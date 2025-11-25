from flask import Blueprint, request, jsonify
from app.services.mongo_service import mongo_collections
from bson import ObjectId
import jwt
import os
import datetime

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

