# app/__init__.py
from flask import Flask, jsonify
from dotenv import load_dotenv
import os
from flasgger import Swagger
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.exceptions import HTTPException

# SocketIO: bắt buộc dùng threading để chạy trên Render
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")


# Rate limiting (optional - chỉ import nếu đã cài đặt)
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    LIMITER_AVAILABLE = True
except ImportError:
    LIMITER_AVAILABLE = False
    print("[WARNING] flask-limiter chưa được cài đặt. Rate limiting sẽ không hoạt động.")
    print("[INFO] Cài đặt: pip install flask-limiter")


def create_app():
    load_dotenv()
    app = Flask(__name__)

    # Validate required environment variables
    REQUIRED_ENV_VARS = ['JWT_KEY']
    missing = [var for var in REQUIRED_ENV_VARS if not os.getenv(var)]
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

    # JWT config
    app.config["JWT_KEY"] = os.getenv("JWT_KEY")
    app.config["JWT_ISSUER"] = os.getenv("JWT_ISSUER")
    app.config["JWT_AUDIENCE"] = os.getenv("JWT_AUDIENCE")

    # Base secret key
    flask_secret = os.getenv("FLASK_SECRET_KEY")
    if not flask_secret:
        raise ValueError("FLASK_SECRET_KEY must be set in environment variables")
    app.config["SECRET_KEY"] = flask_secret
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB

    # CORS
    cors_origins = os.getenv("CORS_ORIGINS", "*")
    if cors_origins != "*":
        cors_origins = [origin.strip() for origin in cors_origins.split(",")]

    CORS(
        app,
        resources={r"/api/*": {
            "origins": cors_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "expose_headers": ["Authorization"],
            "supports_credentials": os.getenv("CORS_SUPPORTS_CREDENTIALS", "false").lower() == "true",
        }},
        supports_credentials=os.getenv("CORS_SUPPORTS_CREDENTIALS", "false").lower() == "true",
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
        expose_headers=["Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    )

    # Swagger
    swagger_template = {
        "swagger": "2.0",
        "info": {
            "title": "Edura API",
            "description": "API cho upload tài liệu (S3) và metadata (Mongo) + Lookups",
            "version": "1.0.0",
        },
        "basePath": "/",
        "schemes": ["http", "https"],
        "securityDefinitions": {
            "Bearer": {
                "type": "apiKey",
                "name": "Authorization",
                "in": "header",
                "description": "Ví dụ: Bearer <token>",
            }
        },
    }
    Swagger(app, template=swagger_template)

    # Blueprints
    from app.controllers.auth import auth_bp
    from app.controllers.documents import documents_bp
    from app.controllers.lookups import lookups_bp
    from app.controllers.search import search_bp
    from app.controllers.admin import admin_bp
    from app.controllers.quizzes import quizzes_bp
    from app.controllers.profile import profile_bp
    from app.controllers.chat import chat_bp
    from app.controllers.mobile_documents import mobile_documents_bp, mobile_home_bp
    from app.controllers.payments import payments_bp

    app.register_blueprint(quizzes_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(lookups_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(mobile_documents_bp)
    app.register_blueprint(mobile_home_bp)
    app.register_blueprint(payments_bp)

    # Error handlers
    @app.errorhandler(413)
    def payload_too_large(e):
        return jsonify({"error": "File quá lớn. Giới hạn 100MB."}), 413

    @app.errorhandler(HTTPException)
    def handle_http_exception(e: HTTPException):
        return jsonify({"error": e.name, "detail": e.description}), e.code

    @app.errorhandler(Exception)
    def handle_unexpected(e):
        app.logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return jsonify({"error": "Lỗi hệ thống. Vui lòng thử lại sau."}), 500

    # Security headers
    @app.after_request
    def set_security_headers(response):
        from flask import request

        if request.method == 'OPTIONS':
            return response

        response.headers['X-Content-Type-Options'] = 'nosniff'
        is_production = os.getenv('FLASK_ENV') == 'production'

        if '/raw' not in request.path:
            response.headers['X-Frame-Options'] = 'DENY'
        elif is_production:
            response.headers['X-Frame-Options'] = 'SAMEORIGIN'

        response.headers['X-XSS-Protection'] = '1; mode=block'

        if is_production:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        return response

    # Rate Limiting
    is_production = os.getenv('FLASK_ENV') == 'production'
    if LIMITER_AVAILABLE:
        if is_production:
            default_limits = ["200 per day", "50 per hour"]
        else:
            default_limits = ["10000 per day", "1000 per hour", "200 per minute"]

        limiter = Limiter(
            app=app,
            key_func=get_remote_address,
            default_limits=default_limits,
            storage_uri="memory://",
            headers_enabled=True
        )
        app.config['LIMITER'] = limiter
    else:
        app.config['LIMITER'] = None

    # Initialize SocketIO with threading mode
    socketio.init_app(app)

    from app import socket_events  # noqa: F401

    return app
