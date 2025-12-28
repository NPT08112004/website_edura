# 🔄 Hướng dẫn Migrate Documents Cũ sang Embedding Vector

## ✅ Documents Cũ Có Sử Dụng Embedding Vector Được Không?

**Có!** Hệ thống đã được thiết kế để hỗ trợ documents cũ:

### 1. **Tự động Generate Embedding Khi Search** ⚡

Khi search, nếu document chưa có embedding:
- ✅ Tự động generate embedding on-the-fly
- ✅ Tự động lưu vào MongoDB để dùng lại lần sau
- ✅ Không cần chạy script trước

**Ví dụ:**
```python
# Document cũ chưa có embedding
# Khi user search → Tự động generate và lưu
# Lần search sau → Dùng embedding đã lưu (nhanh hơn)
```

### 2. **Script Generate Hàng Loạt** 📦

Nếu muốn generate embeddings cho tất cả documents cũ trước:

```bash
python scripts/generate_document_embeddings.py
```

Script này sẽ:
- ✅ Tìm tất cả documents chưa có embedding
- ✅ Generate embeddings cho từng document
- ✅ Lưu vào MongoDB
- ✅ Bỏ qua documents đã có embedding (có thể chạy lại an toàn)

---

## 🚀 Cách Sử Dụng

### Option 1: Tự Động (Khuyến nghị)

**Không cần làm gì!** Hệ thống sẽ tự động:
1. Khi user search → Generate embedding cho documents chưa có
2. Lưu vào DB → Lần sau dùng lại

**Ưu điểm:**
- ✅ Không cần chạy script trước
- ✅ Generate theo nhu cầu (lazy loading)
- ✅ Tự động cache

**Nhược điểm:**
- ⚠️ Lần đầu search có thể chậm hơn (phải generate)
- ⚠️ Documents ít được search sẽ không có embedding

### Option 2: Generate Trước (Cho Production)

**Chạy script một lần để generate tất cả:**

```bash
# 1. Cài đặt dependencies
pip install sentence-transformers numpy

# 2. Thêm vào file .env (khuyến nghị)
# Mở file .env và thêm dòng:
USE_EMBEDDING_SEARCH=true

# Hoặc set environment variable tạm thời:
# Windows PowerShell:
$env:USE_EMBEDDING_SEARCH="true"

# Windows CMD:
set USE_EMBEDDING_SEARCH=true

# Linux/Mac:
export USE_EMBEDDING_SEARCH=true

# 3. Chạy script
python scripts/generate_document_embeddings.py
```

**Output:**
```
Đang load documents từ MongoDB...
Tìm thấy 150 documents cần generate embedding
Đang load categories...
Đã load 10 categories

Đang generate embeddings...
Progress: 10/150 (6%) - Success: 10, Failed: 0
Progress: 20/150 (13%) - Success: 20, Failed: 0
...
✅ Hoàn thành!
  - Processed: 150
  - Success: 150
  - Failed: 0
```

**Ưu điểm:**
- ✅ Tất cả documents đã có embedding sẵn
- ✅ Search nhanh ngay từ đầu
- ✅ Không phải generate on-the-fly

**Nhược điểm:**
- ⚠️ Mất thời gian generate ban đầu
- ⚠️ Tốn storage (mỗi embedding ~3KB)

---

## 📊 So Sánh

| Aspect | Tự Động (On-the-fly) | Generate Trước |
|--------|---------------------|----------------|
| **Setup** | ✅ Không cần | ⚠️ Cần chạy script |
| **Lần đầu search** | ⚠️ Chậm (generate) | ✅ Nhanh |
| **Lần sau search** | ✅ Nhanh (đã cache) | ✅ Nhanh |
| **Storage** | ✅ Chỉ lưu khi search | ⚠️ Lưu tất cả |
| **Documents ít search** | ✅ Không tốn storage | ⚠️ Tốn storage |

---

## 🔍 Kiểm Tra Documents Có Embedding

### MongoDB Query:

```javascript
// Đếm documents có embedding
db.documents.countDocuments({ "embedding": { "$exists": true } })

// Đếm documents chưa có embedding
db.documents.countDocuments({ "embedding": { "$exists": false } })

// Xem một document có embedding
db.documents.findOne(
  { "_id": ObjectId("...") },
  { "embedding": 1, "title": 1 }
)
```

### Python Script:

```python
from app.services.mongo_service import mongo_collections

# Đếm documents có embedding
with_embedding = mongo_collections.documents.count_documents(
    {"embedding": {"$exists": True}}
)

# Đếm documents chưa có embedding
without_embedding = mongo_collections.documents.count_documents(
    {"embedding": {"$exists": False}}
)

print(f"Documents có embedding: {with_embedding}")
print(f"Documents chưa có embedding: {without_embedding}")
```

---

## 🛠️ Troubleshooting

### 1. Documents cũ không được generate embedding

**Nguyên nhân:**
- `USE_EMBEDDING_SEARCH=false`
- `sentence-transformers` chưa được cài đặt
- Model không load được

**Giải pháp:**
```bash
# Kiểm tra environment variable
echo $USE_EMBEDDING_SEARCH  # Phải là "true"

# Kiểm tra cài đặt
pip list | grep sentence-transformers

# Test model
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('keepitreal/vietnamese-sbert')"
```

### 2. Generate embedding chậm

**Nguyên nhân:**
- Dataset lớn
- Model lớn
- Không có GPU

**Giải pháp:**
- Sử dụng model nhỏ hơn: `EMBEDDING_MODEL_NAME=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- Generate theo batch nhỏ hơn
- Chạy vào giờ ít traffic

### 3. Embedding không được lưu vào DB

**Nguyên nhân:**
- Lỗi kết nối MongoDB
- Document ID không hợp lệ
- Permission issues

**Giải pháp:**
- Kiểm tra logs
- Kiểm tra MongoDB connection
- Kiểm tra document ID format

---

## 📝 Best Practices

### 1. **Cho Development:**
- Sử dụng **tự động (on-the-fly)**
- Generate khi cần

### 2. **Cho Production:**
- **Generate trước** tất cả embeddings
- Chạy script vào giờ ít traffic
- Monitor storage usage

### 3. **Cho Documents Mới:**
- Tự động generate khi upload
- Hoặc generate trong background job

### 4. **Maintenance:**
- Định kỳ kiểm tra documents chưa có embedding
- Re-generate nếu model được update
- Monitor embedding quality

---

## 🔄 Update Embeddings

Nếu muốn re-generate embeddings (ví dụ: đổi model):

```python
# Script để re-generate tất cả
python scripts/generate_document_embeddings.py
# Nhưng set skip_existing=False trong code
```

Hoặc MongoDB:
```javascript
// Xóa tất cả embeddings
db.documents.updateMany(
  {},
  { "$unset": { "embedding": "" } }
)

// Sau đó chạy lại script generate
```

---

## ✅ Checklist

- [ ] Cài đặt `sentence-transformers` và `numpy`
- [ ] Set `USE_EMBEDDING_SEARCH=true` trong `.env`
- [ ] Test với một vài documents
- [ ] Quyết định: Tự động hay Generate trước?
- [ ] Nếu Generate trước: Chạy script
- [ ] Kiểm tra embeddings đã được lưu
- [ ] Test search với documents cũ
- [ ] Monitor performance

---

## 📚 Tóm Tắt

**Câu trả lời:** ✅ **Có, documents cũ hoàn toàn có thể sử dụng embedding vector!**

**Cách hoạt động:**
1. **Tự động:** Generate embedding khi search (lazy loading)
2. **Generate trước:** Chạy script một lần cho tất cả documents

**Khuyến nghị:**
- **Development:** Tự động
- **Production:** Generate trước

**Lưu ý:**
- Embeddings được lưu vào MongoDB field `embedding`
- Mỗi embedding ~3KB (768 dimensions)
- Có thể re-generate nếu cần

