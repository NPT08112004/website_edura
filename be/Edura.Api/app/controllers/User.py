# app/models/User.py
from datetime import datetime

class User:
    """
    Model đại diện User trong MongoDB (collection 'users').
    Dùng chung cho đăng ký/đăng nhập và phân quyền user/admin.
    """

    def __init__(
        self,
        username: str,
        password_hash: str,
        full_name: str,
        role: str = "user",
        status: str = "active",
        created_at: datetime = None,
        updated_at: datetime = None,
        user_id=None,
        email: str = None,
        avatar_url: str = None,
    ):
        self.id = user_id                    # _id (ObjectId) dưới dạng str hoặc ObjectId
        self.username = username
        self.email = email
        self.password_hash = password_hash   # bcrypt hash
        self.full_name = full_name
        self.role = role                     # "user" | "admin"
        self.status = status                 # "active" | "locked"
        self.avatar_url = avatar_url
        self.created_at = created_at or datetime.utcnow()
        self.updated_at = updated_at or datetime.utcnow()

    def to_mongo_doc(self):
        doc = {
            "username": self.username,
            "email": self.email,
            "passwordHash": self.password_hash,
            "fullName": self.full_name,
            "role": self.role,
            "status": self.status,
            "avatarUrl": self.avatar_url,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }
        if self.id:
            doc["_id"] = self.id
        return doc

    @staticmethod
    def from_mongo_doc(doc):
        if not doc:
            return None
        # _id có thể là ObjectId → convert sang str để FE dùng
        _id = doc.get("_id")
        try:
            _id = str(_id) if _id is not None else None
        except Exception:
            pass

        return User(
            username=doc.get("username"),
            email=doc.get("email"),
            password_hash=doc.get("passwordHash"),
            full_name=doc.get("fullName"),
            role=doc.get("role", "user"),
            status=doc.get("status", "active"),
            created_at=doc.get("createdAt"),
            updated_at=doc.get("updatedAt"),
            user_id=_id,
            avatar_url=doc.get("avatarUrl"),
        )

    def to_public_dict(self):
        """Dùng cho trả về FE (ẩn password)."""
        return {
            "id": str(self.id) if self.id else None,
            "username": self.username,
            "email": self.email,
            "fullName": self.full_name,
            "role": self.role,
            "status": self.status,
            "avatarUrl": self.avatar_url,
            "createdAt": self.created_at,
        }
