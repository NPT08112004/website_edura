# app/utils/profanity_filter.py
"""
Utility để lọc từ cấm trong tin nhắn chat
"""
import re


# Danh sách từ cấm (có thể mở rộng thêm)
PROFANITY_WORDS = [
    # Tiếng Việt
    "địt", "đụ", "đéo", "đĩ", "đồng tính", "lồn", "buồi", "cặc", "cứt",
    "đái", "ỉa", "đụ má", "đụ mẹ", "đụ cha", "đụ bố", "đụ ông", "đụ bà",
    "chó", "chết tiệt", "đồ chó", "đồ khốn", "đồ ngu", "ngu si", "ngu dốt",
    "đồ ngu xuẩn", "đồ đần", "đồ ngốc", "đồ dốt", "đồ khờ",
    "mẹ mày", "má mày", "cha mày", "bố mày", "ông mày", "bà mày",
    "mẹ kiếp", "cha kiếp", "đồ khốn nạn", "đồ súc vật",
    
    # Tiếng Anh
    "fuck", "fucking", "fucked", "fucker", "fuckers",
    "shit", "shitting", "shitted", "shitty",
    "bitch", "bitches", "bitching",
    "ass", "asses", "asshole", "assholes",
    "damn", "damned", "damning",
    "hell", "hells",
    "crap", "craps", "crappy",
    "piss", "pissing", "pissed",
    "dick", "dicks", "dickhead",
    "cock", "cocks",
    "pussy", "pussies",
    "bastard", "bastards",
    "motherfucker", "motherfuckers",
    "son of a bitch",
    "goddamn", "goddamned",
    
    # Từ viết tắt/tránh né
    "f*ck", "f**k", "f***", "sh*t", "s**t", "b*tch", "a**", "a**hole",
    "đ*t", "đ**", "đ***", "đ*o", "l*n", "b*i", "c*c", "c*t",
]


def filter_profanity(text: str, replacement: str = "***") -> str:
    """
    Lọc từ cấm trong text và thay thế bằng replacement (mặc định: ***)
    
    Args:
        text: Text cần lọc
        replacement: Ký tự thay thế (mặc định: ***)
    
    Returns:
        Text đã được lọc
    """
    if not text or not isinstance(text, str):
        return text
    
    # Tạo pattern để match từ cấm (case-insensitive, word boundary)
    filtered_text = text
    
    for word in PROFANITY_WORDS:
        # Escape special regex characters
        escaped_word = re.escape(word)
        # Match whole word (case-insensitive)
        pattern = r'\b' + escaped_word + r'\b'
        # Replace với replacement
        filtered_text = re.sub(pattern, replacement, filtered_text, flags=re.IGNORECASE)
    
    return filtered_text


def contains_profanity(text: str) -> bool:
    """
    Kiểm tra xem text có chứa từ cấm không
    
    Args:
        text: Text cần kiểm tra
    
    Returns:
        True nếu có từ cấm, False nếu không
    """
    if not text or not isinstance(text, str):
        return False
    
    text_lower = text.lower()
    for word in PROFANITY_WORDS:
        # Check với word boundary
        pattern = r'\b' + re.escape(word) + r'\b'
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    
    return False

