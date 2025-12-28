# 🔍 Tối ưu hóa Thuật toán Search

## 📊 Phân tích hệ thống hiện tại

### Điểm mạnh
- ✅ Hỗ trợ tìm kiếm không dấu, không khoảng cách
- ✅ Có searchText index trên MongoDB
- ✅ Có caching mechanism (in-memory)
- ✅ Ranking dựa trên relevance + popularity

### Điểm yếu
- ⚠️ Load tất cả documents vào memory rồi filter (không scalable)
- ⚠️ Ranking đơn giản: chỉ dựa trên match position (đầu/giữa) và popularity
- ⚠️ Không có term frequency weighting (TF-IDF/BM25)
- ⚠️ Không có document frequency normalization
- ⚠️ Không tận dụng MongoDB text index hiệu quả

---

## 🚀 Đề xuất: BM25 Algorithm

### Tại sao BM25?

**BM25 (Best Matching 25)** là thuật toán ranking tiêu chuẩn cho full-text search, được sử dụng bởi:
- Google Search
- Elasticsearch (default ranking)
- Apache Lucene
- MongoDB Atlas Search

**Ưu điểm:**
1. **Term Frequency (TF) weighting**: Từ xuất hiện nhiều lần trong document → điểm cao hơn
2. **Inverse Document Frequency (IDF)**: Từ hiếm → điểm cao hơn (ví dụ: "giải tích" > "tài liệu")
3. **Field length normalization**: Document ngắn có từ khóa → điểm cao hơn
4. **Tunable parameters**: Có thể điều chỉnh theo dữ liệu

### Công thức BM25

```
BM25(q, d) = Σ IDF(qi) × (f(qi, d) × (k1 + 1)) / (f(qi, d) + k1 × (1 - b + b × |d|/avgdl))

Trong đó:
- q: query (từ khóa tìm kiếm)
- d: document
- f(qi, d): tần suất từ qi trong document d
- |d|: độ dài document (số từ)
- avgdl: độ dài trung bình của tất cả documents
- k1: parameter điều chỉnh term frequency saturation (thường = 1.2)
- b: parameter điều chỉnh field length normalization (thường = 0.75)
- IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5))
  - N: tổng số documents
  - n(qi): số documents chứa từ qi
```

---

## 💡 Implementation Plan

### Phase 1: BM25 với dữ liệu hiện có (Không cần thay đổi infrastructure)

#### 1.1. Pre-compute Document Statistics
- **Tổng số documents**: `N`
- **Độ dài trung bình**: `avgdl` (tính từ title + keywords)
- **Document frequency**: Số documents chứa mỗi từ (từ searchText)

#### 1.2. BM25 Scoring Function
```python
def calculate_bm25_score(
    query: str,
    document: dict,
    document_freq: dict,  # {term: number of documents containing term}
    total_docs: int,
    avg_doc_length: float,
    k1: float = 1.2,
    b: float = 0.75
) -> float:
    """
    Tính BM25 score cho một document.
    
    Args:
        query: Query string (đã normalize)
        document: Document dict với title, keywords, category_name
        document_freq: Dictionary {term: doc_count}
        total_docs: Tổng số documents
        avg_doc_length: Độ dài trung bình (số từ)
        k1: Term frequency saturation parameter (default: 1.2)
        b: Field length normalization parameter (default: 0.75)
    """
    # Tokenize query và document
    query_tokens = tokenize(query)
    doc_text = f"{document.get('title', '')} {' '.join(document.get('keywords', []))}"
    doc_tokens = tokenize(doc_text)
    doc_length = len(doc_tokens)
    
    score = 0.0
    
    for term in query_tokens:
        # Term frequency trong document
        term_freq = doc_tokens.count(term)
        if term_freq == 0:
            continue
        
        # Inverse Document Frequency
        doc_freq = document_freq.get(term, 0)
        if doc_freq == 0:
            continue
        
        idf = math.log((total_docs - doc_freq + 0.5) / (doc_freq + 0.5))
        
        # BM25 component
        numerator = term_freq * (k1 + 1)
        denominator = term_freq + k1 * (1 - b + b * (doc_length / avg_doc_length))
        
        score += idf * (numerator / denominator)
    
    return score
```

#### 1.3. Hybrid Scoring: BM25 + Category Priority
```python
def calculate_hybrid_score(
    query: str,
    document: dict,
    bm25_score: float,
    category_name: str = ""
) -> float:
    """
    Kết hợp BM25 với category priority.
    
    Priority:
    1. Category match: BM25 × 2.0 (boost)
    2. Title match: BM25 × 1.5 (boost)
    3. Keywords match: BM25 (normal)
    """
    query_normalized = normalize_search(query)
    category_normalized = normalize_search(category_name) if category_name else ""
    title_normalized = normalize_search(document.get("title", ""))
    
    # Category boost
    if category_normalized and query_normalized in category_normalized:
        return bm25_score * 2.0
    
    # Title boost
    if title_normalized and query_normalized in title_normalized:
        return bm25_score * 1.5
    
    # Normal BM25
    return bm25_score
```

### Phase 2: Tối ưu MongoDB Query

#### 2.1. Sử dụng MongoDB Text Index hiệu quả
```python
# Tạo text index trên title, keywords
db.documents.create_index([
    ("title", "text"),
    ("keywords", "text")
])

# Query với text search
query = {
    "$text": {"$search": search_query},
    "schoolId": school_id,  # Nếu có filter
    "categoryId": category_id  # Nếu có filter
}

# MongoDB sẽ trả về documents với textScore
cursor = db.documents.find(query).sort([("score", {"$meta": "textScore"})])
```

#### 2.2. Kết hợp MongoDB text search với BM25
- MongoDB text search: Filter sơ bộ (nhanh)
- BM25: Ranking chính xác (chậm hơn nhưng tốt hơn)

### Phase 3: Caching & Optimization

#### 3.1. Cache Document Statistics
- Cache `total_docs`, `avg_doc_length`, `document_freq`
- Update khi có document mới/xóa

#### 3.2. Incremental Updates
- Chỉ tính lại statistics cho documents mới
- Không cần tính lại toàn bộ

---

## 📈 So sánh Performance

### Hiện tại (Simple Relevance)
- **Time complexity**: O(N × M) với N = số documents, M = độ dài query
- **Memory**: Load tất cả documents vào memory
- **Accuracy**: Trung bình (không có TF-IDF)

### Với BM25
- **Time complexity**: O(N × M) nhưng có thể tối ưu với index
- **Memory**: Chỉ load documents match (sau MongoDB filter)
- **Accuracy**: Cao hơn (có TF-IDF, field length normalization)

### Với MongoDB Text Index + BM25 (Tối ưu nhất)
- **Time complexity**: O(K × M) với K = số documents match (sau MongoDB filter)
- **Memory**: Chỉ load documents match
- **Accuracy**: Cao nhất (kết hợp MongoDB text search + BM25)

---

## 🎯 Implementation Steps

### Step 1: Tạo BM25 utility module
- File: `app/utils/bm25_search.py`
- Functions: `calculate_bm25_score()`, `precompute_statistics()`

### Step 2: Pre-compute document statistics
- Script: `scripts/precompute_bm25_stats.py`
- Tính `total_docs`, `avg_doc_length`, `document_freq`
- Lưu vào MongoDB collection `search_statistics`

### Step 3: Update search controllers
- File: `app/controllers/documents.py`
- Thay `calculate_relevance_score()` bằng `calculate_bm25_score()`
- Load statistics từ cache/MongoDB

### Step 4: Testing & Tuning
- Test với queries thực tế
- Tune parameters `k1` và `b` theo dữ liệu
- So sánh kết quả với hệ thống cũ

---

## 🔄 Alternative: Elasticsearch (Long-term)

Nếu dữ liệu lớn (>100K documents) hoặc cần advanced features:

### Ưu điểm Elasticsearch:
- ✅ Inverted index tự động
- ✅ BM25 built-in
- ✅ Faceted search
- ✅ Aggregations
- ✅ Highlighting
- ✅ Fuzzy matching
- ✅ Synonym support

### Nhược điểm:
- ❌ Cần infrastructure mới
- ❌ Cần sync data từ MongoDB → Elasticsearch
- ❌ Tăng complexity

### Khi nào nên dùng:
- Dataset > 100K documents
- Cần real-time search với <100ms latency
- Cần advanced features (fuzzy, synonyms, etc.)

---

## 📝 Recommendation

**Với dữ liệu hiện có, đề xuất:**

1. **Short-term (1-2 tuần)**: Implement BM25 trong Python
   - Không cần thay đổi infrastructure
   - Cải thiện ranking đáng kể
   - Dễ test và tune

2. **Medium-term (1-2 tháng)**: Tối ưu MongoDB queries
   - Sử dụng text index hiệu quả
   - Kết hợp MongoDB filter + BM25 ranking

3. **Long-term (3-6 tháng)**: Xem xét Elasticsearch
   - Nếu dataset > 100K documents
   - Nếu cần advanced features

---

## 📚 References

- [BM25 Algorithm](https://en.wikipedia.org/wiki/Okapi_BM25)
- [MongoDB Text Search](https://www.mongodb.com/docs/manual/text-search/)
- [Elasticsearch BM25](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-modules-similarity.html#bm25)

