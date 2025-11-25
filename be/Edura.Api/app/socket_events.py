# app/socket_events.py
# -*- coding: utf-8 -*-

from flask import request, current_app
from flask_socketio import join_room, leave_room, emit
from datetime import datetime
from bson import ObjectId
from bson.errors import InvalidId
import jwt
import os
from jwt import ExpiredSignatureError, InvalidTokenError

from app import socketio
from app.services.mongo_service import mongo_collections

_user_sessions: dict[str, dict] = {}


def _resolve_secret():
    return (
        current_app.config.get("JWT_KEY")
        or os.getenv("JWT_KEY")
        or current_app.config.get("JWT_SECRET")
        or current_app.config.get("JWT_SECRET_KEY")
        or "dev_secret"
    )


def _authenticate_connection():
    token = request.args.get("token")
    if not token:
        raise InvalidTokenError("Thiếu token")
    payload = jwt.decode(token, _resolve_secret(), algorithms=["HS256"], options={"verify_aud": False})
    uid_raw = payload.get("userId") or payload.get("id") or payload.get("_id") or payload.get("sub")
    uid = ObjectId(str(uid_raw))
    user_doc = mongo_collections.users.find_one(
        {"_id": uid},
        {"username": 1, "fullName": 1, "avatarUrl": 1}
    )
    if not user_doc:
        raise InvalidTokenError("User không tồn tại")
    return uid, user_doc


def _conversation_key(user_a: ObjectId | str, user_b: ObjectId | str, document_id: ObjectId | str) -> str:
    ids = sorted([str(user_a), str(user_b)])
    return f"{ids[0]}::{ids[1]}::{str(document_id)}"


@socketio.on("connect")
def handle_connect():
    try:
        user_id, user_doc = _authenticate_connection()
    except ExpiredSignatureError:
        return False
    except InvalidTokenError:
        return False
    except Exception:
        return False

    _user_sessions[request.sid] = {
        "userId": str(user_id),
        "userDoc": {
            "id": str(user_id),
            "username": user_doc.get("username"),
            "fullName": user_doc.get("fullName"),
            "avatarUrl": user_doc.get("avatarUrl"),
        },
    }
    emit("chat:connected", {"userId": str(user_id)})


@socketio.on("disconnect")
def handle_disconnect():
    session = _user_sessions.pop(request.sid, None)
    if session and session.get("room"):
        leave_room(session["room"])


@socketio.on("chat:join")
def handle_join_chat(data):
    session = _user_sessions.get(request.sid)
    if not session:
        emit("chat:error", {"message": "Chưa xác thực"})
        return

    document_id = data.get("documentId")
    target_user_id = data.get("targetUserId")
    if not document_id or not target_user_id:
        emit("chat:error", {"message": "Thiếu tham số"})
        return

    try:
        doc_oid = ObjectId(str(document_id))
        target_oid = ObjectId(str(target_user_id))
        current_oid = ObjectId(session["userId"])
    except (InvalidId, TypeError):
        emit("chat:error", {"message": "documentId hoặc targetUserId không hợp lệ"})
        return

    room = _conversation_key(current_oid, target_oid, doc_oid)
    join_room(room)
    session["room"] = room
    emit("chat:joined", {"conversationKey": room})


@socketio.on("chat:leave")
def handle_leave_chat(data):
    session = _user_sessions.get(request.sid)
    if not session:
        return
    room = session.get("room")
    if room:
        leave_room(room)
        session.pop("room", None)
        emit("chat:left", {"conversationKey": room})


@socketio.on("chat:message")
def handle_chat_message(data):
    session = _user_sessions.get(request.sid)
    if not session:
        emit("chat:error", {"message": "Chưa xác thực"})
        return

    message_type = data.get("type", "text")
    content = (data.get("content") or "").strip()
    image_url = data.get("imageUrl")
    document_id = data.get("documentId")
    target_user_id = data.get("targetUserId")
    conversation_key = data.get("conversationKey")

    if message_type == "text" and not content:
        emit("chat:error", {"message": "Tin nhắn trống"})
        return
    if message_type == "image" and not image_url:
        emit("chat:error", {"message": "Thiếu ảnh"})
        return

    try:
        current_oid = ObjectId(session["userId"])
        doc_oid = ObjectId(str(document_id))
        target_oid = ObjectId(str(target_user_id))
    except (InvalidId, TypeError):
        emit("chat:error", {"message": "ID không hợp lệ"})
        return

    if not conversation_key:
        conversation_key = _conversation_key(current_oid, target_oid, doc_oid)

    # Lọc từ cấm trong tin nhắn text
    if message_type == "text" and content:
        from app.utils.profanity_filter import filter_profanity
        original_content = content
        content = filter_profanity(content, replacement="***")
        if original_content != content:
            print(f"[CHAT FILTER] Đã lọc từ cấm trong tin nhắn từ user {current_oid}")

    message_doc = {
        "conversationKey": conversation_key,
        "participants": sorted([current_oid, target_oid], key=lambda x: str(x)),
        "documentId": doc_oid,
        "senderId": current_oid,
        "type": message_type,
        "content": content if message_type == "text" else None,
        "imageUrl": image_url if message_type == "image" else None,
        "createdAt": datetime.utcnow(),
    }

    result = mongo_collections.chat_messages.insert_one(message_doc)

    # Đảm bảo content đã được lọc (nếu chưa lọc ở trên)
    payload_content = content if message_type == "text" else None
    if message_type == "text" and payload_content:
        # Content đã được lọc ở trên, nhưng đảm bảo payload cũng dùng content đã lọc
        payload_content = message_doc.get("content")

    payload = {
        "id": str(result.inserted_id),
        "conversationKey": conversation_key,
        "documentId": str(doc_oid),
        "senderId": str(current_oid),
        "sender": session["userDoc"],
        "type": message_type,
        "content": payload_content,
        "imageUrl": image_url,
        "createdAt": message_doc["createdAt"].isoformat() + "Z",
    }

    emit("chat:message", payload, room=conversation_key)
