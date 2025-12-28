# 🚀 Quick Start: Embedding Search

## ⚡ Setup Nhanh (5 phút)

### Bước 1: Cài đặt Dependencies

```bash
pip install sentence-transformers numpy
```

### Bước 2: Cấu hình `.env`

Mở file `.env` trong thư mục `be/Edura.Api/` và thêm:

```env
USE_EMBEDDING_SEARCH=true
```

**Lưu ý:** Nếu chưa có file `.env`, tạo file mới.

### Bước 3: Test

```bash
# Test với script
python scripts/generate_document_embeddings.py
```

Hoặc đơn giản chỉ cần **search trên website** - hệ thống sẽ tự động generate embeddings!

---

## 🪟 Windows PowerShell

Nếu gặp lỗi với lệnh `export`, sử dụng:

### Cách 1: Thêm vào file `.env` (Khuyến nghị)

```env
USE_EMBEDDING_SEARCH=true
```

### Cách 2: Set tạm thời trong PowerShell

```powershell
$env:USE_EMBEDDING_SEARCH="true"
python scripts/generate_document_embeddings.py
```

### Cách 3: Set trong CMD

```cmd
set USE_EMBEDDING_SEARCH=true
python scripts/generate_document_embeddings.py
```

---

## ✅ Kiểm Tra

Sau khi setup, kiểm tra:

```python
# Test trong Python
import os
from dotenv import load_dotenv

load_dotenv()
print(f"USE_EMBEDDING_SEARCH: {os.getenv('USE_EMBEDDING_SEARCH')}")
# Output phải là: USE_EMBEDDING_SEARCH: true
```

---

## 📚 Tài Liệu Chi Tiết

- `EMBEDDING_SEARCH_GUIDE.md` - Hướng dẫn chi tiết
- `EMBEDDING_MIGRATION_GUIDE.md` - Migrate documents cũ

