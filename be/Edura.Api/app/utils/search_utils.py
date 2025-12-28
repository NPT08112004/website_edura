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

        # Token cực ngắn (<= 2 ký tự): chỉ match exact, không prefix
        if len(qt) <= 2:
            if qt in field_tokens_set and qt not in SHORT_STOPWORDS:
                # Kiểm tra thêm: token phải là một từ riêng biệt, không phải phần của từ khác
                # Tìm vị trí của token trong field_text_normalized
                pattern = r'\b' + re.escape(qt) + r'\b'
                if re.search(pattern, field_text_normalized):
                    score += weight_short_exact
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
    category_name: str = "",
    summary: str = "",  # Giữ parameter để tương thích, nhưng không dùng
) -> float:
    """
    Tính điểm relevance (độ liên quan) cho 1 document.
    
    THỨ TỰ ƯU TIÊN: Category > Title > Keywords
    Hỗ trợ tìm kiếm không dấu và không khoảng cách.

    Luật chính:
    - Bắt buộc phải có match trong category HOẶC title HOẶC keywords thì document
      mới được coi là liên quan (score > 0).

    Trọng số (theo thứ tự ưu tiên):
    - Category (ưu tiên cao nhất):
        - match từ đầu:   150
        - match ở giữa:    120
    - Title:
        - match từ đầu:   100
        - match ở giữa:    80
    - Keywords (ưu tiên thấp nhất):
        - match từ đầu:    60
        - match ở giữa:     40
    
    Hỗ trợ tìm kiếm:
    - Không dấu: "laptrinh" match "Lập trình"
    - Không khoảng cách: "laptrinh" match "Lập trình"
    - Case-insensitive: "LAPTRINH" match "lập trình"
    """
    if not query or not query.strip():
        return 0.0

    # Normalize query: bỏ dấu, bỏ khoảng cách, lowercase
    # Đây là cách chính để hỗ trợ tìm kiếm không dấu, không khoảng cách
    query_normalized = strip_vn(query.strip())
    query_normalized = re.sub(r"[^a-z0-9]+", "", query_normalized)
    
    if not query_normalized or len(query_normalized) < 1:
        return 0.0

    # Normalize category, title và keywords: bỏ dấu, bỏ khoảng cách, lowercase
    category_normalized_no_space = ""
    if category_name:
        category_normalized = strip_vn(category_name)
        category_normalized_no_space = re.sub(r"[^a-z0-9]+", "", category_normalized)
    
    title_normalized_no_space = ""
    if title:
    title_normalized = strip_vn(title)
        title_normalized_no_space = re.sub(r"[^a-z0-9]+", "", title_normalized)
    
    keywords_normalized_no_space = ""
    keywords_text = " ".join([str(k) for k in (keywords or []) if k])
    if keywords_text:
    keywords_normalized = strip_vn(keywords_text)
        keywords_normalized_no_space = re.sub(r"[^a-z0-9]+", "", keywords_normalized)

    # Kiểm tra match không dấu, không khoảng cách
    # THỨ TỰ ƯU TIÊN: Category > Title > Keywords
    # CHỈ TÍNH ĐIỂM TỪ NGUỒN ƯU TIÊN CAO NHẤT (không cộng điểm từ nhiều nguồn)
    
    # Category match: ưu tiên cao nhất - phải match chính xác trong category name
    # Chỉ match nếu query thực sự liên quan đến category (không phải substring ngẫu nhiên)
    has_category_match = False
    if category_normalized_no_space and len(query_normalized) >= 3:
        # Match từ đầu category -> chắc chắn liên quan
        if category_normalized_no_space.startswith(query_normalized):
            has_category_match = True
        elif query_normalized in category_normalized_no_space:
            # Match ở giữa: CHỈ match nếu query là một từ riêng biệt
            # Kiểm tra word boundary trong category name gốc
            query_len = len(query_normalized)
            category_normalized_with_space = strip_vn(category_name) if category_name else ""
            if category_normalized_with_space:
                category_words = category_normalized_with_space.split()
                for word in category_words:
                    word_no_space = re.sub(r"[^a-z0-9]+", "", word)
                    # CHỈ match nếu query là toàn bộ từ (exact match)
                    if query_normalized == word_no_space:
                        has_category_match = True
                        break
                    # Hoặc match từ đầu nếu từ đủ dài (>= query_len + 1)
                    elif word_no_space.startswith(query_normalized) and len(word_no_space) >= query_len + 1:
                        has_category_match = True
                        break
    
    # Title match: chỉ match nếu query là một từ riêng biệt hoặc đủ dài
    has_title_match = False
    if title_normalized_no_space and len(query_normalized) >= 3:
        # Match từ đầu title -> chắc chắn liên quan
        if title_normalized_no_space.startswith(query_normalized):
            has_title_match = True
        elif query_normalized in title_normalized_no_space:
            query_len = len(query_normalized)
            title_len = len(title_normalized_no_space)
            
            # Với query ngắn (< 5 ký tự): CHỈ match nếu là một từ riêng biệt
            if query_len < 5:
                # Kiểm tra word boundary: query phải là một từ riêng biệt trong title
                title_normalized_with_space = strip_vn(title) if title else ""
                if title_normalized_with_space:
                    # Tách thành các từ và kiểm tra
                    title_words = title_normalized_with_space.split()
                    for word in title_words:
                        word_no_space = re.sub(r"[^a-z0-9]+", "", word)
                        # CHỈ match nếu query là toàn bộ từ (exact match)
                        # KHÔNG match nếu query chỉ là prefix của từ dài hơn (tránh false positives)
                        if query_normalized == word_no_space:
                            has_title_match = True
                            break
                        # Hoặc match từ đầu nếu từ đủ dài (>= query_len + 1) để tránh match ngẫu nhiên
                        elif word_no_space.startswith(query_normalized) and len(word_no_space) >= query_len + 1:
                            # Chỉ match nếu từ bắt đầu bằng query và đủ dài
                            # Ví dụ: "toan" match "toancap" (toán cấp) nhưng không match "toan" trong "quanlythoigian"
                            has_title_match = True
                            break
            else:
                # Query >= 5 ký tự: match nếu đủ dài hoặc chiếm đủ tỷ lệ
                ratio = query_len / title_len if title_len > 0 else 0
                if ratio >= 0.3:
                    has_title_match = True
                else:
                    # Vẫn kiểm tra word boundary để chắc chắn
                    title_normalized_with_space = strip_vn(title) if title else ""
                    if title_normalized_with_space:
                        title_words = title_normalized_with_space.split()
                        for word in title_words:
                            word_no_space = re.sub(r"[^a-z0-9]+", "", word)
                            if query_normalized in word_no_space:
                                has_title_match = True
                                break
    
    # Keywords match: chỉ match nếu query match với một keyword riêng biệt
    has_keywords_match = False
    if keywords_normalized_no_space and len(query_normalized) >= 3:
        # Kiểm tra từng keyword riêng lẻ
        for keyword in (keywords or []):
            if not keyword:
                continue
            keyword_normalized = strip_vn(str(keyword))
            keyword_normalized_no_space = re.sub(r"[^a-z0-9]+", "", keyword_normalized)
            
            # Match từ đầu keyword -> chắc chắn liên quan
            if keyword_normalized_no_space.startswith(query_normalized):
                has_keywords_match = True
                break
            elif query_normalized in keyword_normalized_no_space:
                # Match ở giữa: CHỈ match nếu query là một từ riêng biệt trong keyword
                query_len = len(query_normalized)
                keyword_words = keyword_normalized.split()
                for word in keyword_words:
                    word_no_space = re.sub(r"[^a-z0-9]+", "", word)
                    # CHỈ match nếu query là toàn bộ từ (exact match)
                    if query_normalized == word_no_space:
                        has_keywords_match = True
                        break
                    # Hoặc match từ đầu nếu từ đủ dài (>= query_len + 1)
                    elif word_no_space.startswith(query_normalized) and len(word_no_space) >= query_len + 1:
                        has_keywords_match = True
                        break
                if has_keywords_match:
                    break
    
    if not has_category_match and not has_title_match and not has_keywords_match:
        return 0.0

    # Tính điểm dựa trên match (theo thứ tự ưu tiên - chỉ tính điểm từ nguồn ưu tiên cao nhất)
    score = 0.0
    
    # Category match: ưu tiên cao nhất - tăng điểm cao để đảm bảo luôn ở trên cùng
    # Nếu match category thì documents này sẽ được ưu tiên hiển thị trước
    if has_category_match and category_normalized_no_space:
        if category_normalized_no_space.startswith(query_normalized):
            score = 300.0  # Match từ đầu category - điểm rất cao để ưu tiên
        elif query_normalized in category_normalized_no_space:
            score = 250.0  # Match ở giữa category - điểm cao để ưu tiên
        return score  # Return ngay, không kiểm tra title/keywords nữa
    
    # Title match: ưu tiên thứ hai - chỉ tính nếu không match category
    if has_title_match and title_normalized_no_space:
        if title_normalized_no_space.startswith(query_normalized):
            score = 100.0  # Match từ đầu title
        elif query_normalized in title_normalized_no_space:
            score = 80.0   # Match ở giữa title
        return score  # Return ngay, không kiểm tra keywords nữa
    
    # Keywords match: ưu tiên thấp nhất - chỉ tính nếu không match category và title
    if has_keywords_match and keywords_normalized_no_space:
        # Kiểm tra từng keyword riêng lẻ để tính điểm chính xác hơn
        for keyword in (keywords or []):
            if not keyword:
                continue
            keyword_normalized = strip_vn(str(keyword))
            keyword_normalized_no_space = re.sub(r"[^a-z0-9]+", "", keyword_normalized)
            
            if query_normalized in keyword_normalized_no_space:
                if keyword_normalized_no_space.startswith(query_normalized):
                    score = 60.0  # Match từ đầu keyword
                elif query_normalized in keyword_normalized_no_space:
                    score = 40.0  # Match ở giữa keyword
                break  # Chỉ tính điểm cho keyword đầu tiên match
    
    # Nếu có match nhưng score = 0 (edge case), cho điểm tối thiểu
    if score == 0.0 and (has_category_match or has_title_match or has_keywords_match):
        score = 30.0  # Điểm tối thiểu
    
    # Với query ngắn (< 5 ký tự), logic match đã được kiểm tra chặt chẽ ở trên:
    # - Chỉ match nếu query là toàn bộ từ (exact match) HOẶC
    # - Match từ đầu và từ đủ dài (>= query_len + 1)
    # Điều này đảm bảo không có false positives
    # Không cần double-check nữa vì logic đã chặt chẽ

    return score


# ------------------------------------------------------------
# 4. API boolean: dùng nhanh để filter
# ------------------------------------------------------------


def create_normalized_text(title: str = "", summary: str = "", keywords: List[str] | None = None) -> str:
    """
    Tạo chuỗi searchText đã normalize từ title, summary, keywords.
    Dùng để lưu vào MongoDB field 'searchText' cho index và tìm kiếm nhanh.
    
    Logic:
    - Gộp title, summary, keywords thành một chuỗi
    - Bỏ dấu tiếng Việt
    - Bỏ khoảng trắng và ký tự đặc biệt
    - Lowercase
    
    Ví dụ:
        title="Kế toán", summary="Tài liệu về kế toán", keywords=["kế toán", "tài chính"]
        -> "ketoantailieuketoantaichinh"
    """
    parts = []
    
    if title:
        parts.append(title)
    if summary:
        parts.append(summary)
    if keywords:
        if isinstance(keywords, list):
            parts.extend([str(k) for k in keywords if k])
        else:
            parts.append(str(keywords))
    
    # Gộp tất cả lại
    combined = " ".join(parts)
    
    # Normalize: bỏ dấu + bỏ khoảng trắng + lowercase
    normalized = strip_vn(combined)
    # Bỏ tất cả ký tự không phải a-z0-9
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    
    return normalized


def search_in_multiple_fields(query: str, *fields: Union[str, List[str]]) -> bool:
    """
    API boolean đơn giản để filter nhanh.
    
    THỨ TỰ ƯU TIÊN: Category > Title > Keywords

    Logic:
    - Gộp các fields: title, keywords (list), category_name thành 3 nhóm:
      title, keywords, category_name (nếu gọi đúng thứ tự).
    - Tính score bằng `calculate_relevance_score` với thứ tự ưu tiên.
    - Trả về True nếu score > 0.

    Lưu ý:
    - Để ranking đẹp hơn, nên dùng trực tiếp `calculate_relevance_score`
      trong controller và sort theo điểm.
    """
    if not query or not query.strip():
        return True

    title = ""
    keywords: List[str] = []
    category_name = ""

    # Hỗ trợ gọi theo dạng (query, title, keywords, category_name)
    if len(fields) >= 1 and isinstance(fields[0], str):
        title = fields[0] or ""
    if len(fields) >= 2:
        if isinstance(fields[1], list):
            keywords = [str(k) for k in fields[1] if k]
        elif isinstance(fields[1], str):
            keywords = [fields[1]]
    if len(fields) >= 3 and isinstance(fields[2], str):
        category_name = fields[2] or ""

    # Tính score theo thứ tự ưu tiên: Category > Title > Keywords
    score = calculate_relevance_score(query, title, keywords, category_name)
    return score > 0.0
