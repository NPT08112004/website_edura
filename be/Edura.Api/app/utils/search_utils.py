# app/utils/search_utils.py
# -*- coding: utf-8 -*-
"""
Utilities for search normalization
- Bỏ dấu tiếng Việt
- Bỏ khoảng trắng để tìm kiếm linh hoạt (ví dụ: "ky thuat" hoặc "kythuat" đều tìm được "kỹ thuật")
"""
import unicodedata
import re


def strip_vn(s: str) -> str:
    """
    Bỏ dấu tiếng Việt + lower-case (không phụ thuộc phiên bản Mongo).
    
    Ví dụ:
        "Kỹ Thuật" -> "ky thuat"
        "Đại Học" -> "dai hoc"
    """
    if not s:
        return ""
    s = s.lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.replace("đ", "d").replace("Đ", "d")


def normalize_search(s: str) -> str:
    """
    Chuẩn hóa chuỗi tìm kiếm: bỏ dấu + bỏ khoảng trắng + lower-case.
    Cho phép tìm kiếm linh hoạt: "ky thuat", "kythuat", "kỹ thuật" đều match.
    
    Ví dụ:
        "Kỹ Thuật" -> "kythuat"
        "ky thuat" -> "kythuat"
        "kythuat" -> "kythuat"
        "Đại Học Bách Khoa" -> "daihocbachkhoa"
    """
    if not s:
        return ""
    
    # Bỏ dấu trước
    normalized = strip_vn(s)
    
    # Bỏ tất cả khoảng trắng và ký tự đặc biệt không cần thiết
    # Giữ lại chữ, số
    normalized = re.sub(r'[^\w]', '', normalized)
    
    return normalized


def normalize_for_matching(text: str) -> str:
    """
    Chuẩn hóa text để so sánh khi search (giống normalize_search).
    Dùng cho cả query và document content.
    """
    return normalize_search(text)


def search_in_text(query: str, text: str) -> bool:
    """
    Kiểm tra xem query (đã normalize) có trong text (đã normalize) không.
    
    Args:
        query: Chuỗi tìm kiếm (có thể có dấu, có khoảng trắng)
        text: Text cần tìm trong đó
    
    Returns:
        True nếu query match với text
    """
    if not query or not text:
        return False
    
    query_norm = normalize_search(query)
    text_norm = normalize_for_matching(text)
    
    return query_norm in text_norm


def search_in_multiple_fields(query: str, *fields: str) -> bool:
    """
    Tìm kiếm query trong nhiều fields (title, keywords, summary, ...).
    
    Args:
        query: Chuỗi tìm kiếm
        *fields: Các fields cần tìm (có thể là string hoặc list)
    
    Returns:
        True nếu query match với bất kỳ field nào
    """
    if not query:
        return True  # Nếu không có query, match tất cả
    
    query_norm = normalize_search(query)
    
    for field in fields:
        if not field:
            continue
        
        # Nếu field là list (như keywords), join lại
        if isinstance(field, list):
            field_text = " ".join([str(f) for f in field if f])
        else:
            field_text = str(field)
        
        field_norm = normalize_for_matching(field_text)
        if query_norm in field_norm:
            return True
    
    return False

