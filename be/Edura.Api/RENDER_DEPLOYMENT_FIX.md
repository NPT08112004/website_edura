# 🔧 Fix Lỗi Deployment trên Render: "Port scan timeout"

## ❌ Lỗi

```
Port scan timeout reached, no open ports detected. 
Bind your service to at least one port.
```

## 🔍 Nguyên nhân

1. **App crash trước khi bind vào port** - Có thể do:
   - Import lỗi (dependencies chưa cài đặt)
   - Lỗi khi khởi tạo app
   - Missing environment variables

2. **App không bind vào port đúng cách**

## ✅ Giải pháp đã áp dụng

### 1. Cải thiện Error Handling trong `run.py`

- ✅ Thêm logging chi tiết cho startup process
- ✅ Catch và log tất cả exceptions
- ✅ Exit code rõ ràng khi có lỗi

### 2. Cải thiện Import Safety

- ✅ `vector_search_service.py`: Safe import cho numpy và embedding_service
- ✅ Không crash nếu dependencies chưa có
- ✅ Fallback gracefully khi embedding search không available

### 3. Kiểm tra Dependencies

Đảm bảo `requirements.txt` có tất cả dependencies:

```txt
sentence-transformers>=2.2.0  # Optional - chỉ cần nếu USE_EMBEDDING_SEARCH=true
numpy>=1.24.0  # Optional - chỉ cần nếu USE_EMBEDDING_SEARCH=true
```

**Lưu ý:** Nếu không dùng embedding search, có thể bỏ qua 2 packages này.

## 🚀 Cách Fix

### Bước 1: Kiểm tra Logs trên Render

Vào **Logs** tab và tìm:
- `[STARTUP]` messages - xem app có start được không
- `[ERROR]` messages - xem lỗi cụ thể là gì

### Bước 2: Kiểm tra Environment Variables

Trên Render Dashboard → **Environment** tab, đảm bảo có:
- `JWT_KEY`
- `FLASK_SECRET_KEY`
- `MONGO_CONNECTION_STRING`
- `DATABASE_NAME`

### Bước 3: Kiểm tra Dependencies

Nếu dùng embedding search, đảm bảo:
- `USE_EMBEDDING_SEARCH=true` (nếu muốn dùng)
- Hoặc không set (nếu không dùng) - app sẽ fallback về keyword search

### Bước 4: Deploy lại

Sau khi fix, commit và push:

```bash
git add .
git commit -m "Fix: Improve error handling and safe imports for Render deployment"
git push
```

Render sẽ tự động deploy lại.

## 🧪 Test Local

Trước khi deploy, test local:

```bash
# Set PORT (như Render)
$env:PORT="5000"  # PowerShell
# hoặc
export PORT=5000  # Linux/Mac

# Chạy app
python run.py
```

Kiểm tra:
- App start thành công
- Logs hiển thị `[STARTUP]` messages
- Không có `[ERROR]` messages

## 📋 Checklist

- [ ] `run.py` có error handling tốt
- [ ] `vector_search_service.py` có safe imports
- [ ] `requirements.txt` có tất cả dependencies
- [ ] Environment variables đã set trên Render
- [ ] Test local thành công
- [ ] Deploy lại trên Render
- [ ] Kiểm tra logs sau khi deploy

## 🔍 Debug Tips

### Nếu vẫn lỗi:

1. **Xem logs chi tiết:**
   - Tìm `[ERROR]` hoặc `Traceback`
   - Copy full error message

2. **Kiểm tra imports:**
   ```python
   # Test trong Python shell
   python -c "from app import create_app; create_app()"
   ```

3. **Kiểm tra dependencies:**
   ```bash
   pip list | grep -E "sentence-transformers|numpy"
   ```

4. **Test từng module:**
   ```python
   python -c "from app.services.embedding_service import *"
   python -c "from app.services.vector_search_service import *"
   ```

## 📚 References

- [Render Port Binding Docs](https://render.com/docs/web-services#port-binding)
- [Render Troubleshooting](https://render.com/docs/troubleshooting-deploys)


