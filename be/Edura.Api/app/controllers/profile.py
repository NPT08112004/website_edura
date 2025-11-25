# app/controllers/profile.py
# -*- coding: utf-8 -*-

from flask import Blueprint, request, jsonify, current_app
from bson.objectid import ObjectId
from bson.errors import InvalidId
from jwt import ExpiredSignatureError, InvalidTokenError
import jwt
import os
import uuid
import boto3
from datetime import datetime
from werkzeug.utils import secure_filename

from app.services.mongo_service import mongo_collections
from app.services.aws_service import aws_service

profile_bp = Blueprint("profile", __name__, url_prefix="/api/profile")

ALLOWED_AVATAR_EXT = {"png", "jpg", "jpeg", "webp"}


def _get_current_user_strict():
    """Đọc Bearer token & trả về ObjectId user."""
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        raise InvalidTokenError("Thiếu Bearer token")
    token = auth.split(" ", 1)[1].strip()
    # Bắt buộc JWT_KEY từ config hoặc env, không có fallback
    secret = (
        current_app.config.get("JWT_KEY")
        or os.getenv("JWT_KEY")
    )
    if not secret:
        raise ValueError("JWT_KEY chưa được cấu hình trong environment variables")
    payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
    uid_raw = payload.get("userId") or payload.get("id") or payload.get("_id") or payload.get("sub")
    uid = ObjectId(str(uid_raw))
    u = mongo_collections.users.find_one({"_id": uid})
    if not u:
        raise InvalidTokenError("User không tồn tại")
    return uid


def _allowed_ext(filename: str, allow: set[str]) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allow


@profile_bp.route("/me", methods=["GET"])
def get_my_profile():
    """Lấy thông tin profile của user hiện tại."""
    try:
        user_id = _get_current_user_strict()
        user = mongo_collections.users.find_one({"_id": user_id})
        if not user:
            return jsonify({"error": "Không tìm thấy user"}), 404

        return jsonify({
            "id": str(user["_id"]),
            "username": user.get("username", ""),
            "email": user.get("email"),
            "fullName": user.get("fullName", ""),
            "role": user.get("role", "user"),
            "status": user.get("status", "active"),
            "avatarUrl": user.get("avatarUrl"),
            "points": user.get("points", 0),
            "createdAt": user.get("createdAt").isoformat() if user.get("createdAt") else None,
        }), 200
    except ExpiredSignatureError:
        return jsonify({"error": "JWT hết hạn. Vui lòng đăng nhập lại."}), 401
    except InvalidTokenError as e:
        return jsonify({"error": f"Token không hợp lệ: {e}"}), 401
    except Exception as e:
        print(f"[ERROR] get_my_profile: {e}")
        return jsonify({"error": f"Lỗi server nội bộ: {e}"}), 500


@profile_bp.route("/me", methods=["PUT"])
def update_my_profile():
    """Cập nhật fullname của user hiện tại."""
    try:
        user_id = _get_current_user_strict()
        data = request.get_json() or {}
        full_name = (data.get("fullName") or "").strip()

        if not full_name:
            return jsonify({"error": "fullName không được để trống"}), 400

        result = mongo_collections.users.update_one(
            {"_id": user_id},
            {"$set": {"fullName": full_name, "updatedAt": datetime.utcnow()}}
        )

        if result.matched_count == 0:
            return jsonify({"error": "Không tìm thấy user"}), 404

        # Cập nhật localStorage nếu cần (FE tự xử lý)
        return jsonify({"success": True, "fullName": full_name}), 200
    except ExpiredSignatureError:
        return jsonify({"error": "JWT hết hạn. Vui lòng đăng nhập lại."}), 401
    except InvalidTokenError as e:
        return jsonify({"error": f"Token không hợp lệ: {e}"}), 401
    except Exception as e:
        print(f"[ERROR] update_my_profile: {e}")
        return jsonify({"error": f"Lỗi server nội bộ: {e}"}), 500


@profile_bp.route("/avatar", methods=["POST"])
def upload_avatar():
    """Upload avatar cho user hiện tại."""
    try:
        user_id = _get_current_user_strict()

        if "avatar" not in request.files:
            return jsonify({"error": "Thiếu file avatar"}), 400

        avatar_file = request.files["avatar"]
        if avatar_file.filename == "" or not _allowed_ext(avatar_file.filename, ALLOWED_AVATAR_EXT):
            return jsonify({"error": "Chỉ chấp nhận PNG/JPG/JPEG/WEBP"}), 400

        # Upload lên S3
        ext = os.path.splitext(secure_filename(avatar_file.filename))[1].lower() or ".jpg"
        avatar_key = f"avatars/{uuid.uuid4()}{ext}"
        avatar_ct = avatar_file.mimetype or "image/jpeg"

        try:
            avatar_url = aws_service.upload_file(avatar_file.stream, avatar_key, avatar_ct)
        except Exception as e:
            print(f"[ERROR] upload_avatar S3: {e}")
            return jsonify({"error": "Lỗi upload avatar lên S3"}), 500

        if not avatar_url:
            return jsonify({"error": "Upload avatar thất bại"}), 500

        # Cập nhật avatarUrl trong database
        result = mongo_collections.users.update_one(
            {"_id": user_id},
            {"$set": {"avatarUrl": avatar_url, "updatedAt": datetime.utcnow()}}
        )

        if result.matched_count == 0:
            return jsonify({"error": "Không tìm thấy user"}), 404

        return jsonify({"success": True, "avatarUrl": avatar_url}), 200
    except ExpiredSignatureError:
        return jsonify({"error": "JWT hết hạn. Vui lòng đăng nhập lại."}), 401
    except InvalidTokenError as e:
        return jsonify({"error": f"Token không hợp lệ: {e}"}), 401
    except Exception as e:
        print(f"[ERROR] upload_avatar: {e}")
        return jsonify({"error": f"Lỗi server nội bộ: {e}"}), 500


@profile_bp.route("/documents", methods=["GET"])
def get_my_documents():
    """Lấy danh sách tài liệu của user hiện tại."""
    try:
        user_id = _get_current_user_strict()

        # Tìm tất cả documents của user này
        docs = list(mongo_collections.documents.find({"userId": user_id}).sort("createdAt", -1))

        result = []
        for doc in docs:
            # Join school/category
            school_name = None
            sid = doc.get("schoolId") or doc.get("school_id")
            if sid:
                try:
                    s = mongo_collections.schools.find_one(
                        {"_id": sid if isinstance(sid, ObjectId) else ObjectId(str(sid))}, {"name": 1}
                    )
                    if s:
                        school_name = s.get("name")
                except Exception:
                    pass

            category_name = None
            cid = doc.get("categoryId") or doc.get("category_id")
            if cid:
                try:
                    c = mongo_collections.categories.find_one(
                        {"_id": cid if isinstance(cid, ObjectId) else ObjectId(str(cid))}, {"name": 1}
                    )
                    if c:
                        category_name = c.get("name")
                except Exception:
                    pass

            result.append({
                "id": str(doc.get("_id")),
                "_id": str(doc.get("_id")),
                "title": doc.get("title", ""),
                "summary": doc.get("summary", ""),
                "s3_url": doc.get("s3_url", ""),
                "image_url": doc.get("image_url"),
                "views": doc.get("views", 0),
                "pages": doc.get("pages", 0),
                "school_name": school_name,
                "category_name": category_name,
                "createdAt": (doc.get("createdAt") or doc.get("created_at")).isoformat()
                if (doc.get("createdAt") or doc.get("created_at")) else None,
            })

        return jsonify(result), 200
    except ExpiredSignatureError:
        return jsonify({"error": "JWT hết hạn. Vui lòng đăng nhập lại."}), 401
    except InvalidTokenError as e:
        return jsonify({"error": f"Token không hợp lệ: {e}"}), 401
    except Exception as e:
        print(f"[ERROR] get_my_documents: {e}")
        return jsonify({"error": f"Lỗi server nội bộ: {e}"}), 500


@profile_bp.route("/view-history", methods=["GET"])
def get_view_history():
    """Lấy lịch sử xem tài liệu của user hiện tại."""
    try:
        user_id = _get_current_user_strict()

        # Tìm trong collection view_history (nếu có) hoặc tạo mới
        # Giả sử có collection view_history với schema: { userId, documentId, viewedAt }
        history = list(
            mongo_collections.view_history.find({"userId": user_id})
            .sort("viewedAt", -1)
            .limit(100)
        )

        result = []
        for h in history:
            doc_id = h.get("documentId")
            if not doc_id:
                continue

            try:
                doc_oid = doc_id if isinstance(doc_id, ObjectId) else ObjectId(str(doc_id))
                doc = mongo_collections.documents.find_one(
                    {"_id": doc_oid},
                    {"title": 1, "image_url": 1, "s3_url": 1}
                )
                if doc:
                    result.append({
                        "documentId": str(doc_id),
                        "title": doc.get("title", ""),
                        "image_url": doc.get("image_url"),
                        "viewedAt": h.get("viewedAt").isoformat() if h.get("viewedAt") else None,
                    })
            except Exception:
                continue

        return jsonify(result), 200
    except ExpiredSignatureError:
        return jsonify({"error": "JWT hết hạn. Vui lòng đăng nhập lại."}), 401
    except InvalidTokenError as e:
        return jsonify({"error": f"Token không hợp lệ: {e}"}), 401
    except Exception as e:
        print(f"[ERROR] get_view_history: {e}")
        # Nếu collection chưa tồn tại, trả về mảng rỗng
        return jsonify([]), 200

