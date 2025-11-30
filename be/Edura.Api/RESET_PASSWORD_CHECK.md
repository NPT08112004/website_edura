# ✅ Kiểm tra chức năng Reset Password

## 📋 Tổng quan

Chức năng reset password đã được tích hợp đầy đủ với Resend.com API (mặc định), Mailgun API, và SMTP (fallback).

## 🔄 Flow hoàn chỉnh

### 1. Frontend - Forgot Password

**File:** `fe/src/components/ForgotPassword.jsx`

**Bước 1: Nhập Email**
- User nhập email vào form
- Validate email format
- Gọi API `forgotPassword(email)`

**Bước 2: Nhập Mã và Mật khẩu mới**
- User nhập mã xác thực 6 chữ số
- User nhập mật khẩu mới và xác nhận
- Validate: mật khẩu không trống, mật khẩu khớp
- Gọi API `resetPassword(email, code, newPassword)`

### 2. Backend - Forgot Password API

**File:** `be/Edura.Api/app/controllers/auth.py`
**Endpoint:** `POST /api/auth/forgot-password`

**Xử lý:**
1. ✅ Validate request JSON
2. ✅ Validate email format
3. ✅ Tìm user theo username (email)
4. ✅ Tạo mã xác thực 6 chữ số ngẫu nhiên
5. ✅ Xóa các mã cũ của email này (nếu có)
6. ✅ Lưu mã mới vào database với:
   - `email`: Email người dùng
   - `code`: Mã xác thực 6 chữ số
   - `userId`: ID người dùng
   - `createdAt`: Thời gian tạo
   - `used`: False
7. ✅ Gọi `send_verification_code_email()` để gửi email
8. ✅ Trả về message thành công (không tiết lộ email có tồn tại hay không - bảo mật)

### 3. Email Service

**File:** `be/Edura.Api/app/services/email_service.py`
**Function:** `send_verification_code_email(to_email, verification_code)`

**Xử lý:**
1. ✅ Kiểm tra DEBUG_MODE (nếu bật, chỉ in ra console)
2. ✅ Chọn provider dựa trên `EMAIL_PROVIDER`:
   - `resend` (mặc định) → `_send_via_resend()`
   - `mailgun` → `_send_via_mailgun()`
   - `smtp` → `_send_via_smtp()`
3. ✅ Gửi email với nội dung HTML đẹp
4. ✅ Trả về `(success: bool, error_message: str)`

### 4. Backend - Reset Password API

**File:** `be/Edura.Api/app/controllers/auth.py`
**Endpoint:** `POST /api/auth/reset-password`

**Xử lý:**
1. ✅ Validate input: email, code, newPassword
2. ✅ Validate email format
3. ✅ Tìm mã xác thực trong database:
   - Theo email
   - Code khớp
   - `used = False`
4. ✅ Kiểm tra mã có hết hạn chưa (10 phút)
5. ✅ Tìm user theo userId từ reset_code_doc
6. ✅ Xác minh username trùng với email
7. ✅ Hash mật khẩu mới (pbkdf2:sha256)
8. ✅ Cập nhật passwordHash trong database
9. ✅ Đánh dấu mã đã sử dụng (`used = True`)
10. ✅ Trả về message thành công

## ✅ Điểm kiểm tra

### Backend

- [x] **Forgot Password Endpoint**
  - [x] Validate email format
  - [x] Tìm user theo username (email)
  - [x] Tạo mã xác thực 6 chữ số
  - [x] Xóa mã cũ trước khi tạo mã mới
  - [x] Lưu mã vào database
  - [x] Gọi email service
  - [x] Xử lý lỗi đầy đủ
  - [x] Không tiết lộ email có tồn tại (bảo mật)

- [x] **Reset Password Endpoint**
  - [x] Validate input đầy đủ
  - [x] Tìm mã xác thực
  - [x] Kiểm tra mã hết hạn (10 phút)
  - [x] Xác minh user
  - [x] Hash mật khẩu mới
  - [x] Cập nhật passwordHash
  - [x] Đánh dấu mã đã sử dụng
  - [x] Xử lý lỗi đầy đủ

- [x] **Email Service**
  - [x] Hỗ trợ Resend (mặc định)
  - [x] Hỗ trợ Mailgun (fallback)
  - [x] Hỗ trợ SMTP (fallback)
  - [x] Debug mode
  - [x] HTML email template đẹp
  - [x] Text fallback
  - [x] Error handling đầy đủ

### Frontend

- [x] **ForgotPassword Component**
  - [x] Form nhập email
  - [x] Validate email format
  - [x] Gọi API forgot-password
  - [x] Form nhập mã và mật khẩu mới
  - [x] Validate mật khẩu (không trống, khớp nhau)
  - [x] Gọi API reset-password
  - [x] Hiển thị thông báo thành công/lỗi
  - [x] Chuyển về login sau khi thành công
  - [x] Loading states
  - [x] Prevent duplicate requests

### API Integration

- [x] **API Functions** (`fe/src/api.js`)
  - [x] `forgotPassword(email)` - POST /api/auth/forgot-password
  - [x] `resetPassword(email, code, newPassword)` - POST /api/auth/reset-password

## 🔍 Các vấn đề tiềm ẩn đã được xử lý

### 1. Bảo mật
- ✅ Không tiết lộ email có tồn tại trong hệ thống
- ✅ Mã xác thực chỉ có hiệu lực 10 phút
- ✅ Mã chỉ dùng được 1 lần (đánh dấu `used = True`)
- ✅ Xóa mã cũ trước khi tạo mã mới
- ✅ Hash mật khẩu với pbkdf2:sha256

### 2. Xử lý lỗi
- ✅ Validate input đầy đủ
- ✅ Xử lý lỗi database
- ✅ Xử lý lỗi email service
- ✅ Thông báo lỗi rõ ràng cho user
- ✅ Debug mode cho development

### 3. User Experience
- ✅ Loading states
- ✅ Prevent duplicate requests
- ✅ Thông báo thành công/lỗi rõ ràng
- ✅ Tự động chuyển về login sau khi thành công
- ✅ Email template đẹp, dễ đọc

## 🧪 Cách test

### Test 1: Gửi mã xác thực

1. Mở frontend → Click "Quên mật khẩu"
2. Nhập email đã đăng ký
3. Click "Gửi mã xác thực"
4. **Kiểm tra:**
   - ✅ Thông báo "Mã xác thực đã được gửi"
   - ✅ Kiểm tra email inbox (hoặc spam)
   - ✅ Kiểm tra logs backend: `✅ [RESEND] Email đã được gửi thành công`
   - ✅ Kiểm tra database: có record trong `password_reset_codes`

### Test 2: Reset password với mã hợp lệ

1. Lấy mã xác thực từ email
2. Nhập mã và mật khẩu mới
3. Click "Đặt lại mật khẩu"
4. **Kiểm tra:**
   - ✅ Thông báo "Đặt lại mật khẩu thành công"
   - ✅ Tự động chuyển về login
   - ✅ Đăng nhập được với mật khẩu mới
   - ✅ Mã trong database đã được đánh dấu `used = True`

### Test 3: Mã hết hạn (10 phút)

1. Gửi mã xác thực
2. Đợi hơn 10 phút
3. Thử reset password với mã đó
4. **Kiểm tra:**
   - ✅ Thông báo "Mã xác thực đã hết hạn"

### Test 4: Mã đã sử dụng

1. Reset password thành công với mã A
2. Thử reset lại với cùng mã A
3. **Kiểm tra:**
   - ✅ Thông báo "Mã xác thực không hợp lệ"

### Test 5: Email không tồn tại

1. Nhập email không có trong hệ thống
2. Click "Gửi mã xác thực"
3. **Kiểm tra:**
   - ✅ Vẫn hiển thị "Mã xác thực đã được gửi" (bảo mật)
   - ✅ Không có email được gửi
   - ✅ Không có record trong database

### Test 6: Debug Mode

1. Set `EMAIL_DEBUG_MODE=true` trong environment
2. Gửi mã xác thực
3. **Kiểm tra:**
   - ✅ Không có email thật được gửi
   - ✅ Mã hiển thị trong logs: `🔧 [DEBUG MODE] Mã xác thực cho email@example.com: 123456`

## 🔧 Cấu hình cần thiết

### Environment Variables (Render)

```env
# Resend (Mặc định - Khuyến nghị)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your-api-key-here
EMAIL_FROM=onboarding@resend.dev

# Hoặc Mailgun
# EMAIL_PROVIDER=mailgun
# MAILGUN_API_KEY=key-your-api-key-here
# MAILGUN_DOMAIN=your-domain.mailgun.org
# EMAIL_FROM=noreply@your-domain.mailgun.org

# Hoặc SMTP (chỉ hoạt động trên Render Paid)
# EMAIL_PROVIDER=smtp
# SMTP_SERVER=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USERNAME=your-email@gmail.com
# SMTP_PASSWORD=your-app-password
# EMAIL_FROM=your-email@gmail.com

# Optional: Debug mode
# EMAIL_DEBUG_MODE=false
```

## 📊 Database Schema

### Collection: `password_reset_codes`

```javascript
{
  "_id": ObjectId,
  "email": "user@example.com",        // Email người dùng
  "code": "123456",                    // Mã xác thực 6 chữ số
  "userId": ObjectId,                  // ID người dùng
  "username": "user@example.com",     // Username (email)
  "createdAt": ISODate,               // Thời gian tạo
  "used": false                        // Đã sử dụng chưa
}
```

## 🐛 Troubleshooting

### Lỗi 403: "You can only send testing emails to your own email address"

**Nguyên nhân:** 
- Resend đang ở **Test Mode**
- Chỉ có thể gửi đến email đã đăng ký tài khoản Resend
- Đang cố gửi đến email khác

**Giải pháp NGAY LẬP TỨC:**

1. **Cập nhật environment variable trên Render:**
   ```env
   EMAIL_FROM=onboarding@resend.dev
   ```

2. **Deploy lại** - Xong! ✅

**Giải thích:**
- `onboarding@resend.dev` cho phép gửi đến bất kỳ email nào
- Không cần verify domain
- Hoạt động ngay sau khi deploy

### Email không được gửi

1. **Kiểm tra environment variables:**
   - `RESEND_API_KEY` đã set chưa?
   - `EMAIL_FROM` đã set chưa? (Phải là `onboarding@resend.dev` nếu chưa verify domain)
   - `EMAIL_PROVIDER=resend` đã set chưa?

2. **Kiểm tra logs:**
   - Tìm `❌ [RESEND]` hoặc `✅ [RESEND]` trong logs
   - Xem error message chi tiết

3. **Kiểm tra Resend dashboard:**
   - API key còn active không?
   - Có bị rate limit không?

### Mã không hợp lệ

1. **Kiểm tra:**
   - Mã đã hết hạn chưa? (10 phút)
   - Mã đã được sử dụng chưa?
   - Email có đúng không?

2. **Kiểm tra database:**
   - Có record trong `password_reset_codes` không?
   - `used` = false không?
   - `createdAt` còn trong 10 phút không?

### Reset password không thành công

1. **Kiểm tra:**
   - Mã xác thực hợp lệ không?
   - User có tồn tại không?
   - Mật khẩu mới có hợp lệ không?

2. **Kiểm tra logs:**
   - Xem error message từ API
   - Kiểm tra database có được update không?

## ✅ Kết luận

Chức năng reset password đã được tích hợp đầy đủ và hoạt động tốt với:
- ✅ Resend.com API (mặc định)
- ✅ Mailgun API (fallback)
- ✅ SMTP (fallback)
- ✅ Bảo mật tốt
- ✅ UX tốt
- ✅ Error handling đầy đủ

**Trạng thái:** ✅ Sẵn sàng sử dụng

