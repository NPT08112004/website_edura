# Hướng dẫn cấu hình Google OAuth Login

## Tổng quan

Chức năng đăng nhập bằng Google cho phép người dùng đăng nhập vào hệ thống Edura bằng tài khoản Google của họ mà không cần tạo tài khoản mới hoặc nhớ mật khẩu.

## Cấu hình biến môi trường

### Backend (.env)

Thêm biến sau vào file `.env` trong thư mục `Edura.Api`:

```env
# Google OAuth Client ID (Backend)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

### Frontend (.env)

Thêm biến sau vào file `.env` trong thư mục `fe`:

```env
# Google OAuth Client ID (Frontend)
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

**Lưu ý:** Cả backend và frontend có thể dùng cùng một Client ID, nhưng phải cấu hình đúng trong Google Cloud Console.

## Đăng ký Google OAuth

### Bước 1: Tạo dự án trên Google Cloud Console

1. Truy cập: https://console.cloud.google.com/
2. Tạo dự án mới hoặc chọn dự án hiện có
3. Đặt tên dự án (ví dụ: "Edura OAuth")

### Bước 2: Bật Google+ API

1. Vào **APIs & Services** → **Library**
2. Tìm "Google+ API" hoặc "Google Identity Services"
3. Click **Enable**

### Bước 3: Tạo OAuth 2.0 Client ID

1. Vào **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Nếu chưa có OAuth consent screen, bạn sẽ được yêu cầu cấu hình:
   - **User Type**: Chọn "External" (hoặc "Internal" nếu dùng Google Workspace)
   - **App name**: Edura
   - **User support email**: Email hỗ trợ của bạn
   - **Developer contact information**: Email của bạn
   - **Scopes**: Thêm `email`, `profile`, `openid`
   - **Test users**: Thêm email test (nếu ở chế độ Testing)

4. Sau khi cấu hình OAuth consent screen, quay lại tạo OAuth client ID:
   - **Application type**: Chọn "Web application"
   - **Name**: Edura Web Client
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (cho development)
     - `http://localhost:3000` (nếu dùng port khác)
     - `https://your-domain.com` (cho production)
   - **Authorized redirect URIs**:
     - `http://localhost:5173` (cho development)
     - `https://your-domain.com` (cho production)

5. Click **Create**
6. Copy **Client ID** và dán vào file `.env`

### Bước 4: Cấu hình cho Backend

Backend cần xác thực Google ID token, vì vậy cần đảm bảo:
- Client ID được cấu hình đúng trong `.env`
- Backend có thể truy cập internet để verify token với Google

## Cài đặt dependencies

### Backend

```bash
cd doam/be/Edura.Api
pip install -r requirements.txt
```

Thư viện `google-auth>=2.23.0` đã được thêm vào `requirements.txt`.

### Frontend

Không cần cài thêm package, đã sử dụng Google Sign-In script từ CDN.

## Kiểm tra hoạt động

1. **Khởi động backend:**
   ```bash
   cd doam/be/Edura.Api
   python run.py
   ```

2. **Khởi động frontend:**
   ```bash
   cd doam/fe
   npm run dev
   ```

3. **Test đăng nhập Google:**
   - Mở trình duyệt và truy cập trang đăng nhập
   - Click nút "Đăng nhập bằng Google"
   - Chọn tài khoản Google
   - Xác nhận quyền truy cập
   - Kiểm tra xem đã đăng nhập thành công chưa

## Xử lý lỗi thường gặp

### Lỗi: "Google OAuth chưa được cấu hình trên server"
- **Nguyên nhân**: Thiếu `GOOGLE_CLIENT_ID` trong `.env` của backend
- **Giải pháp**: Thêm `GOOGLE_CLIENT_ID` vào file `.env`

### Lỗi: "Google token không hợp lệ"
- **Nguyên nhân**: Client ID không khớp hoặc token đã hết hạn
- **Giải pháp**: Kiểm tra lại `GOOGLE_CLIENT_ID` trong backend `.env`

### Nút Google không hiển thị
- **Nguyên nhân**: Thiếu `VITE_GOOGLE_CLIENT_ID` hoặc Google script chưa load
- **Giải pháp**: 
  - Kiểm tra `VITE_GOOGLE_CLIENT_ID` trong frontend `.env`
  - Kiểm tra console trình duyệt xem có lỗi load script không
  - Đảm bảo internet kết nối để load Google script

### Lỗi CORS
- **Nguyên nhân**: Origin không được authorize trong Google Console
- **Giải pháp**: Thêm origin vào "Authorized JavaScript origins" trong Google Cloud Console

## Lưu ý bảo mật

1. **Không commit file `.env`** vào Git
2. **Sử dụng HTTPS** trong production
3. **Giới hạn Authorized origins** chỉ những domain hợp lệ
4. **Kiểm tra token** trên backend trước khi tạo session
5. **Rate limiting** đã được áp dụng cho endpoint `/api/auth/google`

## Cấu trúc database

Khi user đăng nhập bằng Google, hệ thống sẽ:
- Tạo user mới nếu chưa tồn tại
- Lưu `googleId` vào database
- Lưu thông tin `email`, `fullName`, `avatar` từ Google
- Tạo JWT token như đăng nhập thông thường

User có thể đăng nhập bằng:
- Username/Password (nếu đã đăng ký)
- Google OAuth (nếu đã đăng nhập Google trước đó)

