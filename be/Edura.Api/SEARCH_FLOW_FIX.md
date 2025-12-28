# 🔧 Sửa lỗi "Load đúng nhưng sau đó lại load sai"

## 🐛 Vấn đề

Người dùng báo: "kiểm tra load đúng nhưng sau đó lại load sai"

## 🔍 Nguyên nhân có thể

1. **Cache trả về kết quả cũ**: Cache có thể đang trả về kết quả từ lần search trước
2. **Logic build query không đúng**: Không hỗ trợ đầy đủ ObjectId/string như code cũ
3. **Logic load documents không nhất quán**: Có thể load khác nhau giữa các lần

## ✅ Đã sửa

### 1. Cải thiện `build_mongo_query()`
- ✅ Hỗ trợ cả ObjectId và string (như code cũ)
- ✅ Hỗ trợ cả `schoolId`/`school_id` và `categoryId`/`category_id`
- ✅ Sử dụng `_or_id()` helper function

### 2. Cải thiện logic load
- ✅ Chỉ load categories khi có search query (tối ưu)
- ✅ Đảm bảo sort đúng thứ tự
- ✅ Cache chỉ khi có search query hoặc filters (tránh cache quá lớn)

### 3. Cải thiện error handling
- ✅ Try-catch khi cache fail (không fail request)
- ✅ Logging warnings

## 🔄 Luồng mới (đã sửa)

```
Request
  ↓
Parse Parameters
  ↓
Check Cache (chỉ khi có search/filters)
  ↓
Build MongoDB Query (hỗ trợ ObjectId + string)
  ↓
Load Documents (với limit nếu có search)
  ↓
Load Categories (chỉ khi có search query)
  ↓
Filter & Score (chỉ khi có search query)
  ↓
Sort (relevance nếu có search, createdAt nếu không)
  ↓
Paginate
  ↓
Cache Result (chỉ khi có search/filters)
  ↓
Response
```

## 🧪 Test

1. **Test với search query:**
   - Search "toan" → Kiểm tra kết quả đúng
   - Search lại "toan" → Kiểm tra cache trả về đúng
   - Search "toán" → Kiểm tra kết quả giống "toan"

2. **Test với filters:**
   - Filter theo schoolId → Kiểm tra kết quả đúng
   - Filter theo categoryId → Kiểm tra kết quả đúng
   - Combine filters → Kiểm tra kết quả đúng

3. **Test cache:**
   - Search lần 1 → Không có cache
   - Search lần 2 (cùng query) → Có cache
   - Đợi 5 phút → Cache expire
   - Search lần 3 → Không có cache (load lại)

## 📝 Lưu ý

- Cache TTL: 5 phút (có thể điều chỉnh)
- Cache chỉ áp dụng khi có search query hoặc filters
- Không cache khi không có filters để tránh cache quá lớn

