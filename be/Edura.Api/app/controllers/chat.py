# app/controllers/chat.py
# -*- coding: utf-8 -*-

from flask import Blueprint, request, jsonify, current_app
from datetime import datetime
from bson import ObjectId
from bson.errors import InvalidId
from jwt import ExpiredSignatureError, InvalidTokenError
import jwt
import os
import uuid

from app.services.mongo_service import mongo_collections
from app.services.aws_service import aws_service

chat_bp = Blueprint("chat", __name__, url_prefix="/api/chat")

ALLOWED_IMAGE_EXT = {"png", "jpg", "jpeg", "webp", "gif"}


def _resolve_jwt_secret():
    """Lấy JWT secret từ config hoặc env, bắt buộc phải có"""
    secret = (
        current_app.config.get("JWT_KEY")
        or os.getenv("JWT_KEY")
    )
    if not secret:
        raise ValueError("JWT_KEY chưa được cấu hình trong environment variables")
    return secret


def _get_current_user_strict(return_doc: bool = False):
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        raise InvalidTokenError("Thiếu Bearer token")
    token = auth.split(" ", 1)[1].strip()
    secret = _resolve_jwt_secret()
    payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
    uid_raw = payload.get("userId") or payload.get("id") or payload.get("_id") or payload.get("sub")
    uid = ObjectId(str(uid_raw))
    projection = {"username": 1, "fullName": 1, "email": 1, "avatarUrl": 1}
    user_doc = mongo_collections.users.find_one({"_id": uid}, projection)
    if not user_doc:
        raise InvalidTokenError("User không tồn tại")
    if return_doc:
        return uid, user_doc
    return uid, None


def _conversation_key(user_a: ObjectId, user_b: ObjectId, document_id: ObjectId) -> str:
    ids = sorted([str(user_a), str(user_b)])
    return f"{ids[0]}::{ids[1]}::{str(document_id)}"


@chat_bp.route("/history", methods=["GET"])
def get_chat_history():
    try:
        current_user_id, current_user_doc = _get_current_user_strict(return_doc=True)
    except ExpiredSignatureError:
        return jsonify({"error": "JWT hết hạn. Vui lòng đăng nhập lại."}), 401
    except InvalidTokenError as e:
        return jsonify({"error": f"Token không hợp lệ: {e}"}), 401
    except Exception as e:
        return jsonify({"error": f"Lỗi xác thực: {e}"}), 401

    document_id = request.args.get("documentId")
    target_user_id = request.args.get("targetUserId")
    limit = int(request.args.get("limit", "100"))

    if not document_id or not target_user_id:
        return jsonify({"error": "Thiếu documentId hoặc targetUserId"}), 400

    try:
        doc_oid = ObjectId(str(document_id))
        target_oid = ObjectId(str(target_user_id))
    except (InvalidId, TypeError):
        return jsonify({"error": "documentId hoặc targetUserId không hợp lệ"}), 400

    conversation_key = _conversation_key(current_user_id, target_oid, doc_oid)

    cursor = (
        mongo_collections.chat_messages
        .find({"conversationKey": conversation_key})
        .sort("createdAt", 1)
        .limit(limit)
    )
    # Lọc từ cấm trong tin nhắn khi trả về lịch sử
    from app.utils.profanity_filter import filter_profanity
    
    messages = []
    for msg in cursor:
        content = msg.get("content")
        # Lọc từ cấm nếu là tin nhắn text
        if msg.get("type", "text") == "text" and content:
            content = filter_profanity(content, replacement="***")
        
        messages.append({
            "id": str(msg.get("_id")),
            "conversationKey": msg.get("conversationKey"),
            "documentId": str(msg.get("documentId")),
            "senderId": str(msg.get("senderId")),
            "targetUserId": str(target_oid),
            "type": msg.get("type", "text"),
            "content": content,
            "imageUrl": msg.get("imageUrl"),
            "createdAt": (msg.get("createdAt") or datetime.utcnow()).isoformat() + "Z",
        })

    partner_doc = mongo_collections.users.find_one({"_id": target_oid}, {"username": 1, "fullName": 1, "avatarUrl": 1})
    partner = None
    if partner_doc:
        partner = {
            "id": str(partner_doc.get("_id")),
            "username": partner_doc.get("username"),
            "fullName": partner_doc.get("fullName"),
            "avatarUrl": partner_doc.get("avatarUrl"),
        }

    me_payload = {
        "id": str(current_user_id),
        "username": current_user_doc.get("username"),
        "fullName": current_user_doc.get("fullName"),
        "avatarUrl": current_user_doc.get("avatarUrl"),
    }

    return jsonify({
        "conversationKey": conversation_key,
        "messages": messages,
        "me": me_payload,
        "partner": partner,
    })


@chat_bp.route("/upload", methods=["POST"])
def upload_chat_image():
    try:
        current_user_id, _ = _get_current_user_strict()
    except ExpiredSignatureError:
        return jsonify({"error": "JWT hết hạn. Vui lòng đăng nhập lại."}), 401
    except InvalidTokenError as e:
        return jsonify({"error": f"Token không hợp lệ: {e}"}), 401
    except Exception as e:
        return jsonify({"error": f"Lỗi xác thực: {e}"}), 401

    document_id = request.form.get("documentId")
    target_user_id = request.form.get("targetUserId")

    if not document_id or not target_user_id:
        return jsonify({"error": "Thiếu documentId hoặc targetUserId"}), 400

    try:
        doc_oid = ObjectId(str(document_id))
        target_oid = ObjectId(str(target_user_id))
    except (InvalidId, TypeError):
        return jsonify({"error": "documentId hoặc targetUserId không hợp lệ"}), 400

    if "file" not in request.files:
        return jsonify({"error": "Thiếu file"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "File không hợp lệ"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        return jsonify({"error": "Định dạng ảnh không được hỗ trợ"}), 400

    conversation_key = _conversation_key(current_user_id, target_oid, doc_oid)

    object_key = f"chat-images/{conversation_key.replace('::', '/')}/{uuid.uuid4()}.{ext}"
    try:
        file.stream.seek(0)
    except Exception:
        pass
    upload_url = aws_service.upload_file(file.stream, object_key, file.mimetype or "image/jpeg")

    if not upload_url:
        return jsonify({"error": "Upload ảnh lên S3 thất bại"}), 500

    return jsonify({"imageUrl": upload_url, "conversationKey": conversation_key})


@chat_bp.route("/conversations", methods=["GET"])
def list_conversations():
    try:
        current_user_id, current_user_doc = _get_current_user_strict(return_doc=True)
    except ExpiredSignatureError:
        return jsonify({"error": "JWT hết hạn. Vui lòng đăng nhập lại."}), 401
    except InvalidTokenError as e:
        return jsonify({"error": f"Token không hợp lệ: {e}"}), 401
    except Exception as e:
        return jsonify({"error": f"Lỗi xác thực: {e}"}), 401

    pipeline = [
        {"$match": {"participants": current_user_id}},
        {"$sort": {"createdAt": -1}},
        {
            "$group": {
                "_id": "$conversationKey",
                "lastMessage": {"$first": "$$ROOT"},
            }
        },
        {"$sort": {"lastMessage.createdAt": -1}},
        {"$limit": 100},
    ]

    raw_conversations = list(mongo_collections.chat_messages.aggregate(pipeline))

    partner_ids = set()
    document_ids = set()

    conversations = []
    for entry in raw_conversations:
        last_msg = entry.get("lastMessage") or {}
        convo_key = entry.get("_id")
        raw_participants = last_msg.get("participants", [])
        participants = [str(p) for p in raw_participants]
        doc_id = last_msg.get("documentId")
        if isinstance(doc_id, ObjectId):
            document_ids.add(doc_id)
        partner_id = None
        for pid in raw_participants:
            if str(pid) != str(current_user_id):
                partner_id = pid
                break
        if partner_id:
            partner_ids.add(partner_id)
        conversations.append({
            "conversationKey": convo_key,
            "documentId": str(doc_id) if doc_id else None,
            "participants": participants,
            "lastMessage": {
                "type": last_msg.get("type", "text"),
                "content": last_msg.get("content"),
                "imageUrl": last_msg.get("imageUrl"),
                "createdAt": (last_msg.get("createdAt") or datetime.utcnow()).isoformat() + "Z",
            },
            "partnerId": str(partner_id) if partner_id else None,
        })

    users_map = {}
    if partner_ids:
        cursor = mongo_collections.users.find(
            {"_id": {"$in": list(partner_ids)}},
            {"username": 1, "fullName": 1, "avatarUrl": 1}
        )
        for user_doc in cursor:
            users_map[str(user_doc["_id"])] = {
                "id": str(user_doc["_id"]),
                "username": user_doc.get("username"),
                "fullName": user_doc.get("fullName"),
                "avatarUrl": user_doc.get("avatarUrl"),
            }

    documents_map = {}
    if document_ids:
        cursor = mongo_collections.documents.find(
            {"_id": {"$in": list(document_ids)}},
            {"title": 1}
        )
        for doc in cursor:
            documents_map[str(doc["_id"])] = {
                "id": str(doc["_id"]),
                "title": doc.get("title"),
            }

    # Lọc từ cấm trong lastMessage
    from app.utils.profanity_filter import filter_profanity
    
    for convo in conversations:
        pid = convo.get("partnerId")
        if pid and pid in users_map:
            convo["partner"] = users_map[pid]
        doc_id = convo.get("documentId")
        if doc_id and doc_id in documents_map:
            convo["document"] = documents_map[doc_id]
        
        # Lọc từ cấm trong lastMessage content
        if convo.get("lastMessage") and convo["lastMessage"].get("type") == "text":
            content = convo["lastMessage"].get("content")
            if content:
                convo["lastMessage"]["content"] = filter_profanity(content, replacement="***")

    me_payload = {
        "id": str(current_user_id),
        "username": current_user_doc.get("username"),
        "fullName": current_user_doc.get("fullName"),
        "avatarUrl": current_user_doc.get("avatarUrl"),
    }

    return jsonify({
        "me": me_payload,
        "conversations": conversations,
    }), 200
