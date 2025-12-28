#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Vector Search Service - Semantic search dựa trên embedding vectors
Sử dụng cosine similarity để tìm documents tương tự
"""

import os
import logging
from typing import Dict, List, Optional, Tuple
import numpy as np
from bson import ObjectId

from app.services.mongo_service import mongo_collections
from app.services.embedding_service import (
    generate_embedding,
    generate_document_embedding,
    cosine_similarity,
    USE_EMBEDDING_SEARCH,
    SENTENCE_TRANSFORMERS_AVAILABLE
)

logger = logging.getLogger(__name__)

# Configuration
VECTOR_SEARCH_THRESHOLD = float(os.getenv("VECTOR_SEARCH_THRESHOLD", "0.3"))  # Minimum similarity
VECTOR_SEARCH_TOP_K = int(os.getenv("VECTOR_SEARCH_TOP_K", "100"))  # Top K results


class VectorSearchService:
    """Service xử lý vector-based semantic search."""
    
    @staticmethod
    def get_document_embedding_from_db(document_id: str) -> Optional[np.ndarray]:
        """
        Lấy embedding vector của document từ MongoDB.
        
        Args:
            document_id: Document ID (string)
            
        Returns:
            Embedding vector hoặc None
        """
        try:
            doc = mongo_collections.documents.find_one(
                {"_id": ObjectId(document_id)},
                {"embedding": 1}
            )
            if doc and "embedding" in doc:
                embedding = doc["embedding"]
                if isinstance(embedding, list):
                    return np.array(embedding)
                return embedding
        except Exception as e:
            logger.warning(f"Error getting embedding from DB: {e}")
        return None
    
    @staticmethod
    def save_document_embedding(document_id: str, embedding: np.ndarray):
        """
        Lưu embedding vector vào MongoDB.
        
        Args:
            document_id: Document ID (string)
            embedding: Embedding vector (numpy array)
        """
        try:
            # Convert numpy array to list for MongoDB
            embedding_list = embedding.tolist()
            
            mongo_collections.documents.update_one(
                {"_id": ObjectId(document_id)},
                {"$set": {"embedding": embedding_list}}
            )
        except Exception as e:
            logger.error(f"Error saving embedding to DB: {e}")
    
    @staticmethod
    def generate_and_save_embedding(document: Dict) -> Optional[np.ndarray]:
        """
        Generate và lưu embedding cho một document.
        
        Args:
            document: Document dict với title, keywords, category_name, summary
            
        Returns:
            Embedding vector hoặc None
        """
        doc_id = str(document.get("_id", ""))
        if not doc_id:
            return None
        
        # Generate embedding
        embedding = generate_document_embedding(
            title=document.get("title", "") or "",
            keywords=document.get("keywords", []) or [],
            category_name=document.get("category_name", "") or "",
            summary=document.get("summary", "") or ""
        )
        
        if embedding is not None:
            # Save to MongoDB
            VectorSearchService.save_document_embedding(doc_id, embedding)
        
        return embedding
    
    @staticmethod
    def search_by_vector(
        query: str,
        documents: List[Dict],
        category_map: Dict[str, str],
        top_k: int = None
    ) -> List[Tuple[Dict, float]]:
        """
        Search documents bằng vector similarity.
        
        Args:
            query: Search query
            documents: List of documents
            category_map: Dict mapping category_id -> category_name
            top_k: Top K results (None = all)
            
        Returns:
            List of tuples (document, similarity_score) sorted by score
        """
        if not query or not query.strip():
            return []
        
        if not USE_EMBEDDING_SEARCH or not SENTENCE_TRANSFORMERS_AVAILABLE:
            return []
        
        # Generate query embedding
        query_embedding = generate_embedding(query)
        if query_embedding is None:
            return []
        
        # Calculate similarity cho từng document
        results = []
        
        for doc in documents:
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
            
            # Lấy hoặc generate document embedding
            doc_embedding = VectorSearchService.get_document_embedding_from_db(doc_id)
            
            if doc_embedding is None:
                # Generate embedding nếu chưa có
                doc_embedding = generate_document_embedding(
                    title=doc.get("title", "") or "",
                    keywords=doc.get("keywords", []) or [],
                    category_name=category_name,
                    summary=doc.get("summary", "") or ""
                )
                
                # Save to DB
                if doc_embedding is not None:
                    VectorSearchService.save_document_embedding(doc_id, doc_embedding)
            
            if doc_embedding is None:
                continue
            
            # Calculate cosine similarity
            similarity = cosine_similarity(query_embedding, doc_embedding)
            
            # Chỉ chấp nhận nếu similarity >= threshold
            if similarity >= VECTOR_SEARCH_THRESHOLD:
                results.append((doc, similarity))
        
        # Sort by similarity (high -> low)
        results.sort(key=lambda x: x[1], reverse=True)
        
        # Return top K
        if top_k:
            results = results[:top_k]
        
        return results
    
    @staticmethod
    def hybrid_search(
        query: str,
        documents: List[Dict],
        category_map: Dict[str, str],
        keyword_scores: Dict[str, float],
        vector_weight: float = 0.6,
        keyword_weight: float = 0.4
    ) -> List[Dict]:
        """
        Hybrid search: kết hợp vector similarity và keyword-based scores.
        
        Args:
            query: Search query
            documents: List of documents
            category_map: Dict mapping category_id -> category_name
            keyword_scores: Dict mapping doc_id -> keyword_score
            vector_weight: Weight cho vector similarity (default: 0.6)
            keyword_weight: Weight cho keyword score (default: 0.4)
            
        Returns:
            List of documents với _relevance_score (hybrid score)
        """
        if not query or not query.strip():
            return documents
        
        # Vector search
        vector_results = VectorSearchService.search_by_vector(
            query,
            documents,
            category_map,
            top_k=None
        )
        
        # Create vector scores map
        vector_scores = {}
        for doc, similarity in vector_results:
            doc_id = str(doc.get("_id", ""))
            vector_scores[doc_id] = similarity
        
        # Normalize scores to 0-100 range
        if vector_scores:
            max_vector_score = max(vector_scores.values())
            if max_vector_score > 0:
                for doc_id in vector_scores:
                    vector_scores[doc_id] = (vector_scores[doc_id] / max_vector_score) * 100
        
        if keyword_scores:
            max_keyword_score = max(keyword_scores.values())
            if max_keyword_score > 0:
                for doc_id in keyword_scores:
                    keyword_scores[doc_id] = (keyword_scores[doc_id] / max_keyword_score) * 100
        
        # Combine scores
        hybrid_results = []
        all_doc_ids = set(vector_scores.keys()) | set(keyword_scores.keys())
        
        for doc in documents:
            doc_id = str(doc.get("_id", ""))
            if doc_id not in all_doc_ids:
                continue
            
            vector_score = vector_scores.get(doc_id, 0.0)
            keyword_score = keyword_scores.get(doc_id, 0.0)
            
            # Hybrid score
            hybrid_score = (vector_score * vector_weight) + (keyword_score * keyword_weight)
            
            if hybrid_score > 0:
                doc["_relevance_score"] = hybrid_score
                hybrid_results.append(doc)
        
        # Sort by hybrid score
        hybrid_results.sort(key=lambda d: d.get("_relevance_score", 0.0), reverse=True)
        
        return hybrid_results

