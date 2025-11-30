from flask import Blueprint, request, jsonify
from app.services.mongo_service import mongo_collections
from app.services.aws_service import aws_service
from bson import ObjectId
import jwt
import os
import datetime
from urllib.parse import urlparse

# Blueprint cho các API quản trị
admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

# Lấy cấu hình JWT từ biến môi trường (đồng nhất với auth)
JWT_KEY = os.getenv("JWT_KEY")
JWT_ISSUER = os.getenv("JWT_ISSUER")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE")

if not JWT_KEY:
    raise ValueError("JWT_KEY chưa được cấu hình!")


def _get_current_user():
    """Giải mã JWT từ header Authorization và trả về user hiện tại (doc Mongo)."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, (jsonify({"error": "Thiếu hoặc sai định dạng Authorization header."}), 401)

    token = auth_header.split(' ', 1)[1].strip()
    try:
        decode_kwargs = {
            'key': JWT_KEY,
            'algorithms': ['HS256'],
        }
        if JWT_AUDIENCE:
            decode_kwargs['audience'] = JWT_AUDIENCE
        if JWT_ISSUER:
            decode_kwargs['issuer'] = JWT_ISSUER

        payload = jwt.decode(token, **decode_kwargs)
    except jwt.ExpiredSignatureError:
        return None, (jsonify({"error": "Token đã hết hạn."}), 401)
    except jwt.InvalidTokenError as ex:
        return None, (jsonify({"error": f"Token không hợp lệ: {str(ex)}"}), 401)

    user_id = payload.get('sub')
    if not user_id:
        return None, (jsonify({"error": "Token thiếu thông tin người dùng."}), 401)

    try:
        obj_id = ObjectId(user_id)
    except Exception:
        return None, (jsonify({"error": "Định danh người dùng không hợp lệ."}), 401)

    user_doc = mongo_collections.users.find_one({"_id": obj_id})
    if not user_doc:
        return None, (jsonify({"error": "Người dùng không tồn tại."}), 401)

    return user_doc, None


@admin_bp.route('/promote', methods=['POST'])
def promote_user_to_admin():
    """
    Nâng quyền người dùng thành admin. Chỉ admin mới có quyền gọi.
    ---
    tags:
      - Admin
    security:
      - Bearer: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          id: PromoteUser
          properties:
            userId:
              type: string
            username:
              type: string
    responses:
      200:
        description: Nâng quyền thành công.
      400:
        description: Thiếu tham số.
      401:
        description: Không xác thực.
      403:
        description: Không có quyền.
      404:
        description: Không tìm thấy người dùng.
    """
    current_user, err = _get_current_user()
    if err:
        return err

    if current_user.get('role') != 'admin':
        return jsonify({"error": "Bạn không có quyền thực hiện thao tác này."}), 403

    data = request.get_json() or {}
    user_id = data.get('userId')
    username = data.get('username')

    if not user_id and not username:
        return jsonify({"error": "Cần cung cấp userId hoặc username."}), 400

    target_query = {}
    if user_id:
        try:
            target_query["_id"] = ObjectId(user_id)
        except Exception:
            return jsonify({"error": "userId không hợp lệ."}), 400
    else:
        target_query["username"] = str(username).strip()

    target_user = mongo_collections.users.find_one(target_query)
    if not target_user:
        return jsonify({"error": "Không tìm thấy người dùng."}), 404

    if target_user.get('role') == 'admin':
        # Đã là admin rồi
        return jsonify({
            "message": "Người dùng đã là admin.",
            "user": {
                "id": str(target_user.get('_id')),
                "username": target_user.get('username'),
                "fullName": target_user.get('fullName'),
                "role": target_user.get('role')
            }
        }), 200

    mongo_collections.users.update_one(
        {"_id": target_user["_id"]},
        {"$set": {"role": "admin", "updatedAt": datetime.datetime.utcnow()}}
    )

    updated = mongo_collections.users.find_one({"_id": target_user["_id"]})

    return jsonify({
        "message": "Đã nâng quyền người dùng thành admin.",
        "user": {
            "id": str(updated.get('_id')),
            "username": updated.get('username'),
            "fullName": updated.get('fullName'),
            "role": updated.get('role')
        }
    }), 200


@admin_bp.route('/users', methods=['GET'])
def get_users():
    """
    Lấy danh sách tất cả người dùng. Chỉ admin mới có quyền gọi.
    ---
    tags:
      - Admin
    security:
      - Bearer: []
    responses:
      200:
        description: Danh sách người dùng.
      401:
        description: Không xác thực.
      403:
        description: Không có quyền.
    """
    current_user, err = _get_current_user()
    if err:
        return err

    if current_user.get('role') != 'admin':
        return jsonify({"error": "Bạn không có quyền thực hiện thao tác này."}), 403

    users = list(mongo_collections.users.find({}, {
        "passwordHash": 0  # Không trả về password hash
    }).sort("createdAt", -1))

    users_list = []
    for user_doc in users:
        users_list.append({
            "id": str(user_doc.get('_id')),
            "username": user_doc.get('username'),
            "email": user_doc.get('email'),
            "fullName": user_doc.get('fullName'),
            "role": user_doc.get('role', 'user'),
            "status": user_doc.get('status', 'active'),
            "createdAt": user_doc.get('createdAt').isoformat() if user_doc.get('createdAt') else None
        })

    return jsonify({"users": users_list}), 200


@admin_bp.route('/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    """
    Xóa người dùng. Chỉ admin mới có quyền gọi.
    Admin không thể xóa admin khác và không thể xóa chính mình.
    ---
    tags:
      - Admin
    security:
      - Bearer: []
    parameters:
      - in: path
        name: user_id
        required: true
        type: string
        description: MongoDB ObjectId của người dùng cần xóa.
    responses:
      200:
        description: Xóa thành công.
      400:
        description: userId không hợp lệ.
      401:
        description: Không xác thực.
      403:
        description: Không có quyền hoặc không thể xóa admin/chính mình.
      404:
        description: Không tìm thấy người dùng.
    """
    current_user, err = _get_current_user()
    if err:
        return err

    if current_user.get('role') != 'admin':
        return jsonify({"error": "Bạn không có quyền thực hiện thao tác này."}), 403

    try:
        target_obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({"error": "userId không hợp lệ."}), 400

    # Không cho phép xóa chính mình
    if current_user.get('_id') == target_obj_id:
        return jsonify({"error": "Bạn không thể xóa chính mình."}), 403

    target_user = mongo_collections.users.find_one({"_id": target_obj_id})
    if not target_user:
        return jsonify({"error": "Không tìm thấy người dùng."}), 404

    # Không cho phép xóa admin khác
    if target_user.get('role') == 'admin':
        return jsonify({"error": "Bạn không thể xóa admin khác."}), 403

    mongo_collections.users.delete_one({"_id": target_obj_id})

    return jsonify({
        "message": "Đã xóa người dùng thành công.",
        "user": {
            "id": str(target_user.get('_id')),
            "username": target_user.get('username'),
            "fullName": target_user.get('fullName')
        }
    }), 200


@admin_bp.route('/users/<user_id>/lock', methods=['POST'])
def lock_user(user_id):
    """
    Khóa người dùng (status = 'locked').
    Không cho phép khóa admin và không cho phép khóa chính mình.
    """
    current_user, err = _get_current_user()
    if err:
        return err

    if current_user.get('role') != 'admin':
        return jsonify({"error": "Bạn không có quyền thực hiện thao tác này."}), 403

    try:
        target_obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({"error": "userId không hợp lệ."}), 400

    if current_user.get('_id') == target_obj_id:
        return jsonify({"error": "Bạn không thể khóa chính mình."}), 403

    target_user = mongo_collections.users.find_one({"_id": target_obj_id})
    if not target_user:
        return jsonify({"error": "Không tìm thấy người dùng."}), 404

    if target_user.get('role') == 'admin':
        return jsonify({"error": "Bạn không thể khóa admin."}), 403

    mongo_collections.users.update_one(
        {"_id": target_obj_id},
        {"$set": {"status": "locked", "updatedAt": datetime.datetime.utcnow()}}
    )

    updated = mongo_collections.users.find_one({"_id": target_obj_id})
    return jsonify({
        "message": "Đã khóa người dùng.",
        "user": {
            "id": str(updated.get('_id')),
            "username": updated.get('username'),
            "fullName": updated.get('fullName'),
            "status": updated.get('status')
        }
    }), 200


@admin_bp.route('/users/<user_id>/unlock', methods=['POST'])
def unlock_user(user_id):
    """
    Mở khóa người dùng (status = 'active').
    """
    current_user, err = _get_current_user()
    if err:
        return err

    if current_user.get('role') != 'admin':
        return jsonify({"error": "Bạn không có quyền thực hiện thao tác này."}), 403

    try:
        target_obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({"error": "userId không hợp lệ."}), 400

    mongo_collections.users.update_one(
        {"_id": target_obj_id},
        {"$set": {"status": "active", "updatedAt": datetime.datetime.utcnow()}}
    )

    updated = mongo_collections.users.find_one({"_id": target_obj_id})
    if not updated:
        return jsonify({"error": "Không tìm thấy người dùng."}), 404

    return jsonify({
        "message": "Đã mở khóa người dùng.",
        "user": {
            "id": str(updated.get('_id')),
            "username": updated.get('username'),
            "fullName": updated.get('fullName'),
            "status": updated.get('status')
        }
    }), 200


@admin_bp.route('/documents/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """
    Xóa tài liệu bất kỳ. Chỉ admin mới có quyền gọi.
    ---
    tags:
      - Admin
    security:
      - Bearer: []
    parameters:
      - in: path
        name: doc_id
        required: true
        type: string
        description: MongoDB ObjectId của tài liệu cần xóa.
    responses:
      200:
        description: Xóa thành công.
      400:
        description: doc_id không hợp lệ.
      401:
        description: Không xác thực.
      403:
        description: Không có quyền.
      404:
        description: Không tìm thấy tài liệu.
    """
    current_user, err = _get_current_user()
    if err:
        return err

    if current_user.get('role') != 'admin':
        return jsonify({"error": "Bạn không có quyền thực hiện thao tác này."}), 403

    try:
        doc_obj_id = ObjectId(doc_id)
    except Exception:
        return jsonify({"error": "doc_id không hợp lệ."}), 400

    # Lấy thông tin document
    doc = mongo_collections.documents.find_one({"_id": doc_obj_id})
    if not doc:
        return jsonify({"error": "Không tìm thấy tài liệu."}), 404

    # Xóa file trên S3 nếu có
    s3_url = doc.get('s3_url') or doc.get('s3Url')
    if s3_url:
        try:
            # Parse S3 URL để lấy key
            # Format: https://bucket.s3.region.amazonaws.com/key hoặc https://bucket.s3-region.amazonaws.com/key
            parsed = urlparse(s3_url)
            # Lấy path sau domain (bỏ dấu / đầu tiên)
            s3_key = parsed.path.lstrip('/')
            if s3_key:
                aws_service.delete_object(s3_key)
        except Exception as e:
            # Log lỗi nhưng vẫn tiếp tục xóa document trong DB
            print(f"[WARNING] Không thể xóa file S3 {s3_url}: {e}")

    # Xóa image trên S3 nếu có
    image_url = doc.get('image_url') or doc.get('imageUrl')
    if image_url and image_url.startswith('http'):
        try:
            parsed = urlparse(image_url)
            image_key = parsed.path.lstrip('/')
            if image_key:
                aws_service.delete_object(image_key)
        except Exception as e:
            print(f"[WARNING] Không thể xóa image S3 {image_url}: {e}")

    # Xóa document trong MongoDB
    result = mongo_collections.documents.delete_one({"_id": doc_obj_id})
    if result.deleted_count == 0:
        return jsonify({"error": "Xóa tài liệu thất bại."}), 500

    # Xóa view history liên quan
    try:
        mongo_collections.view_history.delete_many({"documentId": doc_obj_id})
    except Exception as e:
        print(f"[WARNING] Không thể xóa view history: {e}")

    # Xóa reactions liên quan (nếu có)
    try:
        mongo_collections.document_reactions.delete_many({"documentId": doc_obj_id})
    except Exception as e:
        print(f"[WARNING] Không thể xóa reactions: {e}")

    # Xóa comments liên quan (nếu có)
    try:
        mongo_collections.document_comments.delete_many({"documentId": doc_obj_id})
    except Exception as e:
        print(f"[WARNING] Không thể xóa comments: {e}")

    return jsonify({
        "message": "Đã xóa tài liệu thành công.",
        "document": {
            "id": str(doc.get('_id')),
            "title": doc.get('title')
        }
    }), 200

