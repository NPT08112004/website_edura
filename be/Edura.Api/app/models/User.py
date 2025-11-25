# app/models/user.py

from datetime import datetime

# Python sử dụng dictionary (dict) để đại diện cho MongoDB document.
# Class này chỉ là một định nghĩa giúp code dễ đọc hơn.

class User:
    def __init__(self, username, password_hash, full_name, created_at=None, user_id=None):
        # Tương đương [BsonId, BsonRepresentation(BsonType.ObjectId)]
        self.id = user_id
        # Tương đương [BsonElement("username")]
        self.username = username
        # Tương đương [BsonElement("passwordHash")]
        self.password_hash = password_hash
        
        self.full_name = full_name
        # Tương đương [BsonElement("createdAt")]
        self.created_at = created_at if created_at is not None else datetime.utcnow()

    # Phương thức để chuyển đổi đối tượng Python thành Dict để chèn vào MongoDB
    def to_mongo_doc(self):
        doc = {
            "username": self.username,
            "passwordHash": self.password_hash,
            "fullName": self.full_name,
            "createdAt": self.created_at
        }
        if self.id:
            doc["_id"] = self.id
        return doc