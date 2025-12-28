# 🚀 Hướng dẫn sử dụng BM25 Search Algorithm

## 📋 Tổng quan

BM25 (Best Matching 25) là thuật toán ranking tiêu chuẩn cho full-text search, được sử dụng bởi Google, Elasticsearch, và MongoDB Atlas Search.

**Ưu điểm so với hệ thống hiện tại:**
- ✅ **Term Frequency (TF) weighting**: Từ xuất hiện nhiều lần → điểm cao hơn
- ✅ **Inverse Document Frequency (IDF)**: Từ hiếm → điểm cao hơn
- ✅ **Field length normalization**: Document ngắn có từ khóa → điểm cao hơn
- ✅ **Tunable parameters**: Có thể điều chỉnh theo dữ liệu

---

## 📦 Files đã tạo

1. **`app/utils/bm25_search.py`**: BM25 implementation
2. **`scripts/test_bm25_search.py`**: Script test và so sánh
3. **`scripts/precompute_bm25_stats.py`**: Script pre-compute statistics
4. **`SEARCH_ALGORITHM_OPTIMIZATION.md`**: Document phân tích chi tiết

---

## 🔧 Cách sử dụng

### Option 1: BM25 đơn giản (Không cần pre-compute)

Sử dụng khi không có pre-computed statistics. Phù hợp cho:
- Dataset nhỏ (< 10K documents)
- Test và development
- Không cần độ chính xác cao nhất

**Ví dụ:**
```python
from app.utils.bm25_search import calculate_bm25_score_simple, calculate_hybrid_score

# Document
document = {
    "title": "Giải tích 1 - Đề cương",
    "keywords": ["giải tích", "toán", "đề cương"],
    "category_name": "Toán học"
}

# Query
query = "giải tích"

# Tính BM25 score
bm25_score = calculate_bm25_score_simple(query, document)

# Kết hợp với category/title boost
hybrid_score = calculate_hybrid_score(
    query,
    document,
    bm25_score,
    category_name="Toán học"
)

print(f"BM25 Score: {bm25_score:.2f}")
print(f"Hybrid Score: {hybrid_score:.2f}")
```

### Option 2: BM25 với pre-computed statistics (Khuyến nghị)

Sử dụng khi có pre-computed statistics. Phù hợp cho:
- Dataset lớn (> 10K documents)
- Production environment
- Cần độ chính xác cao nhất

**Bước 1: Pre-compute statistics**
```bash
python scripts/precompute_bm25_stats.py
```

**Bước 2: Sử dụng trong controller**
```python
from app.services.mongo_service import mongo_collections
from app.utils.bm25_search import BM25

# Load statistics từ MongoDB
stats = mongo_collections.search_statistics.find_one({"_id": "bm25_stats"})

if stats:
    # Initialize BM25 với statistics
    bm25 = BM25(k1=1.2, b=0.75)
    bm25.total_docs = stats["total_docs"]
    bm25.avg_doc_length = stats["avg_doc_length"]
    bm25.document_freq = stats["document_freq"]
    bm25.doc_lengths = stats["doc_lengths"]
    
    # Tính score
    score = bm25.score(query, doc_id)
```

---

## 🔄 Tích hợp vào hệ thống hiện tại

### Cách 1: Thay thế hoàn toàn (Khuyến nghị cho production)

**File:** `app/controllers/documents.py`

```python
# Thay đổi import
from app.utils.bm25_search import calculate_bm25_score_simple, calculate_hybrid_score

# Trong hàm get_documents(), thay đổi:
# OLD:
score = calculate_relevance_score(search_stripped, title, keywords, category_name)

# NEW:
bm25_score = calculate_bm25_score_simple(search_stripped, {
    "title": title,
    "keywords": keywords,
    "category_name": category_name
})
final_score = calculate_hybrid_score(
    search_stripped,
    {"title": title, "keywords": keywords},
    bm25_score,
    category_name
)

# Thêm popularity bonus (giữ nguyên)
views = doc.get("views", 0) or 0
downloads = doc.get("downloads", 0) or 0
grade_score = float(doc.get("gradeScore", 0) or 0)
popularity_bonus = (views * 0.1) + (downloads * 0.2) + (grade_score * 0.5)
final_score = final_score + popularity_bonus
```

### Cách 2: Feature flag (Khuyến nghị cho testing)

Thêm feature flag để có thể switch giữa hệ thống cũ và BM25:

```python
# app/config.py hoặc environment variable
USE_BM25_SEARCH = os.getenv("USE_BM25_SEARCH", "false").lower() == "true"

# Trong controller
if USE_BM25_SEARCH:
    # Sử dụng BM25
    bm25_score = calculate_bm25_score_simple(search_stripped, {...})
    final_score = calculate_hybrid_score(...)
else:
    # Sử dụng hệ thống cũ
    score = calculate_relevance_score(...)
    final_score = score + popularity_bonus
```

---

## 🧪 Testing

### Test và so sánh với hệ thống cũ:
```bash
python scripts/test_bm25_search.py
```

Output sẽ hiển thị:
- Kết quả từ hệ thống cũ (Relevance Score)
- Kết quả từ BM25 (Hybrid Score)
- So sánh ranking

### Test với dữ liệu thực:
1. Chạy script pre-compute statistics
2. Test với queries thực tế từ users
3. So sánh kết quả và tune parameters

---

## ⚙️ Tuning Parameters

BM25 có 2 parameters chính:

### `k1` (Term frequency saturation)
- **Default**: 1.2
- **Range**: 0.5 - 2.0
- **Ý nghĩa**: Điều chỉnh mức độ "bão hòa" của term frequency
  - `k1` thấp (0.5-1.0): Term frequency ít quan trọng hơn
  - `k1` cao (1.5-2.0): Term frequency quan trọng hơn

### `b` (Field length normalization)
- **Default**: 0.75
- **Range**: 0.0 - 1.0
- **Ý nghĩa**: Điều chỉnh mức độ normalize theo độ dài document
  - `b = 0`: Không normalize theo độ dài
  - `b = 1`: Normalize hoàn toàn theo độ dài

**Cách tune:**
1. Test với `k1=1.2, b=0.75` (default)
2. Nếu kết quả không tốt, thử:
   - `k1=1.5, b=0.75` (tăng importance của term frequency)
   - `k1=1.0, b=0.5` (giảm importance của term frequency và length)
3. So sánh kết quả và chọn parameters tốt nhất

---

## 📊 Performance

### So sánh với hệ thống hiện tại:

| Metric | Hệ thống cũ | BM25 (Simple) | BM25 (Pre-computed) |
|--------|-------------|---------------|---------------------|
| **Accuracy** | Trung bình | Tốt | Rất tốt |
| **Speed** | Nhanh | Trung bình | Nhanh (với cache) |
| **Memory** | Cao (load all) | Trung bình | Thấp (với index) |
| **Scalability** | Kém | Tốt | Rất tốt |

### Khi nào nên dùng:

- **BM25 Simple**: Dataset < 10K documents, development/testing
- **BM25 Pre-computed**: Dataset > 10K documents, production
- **Elasticsearch**: Dataset > 100K documents, cần advanced features

---

## 🔍 Ví dụ sử dụng

### Ví dụ 1: Search "toán"
```python
query = "toán"

documents = [
    {
        "title": "Giải tích 1",
        "keywords": ["giải tích", "toán"],
        "category_name": "Toán học"
    },
    {
        "title": "Luật kinh tế",
        "keywords": ["luật", "kinh tế"],
        "category_name": "Luật kinh tế"
    }
]

# BM25 sẽ ưu tiên document có "toán" trong category/title/keywords
# Document 1 sẽ có điểm cao hơn Document 2
```

### Ví dụ 2: Search "giải tích"
```python
query = "giải tích"

# Document có "giải tích" xuất hiện nhiều lần sẽ có điểm cao hơn
# Document có "giải tích" trong category sẽ có điểm cao hơn (boost)
```

---

## 🚨 Lưu ý

1. **Pre-compute statistics**: Cần chạy lại khi có documents mới/xóa
2. **Cache statistics**: Nên cache statistics trong memory để tránh query MongoDB mỗi lần
3. **Update frequency**: Có thể update statistics định kỳ (mỗi ngày/tuần) thay vì real-time
4. **Backward compatibility**: Giữ hệ thống cũ làm fallback nếu BM25 có vấn đề

---

## 📚 Tài liệu tham khảo

- [BM25 Algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Okapi_BM25)
- [Elasticsearch BM25](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-modules-similarity.html#bm25)
- [MongoDB Atlas Search](https://www.mongodb.com/docs/atlas/atlas-search/)

---

## ✅ Checklist triển khai

- [ ] Chạy `python scripts/test_bm25_search.py` để test
- [ ] Chạy `python scripts/precompute_bm25_stats.py` để tính statistics
- [ ] Tích hợp BM25 vào controller (với feature flag)
- [ ] Test với queries thực tế
- [ ] Tune parameters `k1` và `b`
- [ ] So sánh kết quả với hệ thống cũ
- [ ] Deploy với feature flag = false
- [ ] Monitor performance và accuracy
- [ ] Enable feature flag = true khi đã ổn định
- [ ] Remove hệ thống cũ (nếu muốn)

