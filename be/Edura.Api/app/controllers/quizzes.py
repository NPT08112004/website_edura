# app/controllers/quizzes.py
# -*- coding: utf-8 -*-

from flask import Blueprint, request, jsonify, current_app
from datetime import datetime
from bson import ObjectId
from jwt import InvalidTokenError
import os
import tempfile
import jwt  # pyjwt

from app.services.mongo_service import mongo_collections

QUIZ_COST = int(os.getenv("QUIZ_COST_POINTS", "5"))  # mặc định 5 điểm/lần làm
# Optional: AI & parser
_ai_generate_quiz = None
_parse_quiz_docx = None
try:
    from app.services.ai_service import generate_quiz_from_text as _ai_generate_quiz
except Exception:
    _ai_generate_quiz = None

try:
    from app.services.ai_service import parse_quiz_docx as _parse_quiz_docx
except Exception:
    _parse_quiz_docx = None

quizzes_bp = Blueprint("quizzes", __name__, url_prefix="/api/quizzes")

ALLOWED_EXTS = {".doc", ".docx"}
QUIZ_COST = int(os.getenv("QUIZ_COST_POINTS", "5"))  # điểm trừ khi người khác làm bài


# ---------------- JWT helpers ----------------
def _decode_jwt_strict(token: str) -> dict:
    secret = (
        current_app.config.get("JWT_KEY")
        or os.getenv("JWT_KEY")
        or current_app.config.get("JWT_SECRET")
        or current_app.config.get("JWT_SECRET_KEY")
        or "dev_secret"
    )
    return jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})


def _current_user_id() -> ObjectId:
    auth = (request.headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        raise InvalidTokenError("Thiếu Bearer token")
    token = auth.split(" ", 1)[1].strip()
    payload = _decode_jwt_strict(token)
    uid_raw = payload.get("sub") or payload.get("userId") or payload.get("id") or payload.get("_id")
    return ObjectId(str(uid_raw))


# --------------- DOC/DOCX text ---------------
def _text_from_doc_stream(file_storage, ext: str) -> str:
    ext = (ext or "").lower()
    text = ""
    try:
        import docx
        file_storage.stream.seek(0)
        doc = docx.Document(file_storage.stream)
        paras = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
        text = "\n".join(paras)
    except Exception:
        try:
            import docx2txt
            file_storage.stream.seek(0)
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                file_storage.save(tmp.name)
            try:
                text = docx2txt.process(tmp.name) or ""
            finally:
                try:
                    os.remove(tmp.name)
                except Exception:
                    pass
        except Exception:
            text = ""
    return (text or "").strip()


# ---------------- Fallback AI ----------------
def _generate_quiz_local(text: str):
    qs = []
    for i in range(1, 11):
        qs.append({
            "id": f"q{i}",
            "text": f"Câu {i}: Nội dung trên có đề cập khái niệm chính không?",
            "choices": [{"id": "A", "text": "Có"}, {"id": "B", "text": "Không"}],
            "answer": "A",
            "explanation": "Sinh tự động (fallback)."
        })
    return ("Bài trắc nghiệm (demo)", qs)


def _generate_quiz(text: str):
    if _ai_generate_quiz:
        try:
            title, questions = _ai_generate_quiz(text)
            title = title or "Bài trắc nghiệm"
            questions = questions or []
            fixed = []
            for i, q in enumerate(questions, 1):
                choices = q.get("choices") or []
                fixed.append({
                    "id": q.get("id") or f"q{i}",
                    "text": q.get("text") or "",
                    "choices": [{"id": c.get("id"), "text": c.get("text")}
                                for c in choices if c.get("id") and c.get("text")],
                    "answer": q.get("answer") or "A",
                    "explanation": q.get("explanation") or ""
                })
            return (title, fixed)
        except Exception as e:
            print("[AI] generate_quiz_from_text lỗi, fallback:", e)
    return _generate_quiz_local(text)


# ----------- Points & transactions -----------
def _deduct_points(user_id: ObjectId, points: int, reason: str, meta=None):
    """Trừ điểm từ tài khoản người dùng và ghi lại transaction"""
    meta = meta or {}
    print(f"[DEDUCT POINTS] Bắt đầu trừ {points} điểm cho user {user_id}, lý do: {reason}")
    
    u = mongo_collections.users.find_one({"_id": user_id}, {"points": 1})
    if not u:
        print(f"[DEDUCT POINTS] Không tìm thấy user {user_id}")
        return False, "USER_NOT_FOUND"
    
    curr = int(u.get("points", 0) or 0)
    print(f"[DEDUCT POINTS] Điểm hiện tại của user {user_id}: {curr}")
    
    if curr < points:
        print(f"[DEDUCT POINTS] Không đủ điểm: {curr} < {points}")
        return False, "NOT_ENOUGH_POINTS"

    # Trừ điểm
    result = mongo_collections.users.update_one(
        {"_id": user_id}, 
        {"$inc": {"points": -points}}
    )
    print(f"[DEDUCT POINTS] Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    if result.modified_count == 0:
        print(f"[DEDUCT POINTS] WARNING: Không cập nhật được điểm cho user {user_id}")
        return False, "UPDATE_FAILED"
    
    # Ghi lại transaction
    txn_result = mongo_collections.point_txns.insert_one({
        "userId": user_id,
        "type": reason,
        "points": -int(points),
        "meta": meta,
        "createdAt": datetime.utcnow()
    })
    print(f"[DEDUCT POINTS] Đã ghi transaction {txn_result.inserted_id}")
    
    # Verify điểm sau khi trừ
    u_after = mongo_collections.users.find_one({"_id": user_id}, {"points": 1})
    new_balance = int(u_after.get("points", 0) or 0) if u_after else 0
    print(f"[DEDUCT POINTS] Điểm sau khi trừ: {new_balance} (mong đợi: {curr - points})")
    
    return True, None


# -------------------- ROUTES --------------------

@quizzes_bp.post("/from-doc")
def create_quiz_from_doc():
    """
    Upload .doc/.docx để tạo quiz.
    - Nếu .docx theo quy tắc + / - (đáp án đúng in đậm) và có parse_quiz_docx() => đọc đúng số câu theo file.
    - Ngược lại: trích text và dùng AI (hoặc fallback).
    Thêm: title, schoolId, categoryId; tự động gán thông tin người tạo (creatorName, creatorEmail).
    """
    try:
        user_id = _current_user_id()
    except Exception as e:
        return jsonify({"error": f"Auth lỗi: {e}"}), 401

    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "Thiếu file"}), 400

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        return jsonify({"error": "Chỉ chấp nhận .doc/.docx"}), 400

    # Lấy thông tin người tạo
    me = mongo_collections.users.find_one({"_id": user_id}, {"fullName": 1, "username": 1, "email": 1})
    creator_name = (me.get("fullName") or me.get("username") or "").strip() if me else ""
    creator_email = (me.get("email") or "").strip() if me else ""

    # Lấy thêm metadata từ form
    raw_title = (request.form.get("title") or "").strip()
    raw_school_id = (request.form.get("schoolId") or "").strip()
    raw_category_id = (request.form.get("categoryId") or "").strip()

    school_id = None
    category_id = None
    school_name = None
    category_name = None

    if raw_school_id:
        try:
            school_id = ObjectId(raw_school_id)
            s = mongo_collections.schools.find_one({"_id": school_id}, {"name": 1})
            school_name = s.get("name") if s else None
        except Exception:
            school_id = None

    if raw_category_id:
        try:
            category_id = ObjectId(raw_category_id)
            c = mongo_collections.categories.find_one({"_id": category_id}, {"name": 1})
            category_name = c.get("name") if c else None
        except Exception:
            category_id = None

    # Parse/AI tạo câu hỏi
    title, questions = None, None
    if ext == ".docx" and _parse_quiz_docx:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
            f.save(tmp.name)
        try:
            title, questions = _parse_quiz_docx(tmp.name)
        finally:
            try:
                os.remove(tmp.name)
            except Exception:
                pass

    if not questions:
        text = _text_from_doc_stream(f, ext)
        if not text:
            return jsonify({"error": "Không trích được nội dung từ file"}), 400
        title, questions = _generate_quiz(text)

    # Chuẩn hoá id câu hỏi
# Chuẩn hoá id câu hỏi
    fixed = []
    for i, q in enumerate(questions, 1):
        choices = q.get("choices") or []
        fixed.append({
            "id": q.get("id") or f"q{i}",
            "text": q.get("text") or "",
            "choices": [{"id": c.get("id"), "text": c.get("text")}
                        for c in choices if c.get("id") and c.get("text")],
            "answer": q.get("answer") or "A",
            "explanation": q.get("explanation") or ""
        })
    questions = fixed


    # Lưu quiz (đã kèm thông tin người upload)
    quiz = {
        "title": raw_title or (title or "Bộ câu hỏi từ file"),
        "sourceType": ext.replace(".", ""),
        "sourceDocumentId": None,

        "creatorId": user_id,
        "creatorName": creator_name or None,
        "creatorEmail": creator_email or None,

        "schoolId": school_id,
        "schoolName": school_name,
        "categoryId": category_id,
        "categoryName": category_name,

        "numQuestions": len(questions),
        "questions": questions,
        "status": "ready",
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    }
    res = mongo_collections.quizzes.insert_one(quiz)

    return jsonify({
        "id": str(res.inserted_id),
        "title": quiz["title"],
        "numQuestions": quiz["numQuestions"],
        "schoolId": str(quiz["schoolId"]) if quiz.get("schoolId") else None,
        "schoolName": quiz.get("schoolName"),
        "categoryId": str(quiz["categoryId"]) if quiz.get("categoryId") else None,
        "categoryName": quiz.get("categoryName"),
        "creatorName": quiz.get("creatorName"),
        "creatorEmail": quiz.get("creatorEmail"),
    })


@quizzes_bp.get("")
@quizzes_bp.get("/")
def list_quizzes():
    """
    Trả về danh sách TẤT CẢ quiz (mặc định).
    Có thể lọc của riêng mình bằng ?mine=1
    """
    try:
        user_id = _current_user_id()  # chỉ để xác thực, không lọc mặc định
    except Exception as e:
        return jsonify({"error": f"Auth lỗi: {e}"}), 401

    mine = (request.args.get("mine", "0") == "1")  # <-- mặc định 0 (all)
    q = {"creatorId": user_id} if mine else {}

    items = []
    cursor = mongo_collections.quizzes.find(q).sort("createdAt", -1)
    for qz in cursor:
        items.append({
            "id": str(qz["_id"]),
            "title": qz.get("title"),
            "numQuestions": int(qz.get("numQuestions", 0) or 0),
            "status": qz.get("status", "ready"),
            "createdAt": qz.get("createdAt"),
            "schoolId": str(qz["schoolId"]) if qz.get("schoolId") else None,
            "schoolName": qz.get("schoolName"),
            "categoryId": str(qz["categoryId"]) if qz.get("categoryId") else None,
            "categoryName": qz.get("categoryName"),
            "creatorName": qz.get("creatorName"),
            "creatorEmail": qz.get("creatorEmail"),
        })
    return jsonify({"quizzes": items})


@quizzes_bp.get("/<quiz_id>")
def get_quiz_public(quiz_id: str):
    """Lấy đề thi (KHÔNG trả đáp án)."""
    try:
        _id = ObjectId(quiz_id)
    except Exception:
        return jsonify({"error": "quiz id không hợp lệ"}), 400

    qz = mongo_collections.quizzes.find_one({"_id": _id})
    if not qz:
        return jsonify({"error": "Not found"}), 404

    qs = [{"id": q.get("id"), "text": q.get("text"), "choices": q.get("choices") or []}
          for q in (qz.get("questions") or [])]

    return jsonify({
        "id": str(qz["_id"]),
        "title": qz.get("title"),
        "numQuestions": int(qz.get("numQuestions", 0) or 0),
        "schoolId": str(qz["schoolId"]) if qz.get("schoolId") else None,
        "schoolName": qz.get("schoolName"),
        "categoryId": str(qz["categoryId"]) if qz.get("categoryId") else None,
        "categoryName": qz.get("categoryName"),
        "creatorName": qz.get("creatorName"),
        "creatorEmail": qz.get("creatorEmail"),
        "questions": qs
    })


@quizzes_bp.post("/<quiz_id>/start")
def start_attempt(quiz_id: str):
    """
    Bắt đầu làm bài:
    - Trừ QUIZ_COST điểm (mặc định 5 điểm) cho TẤT CẢ người dùng khi bắt đầu làm bài.
    - Mỗi lần bấm Start được xem như một lần attempt mới (tức là trừ theo lần thi).
    Trả lại đề thi (không lộ đáp án).
    """
    try:
        user_id = _current_user_id()
    except Exception as e:
        return jsonify({"error": f"Auth lỗi: {e}"}), 401

    try:
        _id = ObjectId(quiz_id)
    except Exception:
        return jsonify({"error": "quiz id không hợp lệ"}), 400

    qz = mongo_collections.quizzes.find_one({"_id": _id})
    if not qz:
        return jsonify({"error": "Not found"}), 404

    # Trừ 5 điểm cho TẤT CẢ người dùng khi bắt đầu làm bài
    print(f"[QUIZ START] User {user_id} bắt đầu làm quiz {quiz_id}, sẽ trừ {QUIZ_COST} điểm")
    ok, err = _deduct_points(user_id, QUIZ_COST, "quiz_cost", {"quizId": quiz_id})
    if not ok:
        print(f"[QUIZ START] Lỗi trừ điểm: {err}")
        if err == "NOT_ENOUGH_POINTS":
            return jsonify({"error": "NOT_ENOUGH_POINTS", "need": QUIZ_COST}), 402
        return jsonify({"error": err}), 400
    print(f"[QUIZ START] Đã trừ {QUIZ_COST} điểm thành công cho user {user_id}")

    # Lấy điểm mới sau khi trừ
    u_after = mongo_collections.users.find_one({"_id": user_id}, {"points": 1})
    new_balance = int(u_after.get("points", 0) or 0) if u_after else 0
    print(f"[QUIZ START] Điểm mới của user {user_id}: {new_balance}")

    # Tạo attempt mới
    att = {
        "quizId": qz["_id"],
        "userId": user_id,
        "startedAt": datetime.utcnow(),
        "submittedAt": None,
        "answers": [],
        "score": None,
        "maxScore": int(qz.get("numQuestions", 0) or 0),
        "freeForOwner": False  # Tất cả đều trừ điểm khi bắt đầu
    }
    res = mongo_collections.quiz_attempts.insert_one(att)

    # Trả đề (không kèm đáp án)
    paper_qs = [{
        "id": q.get("id"),
        "text": q.get("text"),
        "choices": q.get("choices") or []
    } for q in (qz.get("questions") or [])]

    return jsonify({
        "attemptId": str(res.inserted_id),
        "quizId": quiz_id,
        "title": qz.get("title"),
        "questions": paper_qs,
        "pointsDeducted": QUIZ_COST,
        "currentBalance": new_balance  # Trả về điểm mới để frontend cập nhật
    })


@quizzes_bp.post("/<quiz_id>/submit")
def submit_attempt(quiz_id: str):
    """Chấm bài: trả về {"correct": X, "total": N}."""
    try:
        user_id = _current_user_id()
    except Exception as e:
        return jsonify({"error": f"Auth lỗi: {e}"}), 401

    try:
        _id = ObjectId(quiz_id)
    except Exception:
        return jsonify({"error": "quiz id không hợp lệ"}), 400

    data = request.get_json(force=True) or {}
    answers = data.get("answers") or []  # [{qid, choice}]

    qz = mongo_collections.quizzes.find_one({"_id": _id})
    if not qz:
        return jsonify({"error": "Not found"}), 404

    ans_map = {q.get("id"): q.get("answer") for q in (qz.get("questions") or [])}
    correct = 0
    for a in answers:
        qid = (a or {}).get("qid")
        choice = (a or {}).get("choice")
        if qid and choice and ans_map.get(qid) == choice:
            correct += 1

    mongo_collections.quiz_attempts.insert_one({
        "quizId": qz["_id"],
        "userId": user_id,
        "startedAt": datetime.utcnow(),
        "submittedAt": datetime.utcnow(),
        "answers": answers,
        "score": int(correct),
        "maxScore": int(qz.get("numQuestions", 0) or 0)
    })

    return jsonify({"correct": int(correct), "total": int(qz.get("numQuestions", 0) or 0)})
