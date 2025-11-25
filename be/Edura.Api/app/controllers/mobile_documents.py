from flask import Blueprint, jsonify, request, current_app
from bson import ObjectId
from app.services.mongo_service import mongo_collections
import os
import jwt
from bson import ObjectId
from datetime import datetime
import unicodedata

# =========================================================
# Helpers
# =========================================================

def strip_vn(s: str) -> str:
    """Bỏ dấu tiếng Việt + lower-case (không phụ thuộc phiên bản Mongo)."""
    if not s:
        return ""
    s = s.lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.replace("đ", "d")

def _to_oid(val):
    if val is None or val == "":
        return None
    if isinstance(val, ObjectId):
        return val
    try:
        return ObjectId(str(val))
    except Exception:
        return None

def _jwt_user_optional():
    """
    Trả về ObjectId user nếu header Authorization: Bearer ... hợp lệ, ngược lại None.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()

    secret = (
        current_app.config.get("JWT_KEY")
        or os.getenv("JWT_KEY")
        or current_app.config.get("JWT_SECRET")
        or os.getenv("JWT_SECRET")
        or "dev_secret"
    )
    try:
        payload = jwt.decode(
            token, secret, algorithms=["HS256"], options={"verify_aud": False}
        )
        uid = (
            payload.get("userId")
            or payload.get("id")
            or payload.get("_id")
            or payload.get("sub")
        )
        return _to_oid(uid)
    except Exception:
        return None

def _uploader_name(uid):
    uid = _to_oid(uid)
    if not uid:
        return None
    u = mongo_collections.users.find_one(
        {"_id": uid}, {"username": 1, "fullName": 1, "name": 1}
    )
    if not u:
        return None
    return u.get("fullName") or u.get("name") or u.get("username")

def _safe_iso(dt):
    return dt.isoformat() if hasattr(dt, "isoformat") else dt

def _school_name(sid):
    """Trả về tên trường (school name) từ ObjectId hoặc ID dạng chuỗi."""
    sid = _to_oid(sid)
    if not sid:
        return None
    s = mongo_collections.schools.find_one(
        {"_id": sid}, {"name": 1, "shortName": 1}
    )
    if not s:
        return None
    return s.get("name") or s.get("shortName")

# =========================================================
# Blueprint: /api/mobile/documents
# =========================================================

mobile_documents_bp = Blueprint(
    "mobile_documents",
    __name__,
    url_prefix="/api/mobile/documents",
)

@mobile_documents_bp.route("", methods=["GET"])
@mobile_documents_bp.route("/", methods=["GET"])
def list_documents():
    """
    GET /api/mobile/documents?page=1&limit=10&search=&categoryId=&schoolId=
    - Cập nhật để tìm kiếm KHÔNG DẤU bằng Python (như search.py)
    """
    try:
        page = max(int(request.args.get("page", 1)), 1)
        limit = max(int(request.args.get("limit", 10)), 1)

        search = (request.args.get("search") or "").strip()
        search_norm = strip_vn(search) # <-- Chuỗi tìm kiếm đã bỏ dấu
        
        category_id = request.args.get("categoryId")
        school_id = request.args.get("schoolId")

        # 1) Xây dựng truy vấn cơ bản (Chỉ lọc theo ID Trường/Thể loại)
        base_query = {}
        if category_id:
            cat_oid = _to_oid(category_id)
            base_query.setdefault("$and", []).append(
                {
                    "$or": [
                        {"categoryId": cat_oid or category_id},
                        {"category_id": cat_oid or category_id},
                    ]
                }
            )

        if school_id:
            sch_oid = _to_oid(school_id)
            base_query.setdefault("$and", []).append(
                {
                    "$or": [
                        {"schoolId": sch_oid or school_id},
                        {"school_id": sch_oid or school_id},
                    ]
                }
            )

        # Cần lấy đủ các trường để lọc bằng Python (title, keywords, summary)
        projection = {
            "title": 1, "keywords": 1, "summary": 1, "image_url": 1, "s3_url": 1,
            "createdAt": 1, "created_at": 1, "views": 1, "likes": 1, "dislikes": 1,
            "pages": 1, "pageCount": 1, "userId": 1, "user_id": 1, 
            "schoolId": 1, "school_id": 1,
        }

        # LẤY TẤT CẢ docs thỏa mãn điều kiện lọc ID (TRƯỚC KHI PHÂN TRANG)
        # Bằng cách này, ta có thể lọc không dấu chính xác trên toàn bộ kết quả.
        all_docs = list(
            mongo_collections.documents.find(base_query, projection)
            .sort([("createdAt", -1), ("created_at", -1)])
        )

        # 2) Lọc theo q KHÔNG DẤU ở Python
        if search_norm:
            filtered_docs = []
            for d in all_docs:
                title = d.get("title", "")
                keywords = d.get("keywords", []) or []
                summary = d.get("summary", "") or ""
                
                # Tạo một blob chứa tất cả nội dung cần tìm kiếm
                blob = f"{title} {' '.join([str(k) for k in keywords])} {summary}"
                
                # So sánh chuỗi không dấu của query với chuỗi không dấu của blob
                if search_norm in strip_vn(blob):
                    filtered_docs.append(d)
        else:
            filtered_docs = all_docs
            
        # 3) Phân trang sau khi lọc
        total = len(filtered_docs)
        skip = (page - 1) * limit
        docs = filtered_docs[skip : skip + limit]
        
        # --- Bắt đầu xử lý join (school_map và user_map) như cũ ---
        
        # Gom tất cả schoolId / school_id
        school_ids = {
            _to_oid(d.get("schoolId") or d.get("school_id"))
            for d in docs
            if _to_oid(d.get("schoolId") or d.get("school_id"))
        }

        # Map id -> tên trường
        school_map = {}
        if school_ids:
            for s in mongo_collections.schools.find(
                {"_id": {"$in": list(school_ids)}},
                {"name": 1, "shortName": 1},
            ):
                school_map[str(s["_id"])] = s.get("name") or s.get("shortName")

        # Map user id -> tên người đăng (làm thủ công vì không có list user_id tập trung)
        user_map = {}
        user_ids_to_fetch = {
            _to_oid(d.get("userId") or d.get("user_id"))
            for d in docs
            if _to_oid(d.get("userId") or d.get("user_id"))
        }
        if user_ids_to_fetch:
            for u in mongo_collections.users.find(
                {"_id": {"$in": list(user_ids_to_fetch)}},
                {"username": 1, "fullName": 1, "name": 1},
            ):
                user_map[str(u["_id"])] = u.get("fullName") or u.get("name") or u.get("username")


        items = []
        for d in docs:
            created = d.get("created_at") or d.get("createdAt")
            views = int(d.get("views", 0) or 0)
            likes = int(d.get("likes", 0) or 0)
            dislikes = int(d.get("dislikes", 0) or 0)
            pages = int(d.get("pages", 0) or d.get("pageCount", 0) or 0)

            sid = _to_oid(d.get("schoolId") or d.get("school_id"))
            
            # Lấy tên trường
            if sid:
                school_name = school_map.get(str(sid), "Unknown school")
            else:
                school_name = "Unknown school"
            
            # Lấy tên người đăng
            uid = d.get("userId") or d.get("user_id")
            uploader = user_map.get(str(_to_oid(uid))) if _to_oid(uid) else d.get("uploaderName") or "ADMIN"


            items.append(
                {
                    "_id": str(d["_id"]),
                    "title": d.get("title", ""),
                    "summary": d.get("summary", ""),
                    "image_url": d.get("image_url"),
                    "s3_url": d.get("s3_url"),
                    "created_at": _safe_iso(created),
                    "views": views,
                    "likes": likes,
                    "dislikes": dislikes,
                    "pages": pages,
                    "uploader": uploader, # <-- Đã lấy tên từ map
                    "school_name": school_name, 
                }
            )

        return (
            jsonify({"items": items, "page": page, "limit": limit, "total": total}),
            200,
        )

    except Exception as e:
        return jsonify({"error": f"Error fetching documents: {str(e)}"}), 500

# mobile_documents.py

# ... (sau hàm _school_name)

def _remove_vietnamese_accents(text):
    """
    Chuyển đổi chuỗi có dấu tiếng Việt sang không dấu.
    """
    if not isinstance(text, str):
        return text
    
    # Chuỗi không dấu (chỉ áp dụng cho mục đích tìm kiếm cơ bản)
    text = text.lower()
    text = text.replace('á', 'a').replace('à', 'a').replace('ả', 'a').replace('ã', 'a').replace('ạ', 'a')
    text = text.replace('ă', 'a').replace('ắ', 'a').replace('ằ', 'a').replace('ẳ', 'a').replace('ẵ', 'a').replace('ặ', 'a')
    text = text.replace('â', 'a').replace('ấ', 'a').replace('ầ', 'a').replace('ẩ', 'a').replace('ẫ', 'a').replace('ậ', 'a')
    text = text.replace('é', 'e').replace('è', 'e').replace('ẻ', 'e').replace('ẽ', 'e').replace('ẹ', 'e')
    text = text.replace('ê', 'e').replace('ế', 'e').replace('ề', 'e').replace('ể', 'e').replace('ễ', 'e').replace('ệ', 'e')
    text = text.replace('í', 'i').replace('ì', 'i').replace('ỉ', 'i').replace('ĩ', 'i').replace('ị', 'i')
    text = text.replace('ó', 'o').replace('ò', 'o').replace('ỏ', 'o').replace('õ', 'o').replace('ọ', 'o')
    text = text.replace('ô', 'o').replace('ố', 'o').replace('ồ', 'o').replace('ổ', 'o').replace('ỗ', 'o').replace('ộ', 'o')
    text = text.replace('ơ', 'o').replace('ớ', 'o').replace('ờ', 'o').replace('ở', 'o').replace('ỡ', 'o').replace('ợ', 'o')
    text = text.replace('ú', 'u').replace('ù', 'u').replace('ủ', 'u').replace('ũ', 'u').replace('ụ', 'u')
    text = text.replace('ư', 'u').replace('ứ', 'u').replace('ừ', 'u').replace('ử', 'u').replace('ữ', 'u').replace('ự', 'u')
    text = text.replace('ý', 'y').replace('ỳ', 'y').replace('ỷ', 'y').replace('ỹ', 'y').replace('ỵ', 'y')
    text = text.replace('đ', 'd')
    return text

@mobile_documents_bp.route("/by-category/<category_id>", methods=["GET"])
def docs_by_category(category_id):
    """
    GET /api/mobile/documents/by-category/<category_id>?page=1&limit=20
    -> Trả về tất cả tài liệu trong 1 category (sắp xếp theo views giảm dần).
    """
    try:
        page = max(int(request.args.get("page", 1)), 1)
        limit = max(int(request.args.get("limit", 20)), 1)
        skip = (page - 1) * limit

        oid = _to_oid(category_id)
        if not oid:
            return jsonify({"error": "Invalid category id"}), 400

        q = {"$or": [{"categoryId": oid}, {"category_id": oid}]}

        cursor = (
            mongo_collections.documents.find(
                q,
                {
                    "title": 1,
                    "image_url": 1,
                    "s3_url": 1,
                    "userId": 1,
                    "user_id": 1,
                    "views": 1,
                    "createdAt": 1,
                    "created_at": 1,
                    "pages": 1,
                    "pageCount": 1,
                    "schoolId": 1,
                    "school_id": 1,
                    "summary": 1,          # <--- THÊM
                },
            )
            .sort([("views", -1), ("createdAt", -1), ("created_at", -1)])
            .skip(skip)
            .limit(limit)
        )

        docs = list(cursor)

        # Map school id -> name
        school_ids = {
            _to_oid(d.get("schoolId") or d.get("school_id"))
            for d in docs
            if _to_oid(d.get("schoolId") or d.get("school_id"))
        }
        school_map = {}
        if school_ids:
            for s in mongo_collections.schools.find(
                {"_id": {"$in": list(school_ids)}}, {"name": 1, "shortName": 1}
            ):
                school_map[str(s["_id"])] = s.get("name") or s.get("shortName")

        items = []
        for d in docs:
            created = d.get("created_at") or d.get("createdAt")
            uid = d.get("userId") or d.get("user_id")
            sid = _to_oid(d.get("schoolId") or d.get("school_id"))

            views = int(d.get("views", 0) or 0)
            pages = int(d.get("pages", 0) or d.get("pageCount", 0) or 0)

            school_name = school_map.get(str(sid)) if sid else "Unknown School"

            items.append(
                {
                    "id": str(d["_id"]),
                    "title": d.get("title", ""),
                    "image_url": d.get("image_url"),
                    "s3_url": d.get("s3_url"),
                    "uploader": _uploader_name(uid) or "ADMIN",
                    "views": views,
                    "created_at": _safe_iso(created),
                    "pages": pages,
                    "school_name": school_name,
                    "summary": d.get("summary", ""),   # <--- THÊM
                }
            )

        total = mongo_collections.documents.count_documents(q)
        return (
            jsonify({"items": items, "page": page, "limit": limit, "total": total}),
            200,
        )

    except Exception as e:
        current_app.logger.error(
            f"Error fetching by category: {str(e)}", exc_info=True
        )
        return jsonify({"error": f"Error fetching by category: {str(e)}"}), 500



# =========================================================
# Blueprint: /api/mobile  (home)
# =========================================================

mobile_home_bp = Blueprint(
    "mobile_home",
    __name__,
    url_prefix="/api/mobile",
)

@mobile_home_bp.route("/home/trending", methods=["GET"])
def home_trending():
    """
    GET /api/mobile/home/trending?limit=12
    -> 4 section: Toán cao cấp, CTDL&GT, Marketing căn bản, Kinh tế vi mô
    """
    try:
        limit = max(int(request.args.get("limit", 12)), 1)
        me = _jwt_user_optional()

        names_vi = {
            "toan": "Toán cao cấp",
            "dsa": "Cấu trúc dữ liệu và giải thuật",
            "mkt": "Marketing căn bản",
            "micro": "Kinh tế vi mô",
        }
        cat_ids = {}
        for key, vn_name in names_vi.items():
            cat = mongo_collections.categories.find_one(
                {"name": {"$regex": f"^{vn_name}$", "$options": "i"}}, {"_id": 1}
            )
            cat_ids[key] = cat["_id"] if cat else None

        def top_docs(cat_oid):
            if not cat_oid:
                return []
            return list(
                mongo_collections.documents.find(
                    {"$or": [{"categoryId": cat_oid}, {"category_id": cat_oid}]},
                    {
                        "title": 1,
                        "image_url": 1,
                        "s3_url": 1,
                        "userId": 1,
                        "user_id": 1,
                        "views": 1,
                        "createdAt": 1,
                        "created_at": 1,
                        "pages": 1,
                        "pageCount": 1,
                        "summary": 1,   # <--- THÊM
                    },
                )
                .sort([("views", -1), ("createdAt", -1), ("created_at", -1)])
                .limit(limit)
            )

        buckets = {
            "toan": top_docs(cat_ids.get("toan")),
            "dsa": top_docs(cat_ids.get("dsa")),
            "mkt": top_docs(cat_ids.get("mkt")),
            "micro": top_docs(cat_ids.get("micro")),
        }

        all_doc_ids, all_user_ids = [], set()
        for docs in buckets.values():
            for d in docs:
                all_doc_ids.append(d["_id"])
                uid = _to_oid(d.get("userId") or d.get("user_id"))
                if uid:
                    all_user_ids.add(uid)

        like_map, dislike_map = {}, {}
        if all_doc_ids:
            pipeline = [
                {"$match": {"documentId": {"$in": all_doc_ids}}},
                {
                    "$group": {
                        "_id": {"id": "$documentId", "reaction": "$reaction"},
                        "cnt": {"$sum": 1},
                    }
                },
            ]
            for row in mongo_collections.document_reactions.aggregate(pipeline):
                did = str(row["_id"]["id"])
                if row["_id"]["reaction"] == "like":
                    like_map[did] = row["cnt"]
                elif row["_id"]["reaction"] == "dislike":
                    dislike_map[did] = row["cnt"]

        my_map, fav_map = {}, {}
        if me and all_doc_ids:
            for r in mongo_collections.document_reactions.find(
                {"userId": me, "documentId": {"$in": all_doc_ids}},
                {"documentId": 1, "reaction": 1},
            ):
                my_map[str(r["documentId"])] = r.get("reaction")

            coll_names = set(mongo_collections.db.list_collection_names())
            fav_cur = None
            if "favorites" in coll_names:
                fav_cur = mongo_collections.db["favorites"].find(
                    {"userId": me, "documentId": {"$in": all_doc_ids}},
                    {"documentId": 1},
                )
            elif "saved_documents" in coll_names:
                fav_cur = mongo_collections.db["saved_documents"].find(
                    {"userId": me, "documentId": {"$in": all_doc_ids}},
                    {"documentId": 1},
                )
            if fav_cur:
                for f in fav_cur:
                    fav_map[str(f["documentId"])] = True

        user_map = {}
        if all_user_ids:
            for u in mongo_collections.users.find(
                {"_id": {"$in": list(all_user_ids)}},
                {"username": 1, "fullName": 1, "name": 1},
            ):
                user_map[str(u["_id"])] = (
                    u.get("fullName") or u.get("name") or u.get("username")
                )

        def pack(docs):
            out = []
            for d in docs:
                did = str(d["_id"])
                uid = _to_oid(d.get("userId") or d.get("user_id"))
                views = int(d.get("views", 0) or 0)

                # Đọc pages đúng từ Mongo
                raw_pages = d.get("pages") or d.get("pageCount") or 0
                try:
                    pages = int(raw_pages)
                except Exception:
                    pages = 0

                created = d.get("created_at") or d.get("createdAt")

                out.append(
                    {
                        "id": did,
                        "title": d.get("title", ""),
                        "image_url": d.get("image_url"),
                        "s3_url": d.get("s3_url"),
                        "uploader": user_map.get(str(uid)) if uid else None,
                        "views": views,
                        "likes": int(like_map.get(did, 0)),
                        "dislikes": int(dislike_map.get(did, 0)),
                        "myReaction": my_map.get(did),
                        "isFavorite": bool(fav_map.get(did, False)),
                        "pages": pages,                         # <--- giờ đúng
                        "created_at": _safe_iso(created),
                        "summary": d.get("summary", ""),
                    }
                )
            return out



        payload = {
            "sections": [
                {
                    "key": "toan-cao-cap",
                    "title": "Trending in Science & Mathematics",
                    "categoryId": str(cat_ids.get("toan"))
                    if cat_ids.get("toan")
                    else None,
                    "items": pack(buckets["toan"]),
                },
                {
                    "key": "ctdl-gt",
                    "title": "Trending in Data Structures & Algorithms",
                    "categoryId": str(cat_ids.get("dsa"))
                    if cat_ids.get("dsa")
                    else None,
                    "items": pack(buckets["dsa"]),
                },
                {
                    "key": "marketing-can-ban",
                    "title": "Trending in Marketing",
                    "categoryId": str(cat_ids.get("mkt"))
                    if cat_ids.get("mkt")
                    else None,
                    "items": pack(buckets["mkt"]),
                },
                {
                    "key": "kinh-te-vi-mo",
                    "title": "Trending in Economics",
                    "categoryId": str(cat_ids.get("micro"))
                    if cat_ids.get("micro")
                    else None,
                    "items": pack(buckets["micro"]),
                },
            ]
        }
        return jsonify(payload), 200

    except Exception as e:
        return jsonify({"error": f"Error building home: {str(e)}"}), 500
    

@mobile_documents_bp.route("/favorite/<doc_id>", methods=["POST"])
def toggle_favorite(doc_id):
    """
    POST /api/mobile/documents/favorite/<doc_id>
    Body: { "favorite": true/false }
    Yêu cầu header Authorization: Bearer <JWT>
    """
    try:
        me = _jwt_user_optional()
        if not me:
            return jsonify({"error": "Unauthorized"}), 401

        doc_oid = _to_oid(doc_id)
        if not doc_oid:
            return jsonify({"error": "Invalid document id"}), 400

        payload = request.get_json(silent=True) or {}
        want_fav = bool(payload.get("favorite", True))

        coll_names = set(mongo_collections.db.list_collection_names())
        if "favorites" in coll_names:
            coll = mongo_collections.db["favorites"]
        else:
            coll = mongo_collections.db["saved_documents"]

        if want_fav:
            # Lưu / update
            coll.update_one(
                {"userId": me, "documentId": doc_oid},
                {"$set": {"userId": me, "documentId": doc_oid}},
                upsert=True,
            )
        else:
            # Bỏ lưu
            coll.delete_one({"userId": me, "documentId": doc_oid})

        return jsonify({"ok": True, "isFavorite": want_fav}), 200

    except Exception as e:
        current_app.logger.error(f"Error toggle favorite: {e}", exc_info=True)
        return jsonify({"error": f"Error toggle favorite: {e}"}), 500

@mobile_documents_bp.route("/recommended/<doc_id>", methods=["GET"])
def recommended_documents(doc_id):
    """
    GET /api/mobile/documents/recommended/<doc_id>
    Gợi ý tài liệu cùng category (trừ chính nó), sort theo views giảm dần.
    """
    try:
        doc_oid = _to_oid(doc_id)
        if not doc_oid:
            return jsonify({"error": "Invalid document id"}), 400

        # Lấy document gốc để biết category / school
        doc = mongo_collections.documents.find_one(
            {"_id": doc_oid},
            {
                "categoryId": 1,
                "category_id": 1,
                "schoolId": 1,
                "school_id": 1,
            },
        )
        if not doc:
            return jsonify({"error": "Document not found"}), 404

        cat_oid = _to_oid(doc.get("categoryId") or doc.get("category_id"))
        if not cat_oid:
            # không có category thì thôi, trả rỗng
            return jsonify({"items": []}), 200

        # Lấy các doc cùng category, exclude chính nó
        cursor = (
            mongo_collections.documents.find(
                {
                    "$and": [
                        {
                            "$or": [
                                {"categoryId": cat_oid},
                                {"category_id": cat_oid},
                            ]
                        },
                        {"_id": {"$ne": doc_oid}},
                    ]
                },
                {
                    "title": 1,
                    "image_url": 1,
                    "s3_url": 1,
                    "userId": 1,
                    "user_id": 1,
                    "views": 1,
                    "createdAt": 1,
                    "created_at": 1,
                    "pages": 1,
                    "pageCount": 1,
                    "schoolId": 1,
                    "school_id": 1,
                    "summary": 1,
                },
            )
            .sort([("views", -1), ("createdAt", -1), ("created_at", -1)])
            .limit(12)
        )

        docs = list(cursor)

        # Map school id -> name (giống by-category)
        school_ids = {
            _to_oid(d.get("schoolId") or d.get("school_id"))
            for d in docs
            if _to_oid(d.get("schoolId") or d.get("school_id"))
        }
        school_map = {}
        if school_ids:
            for s in mongo_collections.schools.find(
                {"_id": {"$in": list(school_ids)}}, {"name": 1, "shortName": 1}
            ):
                school_map[str(s["_id"])] = s.get("name") or s.get("shortName")

        items = []
        for d in docs:
            created = d.get("created_at") or d.get("createdAt")
            uid = d.get("userId") or d.get("user_id")
            sid = _to_oid(d.get("schoolId") or d.get("school_id"))

            raw_pages = d.get("pages") or d.get("pageCount") or 0
            try:
                pages = int(raw_pages)
            except Exception:
                pages = 0

            views = int(d.get("views", 0) or 0)
            school_name = school_map.get(str(sid)) if sid else "Unknown School"

            items.append(
                {
                    "id": str(d["_id"]),
                    "title": d.get("title", ""),
                    "image_url": d.get("image_url"),
                    "s3_url": d.get("s3_url"),
                    "uploader": _uploader_name(uid) or "ADMIN",
                    "views": views,
                    "likes": 0,
                    "dislikes": 0,
                    "myReaction": None,
                    "isFavorite": False,
                    "pages": pages,
                    "created_at": _safe_iso(created),
                    "school_name": school_name,
                    "summary": d.get("summary", ""),
                }
            )

        return jsonify({"items": items}), 200

    except Exception as e:
        current_app.logger.error(f"Error recommended_documents: {e}", exc_info=True)
        return jsonify({"error": f"Error recommended_documents: {e}"}), 500

@mobile_home_bp.route("/categories", methods=["GET"])
def mobile_categories():
    items = []
    for c in mongo_collections.categories.find({}, {"name": 1}):
        items.append({
            "id": str(c["_id"]),
            "name": c["name"]
        })
    return jsonify({"items": items}), 200


@mobile_home_bp.route("/schools", methods=["GET"])
def mobile_schools():
    items = []
    for s in mongo_collections.schools.find({}, {"name": 1, "shortName": 1}):
        items.append({
            "id": str(s["_id"]),
            "name": s.get("name") or s.get("shortName")
        })
    return jsonify({"items": items}), 200

@mobile_documents_bp.route("/saved", methods=["GET"])
def list_saved_documents():
    """
    GET /api/mobile/documents/saved
    Trả về danh sách tài liệu user đã lưu (favorite).
    Yêu cầu Authorization: Bearer <JWT>.
    """
    try:
        me = _jwt_user_optional()
        if not me:
            return jsonify({"error": "Unauthorized"}), 401

        # Chọn collection favorites / saved_documents
        coll_names = set(mongo_collections.db.list_collection_names())
        if "favorites" in coll_names:
            coll = mongo_collections.db["favorites"]
        else:
            coll = mongo_collections.db["saved_documents"]

        fav_rows = list(
            coll.find({"userId": me}, {"documentId": 1, "_id": 0})
        )
        doc_ids = [
            _to_oid(r.get("documentId")) for r in fav_rows
            if _to_oid(r.get("documentId")) is not None
        ]
        if not doc_ids:
            return jsonify({"items": []}), 200

        # Lấy documents
        docs = list(
            mongo_collections.documents.find(
                {"_id": {"$in": doc_ids}}
            ).sort([("createdAt", -1), ("created_at", -1)])
        )

        # Lấy school name 1 lần
        school_ids = set()
        for d in docs:
            sid = _to_oid(d.get("schoolId") or d.get("school_id"))
            if sid:
                school_ids.add(sid)

        school_map = {}
        if school_ids:
            cursor_s = mongo_collections.schools.find(
                {"_id": {"$in": list(school_ids)}},
                {"name": 1, "shortName": 1},
            )
            for s in cursor_s:
                school_map[str(s["_id"])] = (
                    s.get("name") or s.get("shortName") or "Unknown school"
                )

        items = []
        for d in docs:
            created = d.get("created_at") or d.get("createdAt")
            views = int(d.get("views", 0) or 0)
            likes = int(d.get("likes", 0) or 0)
            pages = int(
                d.get("pages", 0) or d.get("pageCount", 0) or 0
            )

            sid = _to_oid(d.get("schoolId") or d.get("school_id"))
            if sid:
                school_name = school_map.get(str(sid), "Unknown school")
            else:
                school_name = "Unknown school"

            items.append(
                {
                    "_id": str(d["_id"]),
                    "title": d.get("title", ""),
                    "summary": d.get("summary", ""),
                    "image_url": d.get("image_url"),
                    "s3_url": d.get("s3_url"),
                    "created_at": _safe_iso(created),
                    "views": views,
                    "likes": likes,
                    "pages": pages,
                    "uploader": _uploader_name(
                        d.get("userId") or d.get("user_id")
                    )
                    or "ADMIN",
                    "school_name": school_name,
                    "isFavorite": True,
                }
            )

        return jsonify({"items": items}), 200

    except Exception as e:
        current_app.logger.error(
            f"Error list saved documents: {e}", exc_info=True
        )
        return jsonify({"error": f"Error list saved documents: {e}"}), 500

@mobile_documents_bp.route("/lists", methods=["POST"])
def create_list():
    me = _jwt_user_optional()
    if not me:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json or {}
    name = data.get("name")
    private = bool(data.get("private", False))

    if not name:
        return jsonify({"error": "Name required"}), 400

    lst = {
        "userId": me,
        "name": name,
        "private": private,
        "items": [],
    }

    mongo_collections.db["lists"].insert_one(lst)
    lst["_id"] = str(lst["_id"])

    return jsonify(lst), 200

@mobile_documents_bp.route("/lists", methods=["GET"])
def get_lists():
    me = _jwt_user_optional()
    if not me:
        return jsonify({"error": "Unauthorized"}), 401

    cursor = mongo_collections.db["lists"].find({"userId": me})
    items = []
    for l in cursor:
        items.append({
            "id": str(l["_id"]),
            "name": l.get("name"),
            "private": l.get("private"),
            "count": len(l.get("items", [])),
        })

    return jsonify(items), 200

@mobile_documents_bp.route("/lists/<list_id>/add", methods=["POST"])
def add_to_list(list_id):
    me = _jwt_user_optional()
    if not me:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json or {}
    doc_id = data.get("documentId")

    if not doc_id:
        return jsonify({"error": "documentId required"}), 400

    mongo_collections.db["lists"].update_one(
        {"_id": ObjectId(list_id), "userId": me},
        {"$addToSet": {"items": ObjectId(doc_id)}}
    )

    return jsonify({"ok": True}), 200

def convert_objectid(doc):
    doc["_id"] = str(doc["_id"])
    return doc

@mobile_documents_bp.route("/lists/<list_id>", methods=["GET"])
def get_list_detail(list_id):
    me = _jwt_user_optional()
    if not me:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        lst = mongo_collections.db["lists"].find_one({
            "_id": ObjectId(list_id),
            "userId": me
        })

        if not lst:
            return jsonify({"error": "List not found"}), 404

        # items đang là list ObjectId → chuyển về list string
        doc_ids = [str(i) for i in lst.get("items", [])]

        # Lấy đúng thông tin tài liệu
        docs = []
        if doc_ids:
            cursor = mongo_collections.documents.find(
                {"_id": {"$in": [ObjectId(x) for x in doc_ids]}},
                {
                    "title": 1,
                    "summary": 1,
                    "image_url": 1,
                    "s3_url": 1,
                    "pages": 1,
                    "pageCount": 1,
                    "userId": 1,
                    "user_id": 1
                }
            )

            for d in cursor:
                pages = (
                    d.get("pages")
                    or d.get("pageCount")
                    or 0
                )

                docs.append({
                    "id": str(d["_id"]),
                    "title": d.get("title", ""),
                    "summary": d.get("summary", ""),
                    "imageUrl": d.get("image_url"),
                    "s3Url": d.get("s3_url"),
                    "pages": int(pages),
                    "uploader": _uploader_name(
                        d.get("userId") or d.get("user_id")
                    ) or "ADMIN"
                })

        return jsonify({
            "id": str(lst["_id"]),
            "name": lst["name"],
            "count": len(docs),
            "items": docs
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@mobile_documents_bp.route("/lists/<list_id>/remove", methods=["POST"])
def remove_from_list(list_id):
    me = _jwt_user_optional()
    if not me:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json or {}
    doc_id = data.get("documentId")

    if not doc_id:
        return jsonify({"error": "documentId required"}), 400

    try:
        mongo_collections.db["lists"].update_one(
            {"_id": ObjectId(list_id), "userId": me},
            {"$pull": {"items": ObjectId(doc_id)}}
        )

        return jsonify({"ok": True}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@mobile_documents_bp.route("/history/add", methods=["POST"])
def add_history():
    me = _jwt_user_optional()
    if not me:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json or {}
    doc_id = data.get("documentId")

    if not doc_id:
        return jsonify({"error": "documentId required"}), 400

    try:
        mongo_collections.db["history"].update_one(
            {"userId": me, "documentId": ObjectId(doc_id)},
            {
                "$set": {"viewedAt": datetime.utcnow()},
                "$setOnInsert": {"createdAt": datetime.utcnow()}
            },
            upsert=True
        )

        return jsonify({"ok": True}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@mobile_documents_bp.route("/history", methods=["GET"])
def get_history():
    me = _jwt_user_optional()
    if not me:
        return jsonify({"items": []}), 200

    cursor = mongo_collections.db["history"].find(
        {"userId": me}
    ).sort("viewedAt", -1)

    items = []

    for h in cursor:
        doc = mongo_collections.db["documents"].find_one(
            {"_id": h["documentId"]}
        )
        if not doc:
            continue

        pages = doc.get("pages") or doc.get("pageCount") or 0

        items.append({
            "id": str(doc["_id"]),
            "title": doc.get("title", ""),
            "image_url": doc.get("imageUrl") or doc.get("image_url"),
            "s3_url": doc.get("s3Url") or doc.get("s3_url"),
            "pages": pages,
            "uploader": _uploader_name(doc.get("userId")) or "ADMIN",
            "viewedAt": h.get("viewedAt").isoformat()
        })

    return jsonify({"items": items}), 200 

@mobile_home_bp.route("/home/trending-15", methods=["GET"])
def home_trending_15():
    """
    GET /api/mobile/home/trending-15
    -> Trả về 15 section: 3 section cũ + 12 section mới.
    """

    try:
        limit = max(int(request.args.get("limit", 12)), 1)

        # ===== 3 CATEGORY CŨ (đang dùng trong app) =====
        old_categories = [
            "Science & Mathematics",
            "Marketing",
            "Economics",
        ]

        # ===== 12 CATEGORY MỚI (đa dạng ngành) =====
        new_categories = [
            "Toán cao cấp",
            "Cấu trúc dữ liệu & Giải thuật",
            "Cơ sở dữ liệu",
            "Mạng máy tính",
            "Hệ điều hành",
            "Lập trình Java",
            "Lập trình Python",
            "Trí tuệ nhân tạo (AI)",
            "Khoa học dữ liệu",
            "An toàn thông tin",
            "Quản trị kinh doanh",
            "Tài chính – Ngân hàng",
        ]

        all_categories = old_categories + new_categories   # TOTAL = 15

        # ===== LẤY CATEGORY OID =====
        cat_map = {}
        for name in all_categories:
            c = mongo_collections.categories.find_one(
                {"name": {"$regex": f"^{name}$", "$options": "i"}},
                {"_id": 1}
            )
            if c:
                cat_map[name] = c["_id"]

        # ===== FUNCTION LẤY TOP DOCS =====
        def top_docs(cat_oid):
            if not cat_oid:
                return []
            return list(
                mongo_collections.documents.find(
                    {"$or": [
                        {"categoryId": cat_oid},
                        {"category_id": cat_oid}
                    ]},
                    {
                        "title": 1, "image_url": 1, "s3_url": 1,
                        "summary": 1, "views": 1,
                        "createdAt": 1, "created_at": 1,
                        "pages": 1, "pageCount": 1,
                        "userId": 1, "user_id": 1
                    }
                )
                .sort([("views", -1), ("createdAt", -1), ("created_at", -1)])
                .limit(limit)
            )

        # ===== PACK DOCUMENT =====
        def pack(docs):
            out = []
            for d in docs:
                did = str(d["_id"])
                uid = d.get("userId") or d.get("user_id")
                created = d.get("created_at") or d.get("createdAt")

                raw_pages = d.get("pages") or d.get("pageCount") or 0
                try:
                    pages = int(raw_pages)
                except:
                    pages = 0

                out.append({
                    "id": did,
                    "title": d.get("title", ""),
                    "image_url": d.get("image_url"),
                    "s3_url": d.get("s3_url"),
                    "summary": d.get("summary", ""),
                    "views": int(d.get("views", 0)),
                    "pages": pages,
                    "created_at": _safe_iso(created),
                    "uploader": _uploader_name(uid) or "ADMIN",
                })
            return out

        # ===== BUILD 15 SECTIONS =====
        sections = []
        for name in all_categories:
            cat_oid = cat_map.get(name)
            docs = top_docs(cat_oid)
            sections.append({
                "title": f"Trending in {name}",
                "category": name,
                "categoryId": str(cat_oid) if cat_oid else None,
                "items": pack(docs)
            })

        return jsonify({"sections": sections}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500








    return jsonify({"items": items})


