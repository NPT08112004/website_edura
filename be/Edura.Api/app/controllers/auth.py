# app/controllers/auth.py

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import os
import random
import re
from google.oauth2 import id_token
from google.auth.transport import requests
from app.services.mongo_service import mongo_collections
from app.services.email_service import send_verification_code_email

# Tạo Blueprint (Tương đương [ApiController] [Route("api/auth")])
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Lấy cấu hình JWT từ biến môi trường
JWT_KEY = os.getenv("JWT_KEY")
JWT_ISSUER = os.getenv("JWT_ISSUER")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE")
try:
    # Lấy thời gian hết hạn từ biến môi trường
    GLOBAL_JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", 120))
except (ValueError, TypeError):
    GLOBAL_JWT_EXPIRES_MINUTES = 120

if not JWT_KEY:
    raise ValueError("JWT_KEY chưa được cấu hình!")


def decode_jwt_strict(token: str):
    """
    Decode JWT token và trả về payload.
    Ném exception nếu token không hợp lệ hoặc đã hết hạn.
    
    Args:
        token: JWT token string
    
    Returns:
        dict: Payload của JWT token
    
    Raises:
        jwt.ExpiredSignatureError: Token đã hết hạn
        jwt.InvalidTokenError: Token không hợp lệ
    """
    decode_kwargs = {
        'key': JWT_KEY,
        'algorithms': ['HS256'],
    }
    if JWT_AUDIENCE:
        decode_kwargs['audience'] = JWT_AUDIENCE
    if JWT_ISSUER:
        decode_kwargs['issuer'] = JWT_ISSUER
    
    payload = jwt.decode(token, **decode_kwargs)
    return payload


def generate_jwt(user_id, username, expires_minutes): 
    """Tạo JWT token, tương đương GenerateJwt(User u).
    Sử dụng datetime aware cho exp/iat để tránh lệch múi giờ dẫn đến ExpiredSignatureError."""

    now_utc = datetime.datetime.utcnow()
    expires = now_utc + datetime.timedelta(minutes=expires_minutes)

    payload = {
        'sub': str(user_id),
        'unique_name': username,
        'exp': expires,              # datetime trực tiếp, PyJWT sẽ xử lý đúng
        'iat': now_utc,
    }
    # Chỉ thêm iss/aud nếu có cấu hình
    if JWT_ISSUER:
        payload['iss'] = JWT_ISSUER
    if JWT_AUDIENCE:
        payload['aud'] = JWT_AUDIENCE

    token = jwt.encode(payload, JWT_KEY, algorithm='HS256')
    return token


def _apply_rate_limit_if_available(route_func):
    """Apply rate limiting nếu flask-limiter có sẵn"""
    try:
        from flask import current_app
        limiter = current_app.config.get('LIMITER')
        if limiter:
            return limiter.limit("5 per minute")(route_func)
    except Exception:
        pass
    return route_func


@auth_bp.route('/register', methods=['POST'])
@_apply_rate_limit_if_available
def register():
    """
    Endpoint Đăng ký người dùng mới.
    ---
    tags:
      - Authentication
    parameters:
      - name: body
        in: body
        required: true
        schema:
          id: Register
          required:
            - username
            - password
            - fullName
          properties:
            username:
              type: string
              description: Email dùng làm username.
            password:
              type: string
              description: Mật khẩu.
            fullName:
              type: string
              description: Họ và tên người dùng.
    responses:
      200:
        description: Đăng ký thành công và trả về thông tin người dùng.
        schema:
          properties:
            id:
              type: string
              description: MongoDB ObjectId của người dùng.
            username:
              type: string
            fullName:
              type: string
      400:
        description: Thiếu username, password hoặc fullName.
      409:
        description: Username đã tồn tại.
    """
    data = request.get_json() 
    username = data.get('username')
    password = data.get('password')
    full_name = data.get('fullName')

    # Validate input với validation utilities
    try:
        from app.utils.validation import validate_username, validate_password, validate_full_name
        username = validate_username(username)
        password = validate_password(password)
        full_name = validate_full_name(full_name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    user_doc = mongo_collections.users.find_one({"username": username})
    if user_doc:
        return jsonify({"error": "Username đã tồn tại."}), 409 # Conflict

    password_hash = generate_password_hash(password, method='pbkdf2:sha256', salt_length=16) 

    # Luôn đặt role mặc định là 'user' khi đăng ký
    user = {
        "username": username.strip(),
        "passwordHash": password_hash,
        "fullName": full_name.strip(),
        "role": "user",
        "status": "active",
        "points": 0,
        "createdAt": datetime.datetime.utcnow(),
        "updatedAt": datetime.datetime.utcnow()
    }
    
    result = mongo_collections.users.insert_one(user)
    
    return jsonify({
        "id": str(result.inserted_id),
        "username": user["username"],
        "fullName": user["fullName"]
    }), 200 # Ok


@auth_bp.route('/login', methods=['POST'])
@_apply_rate_limit_if_available
def login():
    """
    Endpoint Đăng nhập người dùng và trả về JWT token.
    ---
    tags:
      - Authentication
    parameters:
      - name: body
        in: body
        required: true
        schema:
          id: Login
          required:
            - username
            - password
          properties:
            username:
              type: string
              description: Email/Username.
            password:
              type: string
              description: Mật khẩu.
    responses:
      200:
        description: Đăng nhập thành công và trả về token.
        schema:
          properties:
            token:
              type: string
              description: JSON Web Token (JWT).
            user:
              type: object
              properties:
                id:
                  type: string
                username:
                  type: string
      401:
        description: Sai username hoặc mật khẩu.
    """
    data = request.get_json() 
    username = data.get('username')
    password = data.get('password')

    user_doc = mongo_collections.users.find_one({"username": username})
    
    if not user_doc:
        return jsonify({"error": "Sai username hoặc mật khẩu."}), 401 # Unauthorized
    
    # Kiểm tra status của user
    user_status = user_doc.get("status", "active")
    if user_status == "locked":
        return jsonify({
            "error": "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ đến email toivaem136317@gmail.com để được hỗ trợ."
        }), 403 # Forbidden
    
    if check_password_hash(user_doc["passwordHash"], password):
        user_id = user_doc["_id"]
        
        token = generate_jwt(user_id, user_doc["username"], GLOBAL_JWT_EXPIRES_MINUTES)
        
        return jsonify({
            "token": token,
            "user": {
                "id": str(user_id),
                "username": user_doc["username"],
                "fullName": user_doc.get("fullName", None),
                "role": user_doc.get("role", "user"),
                "status": user_doc.get("status", "active")
            }
        }), 200 # Ok
    else:
        return jsonify({"error": "Sai username hoặc mật khẩu."}), 401 # Unauthorized


@auth_bp.route('/google', methods=['POST'])
@_apply_rate_limit_if_available
def google_login():
    """
    Endpoint Đăng nhập bằng Google OAuth.
    Xác thực Google ID token và tạo/tìm user trong database.
    ---
    tags:
      - Authentication
    parameters:
      - name: body
        in: body
        required: true
        schema:
          id: GoogleLogin
          required:
            - idToken
          properties:
            idToken:
              type: string
              description: Google ID token từ client.
    responses:
      200:
        description: Đăng nhập thành công và trả về token.
        schema:
          properties:
            token:
              type: string
              description: JSON Web Token (JWT).
            user:
              type: object
              properties:
                id:
                  type: string
                username:
                  type: string
                fullName:
                  type: string
      400:
        description: Token không hợp lệ hoặc thiếu thông tin.
      401:
        description: Xác thực Google thất bại.
    """
    data = request.get_json()
    id_token_str = data.get('idToken')
    
    if not id_token_str:
        return jsonify({"error": "Thiếu Google ID token."}), 400
    
    try:
        # Lấy Google Client ID từ biến môi trường
        GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
        if not GOOGLE_CLIENT_ID:
            return jsonify({"error": "Google OAuth chưa được cấu hình trên server."}), 500
        
        # Xác thực Google ID token
        request_obj = requests.Request()
        try:
            idinfo = id_token.verify_oauth2_token(
                id_token_str, 
                request_obj, 
                GOOGLE_CLIENT_ID
            )
        except ValueError as e:
            # Token không hợp lệ hoặc đã hết hạn
            return jsonify({"error": f"Google token không hợp lệ: {str(e)}"}), 401
        
        # Lấy thông tin từ Google
        google_id = idinfo.get('sub')
        email = idinfo.get('email')
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')
        
        if not google_id or not email:
            return jsonify({"error": "Không thể lấy thông tin từ Google token."}), 400
        
        # Tìm user theo googleId hoặc email (username)
        user_doc = mongo_collections.users.find_one({
            "$or": [
                {"googleId": google_id},
                {"username": email.lower()}
            ]
        })
        
        if user_doc:
            # User đã tồn tại - cập nhật thông tin nếu cần
            update_data = {
                "updatedAt": datetime.datetime.utcnow()
            }
            
            # Nếu chưa có googleId, thêm vào
            if not user_doc.get("googleId"):
                update_data["googleId"] = google_id
            
            # Cập nhật tên nếu có
            if name and not user_doc.get("fullName"):
                update_data["fullName"] = name
            
            # Cập nhật avatar nếu có
            if picture and not user_doc.get("avatar"):
                update_data["avatar"] = picture
            
            if len(update_data) > 1:  # Nếu có thay đổi (ngoài updatedAt)
                mongo_collections.users.update_one(
                    {"_id": user_doc["_id"]},
                    {"$set": update_data}
                )
                # Lấy lại user doc sau khi update
                user_doc = mongo_collections.users.find_one({"_id": user_doc["_id"]})
            
            # Kiểm tra status
            user_status = user_doc.get("status", "active")
            if user_status == "locked":
                return jsonify({
                    "error": "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ đến email toivaem136317@gmail.com để được hỗ trợ."
                }), 403
            
            user_id = user_doc["_id"]
            username = user_doc.get("username", email.lower())
        else:
            # Tạo user mới
            user = {
                "username": email.lower(),
                "googleId": google_id,
                "fullName": name if name else email.split('@')[0],
                "role": "user",
                "status": "active",
                "points": 0,
                "createdAt": datetime.datetime.utcnow(),
                "updatedAt": datetime.datetime.utcnow()
            }
            
            # Thêm avatar nếu có
            if picture:
                user["avatar"] = picture
            
            # Không cần passwordHash cho Google users
            result = mongo_collections.users.insert_one(user)
            user_id = result.inserted_id
            username = user["username"]
            user_doc = user
            user_doc["_id"] = user_id
        
        # Tạo JWT token
        token = generate_jwt(user_id, username, GLOBAL_JWT_EXPIRES_MINUTES)
        
        return jsonify({
            "token": token,
            "user": {
                "id": str(user_id),
                "username": username,
                "fullName": user_doc.get("fullName", ""),
                "role": user_doc.get("role", "user"),
                "status": user_doc.get("status", "active"),
                "avatar": user_doc.get("avatar")
            }
        }), 200
        
    except Exception as e:
        # Log lỗi chi tiết cho debugging
        import traceback
        print(f"Google login error: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"error": f"Lỗi xử lý đăng nhập Google: {str(e)}"}), 500


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
    Endpoint Gửi mã xác thực đến email để đặt lại mật khẩu.
    Trong hệ thống, username chính là email của người dùng.
    ---
    tags:
      - Authentication
    parameters:
      - name: body
        in: body
        required: true
        schema:
          id: ForgotPassword
          required:
            - email
          properties:
            email:
              type: string
              description: Email của người dùng (username).
    responses:
      200:
        description: Mã xác thực đã được gửi đến email.
      400:
        description: Thiếu email hoặc email không hợp lệ.
    """
    data = request.get_json()
    email = data.get('email')
    
    if not email or not email.strip():
        return jsonify({"error": "Vui lòng nhập email."}), 400
    
    email = email.strip().lower()
    
    # Kiểm tra định dạng email
    email_pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    if not re.match(email_pattern, email):
        return jsonify({"error": "Email không hợp lệ."}), 400
    
    # Tìm user theo username (vì username chính là email trong hệ thống)
    user_doc = mongo_collections.users.find_one({"username": email})
    
    if not user_doc:
        # Không tiết lộ email có tồn tại hay không (bảo mật)
        return jsonify({
            "message": "Nếu email tồn tại trong hệ thống, mã xác thực đã được gửi."
        }), 200
    
    # Lấy email từ username (username chính là email)
    user_email = user_doc.get("username")
    
    if not user_email:
        return jsonify({
            "error": "Không tìm thấy email trong tài khoản."
        }), 400
    
    # Tạo mã xác thực 6 chữ số
    verification_code = str(random.randint(100000, 999999))
    
    # Lưu mã vào database với thời gian hết hạn (10 phút)
    reset_code_doc = {
        "email": user_email,
        "code": verification_code,
        "userId": user_doc["_id"],
        "username": user_doc.get("username"),  # Lưu thêm username để dễ tìm
        "createdAt": datetime.datetime.utcnow(),
        "used": False
    }
    
    # Xóa các mã cũ của email này (nếu có)
    mongo_collections.password_reset_codes.delete_many({
        "email": user_email,
        "used": False
    })
    
    # Lưu mã mới
    mongo_collections.password_reset_codes.insert_one(reset_code_doc)
    
    # Gửi email
    email_sent, error_message = send_verification_code_email(user_email, verification_code)
    
    if not email_sent:
        # Trả về thông báo lỗi chi tiết hơn (chỉ trong development)
        error_detail = error_message if os.getenv("FLASK_ENV") == "development" else "Không thể gửi email. Vui lòng kiểm tra cấu hình email server."
        return jsonify({
            "error": error_detail
        }), 500
    
    return jsonify({
        "message": "Mã xác thực đã được gửi đến email của bạn."
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Endpoint Đặt lại mật khẩu mới sau khi xác thực mã.
    Trong hệ thống, username chính là email của người dùng.
    ---
    tags:
      - Authentication
    parameters:
      - name: body
        in: body
        required: true
        schema:
          id: ResetPassword
          required:
            - email
            - code
            - newPassword
          properties:
            email:
              type: string
              description: Email của người dùng (username).
            code:
              type: string
              description: Mã xác thực 6 chữ số.
            newPassword:
              type: string
              description: Mật khẩu mới.
    responses:
      200:
        description: Đặt lại mật khẩu thành công.
      400:
        description: Mã xác thực không hợp lệ hoặc đã hết hạn.
      404:
        description: Không tìm thấy tài khoản.
    """
    data = request.get_json()
    email = data.get('email')
    code = data.get('code')
    new_password = data.get('newPassword')
    
    if not email or not code or not new_password:
        return jsonify({"error": "Vui lòng nhập đầy đủ email, mã xác thực và mật khẩu mới."}), 400
    
    # Bỏ ràng buộc độ dài mật khẩu - cho phép tự do đặt mật khẩu
    if not new_password.strip():
        return jsonify({"error": "Mật khẩu không được để trống."}), 400
    
    email = email.strip().lower()
    code = code.strip()
    
    # Kiểm tra định dạng email
    email_pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    if not re.match(email_pattern, email):
        return jsonify({"error": "Email không hợp lệ."}), 400
    
    # Tìm mã xác thực theo email (email chính là username)
    reset_code_doc = mongo_collections.password_reset_codes.find_one({
        "email": email,
        "code": code,
        "used": False
    })
    
    if not reset_code_doc:
        return jsonify({
            "error": "Mã xác thực không hợp lệ hoặc đã hết hạn. Vui lòng thử lại."
        }), 400
    
    # Kiểm tra mã có hết hạn chưa (10 phút)
    created_at = reset_code_doc.get("createdAt")
    if created_at:
        elapsed = (datetime.datetime.utcnow() - created_at).total_seconds()
        if elapsed > 600:  # 10 phút
            return jsonify({
                "error": "Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới."
            }), 400
    
    # Tìm user theo userId từ reset_code_doc hoặc theo username (email)
    user_id = reset_code_doc.get("userId")
    user_doc = mongo_collections.users.find_one({"_id": user_id})
    
    # Xác minh thêm: user phải có username trùng với email
    if not user_doc or user_doc.get("username") != email:
        return jsonify({"error": "Không tìm thấy tài khoản."}), 404
    
    # Cập nhật mật khẩu mới
    new_password_hash = generate_password_hash(new_password.strip(), method='pbkdf2:sha256', salt_length=16)
    
    mongo_collections.users.update_one(
        {"_id": user_id},
        {
            "$set": {
                "passwordHash": new_password_hash,
                "updatedAt": datetime.datetime.utcnow()
            }
        }
    )
    
    # Đánh dấu mã đã sử dụng
    mongo_collections.password_reset_codes.update_one(
        {"_id": reset_code_doc["_id"]},
        {"$set": {"used": True}}
    )
    
    return jsonify({
        "message": "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới."
    }), 200