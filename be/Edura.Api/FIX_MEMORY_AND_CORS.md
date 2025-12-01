# 🔧 Hướng dẫn sửa lỗi Memory và CORS trên Production

## 📋 Vấn đề

1. **Out of Memory (OOM)**: Backend bị crash do hết memory (512MB limit trên Render free tier)
2. **CORS Error**: Frontend không thể kết nối đến backend do CORS policy
3. **502 Bad Gateway**: Backend crash dẫn đến không thể xử lý request

## ✅ Đã tối ưu

### 1. Tối ưu Search (Giảm Memory Usage)

**Trước đây:**
- Load TOÀN BỘ documents vào memory → OOM khi có nhiều documents

**Bây giờ:**
- Chỉ load và filter từng batch nhỏ (100 documents/batch)
- Giới hạn tối đa 1000 documents khi search
- Giải phóng memory sau mỗi batch bằng `gc.collect()`
- Không có search: Dùng pagination trực tiếp từ MongoDB (không load toàn bộ)

### 2. Tối ưu Upload (Giảm Memory Usage)

**Trước đây:**
- Load toàn bộ file vào memory và giữ lại suốt quá trình xử lý

**Bây giờ:**
- Đóng file handle ngay sau khi đọc
- Giải phóng `raw_bytes` và `pdf_bytes` sau khi upload xong
- Gọi `gc.collect()` để giải phóng memory

### 3. Cải thiện CORS Configuration

- Thêm log để debug CORS config
- Đảm bảo CORS được cấu hình đúng cho production

## 🚀 Cấu hình trên Render

### 1. Cấu hình CORS Environment Variable

Trên Render Dashboard, thêm/sửa environment variable:

```
CORS_ORIGINS=https://website-edura.vercel.app,https://website-edura.onrender.com
```

**Lưu ý:**
- Nếu để `*` thì cho phép tất cả origins (chỉ dùng cho development)
- Production nên chỉ định rõ các origins được phép
- Nếu có nhiều origins, phân cách bằng dấu phẩy

### 2. Kiểm tra Memory Usage

Render free tier có giới hạn 512MB memory. Để kiểm tra:

1. Vào Render Dashboard → Service → Metrics
2. Xem memory usage trong thời gian thực
3. Nếu vượt quá 512MB, service sẽ bị restart

### 3. Nâng cấp Plan (Nếu cần)

Nếu vẫn gặp vấn đề memory sau khi tối ưu:

1. **Starter Plan** ($7/tháng): 512MB memory
2. **Standard Plan** ($25/tháng): 2GB memory
3. **Pro Plan** ($85/tháng): 4GB memory

## 🔍 Debug

### Kiểm tra CORS trong Logs

Sau khi deploy, kiểm tra logs để xem CORS config:

```
[CORS] Configured origins: https://website-edura.vercel.app,https://website-edura.onrender.com
```

### Kiểm tra Memory trong Logs

Nếu vẫn gặp OOM, kiểm tra logs để xem:
- Request nào gây ra OOM
- Số lượng documents được load
- Kích thước file upload

### Test CORS

1. Mở browser console
2. Gửi request từ frontend
3. Kiểm tra response headers:
   - `Access-Control-Allow-Origin` phải có giá trị đúng
   - `Access-Control-Allow-Methods` phải có `POST`

## 📝 Checklist

- [ ] Đã cấu hình `CORS_ORIGINS` trên Render
- [ ] Đã deploy code mới với tối ưu memory
- [ ] Đã test upload document
- [ ] Đã test search documents
- [ ] Đã kiểm tra memory usage trên Render Dashboard
- [ ] Đã kiểm tra CORS headers trong browser console

## 🎯 Kết quả mong đợi

1. **Memory Usage**: Giảm từ ~500MB+ xuống <300MB trong điều kiện bình thường
2. **CORS**: Frontend có thể kết nối đến backend thành công
3. **Stability**: Backend không còn bị crash do OOM

## ⚠️ Lưu ý

- Tối ưu này giới hạn search tối đa 1000 documents. Nếu cần search nhiều hơn, cần nâng cấp plan hoặc implement pagination cho search.
- Upload file lớn (>50MB) vẫn có thể gây OOM. Nên giới hạn kích thước file ở frontend.
- Nếu vẫn gặp vấn đề, xem xét:
  - Sử dụng MongoDB aggregation pipeline thay vì Python filtering
  - Implement caching cho search results
  - Sử dụng background jobs cho các tác vụ nặng (AI processing, thumbnail generation)

