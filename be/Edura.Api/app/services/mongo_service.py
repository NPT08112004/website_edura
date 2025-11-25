# app/services/mongo_service.py
from pymongo import MongoClient, TEXT
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_CONNECTION_STRING")
DATABASE_NAME = os.getenv("DATABASE_NAME", "DACN") 

if not MONGO_URI:
    raise ValueError("MONGO_CONNECTION_STRING chưa được cấu hình trong .env")

class Collections:
    def __init__(self):
            print("Đang kết nối MongoDB...")
            self.client = MongoClient(MONGO_URI)
            self.db = self.client[DATABASE_NAME]

            # Collections
            self.users = self.db["users"]
            self.documents = self.db["documents"]
            self.schools = self.db["schools"]
            self.categories = self.db["categories"]

            # NEW:
            self.quizzes = self.db["quizzes"]
            self.quiz_attempts = self.db["quiz_attempts"]
            self.point_txns = self.db["point_txns"]
            self.view_history = self.db["view_history"]
            self.chat_messages = self.db["chat_messages"]
            self.document_reactions = self.db["document_reactions"]
            self.document_comments = self.db["document_comments"]
            self.password_reset_codes = self.db["password_reset_codes"]
            self.payment_transactions = self.db["payment_transactions"]

            self._ensure_indexes()
            print("Kết nối MongoDB thành công và Index đã được kiểm tra.")

    def _has_index_by_fields(self, collection, fields):
        """Kiểm tra xem collection đã có index với fields này chưa (không quan tâm tên)"""
        try:
            existing_indexes = collection.index_information()
            for idx in existing_indexes.values():
                idx_keys = [key for key, _ in idx.get("key", [])]
                # Kiểm tra xem tất cả fields có trong index không
                if all(field in idx_keys for field in fields):
                    return True
            return False
        except Exception:
            return False

    def _ensure_indexes(self):
        try:
            # Unique index cho users.username
            if "ix_users_username" not in self.users.index_information():
                self.users.create_index([("username", 1)], unique=True, name="ix_users_username")

            # Unique index cho schools.name
            if "ix_schools_name" not in self.schools.index_information():
                self.schools.create_index([("name", 1)], unique=True, name="ix_schools_name")

            # Unique index cho categories.name
            if "ix_categories_name" not in self.categories.index_information():
                self.categories.create_index([("name", 1)], unique=True, name="ix_categories_name")

            # Text index cho documents: tìm kiếm theo tiêu đề + tóm tắt + keywords
            # (keywords là mảng string, Mongo sẽ index từng phần tử)
            if "ix_documents_text" not in self.documents.index_information():
                self.documents.create_index(
                    [("title", TEXT), ("summary", TEXT), ("keywords", TEXT)],
                    name="ix_documents_text"
                )
            if "ix_quizzes_creator" not in self.quizzes.index_information():
                self.quizzes.create_index([("creatorId", 1), ("createdAt", -1)], name="ix_quizzes_creator")

            if "ix_quiz_attempts_user" not in self.quiz_attempts.index_information():
                self.quiz_attempts.create_index([("userId", 1), ("quizId", 1), ("startedAt", -1)], name="ix_quiz_attempts_user")

            if "ix_point_txns_user" not in self.point_txns.index_information():
                self.point_txns.create_index([("userId", 1), ("createdAt", -1)], name="ix_point_txns_user")

            # Index cho view_history: tìm nhanh theo userId và documentId
            if "ix_view_history_user" not in self.view_history.index_information():
                self.view_history.create_index([("userId", 1), ("viewedAt", -1)], name="ix_view_history_user")
            if "ix_view_history_doc" not in self.view_history.index_information():
                self.view_history.create_index([("documentId", 1), ("viewedAt", -1)], name="ix_view_history_doc")
            
            # Index cho document_reactions và document_comments để tối ưu aggregation
            # Kiểm tra xem đã có index cho documentId chưa (theo fields, không chỉ tên)
            if not self._has_index_by_fields(self.document_reactions, ["documentId"]):
                try:
                    self.document_reactions.create_index([("documentId", 1)], name="ix_document_reactions_doc")
                except Exception as e:
                    print(f"Lỗi khi tạo index ix_document_reactions_doc: {e}")
            
            if not self._has_index_by_fields(self.document_comments, ["documentId"]):
                try:
                    self.document_comments.create_index([("documentId", 1)], name="ix_document_comments_doc")
                except Exception as e:
                    print(f"Lỗi khi tạo index ix_document_comments_doc: {e}")
            
            # Index cho documents để tối ưu sort và filter
            if "ix_documents_createdAt" not in self.documents.index_information():
                self.documents.create_index([("createdAt", -1)], name="ix_documents_createdAt")
            if "ix_documents_created_at" not in self.documents.index_information():
                self.documents.create_index([("created_at", -1)], name="ix_documents_created_at")

            # Index cho chat_messages
            if "ix_chat_messages_conv" not in self.chat_messages.index_information():
                self.chat_messages.create_index([("conversationKey", 1), ("createdAt", -1)], name="ix_chat_messages_conv")
            if "ix_chat_messages_participant" not in self.chat_messages.index_information():
                self.chat_messages.create_index([("participants", 1), ("createdAt", -1)], name="ix_chat_messages_participant")

            # Unique index cho document_reactions (documentId + userId)
            if not self._has_index_by_fields(self.document_reactions, ["documentId", "userId"]):
                try:
                    self.document_reactions.create_index([("documentId", 1), ("userId", 1)], unique=True, name="ix_doc_reactions_unique")
                except Exception as e:
                    print(f"Lỗi khi tạo index ix_doc_reactions_unique: {e}")
            
            # Compound index cho document_comments (documentId + createdAt)
            if not self._has_index_by_fields(self.document_comments, ["documentId", "createdAt"]):
                try:
                    self.document_comments.create_index([("documentId", 1), ("createdAt", -1)], name="ix_doc_comments_doc")
                except Exception as e:
                    print(f"Lỗi khi tạo index ix_doc_comments_doc: {e}")
            
            # Index cho password reset codes: TTL index để tự động xóa sau 10 phút
            if "ix_password_reset_codes_ttl" not in self.password_reset_codes.index_information():
                self.password_reset_codes.create_index([("createdAt", 1)], expireAfterSeconds=600, name="ix_password_reset_codes_ttl")
            if "ix_password_reset_codes_email" not in self.password_reset_codes.index_information():
                self.password_reset_codes.create_index([("email", 1), ("createdAt", -1)], name="ix_password_reset_codes_email")
            
            # Index cho payment transactions
            if "ix_payment_transactions_order" not in self.payment_transactions.index_information():
                self.payment_transactions.create_index([("orderId", 1)], unique=True, name="ix_payment_transactions_order")
            if "ix_payment_transactions_user" not in self.payment_transactions.index_information():
                self.payment_transactions.create_index([("userId", 1), ("createdAt", -1)], name="ix_payment_transactions_user")
            if "ix_payment_transactions_status" not in self.payment_transactions.index_information():
                self.payment_transactions.create_index([("status", 1), ("createdAt", -1)], name="ix_payment_transactions_status")
        except Exception as e:
            print(f"Lỗi khi kiểm tra/tạo index MongoDB: {e}")

mongo_collections = Collections()
