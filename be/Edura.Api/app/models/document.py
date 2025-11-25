# app/models/document.py
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId

class Document:
    def __init__(
        self,
        title: str,
        s3_url: str,
        user_id: str,
        summary: str,
        keywords: list[str],
        school_id: str | None = None,
        category_id: str | None = None,
        image_url: str | None = None,              # <-- NEW
        pages: int | None = None,
        created_at=None,
        doc_id=None,
        **kwargs
    ):
        if school_id is None:
            school_id = kwargs.get("schoolId")
        if category_id is None:
            category_id = kwargs.get("categoryId")

        self.id = doc_id
        self.title = title
        self.s3_url = s3_url
        self.summary = summary or ""
        self.keywords = keywords or []
        self.image_url = image_url                # <-- NEW

        self.user_id = self._to_oid(user_id, field="user_id")
        self.school_id = self._to_oid(school_id, field="school_id") if school_id else None
        self.category_id = self._to_oid(category_id, field="category_id") if category_id else None
        self.created_at = created_at if created_at is not None else datetime.utcnow()
        raw_pages = pages if pages is not None else kwargs.get("pages") or kwargs.get("pageCount")
        try:
            self.pages = int(raw_pages) if raw_pages is not None else None
        except (TypeError, ValueError):
            self.pages = None

    def _to_oid(self, value, field=""):
        if isinstance(value, ObjectId):
            return value
        try:
            return ObjectId(str(value))
        except (InvalidId, TypeError):
            raise ValueError(f"{field or 'ObjectId'} không hợp lệ: {value}")

    def to_mongo_doc(self) -> dict:
        doc = {
            "title": self.title,
            "s3_url": self.s3_url,
            "userId": self.user_id,
            "summary": self.summary,
            "keywords": self.keywords,
            "createdAt": self.created_at,
        }
        if self.image_url:                         # <-- NEW
            doc["image_url"] = self.image_url
        if self.pages is not None:
            doc["pages"] = self.pages
        if self.school_id:
            doc["schoolId"] = self.school_id
        if self.category_id:
            doc["categoryId"] = self.category_id
        if self.id:
            doc["_id"] = self.id
        return doc
