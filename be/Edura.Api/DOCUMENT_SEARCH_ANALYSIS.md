# 📊 Phân tích chức năng Tìm kiếm Tài liệu

## Tổng quan

Hệ thống Edura có **2 API endpoints** chính cho tìm kiếm tài liệu:
1. **`GET /api/documents`** - Endpoint chính với nhiều filters
2. **`GET /api/search/documents`** - Endpoint đơn giản hơn, tập trung vào search text

---

## 🔍 1. API Endpoint: `/api/documents` (Chính)

### 1.1. Thông tin cơ bản

**File:** `be/Edura.Api/app/controllers/documents.py`  
**Route:** `GET /api/documents`  
**Mô tả:** Lấy danh sách documents với search + filters + pagination

### 1.2. Query Parameters

| Parameter | Type | Mô tả | Ví dụ |
|-----------|------|-------|-------|
| `search` | string | Từ khóa tìm kiếm (title, keywords, summary) | `"giải tích"` |
| `schoolId` | string | Lọc theo trường học (ObjectId) | `"507f1f77bcf86cd799439011"` |
| `categoryId` | string | Lọc theo thể loại (ObjectId) | `"507f1f77bcf86cd799439012"` |
| `fileType` | string | Loại file: `pdf`, `doc`, `docx`, `word` | `"pdf"` |
| `length` | string | Độ dài: `short` (<10 trang), `medium` (10-50), `long` (>50) | `"short"` |
| `uploadDate` | string | Lọc theo ngày upload (xem chi tiết bên dưới) | `"today"` |
| `page` | int | Số trang (mặc định: 1) | `1` |
| `limit` | int | Số items/trang (mặc định: 12, max: 100) | `12` |

### 1.3. Upload Date Filter

Hỗ trợ nhiều format:

| Format | Ví dụ | Mô tả |
|--------|-------|-------|
| `today` | `"today"` | Hôm nay |
| `yesterday` | `"yesterday"` | Hôm qua |
| `last7days` | `"last7days"` | 7 ngày gần nhất |
| `last30days` | `"last30days"` | 30 ngày gần nhất |
| `month:YYYY:MM` | `"month:2024:11"` | Tháng cụ thể |
| `year:YYYY` | `"year:2024"` | Năm cụ thể |
| `day:YYYY:MM:DD` | `"day:2024:11:30"` | Ngày cụ thể |
| `week:YYYY:WW` | `"week:2024:48"` | Tuần cụ thể (ISO week) |

### 1.4. Cơ chế tìm kiếm

#### A. Search Text (Không dấu, không khoảng trắng)

**Tính năng đặc biệt:** Hệ thống hỗ trợ tìm kiếm **không phân biệt dấu tiếng Việt** và **không phân biệt khoảng trắng**.

**Ví dụ:**
- Query: `"ky thuat"` → Tìm được: `"Kỹ Thuật"`, `"kỹ thuật"`, `"kythuat"`
- Query: `"kỹ thuật"` → Tìm được: `"ky thuat"`, `"kythuat"`, `"Kỹ Thuật"`
- Query: `"dai hoc"` → Tìm được: `"Đại Học"`, `"daihoc"`, `"Đại học"`

**Cách hoạt động:**
1. **Bước 1:** Lọc sơ bộ bằng MongoDB regex (case-insensitive) trên `title`, `summary`, `keywords`
2. **Bước 2:** Load tất cả documents match vào memory
3. **Bước 3:** Lọc lại bằng Python với hàm `normalize_search()`:
   - Bỏ dấu tiếng Việt: `"Kỹ Thuật"` → `"ky thuat"`
   - Bỏ khoảng trắng: `"ky thuat"` → `"kythuat"`
   - So sánh normalized query với normalized content
4. **Bước 4:** Áp dụng pagination sau khi lọc

**Code tham khảo:**
```python
# app/utils/search_utils.py
def normalize_search(s: str) -> str:
    """Bỏ dấu + bỏ khoảng trắng + lower-case"""
    normalized = strip_vn(s)  # Bỏ dấu
    normalized = re.sub(r'[^\w]', '', normalized)  # Bỏ khoảng trắng
    return normalized
```

#### B. Filters

**MongoDB Query:**
- `schoolId` / `categoryId`: Hỗ trợ cả ObjectId và string (tương thích dữ liệu cũ)
- `fileType`: Regex match trên `s3_url` (`.pdf`, `.docx`, `.doc`)
- `length`: Filter theo `pages` field
- `uploadDate`: Filter theo `createdAt` hoặc `created_at`

### 1.5. Response Format

```json
{
  "documents": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Giải tích 1 - Đề cương",
      "summary": "Tài liệu ôn thi giải tích...",
      "keywords": ["giải tích", "toán", "đề cương"],
      "image_url": "https://...",
      "s3_url": "https://...",
      "pages": 25,
      "school": {
        "_id": "...",
        "name": "Đại học Bách Khoa"
      },
      "category": {
        "_id": "...",
        "name": "Toán học"
      },
      "uploader": {
        "_id": "...",
        "username": "student123",
        "name": "Nguyễn Văn A"
      },
      "reactions": {
        "likes": 10,
        "dislikes": 2
      },
      "commentCount": 5,
      "createdAt": "2024-11-30T10:00:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 12,
  "totalPages": 13
}
```

### 1.6. Tối ưu hóa

1. **Batch Loading:** Load tất cả schools/categories/users trong 1 query mỗi loại thay vì N queries
2. **Aggregation Pipeline:** Dùng MongoDB aggregation để đếm likes/dislikes/comments
3. **Lazy Update:** Cập nhật `pages` field sau khi response (không block)

---

## 🔍 2. API Endpoint: `/api/search/documents` (Đơn giản)

### 2.1. Thông tin cơ bản

**File:** `be/Edura.Api/app/controllers/search.py`  
**Route:** `GET /api/search/documents`  
**Mô tả:** Tìm kiếm đơn giản với ít filters hơn

### 2.2. Query Parameters

| Parameter | Type | Mô tả | Ví dụ |
|-----------|------|-------|-------|
| `q` | string | Từ khóa tìm kiếm | `"giải tích"` |
| `schoolId` | string | Lọc theo trường học | `"507f1f77bcf86cd799439011"` |
| `categoryId` | string | Lọc theo thể loại | `"507f1f77bcf86cd799439012"` |
| `page` | int | Số trang (mặc định: 1) | `1` |
| `limit` | int | Số items/trang (mặc định: 24, max: 60) | `24` |

### 2.3. Cơ chế tìm kiếm

Tương tự `/api/documents`:
- Lọc sơ bộ bằng MongoDB (schoolId, categoryId)
- Load tất cả vào memory
- Lọc lại bằng Python với `normalize_search()` và `search_in_multiple_fields()`
- Sort theo `createdAt` (descending)
- Pagination

### 2.4. Response Format

```json
{
  "items": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Giải tích 1",
      "image_url": "https://...",
      "s3_url": "https://...",
      "summary": "...",
      "createdAt": "2024-11-30T10:00:00Z",
      "schoolId": "...",
      "categoryId": "...",
      "userId": "...",
      "schoolName": "Đại học Bách Khoa",
      "categoryName": "Toán học",
      "uploaderName": "Nguyễn Văn A"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 24
}
```

---

## 🎨 3. Frontend Implementation

### 3.1. Components sử dụng Search

#### A. `SearchPage.jsx`

**Route:** `/search`  
**API:** `searchDocuments()` → `/api/search/documents`

**Tính năng:**
- Search bar với input text
- Dropdown filter: Trường học, Thể loại
- Hiển thị kết quả dạng grid
- Click vào card để xem chi tiết

**Code:**
```javascript
// fe/src/pages/SearchPage.jsx
const [q, setQ] = useState("");
const [schoolId, setSchoolId] = useState("");
const [categoryId, setCategoryId] = useState("");

const doSearch = async (e) => {
  const res = await searchDocuments({ q, schoolId, categoryId });
  setItems(res.items || []);
};
```

#### B. `HomePage.jsx`

**Route:** `/home`  
**API:** `getDocuments()` → `/api/documents`

**Tính năng:**
- Search bar với debounce (300ms)
- Sidebar với nhiều filters:
  - File type (PDF, Word)
  - Length (Short, Medium, Long)
  - Upload date (DateRangePicker)
  - School, Category
- Pagination
- View mode: List / Grid

**Code:**
```javascript
// fe/src/components/HomePage.jsx
const [searchQuery, setSearchQuery] = useState('');
const [filters, setFilters] = useState({
  type: '',
  length: '',
  fileType: '',
  uploadDate: '',
  language: '',
  schoolId: '',
  categoryId: ''
});

useEffect(() => {
  const timer = setTimeout(() => {
    loadDocuments();
  }, 300); // Debounce 300ms
  return () => clearTimeout(timer);
}, [searchQuery, filters]);
```

#### C. `Trangchu.jsx` (Homepage)

**Route:** `/`  
**Tính năng:**
- Search bar trên hero section
- Click keyword gợi ý → navigate đến `/home?search=...`
- Click category → navigate đến `/home?categoryId=...`

**Code:**
```javascript
// fe/src/pages/Trangchu.jsx
const handleSearch = (e) => {
  e.preventDefault();
  if (searchQuery.trim()) {
    navigate(`/home?search=${encodeURIComponent(searchQuery.trim())}`);
  }
};
```

### 3.2. API Functions

**File:** `fe/src/api.js`

```javascript
// Endpoint chính với nhiều filters
export async function getDocuments(search = "", filters = {}, page = 1, limit = 12) {
  const params = {
    search,
    type: filters.type,
    length: filters.length,
    fileType: filters.fileType,
    uploadDate: filters.uploadDate,
    language: filters.language,
    schoolId: filters.schoolId,
    categoryId: filters.categoryId,
    page,
    limit,
  };
  return http("GET", `/api/documents?${qs(params)}`);
}

// Endpoint đơn giản
export async function searchDocuments({ q, schoolId, categoryId, page = 1, limit = 24 } = {}) {
  const params = { q, schoolId, categoryId, page, limit };
  return http("GET", `/api/search/documents?${qs(params)}`);
}
```

---

## 🔧 4. Utilities

### 4.1. `search_utils.py`

**File:** `be/Edura.Api/app/utils/search_utils.py`

**Functions:**

1. **`strip_vn(s: str) -> str`**
   - Bỏ dấu tiếng Việt + lower-case
   - Ví dụ: `"Kỹ Thuật"` → `"ky thuat"`

2. **`normalize_search(s: str) -> str`**
   - Bỏ dấu + bỏ khoảng trắng + lower-case
   - Ví dụ: `"Kỹ Thuật"` → `"kythuat"`

3. **`search_in_text(query: str, text: str) -> bool`**
   - Kiểm tra query có trong text không (đã normalize)

4. **`search_in_multiple_fields(query: str, *fields: str) -> bool`**
   - Tìm kiếm query trong nhiều fields (title, keywords, summary)
   - Hỗ trợ field là list (như keywords)

---

## 📈 5. Performance & Scalability

### 5.1. Điểm mạnh

✅ **Tìm kiếm linh hoạt:** Không phân biệt dấu, không phân biệt khoảng trắng  
✅ **Batch loading:** Giảm số queries đến MongoDB  
✅ **Aggregation:** Đếm reactions/comments hiệu quả  
✅ **Debounce:** Giảm số API calls từ frontend  

### 5.2. Điểm yếu & Cải thiện

#### ✅ Đã cải thiện:

1. **✅ Sử dụng searchText index để filter sơ bộ:**
   - Normalize query và filter bằng MongoDB regex trên field `searchText`
   - Giảm số documents cần load vào memory từ 1000 xuống 500
   - Giảm batch size từ 100 xuống 50 để tiết kiệm memory

2. **✅ Caching mechanism:**
   - Thêm in-memory cache với TTL 5 phút
   - Cache key dựa trên tất cả query parameters
   - Tự động cleanup entries đã hết hạn
   - File: `app/utils/search_cache.py`

3. **✅ Cải thiện ranking:**
   - Relevance score từ title/keywords/summary
   - Bonus điểm từ views (0.1 điểm/view)
   - Bonus điểm từ downloads (0.2 điểm/download)
   - Bonus điểm từ grade score (0.5 điểm/grade)
   - Sort theo: relevance score (bao gồm popularity) → createdAt

4. **✅ Script update searchText:**
   - Script `scripts/update_search_text.py` để update searchText cho documents cũ
   - Chạy một lần để đảm bảo tất cả documents có searchText

#### 🔄 Có thể cải thiện thêm:

1. **Redis Cache:** Thay thế in-memory cache bằng Redis cho production
2. **Elasticsearch/Solr:** Cho full-text search nâng cao với fuzzy matching
3. **Search suggestions:** Gợi ý từ khóa phổ biến
4. **Search analytics:** Theo dõi queries phổ biến để tối ưu

---

## 🎯 6. Use Cases

### 6.1. Tìm kiếm đơn giản

**User:** Gõ "giải tích"  
**Flow:**
1. Frontend: `getDocuments(search="giải tích")`
2. Backend: Lọc documents có "giải tích" trong title/keywords/summary
3. Response: Danh sách documents match

### 6.2. Tìm kiếm với filters

**User:** Gõ "đề cương", chọn trường "Bách Khoa", thể loại "Toán học"  
**Flow:**
1. Frontend: `getDocuments(search="đề cương", schoolId="...", categoryId="...")`
2. Backend:
   - Lọc theo schoolId và categoryId (MongoDB)
   - Lọc theo search text (Python)
3. Response: Documents match tất cả điều kiện

### 6.3. Tìm kiếm từ homepage

**User:** Click keyword "Giải tích 1" trên homepage  
**Flow:**
1. Frontend: Navigate đến `/home?search=Giải tích 1`
2. HomePage: Parse URL params, set searchQuery
3. HomePage: Gọi `getDocuments(search="Giải tích 1")`
4. Response: Hiển thị kết quả

---

## 📝 7. Tóm tắt

### 7.1. Backend

- **2 endpoints:** `/api/documents` (đầy đủ) và `/api/search/documents` (đơn giản)
- **Search text:** Không dấu, không khoảng trắng, case-insensitive
- **Filters:** School, Category, File type, Length, Upload date
- **Pagination:** Hỗ trợ page và limit
- **Optimization:** Batch loading, aggregation pipeline

### 7.2. Frontend

- **3 components:** SearchPage, HomePage, Trangchu
- **Debounce:** 300ms để giảm API calls
- **URL params:** Sync search/filters với URL
- **View modes:** List và Grid

### 7.3. Utilities

- **search_utils.py:** Normalize search text, multi-field search
- **Tương thích:** Hỗ trợ cả ObjectId và string (dữ liệu cũ)

---

## 🔗 8. Files liên quan

### Backend
- `be/Edura.Api/app/controllers/documents.py` - Endpoint chính
- `be/Edura.Api/app/controllers/search.py` - Endpoint đơn giản
- `be/Edura.Api/app/utils/search_utils.py` - Utilities

### Frontend
- `fe/src/pages/SearchPage.jsx` - Trang search đơn giản
- `fe/src/components/HomePage.jsx` - Trang home với filters
- `fe/src/pages/Trangchu.jsx` - Homepage với search bar
- `fe/src/api.js` - API functions

---

## ✅ Kết luận

Chức năng tìm kiếm tài liệu của Edura được thiết kế tốt với:
- ✅ Tìm kiếm linh hoạt (không dấu, không khoảng trắng)
- ✅ Nhiều filters (school, category, file type, length, date)
- ✅ Pagination và optimization
- ✅ UI/UX tốt với debounce và URL sync

**Đã cải thiện:**
- ✅ Sử dụng searchText index để filter sơ bộ
- ✅ Caching mechanism (in-memory, có thể nâng cấp Redis)
- ✅ Ranking với relevance + popularity (views, downloads, grade)
- ✅ Tối ưu memory usage (giảm MAX_SEARCH_DOCS, batch size)

**Có thể cải thiện thêm:**
- 🔄 Redis cache cho production scale
- 🔄 Elasticsearch cho advanced search
- 🔄 Search suggestions và analytics

