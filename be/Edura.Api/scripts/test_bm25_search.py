#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script test và so sánh BM25 với hệ thống search hiện tại.
Chạy: python scripts/test_bm25_search.py
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.bm25_search import calculate_bm25_score_simple, calculate_hybrid_score
from app.utils.search_utils import calculate_relevance_score


def test_comparison():
    """So sánh BM25 với hệ thống hiện tại."""
    
    # Test documents
    test_documents = [
        {
            "_id": "1",
            "title": "Giải tích 1 - Đề cương ôn thi",
            "keywords": ["giải tích", "toán", "đề cương", "ôn thi"],
            "category_name": "Toán học",
            "views": 100,
            "downloads": 50,
            "gradeScore": 4.5
        },
        {
            "_id": "2",
            "title": "Luật kinh tế - Tài liệu tham khảo",
            "keywords": ["luật kinh tế", "pháp luật", "kinh tế"],
            "category_name": "Luật kinh tế",
            "views": 80,
            "downloads": 40,
            "gradeScore": 4.0
        },
        {
            "_id": "3",
            "title": "Toán cao cấp - Bài tập và lời giải",
            "keywords": ["toán cao cấp", "bài tập", "lời giải"],
            "category_name": "Toán học",
            "views": 120,
            "downloads": 60,
            "gradeScore": 4.8
        },
        {
            "_id": "4",
            "title": "Kế toán tài chính - Giáo trình",
            "keywords": ["kế toán", "tài chính", "giáo trình"],
            "category_name": "Kế toán",
            "views": 90,
            "downloads": 45,
            "gradeScore": 4.2
        },
    ]
    
    # Test queries
    test_queries = [
        "toán",
        "giải tích",
        "luật kinh tế",
        "kế toán",
    ]
    
    print("=" * 80)
    print("SO SÁNH BM25 VỚI HỆ THỐNG HIỆN TẠI")
    print("=" * 80)
    print()
    
    for query in test_queries:
        print(f"Query: '{query}'")
        print("-" * 80)
        
        results_old = []
        results_bm25 = []
        
        for doc in test_documents:
            # Hệ thống cũ
            score_old = calculate_relevance_score(
                query,
                doc["title"],
                doc["keywords"],
                doc["category_name"]
            )
            
            # Thêm popularity bonus
            views = doc.get("views", 0)
            downloads = doc.get("downloads", 0)
            grade_score = doc.get("gradeScore", 0)
            popularity_bonus = (views * 0.1) + (downloads * 0.2) + (grade_score * 0.5)
            final_score_old = score_old + popularity_bonus
            
            # BM25
            bm25_score = calculate_bm25_score_simple(query, doc)
            hybrid_score = calculate_hybrid_score(
                query,
                doc,
                bm25_score,
                doc["category_name"]
            )
            
            # Thêm popularity bonus cho BM25
            final_score_bm25 = hybrid_score + popularity_bonus
            
            if score_old > 0:
                results_old.append({
                    "doc": doc,
                    "score": final_score_old
                })
            
            if bm25_score > 0:
                results_bm25.append({
                    "doc": doc,
                    "score": final_score_bm25
                })
        
        # Sort
        results_old.sort(key=lambda x: x["score"], reverse=True)
        results_bm25.sort(key=lambda x: x["score"], reverse=True)
        
        # Print comparison
        print("HỆ THỐNG CŨ (Relevance Score):")
        for i, result in enumerate(results_old[:3], 1):
            doc = result["doc"]
            print(f"  {i}. {doc['title']} (Score: {result['score']:.2f})")
            print(f"     Category: {doc['category_name']}")
        
        print()
        print("BM25 (Hybrid Score):")
        for i, result in enumerate(results_bm25[:3], 1):
            doc = result["doc"]
            print(f"  {i}. {doc['title']} (Score: {result['score']:.2f})")
            print(f"     Category: {doc['category_name']}")
        
        print()
        print("=" * 80)
        print()


if __name__ == "__main__":
    test_comparison()

