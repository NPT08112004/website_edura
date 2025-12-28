# ⚙️ Cấu hình BM25 Search cho Local và Production

## 📋 Environment Variables

Thêm các biến sau vào file `.env`:

### Cơ bản

```env
# Enable/disable BM25 search (default: false)
USE_BM25_SEARCH=true

# BM25 parameters (optional, có default values)
BM25_K1=1.2          # Term frequency saturation (0.5-2.0)
BM25_B=0.75          # Field length normalization (0.0-1.0)

# Cache TTL cho statistics (seconds, default: 3600 = 1 giờ)
BM25_STATS_CACHE_TTL=3600
```

### Production

```env
# Production settings
USE_BM25_SEARCH=true
BM25_K1=1.2
BM25_B=0.75
BM25_STATS_CACHE_TTL=7200  # 2 giờ cho production
```

### Local Development

```env
# Local settings
USE_BM25_SEARCH=true
BM25_K1=1.2
BM25_B=0.75
BM25_STATS_CACHE_TTL=1800  # 30 phút cho development
```

---

## 🚀 Setup cho Local

### Bước 1: Cấu hình `.env`

```env
USE_BM25_SEARCH=true
BM25_K1=1.2
BM25_B=0.75
```

### Bước 2: Pre-compute statistics (Optional)

Nếu muốn sử dụng full BM25 với pre-computed statistics:

```bash
python scripts/precompute_bm25_stats.py
```

**Lưu ý:** Script này sẽ:
- Load tất cả documents từ MongoDB
- Tính toán statistics (total_docs, avg_doc_length, document_freq)
- Lưu vào MongoDB collection `search_statistics`

### Bước 3: Test

```bash
# Test BM25
python scripts/test_bm25_search.py
```

### Bước 4: Chạy ứng dụng

```bash
# Flask sẽ tự động sử dụng BM25 nếu USE_BM25_SEARCH=true
python app.py
# hoặc
flask run
```

---

## 🏭 Setup cho Production

### Bước 1: Cấu hình Environment Variables

Trên hosting platform (Render, Heroku, AWS, etc.), thêm:

```env
USE_BM25_SEARCH=true
BM25_K1=1.2
BM25_B=0.75
BM25_STATS_CACHE_TTL=7200
```

### Bước 2: Pre-compute statistics

Chạy script một lần để tính statistics:

```bash
python scripts/precompute_bm25_stats.py
```

**Lưu ý:** Có thể chạy:
- Trong deployment script
- Trong scheduled job (cron)
- Manual khi deploy

### Bước 3: Deploy

Deploy code như bình thường. BM25 sẽ tự động:
- ✅ Load statistics từ MongoDB (với cache)
- ✅ Fallback về hệ thống cũ nếu có lỗi
- ✅ Log warnings nếu có vấn đề

---

## 🔄 Fallback Mechanism

Hệ thống có **automatic fallback**:

1. **Nếu `USE_BM25_SEARCH=false`**: Sử dụng hệ thống cũ
2. **Nếu BM25 import fail**: Sử dụng hệ thống cũ
3. **Nếu BM25 calculation fail**: Sử dụng hệ thống cũ
4. **Nếu statistics không có**: Sử dụng BM25 simple (không cần statistics)

**Không cần lo lắng về breaking changes!**

---

## 📊 Monitoring

### Logs

BM25 sẽ log các events:

```
[INFO] Loaded BM25 stats: 1000 docs, avg_length=15.23
[WARNING] BM25 stats not found in MongoDB. Run precompute_bm25_stats.py first.
[WARNING] Error calculating BM25 score: ...
[DEBUG] Using cached BM25 stats
```

### Health Check

Kiểm tra BM25 có hoạt động:

```python
# Trong Python console
from app.utils.bm25_search import USE_BM25_SEARCH, BM25_AVAILABLE
print(f"BM25 Enabled: {USE_BM25_SEARCH}")
print(f"BM25 Available: {BM25_AVAILABLE}")
```

---

## 🧪 Testing

### Test Local

```bash
# 1. Test BM25 functions
python scripts/test_bm25_search.py

# 2. Test với API
curl "http://localhost:5000/api/documents?search=toán"
```

### Test Production

```bash
# 1. Kiểm tra environment variables
echo $USE_BM25_SEARCH

# 2. Test API endpoint
curl "https://your-domain.com/api/documents?search=toán"
```

---

## ⚙️ Tuning Parameters

### `BM25_K1` (Term frequency saturation)

- **Default**: 1.2
- **Range**: 0.5 - 2.0
- **Ý nghĩa**: 
  - Thấp (0.5-1.0): Term frequency ít quan trọng
  - Cao (1.5-2.0): Term frequency quan trọng hơn

**Khi nào tăng:**
- Documents có nhiều từ lặp lại
- Muốn ưu tiên documents có từ khóa xuất hiện nhiều lần

**Khi nào giảm:**
- Documents ngắn, ít từ lặp lại
- Muốn ưu tiên documents có từ khóa xuất hiện ít lần

### `BM25_B` (Field length normalization)

- **Default**: 0.75
- **Range**: 0.0 - 1.0
- **Ý nghĩa**:
  - 0.0: Không normalize theo độ dài
  - 1.0: Normalize hoàn toàn theo độ dài

**Khi nào tăng:**
- Documents có độ dài rất khác nhau
- Muốn ưu tiên documents ngắn hơn

**Khi nào giảm:**
- Documents có độ dài tương đương
- Không muốn penalize documents dài

---

## 🔧 Troubleshooting

### BM25 không hoạt động

1. **Kiểm tra environment variable:**
   ```bash
   echo $USE_BM25_SEARCH
   # Phải là "true"
   ```

2. **Kiểm tra import:**
   ```python
   from app.utils.bm25_search import USE_BM25_SEARCH
   print(USE_BM25_SEARCH)
   ```

3. **Kiểm tra logs:**
   - Xem có warning/error về BM25 không
   - Hệ thống sẽ tự động fallback về cũ nếu có lỗi

### Statistics không có

1. **Chạy pre-compute script:**
   ```bash
   python scripts/precompute_bm25_stats.py
   ```

2. **Kiểm tra MongoDB:**
   ```python
   from app.services.mongo_service import mongo_collections
   stats = mongo_collections.search_statistics.find_one({"_id": "bm25_stats"})
   print(stats)
   ```

### Performance issues

1. **Tăng cache TTL:**
   ```env
   BM25_STATS_CACHE_TTL=7200  # 2 giờ
   ```

2. **Disable BM25 tạm thời:**
   ```env
   USE_BM25_SEARCH=false
   ```

---

## 📝 Checklist

### Local Setup
- [ ] Thêm `USE_BM25_SEARCH=true` vào `.env`
- [ ] (Optional) Chạy `precompute_bm25_stats.py`
- [ ] Test với `test_bm25_search.py`
- [ ] Test API endpoint
- [ ] Kiểm tra logs

### Production Setup
- [ ] Thêm environment variables trên hosting platform
- [ ] Chạy `precompute_bm25_stats.py` một lần
- [ ] Deploy code
- [ ] Monitor logs
- [ ] Test API endpoint
- [ ] Tune parameters nếu cần

---

## 🎯 Best Practices

1. **Start với default values**: `k1=1.2, b=0.75`
2. **Test trên local trước**: Đảm bảo hoạt động tốt
3. **Monitor logs**: Xem có errors/warnings không
4. **Tune từ từ**: Thay đổi parameters từng chút một
5. **Keep fallback**: Luôn có hệ thống cũ làm backup
6. **Update statistics định kỳ**: Chạy pre-compute khi có documents mới

---

## 📚 References

- [BM25 Algorithm](https://en.wikipedia.org/wiki/Okapi_BM25)
- [BM25 Implementation Guide](./BM25_IMPLEMENTATION_GUIDE.md)
- [Search Algorithm Optimization](./SEARCH_ALGORITHM_OPTIMIZATION.md)

