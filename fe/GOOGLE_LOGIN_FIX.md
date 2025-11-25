# Khắc phục lỗi "Missing required parameter: client_id"

## Nguyên nhân

Lỗi này xảy ra khi Google OAuth không nhận được `client_id`. Có thể do:
1. Chưa tạo file `.env` trong thư mục `fe`
2. Chưa thêm biến `VITE_GOOGLE_CLIENT_ID` vào file `.env`
3. Client ID không đúng format

## Cách khắc phục

### Bước 1: Tạo file `.env` trong thư mục `fe`

Tạo file `.env` trong thư mục `doam/fe/` với nội dung:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

### Bước 2: Lấy Google Client ID

1. Truy cập: https://console.cloud.google.com/
2. Chọn dự án của bạn (hoặc tạo mới)
3. Vào **APIs & Services** → **Credentials**
4. Tìm hoặc tạo **OAuth 2.0 Client ID**
5. Copy **Client ID** (có dạng: `xxxxx.apps.googleusercontent.com`)
6. Dán vào file `.env`:

```env
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

### Bước 3: Khởi động lại dev server

Sau khi thêm biến môi trường, **bắt buộc phải khởi động lại** dev server:

```bash
# Dừng server hiện tại (Ctrl+C)
# Sau đó chạy lại:
npm run dev
```

**Lưu ý quan trọng:** Vite chỉ đọc biến môi trường khi khởi động, nên phải restart server!

### Bước 4: Kiểm tra

1. Mở trình duyệt và vào trang đăng nhập
2. Kiểm tra console (F12) xem có lỗi không
3. Nút Google Sign-In sẽ hiển thị nếu cấu hình đúng

## Nếu vẫn còn lỗi

### Kiểm tra Client ID có đúng không

- Client ID phải có dạng: `xxxxx.apps.googleusercontent.com`
- Không có khoảng trắng ở đầu/cuối
- Đảm bảo đã copy đầy đủ

### Kiểm tra Google Cloud Console

1. Vào **APIs & Services** → **Credentials**
2. Click vào OAuth Client ID của bạn
3. Kiểm tra **Authorized JavaScript origins**:
   - Phải có: `http://localhost:5173` (hoặc port bạn đang dùng)
   - Phải có: `http://localhost:3000` (nếu dùng port khác)

### Kiểm tra OAuth Consent Screen

1. Vào **APIs & Services** → **OAuth consent screen**
2. Đảm bảo đã cấu hình đầy đủ:
   - App name
   - User support email
   - Developer contact information
   - Scopes: `email`, `profile`, `openid`

### Debug trong Console

Mở Developer Tools (F12) và kiểm tra:
- Có lỗi nào trong Console không?
- `import.meta.env.VITE_GOOGLE_CLIENT_ID` có giá trị không?
  - Gõ trong console: `console.log(import.meta.env.VITE_GOOGLE_CLIENT_ID)`

## Ví dụ file .env hoàn chỉnh

```env
# API Base URL
VITE_API_BASE_URL=http://localhost:5000

# Google OAuth Client ID
VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
```

## Liên hệ hỗ trợ

Nếu vẫn gặp vấn đề, vui lòng kiểm tra:
1. File `.env` có đúng vị trí không (phải ở `doam/fe/.env`)
2. Đã restart dev server chưa
3. Client ID có đúng format không
4. Google Cloud Console đã cấu hình đúng chưa

