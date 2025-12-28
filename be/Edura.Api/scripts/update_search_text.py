#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script để update searchText cho các documents cũ (chưa có searchText field).
Chạy: python scripts/update_search_text.py
"""
import sys
import os

# Thêm path để import từ app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.mongo_service import mongo_collections
from app.utils.search_utils import create_normalized_text

def update_search_text_for_all_documents():
    """Update searchText cho tất cả documents chưa có field này."""
    print("Đang tìm documents chưa có searchText...")
    
    # Tìm documents chưa có searchText hoặc searchText rỗng
    query = {
        "$or": [
            {"searchText": {"$exists": False}},
            {"searchText": ""},
            {"searchText": None}
        ]
    }
    
    total = mongo_collections.documents.count_documents(query)
    print(f"Tìm thấy {total} documents cần update.")
    
    if total == 0:
        print("Không có documents nào cần update.")
        return
    
    # Update từng batch
    batch_size = 100
    updated = 0
    cursor = mongo_collections.documents.find(query)
    
    for doc in cursor:
        try:
            title = doc.get("title", "") or ""
            summary = doc.get("summary", "") or ""
            keywords = doc.get("keywords", []) or []
            
            # Tạo searchText normalized
            search_text = create_normalized_text(title, summary, keywords)
            
            # Update document
            mongo_collections.documents.update_one(
                {"_id": doc["_id"]},
                {"$set": {"searchText": search_text}}
            )
            
            updated += 1
            if updated % batch_size == 0:
                print(f"Đã update {updated}/{total} documents...")
        
        except Exception as e:
            print(f"Lỗi khi update document {doc.get('_id')}: {e}")
            continue
    
    print(f"Hoàn thành! Đã update {updated}/{total} documents.")

if __name__ == "__main__":
    try:
        update_search_text_for_all_documents()
    except Exception as e:
        print(f"Lỗi: {e}")
        import traceback
        traceback.print_exc()

