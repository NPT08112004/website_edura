#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Embedding Service - Generate embeddings cho documents và queries
Sử dụng sentence-transformers cho semantic search
"""

import os
import logging
from typing import List, Optional, Dict
import numpy as np

logger = logging.getLogger(__name__)

# Configuration
USE_EMBEDDING_SEARCH = os.getenv("USE_EMBEDDING_SEARCH", "false").lower() == "true"
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "keepitreal/vietnamese-sbert")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "768"))  # Default cho most models

# Try to import sentence-transformers
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    logger.warning("sentence-transformers not available. Install: pip install sentence-transformers")

# Global model instance (lazy load)
_embedding_model = None


def get_embedding_model():
    """
    Lazy load embedding model (singleton pattern).
    
    Returns:
        SentenceTransformer model hoặc None nếu không available
    """
    global _embedding_model
    
    if not SENTENCE_TRANSFORMERS_AVAILABLE:
        return None
    
    if _embedding_model is None and USE_EMBEDDING_SEARCH:
        try:
            logger.info(f"Loading embedding model: {EMBEDDING_MODEL_NAME}")
            _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
            logger.info("Embedding model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            return None
    
    return _embedding_model


def generate_embedding(text: str) -> Optional[np.ndarray]:
    """
    Generate embedding vector cho một text.
    
    Args:
        text: Text cần generate embedding
        
    Returns:
        Numpy array embedding vector hoặc None nếu có lỗi
    """
    if not text or not text.strip():
        return None
    
    model = get_embedding_model()
    if model is None:
        return None
    
    try:
        # Generate embedding
        embedding = model.encode(text, normalize_embeddings=True)
        return embedding
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        return None


def generate_document_embedding(
    title: str = "",
    keywords: List[str] = None,
    category_name: str = "",
    summary: str = ""
) -> Optional[np.ndarray]:
    """
    Generate embedding cho một document từ title, keywords, category, summary.
    
    Args:
        title: Document title
        keywords: List of keywords
        category_name: Category name
        summary: Document summary
        
    Returns:
        Numpy array embedding vector hoặc None
    """
    # Gộp text từ các fields
    text_parts = []
    
    if category_name:
        text_parts.append(f"Thể loại: {category_name}")
    if title:
        text_parts.append(f"Tiêu đề: {title}")
    if keywords:
        if isinstance(keywords, list):
            keywords_text = ", ".join([str(k) for k in keywords if k])
            if keywords_text:
                text_parts.append(f"Từ khóa: {keywords_text}")
        else:
            text_parts.append(f"Từ khóa: {keywords}")
    if summary:
        # Giới hạn summary để tránh quá dài
        summary_limited = summary[:500] if len(summary) > 500 else summary
        text_parts.append(f"Mô tả: {summary_limited}")
    
    if not text_parts:
        return None
    
    # Gộp tất cả lại
    combined_text = ". ".join(text_parts)
    
    return generate_embedding(combined_text)


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """
    Tính cosine similarity giữa 2 vectors.
    
    Args:
        vec1: Vector 1
        vec2: Vector 2
        
    Returns:
        Cosine similarity score (0-1)
    """
    try:
        # Normalize vectors (nếu chưa normalize)
        vec1_norm = vec1 / (np.linalg.norm(vec1) + 1e-8)
        vec2_norm = vec2 / (np.linalg.norm(vec2) + 1e-8)
        
        # Cosine similarity = dot product của normalized vectors
        similarity = np.dot(vec1_norm, vec2_norm)
        return float(similarity)
    except Exception as e:
        logger.error(f"Error calculating cosine similarity: {e}")
        return 0.0


def batch_generate_embeddings(texts: List[str], batch_size: int = 32) -> List[Optional[np.ndarray]]:
    """
    Generate embeddings cho nhiều texts cùng lúc (batch processing).
    
    Args:
        texts: List of texts
        batch_size: Batch size cho processing
        
    Returns:
        List of embedding vectors (có thể có None nếu lỗi)
    """
    if not texts:
        return []
    
    model = get_embedding_model()
    if model is None:
        return [None] * len(texts)
    
    try:
        # Batch encode
        embeddings = model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=False
        )
        return [emb for emb in embeddings]
    except Exception as e:
        logger.error(f"Error in batch embedding generation: {e}")
        return [None] * len(texts)

