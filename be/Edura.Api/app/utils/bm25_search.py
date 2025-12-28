#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
BM25 (Best Matching 25) Algorithm Implementation
Thuật toán ranking tiêu chuẩn cho full-text search.

Tài liệu tham khảo:
- https://en.wikipedia.org/wiki/Okapi_BM25
- Elasticsearch sử dụng BM25 làm default ranking algorithm
"""

import os
import math
import logging
from typing import Dict, List, Optional
from functools import lru_cache
from datetime import datetime, timedelta

from app.utils.search_utils import tokenize, strip_vn, normalize_search

# Configuration từ environment variables
USE_BM25_SEARCH = os.getenv("USE_BM25_SEARCH", "false").lower() == "true"
BM25_K1 = float(os.getenv("BM25_K1", "1.2"))
BM25_B = float(os.getenv("BM25_B", "0.75"))
BM25_STATS_CACHE_TTL = int(os.getenv("BM25_STATS_CACHE_TTL", "3600"))  # 1 giờ mặc định

# Logger
logger = logging.getLogger(__name__)


class BM25:
    """
    BM25 ranking algorithm implementation.
    
    Công thức:
    BM25(q, d) = Σ IDF(qi) × (f(qi, d) × (k1 + 1)) / (f(qi, d) + k1 × (1 - b + b × |d|/avgdl))
    
    Parameters:
    - k1: Term frequency saturation parameter (default: 1.2)
    - b: Field length normalization parameter (default: 0.75)
    """
    
    def __init__(self, k1: float = 1.2, b: float = 0.75):
        """
        Initialize BM25 with parameters.
        
        Args:
            k1: Term frequency saturation (1.2 = moderate saturation)
            b: Field length normalization (0.75 = moderate normalization)
        """
        self.k1 = k1
        self.b = b
        
        # Statistics (sẽ được set bởi fit())
        self.total_docs = 0
        self.avg_doc_length = 0.0
        self.document_freq: Dict[str, int] = {}  # {term: number of documents containing term}
        self.doc_lengths: Dict[int, int] = {}  # {doc_id: document length in tokens}
        self.doc_tokens: Dict[int, List[str]] = {}  # {doc_id: list of tokens}
    
    def fit(self, documents: List[Dict], doc_id_field: str = "_id"):
        """
        Pre-compute statistics từ documents.
        
        Args:
            documents: List of documents với title, keywords, category_name
            doc_id_field: Field name chứa document ID
        """
        self.total_docs = len(documents)
        if self.total_docs == 0:
            return
        
        total_length = 0
        self.document_freq = {}
        self.doc_lengths = {}
        self.doc_tokens = {}
        
        # Process từng document
        for doc in documents:
            doc_id = str(doc.get(doc_id_field, ""))
            if not doc_id:
                continue
            
            # Lấy text từ title, keywords, category
            title = doc.get("title", "") or ""
            keywords = doc.get("keywords", []) or []
            category_name = doc.get("category_name", "") or ""
            
            # Gộp text
            text_parts = []
            if title:
                text_parts.append(title)
            if keywords:
                if isinstance(keywords, list):
                    text_parts.extend([str(k) for k in keywords if k])
                else:
                    text_parts.append(str(keywords))
            if category_name:
                text_parts.append(category_name)
            
            # Tokenize
            full_text = " ".join(text_parts)
            tokens = tokenize(full_text)
            
            # Lưu tokens và length
            self.doc_tokens[doc_id] = tokens
            doc_length = len(tokens)
            self.doc_lengths[doc_id] = doc_length
            total_length += doc_length
            
            # Update document frequency
            unique_tokens = set(tokens)
            for token in unique_tokens:
                self.document_freq[token] = self.document_freq.get(token, 0) + 1
        
        # Tính độ dài trung bình
        self.avg_doc_length = total_length / self.total_docs if self.total_docs > 0 else 0.0
    
    def idf(self, term: str) -> float:
        """
        Tính Inverse Document Frequency (IDF) cho một term.
        
        IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5))
        
        Args:
            term: Term cần tính IDF
            
        Returns:
            IDF score (0 nếu term không có trong corpus)
        """
        if not term or term not in self.document_freq:
            return 0.0
        
        doc_freq = self.document_freq[term]
        if doc_freq == 0:
            return 0.0
        
        # Smoothing: +0.5 để tránh log(0)
        idf = math.log((self.total_docs - doc_freq + 0.5) / (doc_freq + 0.5))
        return idf
    
    def score(self, query: str, doc_id: str) -> float:
        """
        Tính BM25 score cho một document.
        
        Args:
            query: Query string (sẽ được normalize và tokenize)
            doc_id: Document ID (string)
            
        Returns:
            BM25 score (0 nếu không match)
        """
        if not query or not doc_id:
            return 0.0
        
        # Tokenize query
        query_tokens = tokenize(query)
        if not query_tokens:
            return 0.0
        
        # Lấy document tokens và length
        doc_tokens = self.doc_tokens.get(doc_id, [])
        if not doc_tokens:
            return 0.0
        
        doc_length = self.doc_lengths.get(doc_id, 0)
        if doc_length == 0:
            return 0.0
        
        # Tính BM25 score
        score = 0.0
        
        for term in query_tokens:
            # Term frequency trong document
            term_freq = doc_tokens.count(term)
            if term_freq == 0:
                continue
            
            # IDF
            idf_value = self.idf(term)
            if idf_value == 0:
                continue
            
            # BM25 component
            # numerator = term_freq * (k1 + 1)
            # denominator = term_freq + k1 * (1 - b + b * (doc_length / avg_doc_length))
            numerator = term_freq * (self.k1 + 1)
            denominator = term_freq + self.k1 * (1 - self.b + self.b * (doc_length / self.avg_doc_length))
            
            score += idf_value * (numerator / denominator)
        
        return score
    
    def score_document(self, query: str, document: Dict) -> float:
        """
        Tính BM25 score cho một document (không cần pre-fit).
        Sử dụng khi không có pre-computed statistics.
        
        Args:
            query: Query string
            document: Document dict với title, keywords, category_name
            
        Returns:
            BM25 score (simplified version, không có IDF)
        """
        if not query:
            return 0.0
        
        # Tokenize query và document
        query_tokens = tokenize(query)
        if not query_tokens:
            return 0.0
        
        # Lấy text từ document
        title = document.get("title", "") or ""
        keywords = document.get("keywords", []) or []
        category_name = document.get("category_name", "") or ""
        
        text_parts = []
        if title:
            text_parts.append(title)
        if keywords:
            if isinstance(keywords, list):
                text_parts.extend([str(k) for k in keywords if k])
            else:
                text_parts.append(str(keywords))
        if category_name:
            text_parts.append(category_name)
        
        doc_text = " ".join(text_parts)
        doc_tokens = tokenize(doc_text)
        doc_length = len(doc_tokens)
        
        if doc_length == 0:
            return 0.0
        
        # Simplified BM25 (không có IDF, chỉ dùng TF và length normalization)
        score = 0.0
        
        for term in query_tokens:
            term_freq = doc_tokens.count(term)
            if term_freq == 0:
                continue
            
            # Simplified: không có IDF, chỉ dùng TF và length normalization
            # Giả sử avg_doc_length = 20 (có thể tune)
            avg_doc_length = 20.0
            numerator = term_freq * (self.k1 + 1)
            denominator = term_freq + self.k1 * (1 - self.b + self.b * (doc_length / avg_doc_length))
            
            # Sử dụng log(term_freq + 1) như một proxy cho IDF
            score += math.log(term_freq + 1) * (numerator / denominator)
        
        return score


def calculate_bm25_score_simple(
    query: str,
    document: Dict,
    k1: Optional[float] = None,
    b: Optional[float] = None
) -> float:
    """
    Tính BM25 score đơn giản cho một document (không cần pre-compute statistics).
    
    Sử dụng khi:
    - Không có pre-computed statistics
    - Cần tính score nhanh cho một document
    
    Args:
        query: Query string
        document: Document dict với title, keywords, category_name
        k1: Term frequency saturation parameter (default: từ env hoặc 1.2)
        b: Field length normalization parameter (default: từ env hoặc 0.75)
        
    Returns:
        BM25 score (0 nếu có lỗi)
    """
    try:
        if not query or not document:
            return 0.0
        
        k1_value = k1 if k1 is not None else BM25_K1
        b_value = b if b is not None else BM25_B
        
        bm25 = BM25(k1=k1_value, b=b_value)
        score = bm25.score_document(query, document)
        return max(0.0, score)  # Đảm bảo không âm
    except Exception as e:
        logger.warning(f"Error calculating BM25 score: {e}", exc_info=True)
        return 0.0


def calculate_hybrid_score(
    query: str,
    document: Dict,
    bm25_score: float,
    category_name: str = "",
    title_boost: float = 1.5,
    category_boost: float = 2.0
) -> float:
    """
    Kết hợp BM25 với category/title priority boost.
    
    Priority:
    1. Category match: BM25 × category_boost
    2. Title match: BM25 × title_boost
    3. Keywords match: BM25 (normal)
    
    Args:
        query: Query string
        document: Document dict
        bm25_score: BM25 score từ calculate_bm25_score_simple()
        category_name: Category name (nếu có)
        title_boost: Boost factor cho title match (default: 1.5)
        category_boost: Boost factor cho category match (default: 2.0)
        
    Returns:
        Hybrid score (BM25 × boost factor)
    """
    try:
        if bm25_score == 0 or not query:
            return 0.0
        
        query_normalized = normalize_search(query)
        if not query_normalized:
            return bm25_score
        
        # Category boost
        if category_name:
            try:
                category_normalized = normalize_search(category_name)
                if category_normalized and query_normalized in category_normalized:
                    return bm25_score * category_boost
            except Exception:
                pass
        
        # Title boost
        title = document.get("title", "") or ""
        if title:
            try:
                title_normalized = normalize_search(title)
                if title_normalized and query_normalized in title_normalized:
                    return bm25_score * title_boost
            except Exception:
                pass
        
        # Normal BM25
        return bm25_score
    except Exception as e:
        logger.warning(f"Error calculating hybrid score: {e}", exc_info=True)
        return bm25_score  # Fallback về BM25 score gốc

