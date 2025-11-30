#!/usr/bin/env python
# app/utils/search_utils.py
# -*- coding: utf-8 -*-

"""
Core search utilities
- Chuẩn hoá tiếng Việt (bỏ dấu, lowercase)
- Tokenize theo từ, giữ khoảng trắng (không ghép dính mọi thứ lại)
- Tính điểm relevance theo field: title / keywords / summary

Mục tiêu:
- Gõ "toán" chỉ ưu tiên tài liệu có từ "toán" trong title/keywords
- Gõ "AI" không bị dính "đại", "bài", "tài", ...
- Có thể xếp hạng kết quả giống phong cách Google (relevance + thời gian)
"""

import re
import unicodedata
from functools import lru_cache
from typing import List, Union


# ------------------------------------------------------------
# 1. Chuẩn hoá & tokenize
# ------------------------------------------------------------


@lru_cache(maxsize=2000)
def strip_vn(text: str) -> str:
    """
    Bỏ dấu tiếng Việt + lowercase, giữ nguyên khoảng trắng.

    Ví dụ:
        "Kế toán"     -> "ke toan"
        "Trí tuệ"     -> "tri tue"
        "Đại học CNTT" -> "dai hoc cntt"
    """
    if not text:
        return ""

    text = text.lower()
    # Chuẩn hoá unicode rồi bỏ các dấu (combining marks)
    norm = unicodedata.normalize("NFD", text)
    norm = "".join(ch for ch in norm if not unicodedata.combining(ch))
    # Đặc biệt cho đ/Đ
    norm = norm.replace("đ", "d").replace("Đ", "d")
    return norm


@lru_cache(maxsize=2000)
def tokenize(text: str) -> List[str]:
    """
    Chuẩn hoá + tách từ (tokens) chỉ gồm [a-z0-9].

    - Thay toàn bộ ký tự không phải chữ/số thành khoảng trắng.
    - Loại bỏ token rỗng.
    """
    if not text:
        return []

    text_no_accents = strip_vn(text)
    # Mọi thứ không phải a-z0-9 -> space
    cleaned = re.sub(r"[^a-z0-9]+", " ", text_no_accents)
    tokens = [t for t in cleaned.split() if t]
    return tokens


# ------------------------------------------------------------
# 2. Scoring helpers
# ------------------------------------------------------------


# Một số từ rất ngắn/ít nghĩa – có thể muốn bỏ qua trong tương lai nếu cần
SHORT_STOPWORDS = {"va", "la", "là", "is", "of", "to", "in"}


def _score_field(
    query_tokens: List[str],
    field_tokens: List[str],
    field_text_normalized: str,
    *,
    weight_exact: float,
    weight_prefix: float,
    weight_short_exact: float,
) -> float:
    """
    Tính điểm cho 1 field (title / keywords / summary).

    Logic mới (chặt chẽ hơn):
    - Với query 1 từ: chỉ match nếu từ đó xuất hiện như một từ RIÊNG BIỆT trong field.
      Ví dụ: search "toán" chỉ match "Toán cao cấp", KHÔNG match "Kế toán" (vì "toán" chỉ là phần của "kế toán").
    - Với query nhiều từ: tất cả từ phải có trong field (có thể không liên tiếp).
    
    Args:
        query_tokens: Tokens của query
        field_tokens: Tokens của field (đã tokenize)
        field_text_normalized: Text của field đã normalize (bỏ dấu, lowercase, giữ khoảng trắng)
    """
    if not query_tokens or not field_tokens:
        return 0.0

    score = 0.0
    field_tokens_set = set(field_tokens)
    
    # Query chỉ có 1 token: yêu cầu match chính xác với một từ riêng biệt
    if len(query_tokens) == 1:
        qt = query_tokens[0]
        if not qt:
            return 0.0

<<<<<<< HEAD
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
=======
        # Token cực ngắn (<= 2 ký tự): chỉ match exact, không prefix
        if len(qt) <= 2:
            if qt in field_tokens_set and qt not in SHORT_STOPWORDS:
                # Kiểm tra thêm: token phải là một từ riêng biệt, không phải phần của từ khác
                # Tìm vị trí của token trong field_text_normalized
                pattern = r'\b' + re.escape(qt) + r'\b'
                if re.search(pattern, field_text_normalized):
                    score += weight_short_exact
>>>>>>> 334d70619b199e9190dec5345667a795bf4cd1f3
        else:
            # Token dài: ưu tiên exact match
            if qt in field_tokens_set:
                # Kiểm tra word boundary để đảm bảo là từ riêng biệt
                pattern = r'\b' + re.escape(qt) + r'\b'
                if re.search(pattern, field_text_normalized):
                    score += weight_exact
            else:
                # Prefix match (chỉ khi token >= 3 ký tự)
                for ft in field_tokens:
                    if len(ft) > len(qt) and ft.startswith(qt):
                        # Kiểm tra word boundary
                        pattern = r'\b' + re.escape(ft) + r'\b'
                        if re.search(pattern, field_text_normalized):
                            score += weight_prefix
                            break
    else:
        # Query nhiều từ: tất cả từ phải có trong field
        all_matched = True
        for qt in query_tokens:
            if not qt:
                continue
            
            if len(qt) <= 2:
                if qt not in field_tokens_set or qt in SHORT_STOPWORDS:
                    all_matched = False
                    break
                # Kiểm tra word boundary
                pattern = r'\b' + re.escape(qt) + r'\b'
                if not re.search(pattern, field_text_normalized):
                    all_matched = False
                    break
            else:
                if qt in field_tokens_set:
                    # Kiểm tra word boundary
                    pattern = r'\b' + re.escape(qt) + r'\b'
                    if not re.search(pattern, field_text_normalized):
                        all_matched = False
                        break
                else:
                    # Thử prefix match
                    found = False
                    for ft in field_tokens:
                        if len(ft) > len(qt) and ft.startswith(qt):
                            pattern = r'\b' + re.escape(ft) + r'\b'
                            if re.search(pattern, field_text_normalized):
                                found = True
                                break
                    if not found:
                        all_matched = False
                        break
        
<<<<<<< HEAD
        if field_text:
            # Summary: Cho phép match không dấu không khoảng trắng nhưng ưu tiên từ đầy đủ
            if _match_field(query, field_text, allow_no_space=True):
                return True
    
    return False
=======
        if all_matched:
            # Tính điểm dựa trên số lượng tokens match
            base_score = weight_exact if len(query_tokens) <= 2 else weight_exact * 0.8
            score = base_score * len(query_tokens)

    return score


# ------------------------------------------------------------
# 3. API chính: tính điểm relevance cho document
# ------------------------------------------------------------


def calculate_relevance_score(
    query: str,
    title: str = "",
    keywords: List[str] | None = None,
    summary: str = "",
) -> float:
    """
    Tính điểm relevance (độ liên quan) cho 1 document.

    Luật chính:
    - Bắt buộc phải có match trong title HOẶC keywords thì document
      mới được coi là liên quan (score > 0).
    - Summary chỉ cộng thêm điểm, không đủ để tài liệu xuất hiện một mình.

    Trọng số:
    - Title:
        - exact word:   100
        - prefix match:  70
        - short exact:   60  (ví dụ: "ai" trong "AI")
    - Keywords:
        - exact word:    80
        - prefix match:  60
        - short exact:   50
    - Summary:
        - exact word:    40
        - prefix match:  25
        - short exact:   20
    """
    if not query or not query.strip():
        return 0.0

    query_tokens = tokenize(query)
    if not query_tokens:
        return 0.0

    title_tokens = tokenize(title)
    title_normalized = strip_vn(title)
    
    keywords_text = " ".join([str(k) for k in (keywords or []) if k])
    keywords_tokens = tokenize(keywords_text)
    keywords_normalized = strip_vn(keywords_text)
    
    summary_tokens = tokenize(summary)
    summary_normalized = strip_vn(summary)

    # Điểm cho title & keywords (primary match)
    # Logic mới: với query 1 từ, chỉ match nếu từ đó là một từ RIÊNG BIỆT
    # Ví dụ: search "toán" chỉ match "Toán cao cấp", KHÔNG match "Kế toán"
    title_score = _score_field(
        query_tokens,
        title_tokens,
        title_normalized,
        weight_exact=100.0,
        weight_prefix=70.0,
        weight_short_exact=60.0,
    )
    keywords_score = _score_field(
        query_tokens,
        keywords_tokens,
        keywords_normalized,
        weight_exact=80.0,
        weight_prefix=60.0,
        weight_short_exact=50.0,
    )

    primary_score = title_score + keywords_score
    if primary_score <= 0:
        # Không match trong title/keywords -> coi như không liên quan
        return 0.0

    # Summary chỉ cộng thêm điểm nếu đã match ở title/keywords
    summary_score = _score_field(
        query_tokens,
        summary_tokens,
        summary_normalized,
        weight_exact=40.0,
        weight_prefix=25.0,
        weight_short_exact=20.0,
    )

    return primary_score + summary_score


# ------------------------------------------------------------
# 4. API boolean: dùng nhanh để filter
# ------------------------------------------------------------


def search_in_multiple_fields(query: str, *fields: Union[str, List[str]]) -> bool:
    """
    API boolean đơn giản để filter nhanh.

    Logic:
    - Gộp các fields: title, keywords (list), summary ... thành đúng 3 nhóm:
      title, keywords, summary (nếu gọi đúng thứ tự).
    - Tính score bằng `calculate_relevance_score`.
    - Trả về True nếu score > 0.

    Lưu ý:
    - Để ranking đẹp hơn, nên dùng trực tiếp `calculate_relevance_score`
      trong controller và sort theo điểm.
    """
    if not query or not query.strip():
        return True

    title = ""
    keywords: List[str] = []
    summary = ""

    # Hỗ trợ gọi theo dạng (query, title, keywords, summary)
    if len(fields) >= 1 and isinstance(fields[0], str):
        title = fields[0] or ""
    if len(fields) >= 2:
        if isinstance(fields[1], list):
            keywords = [str(k) for k in fields[1] if k]
        elif isinstance(fields[1], str):
            keywords = [fields[1]]
    if len(fields) >= 3 and isinstance(fields[2], str):
        summary = fields[2] or ""

    score = calculate_relevance_score(query, title, keywords, summary)
    return score > 0.0
>>>>>>> 334d70619b199e9190dec5345667a795bf4cd1f3

