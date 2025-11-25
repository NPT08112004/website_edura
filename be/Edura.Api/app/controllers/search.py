# app/controllers/search.py
# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify
from bson import ObjectId
from app.services.mongo_service import mongo_collections
from flask import current_app

import unicodedata
import traceback
import jwt  # pip install pyjwt
import os

# ✅ PHẢI có __name__ làm import_name
search_bp = Blueprint("search", __name__, url_prefix="/api/search")


# --- Helpers ---------------------------------------------------------------
def strip_vn(s: str) -> str:
    """Bỏ dấu tiếng Việt + lower-case (không phụ thuộc phiên bản Mongo)."""
    if not s:
        return ""
    s = s.lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.replace("đ", "d")

def _get_current_user():
    """
    Trả về (user_id:ObjectId|None, uploader_name:str|None)
    - Ưu tiên lấy từ Authorization: Bearer <JWT>
    - Fallback: lấy user đầu tiên trong DB (demo)
    """
    user_id = None
    uploader_name = None

    # 1) JWT từ header
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            secret = (current_app.config.get("JWT_KEY")
          or os.getenv("JWT_KEY"))
            if not secret:
                raise ValueError("JWT_KEY chưa được cấu hình")
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            _uid = payload.get("userId") or payload.get("id") or payload.get("_id")
            if _uid:
                try:
                    user_id = ObjectId(str(_uid))
                except Exception:
                    user_id = None
        except Exception as e:
            print(f"[WARN] decode JWT lỗi: {e}")

    # 2) Fallback: lấy user đầu tiên
    if user_id is None:
        u = mongo_collections.users.find_one({}, {"_id": 1, "fullName": 1, "username": 1, "name": 1, "email": 1})
        if u:
            user_id = u["_id"]
            uploader_name = u.get("fullName") or u.get("username") or u.get("name") or u.get("email")

    # nếu đã decode JWT được mà chưa có tên -> query tên
    if user_id is not None and uploader_name is None:
        u = mongo_collections.users.find_one({"_id": user_id}, {"fullName": 1, "username": 1, "name": 1, "email": 1})
        if u:
            uploader_name = u.get("fullName") or u.get("username") or u.get("name") or u.get("email")

    return user_id, uploader_name

def _safe_int(val, default, lo=None, hi=None):
    try:
        v = int(val)
    except Exception:
        return default
    if lo is not None:
        v = max(v, lo)
    if hi is not None:
        v = min(v, hi)
    return v


def _uploader_name(u: dict) -> str | None:
     # Ưu tiên HỌ TÊN, rồi mới username
     return u.get("fullName") or u.get("username") or u.get("name") or u.get("email")



# --- Routes ----------------------------------------------------------------
@search_bp.route("/documents", methods=["GET"])
def search_documents():
    """
    GET /api/search/documents?q=&schoolId=&categoryId=&page=1&limit=24
    - Tìm theo tên/keywords/summary (KHÔNG DẤU, không phân biệt hoa-thường)
    - Lọc theo Trường/Thể loại (tùy chọn)
    - Phân trang, join tên trường/thể loại/người đăng
    """
    try:
        q = (request.args.get("q") or "").strip()
        q_norm = strip_vn(q)

        school_id_raw = (request.args.get("schoolId") or "").strip()
        category_id_raw = (request.args.get("categoryId") or "").strip()
        page = _safe_int(request.args.get("page"), 1, lo=1)
        limit = _safe_int(request.args.get("limit"), 24, lo=1, hi=60)
        skip = (page - 1) * limit

        # 1) Lọc thô (Trường/Thể loại) trực tiếp trên Mongo
        base_match = {}
        if school_id_raw:
            try:
                base_match["schoolId"] = ObjectId(school_id_raw)
            except Exception:
                return jsonify({"error": "schoolId không hợp lệ"}), 400

        if category_id_raw:
            try:
                base_match["categoryId"] = ObjectId(category_id_raw)
            except Exception:
                return jsonify({"error": "categoryId không hợp lệ"}), 400

        projection = {
            "title": 1,
            "keywords": 1,
            "summary": 1,
            "image_url": 1,
            "s3_url": 1,
            "schoolId": 1,
            "categoryId": 1,
            "userId": 1,
            "createdAt": 1,
            "created_at": 1,  # tài liệu cũ
            "uploaderName": 1,  # snapshot tên người đăng
        }

        docs = list(mongo_collections.documents.find(base_match, projection))

        # 2) Lọc theo q KHÔNG DẤU ở Python (ổn định trên mọi version Mongo)
        if q_norm:
            filtered = []
            for d in docs:
                title = d.get("title", "")
                keywords = d.get("keywords", []) or []
                summary = d.get("summary", "") or ""
                blob = f"{title} {' '.join([str(k) for k in keywords])} {summary}"
                if q_norm in strip_vn(blob):
                    filtered.append(d)
        else:
            filtered = docs

        # 3) Join tên trường/thể loại/người đăng (một lượt rồi map)
        school_ids = {d.get("schoolId") for d in filtered if d.get("schoolId")}
        category_ids = {d.get("categoryId") for d in filtered if d.get("categoryId")}
        user_ids = {d.get("userId") for d in filtered if d.get("userId")}

        school_map = {}
        if school_ids:
            for s in mongo_collections.schools.find(
                {"_id": {"$in": list(school_ids)}}, {"name": 1}
            ):
                school_map[s["_id"]] = s.get("name")

        category_map = {}
        if category_ids:
            for c in mongo_collections.categories.find(
                {"_id": {"$in": list(category_ids)}}, {"name": 1}
            ):
                category_map[c["_id"]] = c.get("name")

        user_map = {}
        if user_ids:
            for u in mongo_collections.users.find(
                {"_id": {"$in": list(user_ids)}},
                {"fullName": 1, "username": 1, "name": 1, "email": 1},
            ):
                user_map[u["_id"]] = _uploader_name(u)

        # 4) Sort & paginate (ưu tiên createdAt -> created_at -> _id)
        def _sort_key(d):
            return d.get("createdAt") or d.get("created_at") or d.get("_id")

        filtered.sort(key=_sort_key, reverse=True)
        total = len(filtered)
        page_items = filtered[skip : skip + limit]

        # 5) Serialize + gắn tên
        items = []
        for d in page_items:
            it = {
                "_id": str(d["_id"]),
                "title": d.get("title"),
                "image_url": d.get("image_url"),
                "s3_url": d.get("s3_url"),
                "summary": d.get("summary"),
                "createdAt": d.get("createdAt") or d.get("created_at"),
                "schoolId": str(d["schoolId"]) if d.get("schoolId") else None,
                "categoryId": str(d["categoryId"]) if d.get("categoryId") else None,
                "userId": str(d["userId"]) if d.get("userId") else None,
                "schoolName": school_map.get(d.get("schoolId")),
                "categoryName": category_map.get(d.get("categoryId")),
               # "uploaderName": user_map.get(d.get("userId")),
                "uploaderName": user_map.get(d.get("userId")) or d.get("uploaderName"),
            }
            items.append(it)

        return jsonify({"items": items, "total": total, "page": page, "limit": limit})

    except Exception as e:
        # In traceback ra console để dễ debug khi cần
        print("🔥 Lỗi trong /api/search/documents:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
