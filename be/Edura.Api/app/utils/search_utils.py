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


def _match_field(query: str, field_text: str, allow_no_space: bool = True) -> bool:
    """
    Kiểm tra query có match với field_text không.
    Hỗ trợ cả 2 cách: match từ đầy đủ (có khoảng trắng) và match không dấu không khoảng trắng.
    
    Args:
        query: Chuỗi tìm kiếm
        field_text: Text cần tìm trong đó
        allow_no_space: Cho phép match không khoảng trắng (ví dụ: "kythuat" match "kỹ thuật")
    
    Returns:
        True nếu match
    """
    if not query or not field_text:
        return False
    
    query = query.strip()
    field_text = str(field_text).strip()
    
    if not query or not field_text:
        return False
    
    # Cách 1: Match không dấu, không khoảng trắng (linh hoạt nhất)
    # Ví dụ: "kythuat" match "kỹ thuật", "ky thuat" match "kỹ thuật"
    if allow_no_space:
        query_norm = normalize_search(query)  # Bỏ dấu + bỏ khoảng trắng
        field_norm = normalize_search(field_text)  # Bỏ dấu + bỏ khoảng trắng
        
        if query_norm and field_norm and query_norm in field_norm:
            return True
    
    # Cách 2: Match từ đầy đủ (chính xác hơn, tránh match substring sai)
    # Bỏ dấu nhưng giữ khoảng trắng để tách từ
    query_no_accent = strip_vn(query)
    field_no_accent = strip_vn(field_text)
    
    query_words = [w for w in query_no_accent.split() if w]
    field_words = [w for w in field_no_accent.split() if w]
    
    if not query_words or not field_words:
        return False
    
    # Kiểm tra tất cả các từ trong query đều có trong field
    # Cho phép match từ đầy đủ hoặc từ bắt đầu (để hỗ trợ từ ghép)
    all_words_found = all(
        any(
            query_word == field_word or  # Match chính xác
            (len(query_word) >= 3 and field_word.startswith(query_word))  # Match từ bắt đầu (từ ghép)
            for field_word in field_words
        )
        for query_word in query_words
    )
    
    if all_words_found:
        return True
    
    return False


def search_in_multiple_fields(query: str, *fields: str) -> bool:
    """
    Tìm kiếm query trong nhiều fields với thứ tự ưu tiên:
    1. Title (fields[0]) - ưu tiên cao nhất, return ngay nếu match
    2. Keywords (fields[1]) - ưu tiên cao, return ngay nếu match
    3. Summary và các fields khác (fields[2+]) - ưu tiên thấp
    
    Hỗ trợ tìm kiếm linh hoạt:
    - Không dấu: "toan" match "toán"
    - Không khoảng trắng: "kythuat" match "kỹ thuật"
    - Cả hai: "kythuat" match "Kỹ Thuật"
    
    Args:
        query: Chuỗi tìm kiếm
        *fields: Các fields cần tìm theo thứ tự ưu tiên
                - fields[0]: title (ưu tiên cao nhất)
                - fields[1]: keywords (ưu tiên cao)
                - fields[2+]: summary và các fields khác (ưu tiên thấp)
    
    Returns:
        True nếu query match với bất kỳ field nào (theo thứ tự ưu tiên)
    """
    if not query:
        return True  # Nếu không có query, match tất cả
    
    query = query.strip()
    if not query:
        return True
    
    # Ưu tiên 1: Tìm trong title (fields[0])
    if len(fields) > 0:
        title = fields[0]
        if title:
            if isinstance(title, list):
                title_text = " ".join([str(f) for f in title if f])
            else:
                title_text = str(title)
            
            if title_text and _match_field(query, title_text, allow_no_space=True):
                return True  # Match title → return ngay
    
    # Ưu tiên 2: Tìm trong keywords (fields[1])
    if len(fields) > 1:
        keywords = fields[1]
        if keywords:
            if isinstance(keywords, list):
                keywords_text = " ".join([str(f) for f in keywords if f])
            else:
                keywords_text = str(keywords)
            
            if keywords_text and _match_field(query, keywords_text, allow_no_space=True):
                return True  # Match keywords → return ngay
    
    # Ưu tiên 3: Tìm trong summary và các fields khác (fields[2+])
    # Summary cần match chặt chẽ hơn (chỉ match từ đầy đủ, không match substring)
    for idx in range(2, len(fields)):
        field = fields[idx]
        if not field:
            continue
        
        if isinstance(field, list):
            field_text = " ".join([str(f) for f in field if f])
        else:
            field_text = str(field)
        
        if field_text:
            # Summary: Cho phép match không dấu không khoảng trắng nhưng ưu tiên từ đầy đủ
            if _match_field(query, field_text, allow_no_space=True):
                return True
    
    return False

