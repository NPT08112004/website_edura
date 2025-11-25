from flask import Blueprint, jsonify, request
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
import re

from app.services.mongo_service import mongo_collections

lookups_bp = Blueprint('lookups', __name__, url_prefix='/api/lookups')


def _to_object_id(value):
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _serialize_school(doc, doc_count: int | None = None):
    if not doc:
        return None
    return {
        "_id": str(doc["_id"]),
        "name": doc.get("name"),
        "shortName": doc.get("shortName"),
        "documentCount": int(doc_count or doc.get("documentCount") or 0)
    }


def _count_documents_for_school(oid: ObjectId):
    if not oid:
        return 0
    oid_str = str(oid)
    return mongo_collections.documents.count_documents({
        "$or": [
            {"schoolId": oid},
            {"schoolId": oid_str},
            {"school_id": oid},
            {"school_id": oid_str},
        ]
    })


@lookups_bp.route('/schools', methods=['GET'])
def get_schools():
    schools = list(mongo_collections.schools.find({}, {"name": 1, "shortName": 1}).sort("name", 1))
    return jsonify([_serialize_school(s) for s in schools])


@lookups_bp.route('/schools/<school_id>', methods=['GET'])
def get_school_by_id(school_id):
    oid = _to_object_id(school_id)
    if not oid:
        return jsonify({"error": "Invalid school id"}), 400
    school = mongo_collections.schools.find_one({"_id": oid})
    if not school:
        return jsonify({"error": "School not found"}), 404
    doc_count = _count_documents_for_school(oid)
    return jsonify(_serialize_school(school, doc_count=doc_count)), 200


@lookups_bp.route('/schools/search', methods=['GET'])
def search_schools():
    query = (request.args.get("q") or "").strip()
    limit = max(1, min(int(request.args.get("limit", 20)), 100))

    filter_query = {}
    if query:
        # Tìm kiếm theo cả name và shortName
        # Escape regex special characters
        escaped_query = re.escape(query)
        filter_query["$or"] = [
            {"name": {"$regex": escaped_query, "$options": "i"}},
            {"shortName": {"$regex": escaped_query, "$options": "i"}}
        ]

    schools = list(
        mongo_collections.schools.find(filter_query, {"name": 1, "shortName": 1})
        .limit(limit * 2)  # Lấy nhiều hơn để sắp xếp
    )
    
    # Sắp xếp: ưu tiên kết quả bắt đầu bằng query, sau đó là chứa query
    if query:
        query_lower = query.lower()
        schools.sort(key=lambda s: (
            0 if s.get("name", "").lower().startswith(query_lower) else (1 if s.get("shortName", "").lower().startswith(query_lower) else 2),
            s.get("name", "").lower()
        ))
        # Chỉ lấy số lượng cần thiết sau khi sắp xếp
        schools = schools[:limit]
    else:
        # Nếu không có query, sắp xếp theo tên
        schools.sort(key=lambda s: s.get("name", "").lower())
    
    # Đếm số tài liệu cho mỗi trường học
    school_ids = [s["_id"] for s in schools]
    doc_counts = {}
    
    if school_ids:
        # Sử dụng aggregation để đếm documents cho tất cả schools cùng lúc
        # Tương tự như get_popular_schools nhưng chỉ đếm cho các schools được tìm thấy
        school_id_strings = [str(oid) for oid in school_ids]
        
        # Tạo match conditions cho cả ObjectId và string
        match_conditions = []
        match_conditions.append({"schoolId": {"$in": school_ids}})
        match_conditions.append({"school_id": {"$in": school_ids}})
        match_conditions.append({"schoolId": {"$in": school_id_strings}})
        match_conditions.append({"school_id": {"$in": school_id_strings}})
        
        pipeline = [
            {
                "$match": {
                    "$or": match_conditions
                }
            },
            {
                "$project": {
                    "schoolRef": {
                        "$ifNull": ["$schoolId", "$school_id"]
                    }
                }
            },
            {
                "$group": {
                    "_id": "$schoolRef",
                    "documentCount": {"$sum": 1}
                }
            }
        ]
        
        try:
            count_results = list(mongo_collections.documents.aggregate(pipeline))
            for result in count_results:
                school_ref = result["_id"]
                # Normalize school_ref về string để so sánh
                if isinstance(school_ref, ObjectId):
                    school_id_key = str(school_ref)
                else:
                    school_id_key = str(school_ref)
                doc_counts[school_id_key] = int(result.get("documentCount", 0))
        except Exception as e:
            # Fallback: đếm từng school nếu aggregation fail
            print(f"Error in aggregation, using fallback: {e}")
            for school in schools:
                doc_counts[str(school["_id"])] = _count_documents_for_school(school["_id"])
    
    # Serialize với document count
    result = []
    for school in schools:
        school_id_str = str(school["_id"])
        doc_count = doc_counts.get(school_id_str, 0)
        result.append(_serialize_school(school, doc_count=doc_count))
    
    return jsonify(result)


@lookups_bp.route('/schools/popular', methods=['GET'])
def get_popular_schools():
    limit = max(1, min(int(request.args.get("limit", 12)), 50))

    pipeline = [
        {"$project": {"schoolRef": {"$ifNull": ["$schoolId", "$school_id"]}}},
        {"$match": {"schoolRef": {"$ne": None}}},
        {"$group": {"_id": "$schoolRef", "documentCount": {"$sum": 1}}},
        {"$sort": {"documentCount": -1}},
        {"$limit": limit}
    ]

    popular_entries = list(mongo_collections.documents.aggregate(pipeline))
    school_ids = []
    doc_counts = {}
    for entry in popular_entries:
        key = str(entry["_id"])
        doc_counts[key] = int(entry.get("documentCount", 0))
        oid = _to_object_id(entry["_id"])
        if oid:
            school_ids.append(oid)

    school_map = {}
    if school_ids:
        cursor = mongo_collections.schools.find({"_id": {"$in": school_ids}}, {"name": 1, "shortName": 1})
        for school in cursor:
            school_map[str(school["_id"])] = school

    result = []
    for entry in popular_entries:
        key = str(entry["_id"])
        school = school_map.get(key)
        if school:
            result.append(_serialize_school(school, doc_counts.get(key, 0)))
        else:
            # fallback in case school document is missing (data inconsistency)
            result.append({
                "_id": key,
                "name": key,
                "shortName": None,
                "documentCount": doc_counts.get(key, 0)
            })

    if not result:
        fallback = list(
            mongo_collections.schools.find({}, {"name": 1, "shortName": 1})
            .sort("name", 1)
            .limit(limit)
        )
        result = [_serialize_school(s, doc_count=0) for s in fallback]

    return jsonify(result), 200

@lookups_bp.route('/categories', methods=['GET'])
def get_categories():
    cats = list(mongo_collections.categories.find({}, {"name": 1}))
    return jsonify([{"_id": str(c["_id"]), "name": c["name"]} for c in cats])

@lookups_bp.route('/seed', methods=['POST'])
def seed():
    payload = request.get_json(silent=True) or {}
    default_schools = payload.get("schools") or [
        "ĐH Bách Khoa TP.HCM", "ĐH Khoa học Tự nhiên TP.HCM", "ĐH CNTT (UIT)",
        "ĐH Kinh Tế TP.HCM", "ĐH Sư Phạm Kỹ Thuật TP.HCM"
    ]
    default_categories = payload.get("categories") or [
        # Toán học & Khoa học cơ bản
        "Toán cao cấp", "Giải tích", "Đại số tuyến tính", "Xác suất thống kê", "Toán rời rạc",
        
        # Công nghệ thông tin
        "Cấu trúc dữ liệu & Giải thuật", "Cơ sở dữ liệu", "Mạng máy tính", "Hệ điều hành",
        "Lập trình hướng đối tượng", "Phát triển Web", "Phát triển Mobile", "Trí tuệ nhân tạo",
        "Machine Learning", "An toàn thông tin", "Kiến trúc máy tính", "Hệ thống phân tán",
        
        # Kinh tế & Quản trị
        "Kinh tế vi mô", "Kinh tế vĩ mô", "Marketing căn bản", "Quản trị học", "Kế toán tài chính",
        "Quản trị dự án", "Quản trị nhân sự", "Quản trị kinh doanh", "Tài chính doanh nghiệp",
        
        # Kỹ thuật
        "Vật lý đại cương", "Hóa học đại cương", "Cơ học kỹ thuật", "Điện tử cơ bản",
        "Kỹ thuật điện", "Cơ khí chế tạo", "Xây dựng dân dụng", "Kỹ thuật môi trường",
        
        # Khoa học xã hội & Nhân văn
        "Triết học Mác-Lênin", "Tư tưởng Hồ Chí Minh", "Lịch sử Đảng", "Pháp luật đại cương",
        "Tâm lý học", "Xã hội học", "Văn học Việt Nam", "Lịch sử Việt Nam",
        
        # Ngoại ngữ
        "Tiếng Anh", "Tiếng Anh chuyên ngành", "Tiếng Nhật", "Tiếng Trung",
        
        # Khác
        "Giáo dục thể chất", "Giáo dục quốc phòng", "Kỹ năng mềm", "Khởi nghiệp"
    ]

    inserted = {"schools": 0, "categories": 0}

    # Dùng upsert để tránh race condition; nếu trùng thì update no-op
    for name in default_schools:
        try:
            mongo_collections.schools.update_one(
                {"name": name}, {"$setOnInsert": {"name": name}}, upsert=True
            )
            inserted["schools"] += 1
        except DuplicateKeyError:
            pass

    for name in default_categories:
        try:
            mongo_collections.categories.update_one(
                {"name": name}, {"$setOnInsert": {"name": name}}, upsert=True
            )
            inserted["categories"] += 1
        except DuplicateKeyError:
            pass

    return jsonify({"message": "Seed completed (idempotent)", "inserted": inserted}), 200
