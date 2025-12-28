#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script để generate embeddings cho tất cả documents trong MongoDB.
Chạy một lần để tạo embeddings cho documents hiện có.

Usage:
    python scripts/generate_document_embeddings.py
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.mongo_service import mongo_collections
from app.services.vector_search_service import VectorSearchService
from app.services.embedding_service import USE_EMBEDDING_SEARCH, SENTENCE_TRANSFORMERS_AVAILABLE
from bson import ObjectId
import time


def generate_all_embeddings(batch_size: int = 50, skip_existing: bool = True):
    """
    Generate embeddings cho tất cả documents.
    
    Args:
        batch_size: Số documents xử lý mỗi batch
        skip_existing: Bỏ qua documents đã có embedding
    """
    if not USE_EMBEDDING_SEARCH or not SENTENCE_TRANSFORMERS_AVAILABLE:
        print("❌ Embedding search is not enabled or sentence-transformers not available")
        print("Set USE_EMBEDDING_SEARCH=true in .env")
        print("Install: pip install sentence-transformers")
        return
    
    print("Đang load documents từ MongoDB...")
    
    # Load documents
    if skip_existing:
        # Chỉ load documents chưa có embedding
        query = {"embedding": {"$exists": False}}
    else:
        # Load tất cả
        query = {}
    
    documents = list(mongo_collections.documents.find(query))
    total = len(documents)
    
    print(f"Tìm thấy {total} documents cần generate embedding")
    
    if total == 0:
        print("✅ Tất cả documents đã có embedding!")
        return
    
    # Load categories
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
    
    # Process documents
    print("\nĐang generate embeddings...")
    processed = 0
    success = 0
    failed = 0
    
    for i, doc in enumerate(documents, 1):
        try:
            doc_id = str(doc.get("_id", ""))
            if not doc_id:
                continue
            
            # Lấy category name
            category_name = ""
            cid = doc.get("categoryId") or doc.get("category_id")
            if cid:
                try:
                    cid_str = str(cid) if isinstance(cid, ObjectId) else str(ObjectId(str(cid)))
                    category_name = category_map.get(cid_str, "")
                except Exception:
                    pass
            
            # Thêm category_name vào doc để generate embedding
            doc["category_name"] = category_name
            
            # Generate và save embedding
            embedding = VectorSearchService.generate_and_save_embedding(doc)
            
            if embedding is not None:
                success += 1
            else:
                failed += 1
            
            processed += 1
            
            # Progress
            if i % 10 == 0:
                print(f"Progress: {i}/{total} ({i*100//total}%) - Success: {success}, Failed: {failed}")
        
        except Exception as e:
            print(f"Error processing document {doc.get('_id')}: {e}")
            failed += 1
            processed += 1
    
    print(f"\n✅ Hoàn thành!")
    print(f"  - Processed: {processed}")
    print(f"  - Success: {success}")
    print(f"  - Failed: {failed}")


if __name__ == "__main__":
    try:
        generate_all_embeddings(skip_existing=True)
    except Exception as e:
        print(f"❌ Lỗi: {e}")
        import traceback
        traceback.print_exc()

