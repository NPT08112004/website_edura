#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Search Service - Xử lý logic tìm kiếm documents
Tổ chức lại luồng tìm kiếm cho rõ ràng và dễ maintain
"""

import os
from typing import Dict, List, Optional, Tuple
from bson import ObjectId
from datetime import datetime, timedelta, date

from app.services.mongo_service import mongo_collections
from app.utils.search_utils import calculate_relevance_score
from app.utils.search_cache import search_cache

# BM25 imports với fallback
try:
    from app.utils.bm25_search import (
        calculate_bm25_score_simple,
        calculate_hybrid_score,
        USE_BM25_SEARCH
    )
    BM25_AVAILABLE = True
except ImportError:
    BM25_AVAILABLE = False
    USE_BM25_SEARCH = False

# Vector search imports với fallback
try:
    from app.services.embedding_service import (
        generate_embedding,
        generate_document_embedding,
        cosine_similarity,
        USE_EMBEDDING_SEARCH,
        SENTENCE_TRANSFORMERS_AVAILABLE
    )
    VECTOR_SEARCH_AVAILABLE = True
except ImportError:
    VECTOR_SEARCH_AVAILABLE = False
    USE_EMBEDDING_SEARCH = False
    SENTENCE_TRANSFORMERS_AVAILABLE = False

# Vector search imports với fallback
try:
    from app.services.vector_search_service import (
        VectorSearchService,
        USE_EMBEDDING_SEARCH
    )
    from app.services.embedding_service import SENTENCE_TRANSFORMERS_AVAILABLE
    VECTOR_SEARCH_AVAILABLE = True
except ImportError:
    VECTOR_SEARCH_AVAILABLE = False
    USE_EMBEDDING_SEARCH = False
    SENTENCE_TRANSFORMERS_AVAILABLE = False


class SearchService:
    """Service xử lý tìm kiếm documents."""
    
    # Configuration
    MAX_SEARCH_DOCS = int(os.getenv("MAX_SEARCH_DOCS", "1000"))  # Max documents to load
    BATCH_SIZE = int(os.getenv("SEARCH_BATCH_SIZE", "50"))  # Batch size for processing
    MIN_SCORE_THRESHOLD_SHORT = 60.0  # Query < 4 ký tự
    MIN_SCORE_THRESHOLD_MEDIUM = 50.0  # Query < 5 ký tự
    MIN_SCORE_THRESHOLD_LONG = 30.0  # Query >= 5 ký tự
    
    @staticmethod
    def parse_search_params(request_args: Dict) -> Dict:
        """
        Parse và validate search parameters từ request.
        
        Returns:
            Dict với các parameters đã parse và validate
        """
        return {
            "search": (request_args.get("search") or "").strip(),
            "schoolId": (request_args.get("schoolId") or "").strip(),
            "categoryId": (request_args.get("categoryId") or "").strip(),
            "fileType": (request_args.get("fileType") or "").strip().lower(),
            "length": (request_args.get("length") or "").strip().lower(),
            "uploadDate": (request_args.get("uploadDate") or "").strip(),
            "page": max(1, int(request_args.get("page", 1))),
            "limit": min(100, max(1, int(request_args.get("limit", 12))))
        }
    
    @staticmethod
    def build_mongo_query(params: Dict) -> Dict:
        """
        Build MongoDB query từ search parameters.
        Hỗ trợ cả ObjectId và string (tương thích dữ liệu cũ).
        
        Returns:
            MongoDB query dict
        """
        ands = []
        
        # Helper function để hỗ trợ cả ObjectId và string
        def _or_id(field1: str, field2: str, val: str):
            """Tạo query hỗ trợ cả ObjectId và string cho field1 và field2."""
            ors = []
            try:
                obj_id = ObjectId(val)
                ors.append({field1: obj_id})
                ors.append({field2: obj_id})
            except Exception:
                pass
            # Thêm cả string match
            ors.append({field1: val})
            ors.append({field2: val})
            return {"$or": ors}
        
        # School filter - hỗ trợ cả schoolId và school_id
        if params["schoolId"]:
            ands.append(_or_id("schoolId", "school_id", params["schoolId"]))
        
        # Category filter - hỗ trợ cả categoryId và category_id
        if params["categoryId"]:
            ands.append(_or_id("categoryId", "category_id", params["categoryId"]))
        
        # File type filter
        if params["fileType"]:
            file_ext_map = {
                "pdf": r"\.pdf",
                "doc": r"\.doc\b",
                "docx": r"\.docx",
                "word": r"\.(doc|docx)\b"
            }
            pattern = file_ext_map.get(params["fileType"])
            if pattern:
                ands.append({"s3_url": {"$regex": pattern, "$options": "i"}})
        
        # Length filter
        if params["length"]:
            length_map = {
                "short": {"$lt": 10},
                "medium": {"$gte": 10, "$lte": 50},
                "long": {"$gt": 50}
            }
            length_filter = length_map.get(params["length"])
            if length_filter:
                ands.append({"pages": length_filter})
        
        # Upload date filter
        if params["uploadDate"]:
            date_filter = SearchService._parse_upload_date(params["uploadDate"])
            if date_filter:
                ands.append({"$or": [
                    {"createdAt": date_filter},
                    {"created_at": date_filter}
                ]})
        
        # Build final query
        # Lưu ý: Nếu không có filters, trả về {} để query tất cả documents
        if len(ands) == 0:
            return {}
        elif len(ands) == 1:
            return ands[0]
        else:
            return {"$and": ands}
    
    @staticmethod
    def _parse_upload_date(upload_date: str) -> Optional[Dict]:
        """Parse upload date filter."""
        try:
            if upload_date == "today":
                today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                tomorrow = today + timedelta(days=1)
                return {"$gte": today, "$lt": tomorrow}
            elif upload_date == "yesterday":
                yesterday = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
                today = yesterday + timedelta(days=1)
                return {"$gte": yesterday, "$lt": today}
            elif upload_date == "last7days":
                week_ago = datetime.now() - timedelta(days=7)
                return {"$gte": week_ago}
            elif upload_date == "last30days":
                month_ago = datetime.now() - timedelta(days=30)
                return {"$gte": month_ago}
            elif upload_date.startswith("month:"):
                _, y, m = upload_date.split(":")
                y, m = int(y), int(m)
                start = datetime(y, m, 1)
                if m == 12:
                    end = datetime(y + 1, 1, 1)
                else:
                    end = datetime(y, m + 1, 1)
                return {"$gte": start, "$lt": end}
            elif upload_date.startswith("year:"):
                _, y = upload_date.split(":")
                y = int(y)
                start = datetime(y, 1, 1)
                end = datetime(y + 1, 1, 1)
                return {"$gte": start, "$lt": end}
            elif upload_date.startswith("day:"):
                _, y, m, d = upload_date.split(":")
                y, m, d = int(y), int(m), int(d)
                start = datetime(y, m, d)
                end = start + timedelta(days=1)
                return {"$gte": start, "$lt": end}
            elif upload_date.startswith("week:"):
                _, y, w = upload_date.split(":")
                y, w = int(y), int(w)
                jan4 = date(y, 1, 4)
                monday = jan4 - timedelta(days=jan4.weekday())
                start = monday + timedelta(weeks=w-1)
                week_start = datetime.combine(start, datetime.min.time())
                week_end = week_start + timedelta(days=7)
                return {"$gte": week_start, "$lt": week_end}
        except Exception:
            pass
        return None
    
    @staticmethod
    def load_documents(mongo_query: Dict, limit: int = None) -> List[Dict]:
        """
        Load documents từ MongoDB với query và limit.
        
        Args:
            mongo_query: MongoDB query
            limit: Max số documents (None = không giới hạn)
            
        Returns:
            List of documents
        """
        try:
            cursor = mongo_collections.documents.find(mongo_query).sort("createdAt", -1)
            if limit:
                cursor = cursor.limit(limit)
            return list(cursor)
        except Exception:
            try:
                cursor = mongo_collections.documents.find(mongo_query).sort("created_at", -1)
                if limit:
                    cursor = cursor.limit(limit)
                return list(cursor)
            except Exception:
                cursor = mongo_collections.documents.find(mongo_query)
                if limit:
                    cursor = cursor.limit(limit)
                return list(cursor)
    
    @staticmethod
    def load_categories(category_ids: List[ObjectId]) -> Dict[str, str]:
        """
        Load category names từ MongoDB.
        
        Args:
            category_ids: List of category ObjectIds
            
        Returns:
            Dict mapping category_id (string) -> category_name
        """
        if not category_ids:
            return {}
        
        category_map = {}
        try:
            for c in mongo_collections.categories.find(
                {"_id": {"$in": category_ids}},
                {"name": 1}
            ):
                category_map[str(c["_id"])] = c.get("name", "")
        except Exception:
            pass
        
        return category_map
    
    @staticmethod
    def calculate_relevance(
        query: str,
        document: Dict,
        category_map: Dict[str, str]
    ) -> float:
        """
        Tính relevance score cho một document.
        Hỗ trợ: Vector search (semantic) > BM25 > Keyword-based
        
        Args:
            query: Search query
            document: Document dict
            category_map: Dict mapping category_id -> category_name
            
        Returns:
            Relevance score (0 nếu không match)
        """
        title = document.get("title", "") or ""
        keywords = document.get("keywords", []) or []
        
        # Lấy category name
        category_name = ""
        cid = document.get("categoryId") or document.get("category_id")
        if cid:
            try:
                cid_str = str(cid) if isinstance(cid, ObjectId) else str(ObjectId(str(cid)))
                category_name = category_map.get(cid_str, "")
            except Exception:
                pass
        
        # Tính score - ưu tiên vector search nếu enabled
        score = 0.0
        
        # Option 1: Vector search (semantic) - ưu tiên cao nhất
        if VECTOR_SEARCH_AVAILABLE and USE_EMBEDDING_SEARCH and SENTENCE_TRANSFORMERS_AVAILABLE:
            try:
                from app.services.embedding_service import generate_embedding, cosine_similarity
                from app.services.vector_search_service import VectorSearchService
                
                # Generate query embedding
                query_embedding = generate_embedding(query)
                if query_embedding is not None:
                    doc_id = str(document.get("_id", ""))
                    
                    # Lấy embedding từ DB (nếu có)
                    doc_embedding = VectorSearchService.get_document_embedding_from_db(doc_id)
                    
                    # Nếu chưa có embedding, generate và lưu vào DB
                    if doc_embedding is None:
                        doc_embedding = generate_document_embedding(
                            title=title,
                            keywords=keywords,
                            category_name=category_name,
                            summary=document.get("summary", "") or ""
                        )
                        
                        # Lưu vào DB để dùng lại lần sau
                        if doc_embedding is not None and doc_id:
                            try:
                                VectorSearchService.save_document_embedding(doc_id, doc_embedding)
                            except Exception as save_err:
                                logger.warning(f"Failed to save embedding for doc {doc_id}: {save_err}")
                    
                    if doc_embedding is not None:
                        # Calculate cosine similarity
                        similarity = cosine_similarity(query_embedding, doc_embedding)
                        
                        # Convert similarity (0-1) to score (0-100)
                        # Threshold: 0.3 similarity = 30 score
                        if similarity >= 0.3:
                            score = similarity * 100.0
            except Exception as e:
                logger.warning(f"Vector search failed, using fallback: {e}")
                # Fallback to BM25 or keyword-based
        
        # Option 2: BM25 (nếu vector search không available hoặc fail)
        if score == 0.0 and BM25_AVAILABLE and USE_BM25_SEARCH:
            try:
                document_for_bm25 = {
                    "title": title,
                    "keywords": keywords,
                    "category_name": category_name
                }
                bm25_score = calculate_bm25_score_simple(query, document_for_bm25)
                if bm25_score > 0:
                    score = calculate_hybrid_score(
                        query,
                        document_for_bm25,
                        bm25_score,
                        category_name
                    )
            except Exception:
                # Fallback về hệ thống cũ
                score = calculate_relevance_score(query, title, keywords, category_name)
        
        # Option 3: Keyword-based (fallback cuối cùng)
        if score == 0.0:
            score = calculate_relevance_score(query, title, keywords, category_name)
        
        return score
    
    @staticmethod
    def get_min_score_threshold(query: str) -> float:
        """Lấy minimum score threshold dựa trên độ dài query."""
        query_len = len(query.strip())
        if query_len < 4:
            return SearchService.MIN_SCORE_THRESHOLD_SHORT
        elif query_len < 5:
            return SearchService.MIN_SCORE_THRESHOLD_MEDIUM
        else:
            return SearchService.MIN_SCORE_THRESHOLD_LONG
    
    @staticmethod
    def calculate_popularity_bonus(document: Dict) -> float:
        """Tính popularity bonus từ views, downloads, grade."""
        views = document.get("views", 0) or 0
        downloads = document.get("downloads", 0) or 0
        grade_score = float(document.get("gradeScore", 0) or 0)
        
        # Bonus: views (0.1 điểm/view), downloads (0.2 điểm/download), grade (0.5 điểm/grade)
        return (views * 0.1) + (downloads * 0.2) + (grade_score * 0.5)
    
    @staticmethod
    def filter_and_score_documents(
        documents: List[Dict],
        query: str,
        category_map: Dict[str, str]
    ) -> List[Dict]:
        """
        Filter và tính score cho documents.
        
        Args:
            documents: List of documents
            query: Search query
            category_map: Dict mapping category_id -> category_name
            
        Returns:
            List of documents với _relevance_score
        """
        if not query:
            return documents
        
        min_score = SearchService.get_min_score_threshold(query)
        filtered_docs = []
        
        for doc in documents:
            # Tính relevance score
            score = SearchService.calculate_relevance(query, doc, category_map)
            
            # Chỉ chấp nhận documents có score >= threshold
            if score >= min_score:
                # Thêm popularity bonus
                popularity_bonus = SearchService.calculate_popularity_bonus(doc)
                final_score = score + popularity_bonus
                
                doc["_relevance_score"] = final_score
                filtered_docs.append(doc)
        
        return filtered_docs
    
    @staticmethod
    def sort_documents(documents: List[Dict]) -> List[Dict]:
        """
        Sort documents theo relevance score.
        
        Priority:
        1. Category match (score >= 200)
        2. Relevance score (high -> low)
        3. Created date (new -> old)
        """
        def _sort_key(d):
            score = d.get("_relevance_score", 0.0)
            created = d.get("createdAt") or d.get("created_at") or d.get("_id")
            # Documents có category match (score >= 200) được ưu tiên cao nhất
            is_category_match = score >= 200.0
            return (is_category_match, score, created)
        
        return sorted(documents, key=_sort_key, reverse=True)
    
    @staticmethod
    def paginate_documents(documents: List[Dict], page: int, limit: int) -> Tuple[List[Dict], int]:
        """
        Paginate documents.
        
        Returns:
            Tuple of (paginated_documents, total_count)
        """
        total = len(documents)
        skip = (page - 1) * limit
        paginated = documents[skip:skip + limit]
        return paginated, total
    
    @staticmethod
    def search_documents(params: Dict, use_cache: bool = True) -> Dict:
        """
        Main search function - tổng hợp tất cả các bước.
        
        Flow:
        1. Parse parameters
        2. Check cache
        3. Build MongoDB query
        4. Load documents
        5. Load categories
        6. Filter và score documents
        7. Sort documents
        8. Paginate
        9. Cache result
        10. Return result
        
        Args:
            params: Search parameters (từ parse_search_params)
            use_cache: Có sử dụng cache không
            
        Returns:
            Dict với documents, total, page, limit, totalPages
        """
        # 1. Check cache
        cache_key = {
            "search": params["search"],
            "schoolId": params["schoolId"],
            "categoryId": params["categoryId"],
            "fileType": params["fileType"],
            "length": params["length"],
            "uploadDate": params["uploadDate"],
            "page": params["page"],
            "limit": params["limit"]
        }
        
        if use_cache:
            cached_result = search_cache.get(cache_key)
            if cached_result:
                # Trả về cached result ngay lập tức
                return cached_result
        
        # 2. Build MongoDB query
        mongo_query = SearchService.build_mongo_query(params)
        
        # 3. Load documents
        search_query = params["search"].strip()
        if search_query:
            # Có search query: load với limit để tối ưu memory
            # Chỉ load documents match filters, sau đó filter bằng relevance score
            documents = SearchService.load_documents(mongo_query, SearchService.MAX_SEARCH_DOCS)
        else:
            # Không có search query: load tất cả (sẽ paginate sau)
            # Lưu ý: Với dataset lớn, nên dùng cursor.skip().limit() thay vì load tất cả
            documents = SearchService.load_documents(mongo_query)
        
        # 4. Load categories (chỉ khi có search query - cần để tính relevance score)
        category_map = {}
        if search_query:
            category_ids = set()
            for doc in documents:
                cid = doc.get("categoryId") or doc.get("category_id")
                if cid:
                    try:
                        category_ids.add(cid if isinstance(cid, ObjectId) else ObjectId(str(cid)))
                    except Exception:
                        pass
            
            if category_ids:
                category_map = SearchService.load_categories(list(category_ids))
        
        # 5. Filter và score documents (chỉ khi có search query)
        if search_query:
            documents = SearchService.filter_and_score_documents(documents, search_query, category_map)
            # 6. Sort documents theo relevance
            documents = SearchService.sort_documents(documents)
        else:
            # Không có search: chỉ sort theo createdAt (mới -> cũ)
            documents = sorted(
                documents,
                key=lambda d: d.get("createdAt") or d.get("created_at") or d.get("_id"),
                reverse=True
            )
        
        # 6. Paginate (sau khi đã filter và sort)
        paginated_docs, total = SearchService.paginate_documents(
            documents,
            params["page"],
            params["limit"]
        )
        
        # 7. Build response
        total_pages = (total + params["limit"] - 1) // params["limit"] if params["limit"] > 0 else 0
        result = {
            "documents": paginated_docs,
            "total": total,
            "page": params["page"],
            "limit": params["limit"],
            "totalPages": total_pages
        }
        
        # 8. Cache result (chỉ cache khi có search query hoặc có filters)
        # Không cache khi không có filters để tránh cache quá lớn
        if use_cache and (search_query or params["schoolId"] or params["categoryId"] or params["fileType"] or params["length"] or params["uploadDate"]):
            try:
                search_cache.set(cache_key, result)
            except Exception as e:
                # Log error nhưng không fail request
                import logging
                logging.warning(f"Failed to cache search result: {e}")
        
        return result

