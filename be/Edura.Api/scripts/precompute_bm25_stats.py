#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script pre-compute BM25 statistics từ MongoDB.
Chạy một lần để tính toán và lưu statistics vào MongoDB collection.

Usage:
    python scripts/precompute_bm25_stats.py
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.mongo_service import mongo_collections
from app.utils.bm25_search import BM25
from app.utils.search_utils import tokenize
from bson import ObjectId
import json
from datetime import datetime


def precompute_statistics():
    """Pre-compute BM25 statistics và lưu vào MongoDB."""
    
    print("Đang load documents từ MongoDB...")
    
    # Load tất cả documents (chỉ cần title, keywords, categoryId)
    projection = {
        "title": 1,
        "keywords": 1,
        "categoryId": 1,
        "category_id": 1,
    }
    
    documents = list(mongo_collections.documents.find({}, projection))
    total_docs = len(documents)
    
    print(f"Đã load {total_docs} documents")
    
    if total_docs == 0:
        print("Không có documents nào!")
        return
    
    # Load categories để lấy category names
    print("Đang load categories...")
    category_ids = set()
    for doc in documents:
        cid = doc.get("categoryId") or doc.get("category_id")
        if cid:
            try:
                category_ids.add(cid if isinstance(cid, ObjectId) else ObjectId(str(cid)))
            except Exception:
                pass
    
    category_map = {}
    if category_ids:
        for c in mongo_collections.categories.find(
            {"_id": {"$in": list(category_ids)}},
            {"name": 1}
        ):
            category_map[str(c["_id"])] = c.get("name", "")
    
    print(f"Đã load {len(category_map)} categories")
    
    # Prepare documents với category_name
    prepared_docs = []
    for doc in documents:
        cid = doc.get("categoryId") or doc.get("category_id")
        category_name = ""
        if cid:
            try:
                cid_str = str(cid) if isinstance(cid, ObjectId) else str(ObjectId(str(cid)))
                category_name = category_map.get(cid_str, "")
            except Exception:
                pass
        
        prepared_doc = {
            "_id": str(doc["_id"]),
            "title": doc.get("title", "") or "",
            "keywords": doc.get("keywords", []) or [],
            "category_name": category_name
        }
        prepared_docs.append(prepared_doc)
    
    # Tính statistics
    print("Đang tính BM25 statistics...")
    
    total_length = 0
    document_freq = {}
    doc_lengths = {}
    
    for doc in prepared_docs:
        # Gộp text
        text_parts = []
        if doc["title"]:
            text_parts.append(doc["title"])
        if doc["keywords"]:
            if isinstance(doc["keywords"], list):
                text_parts.extend([str(k) for k in doc["keywords"] if k])
            else:
                text_parts.append(str(doc["keywords"]))
        if doc["category_name"]:
            text_parts.append(doc["category_name"])
        
        # Tokenize
        full_text = " ".join(text_parts)
        tokens = tokenize(full_text)
        doc_length = len(tokens)
        
        doc_lengths[doc["_id"]] = doc_length
        total_length += doc_length
        
        # Update document frequency
        unique_tokens = set(tokens)
        for token in unique_tokens:
            document_freq[token] = document_freq.get(token, 0) + 1
    
    avg_doc_length = total_length / total_docs if total_docs > 0 else 0.0
    
    print(f"Tổng số documents: {total_docs}")
    print(f"Độ dài trung bình: {avg_doc_length:.2f} tokens")
    print(f"Số unique terms: {len(document_freq)}")
    
    # Lưu vào MongoDB collection `search_statistics`
    print("Đang lưu statistics vào MongoDB...")
    
    stats_doc = {
        "_id": "bm25_stats",
        "total_docs": total_docs,
        "avg_doc_length": avg_doc_length,
        "document_freq": document_freq,
        "doc_lengths": doc_lengths,
        "updated_at": datetime.utcnow()
    }
    
    # Upsert
    mongo_collections.search_statistics.replace_one(
        {"_id": "bm25_stats"},
        stats_doc,
        upsert=True
    )
    
    print("✅ Đã lưu BM25 statistics vào MongoDB collection 'search_statistics'")
    print()
    print("Có thể sử dụng statistics này trong search controllers:")
    print("  from app.services.mongo_service import mongo_collections")
    print("  stats = mongo_collections.search_statistics.find_one({'_id': 'bm25_stats'})")


if __name__ == "__main__":
    try:
        precompute_statistics()
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        import traceback
        traceback.print_exc()

