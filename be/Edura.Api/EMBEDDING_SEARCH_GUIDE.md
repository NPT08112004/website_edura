# 🔍 Hướng dẫn Embedding-based Semantic Search

## 📋 Tổng quan

Hệ thống search dựa trên **embedding vectors** (semantic search) cho phép tìm kiếm theo **ý nghĩa** thay vì chỉ match từ khóa.

**Ưu điểm:**
- ✅ **Semantic understanding**: Hiểu được ý nghĩa của query
- ✅ **Tìm kiếm tương tự**: Tìm được documents tương tự dù không có từ khóa chính xác
- ✅ **Hỗ trợ tiếng Việt**: Sử dụng model được train cho tiếng Việt
- ✅ **Không cần API key**: Chạy local với sentence-transformers

**Ví dụ:**
- Query: "toán học" → Tìm được: "Giải tích", "Đại số", "Toán cao cấp"
- Query: "lập trình" → Tìm được: "Coding", "Programming", "Phát triển phần mềm"

---

## 🚀 Setup

### 1. Cài đặt dependencies

```bash
pip install sentence-transformers numpy
```

Hoặc thêm vào `requirements.txt`:
```
sentence-transformers>=2.2.0
numpy>=1.24.0
```

### 2. Cấu hình Environment Variables

**Cách 1: Thêm vào file `.env` (Khuyến nghị)**

Mở file `.env` trong thư mục `be/Edura.Api/` và thêm:

```env
# Enable embedding search
USE_EMBEDDING_SEARCH=true

# Model name (optional, có default)
EMBEDDING_MODEL_NAME=keepitreal/vietnamese-sbert

# Vector search parameters (optional)
VECTOR_SEARCH_THRESHOLD=0.3  # Minimum similarity (0-1)
VECTOR_SEARCH_TOP_K=100      # Top K results
```

**Cách 2: Set environment variable tạm thời (chỉ cho session hiện tại)**

```powershell
# Windows PowerShell
$env:USE_EMBEDDING_SEARCH="true"
$env:EMBEDDING_MODEL_NAME="keepitreal/vietnamese-sbert"
```

```cmd
# Windows CMD
set USE_EMBEDDING_SEARCH=true
set EMBEDDING_MODEL_NAME=keepitreal/vietnamese-sbert
```

```bash
# Linux/Mac
export USE_EMBEDDING_SEARCH=true
export EMBEDDING_MODEL_NAME=keepitreal/vietnamese-sbert
```

**Lưu ý:** Cách 1 (file `.env`) được khuyến nghị vì:
- ✅ Persistent (không mất khi đóng terminal)
- ✅ Dễ quản lý và version control (thêm `.env` vào `.gitignore`)
- ✅ Tự động load khi chạy Flask app

### 3. Generate embeddings cho documents hiện có

```bash
python scripts/generate_document_embeddings.py
```

Script này sẽ:
- Load tất cả documents từ MongoDB
- Generate embeddings cho mỗi document
- Lưu embeddings vào MongoDB field `embedding`

**Lưu ý:**
- Lần đầu chạy sẽ download model (có thể mất vài phút)
- Với dataset lớn, có thể mất thời gian
- Có thể chạy lại để update embeddings cho documents mới

---

## 🏗️ Kiến trúc

### Files đã tạo:

1. **`app/services/embedding_service.py`**
   - Generate embeddings cho text/queries
   - Sử dụng sentence-transformers
   - Lazy load model (singleton)

2. **`app/services/vector_search_service.py`**
   - Vector search bằng cosine similarity
   - Lưu/load embeddings từ MongoDB
   - Hybrid search (vector + keyword)

3. **`scripts/generate_document_embeddings.py`**
   - Script generate embeddings cho documents hiện có

### Luồng hoạt động:

```
Query → Generate Query Embedding → Load Document Embeddings 
→ Calculate Cosine Similarity → Filter by Threshold → Sort by Similarity → Results
```

---

## 🔧 Sử dụng

### Option 1: Pure Vector Search

Chỉ sử dụng vector similarity:

```python
from app.services.vector_search_service import VectorSearchService

results = VectorSearchService.search_by_vector(
    query="toán học",
    documents=all_documents,
    category_map=category_map,
    top_k=10
)
```

### Option 2: Hybrid Search (Khuyến nghị)

Kết hợp vector similarity + keyword-based scores:

```python
from app.services.vector_search_service import VectorSearchService

# Tính keyword scores trước
keyword_scores = {...}  # doc_id -> score

# Hybrid search
results = VectorSearchService.hybrid_search(
    query="toán học",
    documents=all_documents,
    category_map=category_map,
    keyword_scores=keyword_scores,
    vector_weight=0.6,  # 60% vector
    keyword_weight=0.4  # 40% keyword
)
```

### Option 3: Tích hợp vào SearchService

Đã được tích hợp tự động vào `SearchService.calculate_relevance()`:
- Nếu `USE_EMBEDDING_SEARCH=true` → Sử dụng vector search
- Nếu không → Fallback về BM25 hoặc keyword-based

---

## 📊 Models hỗ trợ

### Vietnamese Models:

1. **`keepitreal/vietnamese-sbert`** (Default)
   - Model tốt cho tiếng Việt
   - Dimension: 768
   - Fast và accurate

2. **`VoVanPhuc/sup-SimCSE-VietNamese-phobert-base`**
   - Model chuyên cho tiếng Việt
   - Dimension: 768
   - Có thể tốt hơn cho một số use cases

3. **`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`**
   - Multilingual (hỗ trợ nhiều ngôn ngữ)
   - Dimension: 384
   - Nhỏ hơn, nhanh hơn

### Cách chọn model:

```env
# Model tốt cho tiếng Việt (khuyến nghị)
EMBEDDING_MODEL_NAME=keepitreal/vietnamese-sbert

# Model nhỏ, nhanh (cho production)
EMBEDDING_MODEL_NAME=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
```

---

## ⚙️ Tuning Parameters

### `VECTOR_SEARCH_THRESHOLD` (0.3 default)

- **Ý nghĩa**: Minimum cosine similarity để chấp nhận document
- **Range**: 0.0 - 1.0
- **Tăng** (0.5-0.7): Chỉ trả về documents rất tương tự (ít kết quả, chính xác hơn)
- **Giảm** (0.1-0.2): Trả về nhiều kết quả hơn (có thể có false positives)

### `VECTOR_SEARCH_TOP_K` (100 default)

- **Ý nghĩa**: Số lượng kết quả tối đa
- **Tăng**: Nhiều kết quả hơn (chậm hơn)
- **Giảm**: Ít kết quả hơn (nhanh hơn)

---

## 🔄 Auto-generate Embeddings

Khi upload document mới, embedding sẽ được generate tự động (nếu enabled).

Khi search, nếu document chưa có embedding:
- Generate embedding on-the-fly
- Lưu vào MongoDB để dùng lại

---

## 📈 Performance

### So sánh:

| Metric | Keyword-based | BM25 | Vector Search |
|--------|---------------|------|---------------|
| **Accuracy** | Trung bình | Tốt | Rất tốt (semantic) |
| **Speed** | Rất nhanh | Nhanh | Chậm hơn (cần tính embedding) |
| **Memory** | Thấp | Trung bình | Cao (lưu embeddings) |
| **Setup** | Dễ | Dễ | Cần generate embeddings |

### Tối ưu:

1. **Pre-generate embeddings**: Chạy script một lần cho tất cả documents
2. **Cache embeddings**: Lưu trong MongoDB để không phải tính lại
3. **Batch processing**: Generate embeddings theo batch
4. **Hybrid search**: Kết hợp vector + keyword để cân bằng accuracy và speed

---

## 🧪 Testing

### Test embedding generation:

```python
from app.services.embedding_service import generate_embedding, cosine_similarity

# Generate embeddings
emb1 = generate_embedding("toán học")
emb2 = generate_embedding("giải tích")

# Calculate similarity
similarity = cosine_similarity(emb1, emb2)
print(f"Similarity: {similarity}")  # Should be high (> 0.7)
```

### Test vector search:

```python
from app.services.vector_search_service import VectorSearchService

# Search
results = VectorSearchService.search_by_vector(
    query="toán học",
    documents=documents,
    category_map=category_map
)

for doc, score in results:
    print(f"{doc['title']}: {score:.2f}")
```

---

## 🚨 Troubleshooting

### Model không load được

```bash
# Kiểm tra cài đặt
pip install sentence-transformers

# Kiểm tra model name
# Thử model khác nếu model hiện tại không available
```

### Embeddings quá lớn

- Giảm `EMBEDDING_DIMENSION` (nếu dùng model nhỏ hơn)
- Hoặc sử dụng model nhỏ hơn (384 dimension thay vì 768)

### Performance chậm

1. **Pre-generate embeddings**: Chạy script một lần
2. **Use smaller model**: Model 384 dimension thay vì 768
3. **Increase threshold**: Giảm số documents cần tính similarity
4. **Use hybrid search**: Kết hợp với keyword search

---

## 📚 References

- [Sentence Transformers](https://www.sbert.net/)
- [Hugging Face Models](https://huggingface.co/models?library=sentence-transformers)
- [Vietnamese SBERT](https://huggingface.co/keepitreal/vietnamese-sbert)
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)

---

## ✅ Checklist

- [ ] Cài đặt `sentence-transformers` và `numpy`
- [ ] Set `USE_EMBEDDING_SEARCH=true` trong `.env`
- [ ] Chạy `generate_document_embeddings.py` để tạo embeddings
- [ ] Test với queries khác nhau
- [ ] Tune parameters `VECTOR_SEARCH_THRESHOLD` và `VECTOR_SEARCH_TOP_K`
- [ ] Monitor performance và memory usage
- [ ] Deploy với embeddings đã generate

