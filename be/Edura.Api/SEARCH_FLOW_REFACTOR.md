# 🔄 Refactor Search Flow - Tài liệu

## 📋 Tổng quan

Đã tạo `SearchService` để tổ chức lại luồng tìm kiếm cho rõ ràng và dễ maintain.

## 🏗️ Cấu trúc mới

### `app/services/search_service.py`

Service class với các methods:

1. **`parse_search_params()`** - Parse và validate parameters
2. **`build_mongo_query()`** - Build MongoDB query từ parameters
3. **`load_documents()`** - Load documents từ MongoDB
4. **`load_categories()`** - Load category names
5. **`calculate_relevance()`** - Tính relevance score (BM25 hoặc cũ)
6. **`filter_and_score_documents()`** - Filter và score documents
7. **`sort_documents()`** - Sort theo relevance
8. **`paginate_documents()`** - Paginate results
9. **`search_documents()`** - Main function tổng hợp tất cả

## 🔄 Luồng mới

```
Request → Parse Params → Check Cache → Build Query → Load Documents 
→ Load Categories → Filter & Score → Sort → Paginate → Cache → Response
```

## 📝 Cách sử dụng

### Trong Controller:

```python
from app.services.search_service import SearchService

# Parse parameters
params = SearchService.parse_search_params(request.args)

# Search documents
result = SearchService.search_documents(params, use_cache=True)

# Response
return jsonify(result)
```

## ✅ Lợi ích

1. **Code rõ ràng hơn**: Logic tách biệt thành các methods
2. **Dễ test**: Có thể test từng method riêng
3. **Dễ maintain**: Thay đổi logic ở một chỗ
4. **Reusable**: Có thể dùng ở nhiều controllers
5. **Performance**: Giữ nguyên caching và optimization

## 🚧 Status

- ✅ Đã tạo SearchService
- ⚠️ Đang refactor controller để sử dụng SearchService
- ⏳ Cần test và fix lỗi

## 📚 Next Steps

1. Hoàn thiện refactor controller
2. Test với các queries khác nhau
3. Update các controllers khác (search.py, mobile_documents.py)
4. Add unit tests cho SearchService

