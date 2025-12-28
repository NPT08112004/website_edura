#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Cache cho BM25 statistics để tránh query MongoDB mỗi lần.
Hỗ trợ cả local và production với TTL và auto-refresh.
"""

import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from functools import lru_cache

logger = logging.getLogger(__name__)

# Configuration
BM25_STATS_CACHE_TTL = int(os.getenv("BM25_STATS_CACHE_TTL", "3600"))  # 1 giờ mặc định
BM25_STATS_ENABLED = os.getenv("USE_BM25_SEARCH", "false").lower() == "true"


class BM25StatsCache:
    """In-memory cache cho BM25 statistics với TTL."""
    
    def __init__(self, ttl_seconds: int = None):
        self.cache: Optional[Dict[str, Any]] = None
        self.cached_at: Optional[datetime] = None
        self.ttl_seconds = ttl_seconds or BM25_STATS_CACHE_TTL
    
    def get(self) -> Optional[Dict[str, Any]]:
        """
        Lấy statistics từ cache nếu còn hợp lệ.
        
        Returns:
            Statistics dict hoặc None nếu cache expired/empty
        """
        if not self.cache or not self.cached_at:
            return None
        
        # Kiểm tra TTL
        if datetime.utcnow() - self.cached_at > timedelta(seconds=self.ttl_seconds):
            logger.debug("BM25 stats cache expired")
            self.cache = None
            self.cached_at = None
            return None
        
        return self.cache
    
    def set(self, stats: Dict[str, Any]):
        """Lưu statistics vào cache."""
        self.cache = stats
        self.cached_at = datetime.utcnow()
        logger.debug("BM25 stats cached")
    
    def clear(self):
        """Xóa cache."""
        self.cache = None
        self.cached_at = None
        logger.debug("BM25 stats cache cleared")
    
    def is_valid(self) -> bool:
        """Kiểm tra cache còn hợp lệ không."""
        if not self.cache or not self.cached_at:
            return False
        return datetime.utcnow() - self.cached_at <= timedelta(seconds=self.ttl_seconds)


# Global cache instance
_bm25_stats_cache = BM25StatsCache()


def get_bm25_stats_from_cache() -> Optional[Dict[str, Any]]:
    """Lấy BM25 statistics từ cache."""
    if not BM25_STATS_ENABLED:
        return None
    return _bm25_stats_cache.get()


def set_bm25_stats_to_cache(stats: Dict[str, Any]):
    """Lưu BM25 statistics vào cache."""
    if not BM25_STATS_ENABLED:
        return
    _bm25_stats_cache.set(stats)


def clear_bm25_stats_cache():
    """Xóa BM25 statistics cache."""
    _bm25_stats_cache.clear()


def load_bm25_stats_from_db(force_refresh: bool = False) -> Optional[Dict[str, Any]]:
    """
    Load BM25 statistics từ MongoDB (với cache).
    
    Args:
        force_refresh: Nếu True, bỏ qua cache và load từ DB
        
    Returns:
        Statistics dict hoặc None nếu không có/error
    """
    if not BM25_STATS_ENABLED:
        return None
    
    # Kiểm tra cache trước
    if not force_refresh:
        cached_stats = get_bm25_stats_from_cache()
        if cached_stats:
            logger.debug("Using cached BM25 stats")
            return cached_stats
    
    # Load từ MongoDB
    try:
        from app.services.mongo_service import mongo_collections
        
        stats_doc = mongo_collections.search_statistics.find_one({"_id": "bm25_stats"})
        if not stats_doc:
            logger.warning("BM25 stats not found in MongoDB. Run precompute_bm25_stats.py first.")
            return None
        
        # Chuyển đổi ObjectId keys thành string (nếu có)
        stats = {
            "total_docs": stats_doc.get("total_docs", 0),
            "avg_doc_length": stats_doc.get("avg_doc_length", 0.0),
            "document_freq": stats_doc.get("document_freq", {}),
            "doc_lengths": stats_doc.get("doc_lengths", {}),
        }
        
        # Lưu vào cache
        set_bm25_stats_to_cache(stats)
        logger.info(f"Loaded BM25 stats: {stats['total_docs']} docs, avg_length={stats['avg_doc_length']:.2f}")
        
        return stats
    except Exception as e:
        logger.error(f"Error loading BM25 stats from DB: {e}", exc_info=True)
        return None

