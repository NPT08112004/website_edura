#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Simple in-memory cache cho search results.
Có thể thay thế bằng Redis trong tương lai.
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import hashlib
import json

class SearchCache:
    """Simple cache cho search queries."""
    
    def __init__(self, ttl_seconds: int = 300):  # 5 phút mặc định
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.ttl_seconds = ttl_seconds
    
    def _make_key(self, query_params: dict) -> str:
        """Tạo cache key từ query parameters."""
        # Sort params để đảm bảo key nhất quán
        sorted_params = sorted(query_params.items())
        key_str = json.dumps(sorted_params, sort_keys=True, ensure_ascii=False)
        return hashlib.md5(key_str.encode('utf-8')).hexdigest()
    
    def get(self, query_params: dict) -> Optional[dict]:
        """Lấy kết quả từ cache nếu còn hợp lệ."""
        key = self._make_key(query_params)
        
        if key not in self.cache:
            return None
        
        entry = self.cache[key]
        expires_at = entry.get('expires_at')
        
        # Kiểm tra TTL
        if expires_at and datetime.utcnow() > expires_at:
            del self.cache[key]
            return None
        
        return entry.get('data')
    
    def set(self, query_params: dict, data: dict):
        """Lưu kết quả vào cache."""
        key = self._make_key(query_params)
        expires_at = datetime.utcnow() + timedelta(seconds=self.ttl_seconds)
        
        self.cache[key] = {
            'data': data,
            'expires_at': expires_at,
            'created_at': datetime.utcnow()
        }
        
        # Cleanup old entries (đơn giản: xóa entries cũ hơn 1 giờ)
        self._cleanup()
    
    def _cleanup(self):
        """Xóa các entries đã hết hạn."""
        now = datetime.utcnow()
        expired_keys = [
            key for key, entry in self.cache.items()
            if entry.get('expires_at') and entry['expires_at'] < now
        ]
        for key in expired_keys:
            del self.cache[key]
    
    def clear(self):
        """Xóa toàn bộ cache."""
        self.cache.clear()
    
    def size(self) -> int:
        """Trả về số lượng entries trong cache."""
        return len(self.cache)

# Global cache instance
search_cache = SearchCache(ttl_seconds=300)  # 5 phút

