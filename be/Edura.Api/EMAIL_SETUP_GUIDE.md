# Hướng dẫn cấu hình Email trên Render

## Vấn đề: "Không thể gửi email. Vui lòng kiểm tra cấu hình email server."

Lỗi này xảy ra khi hệ thống không thể gửi email để reset password. Có 2 cách giải quyết:

## Giải pháp 1: Cấu hình Email thật (Gmail)

### Bước 1: Tạo App Password cho Gmail

1. Đăng nhập vào [Google Account](https://myaccount.google.com/)
2. Vào **Security** → **2-Step Verification** (bật nếu chưa bật)
3. Vào **Security** → **App passwords**
4. Chọn app: **Mail**, device: **Other (Custom name)**
5. Nhập tên: "Edura API"
6. Copy **App Password** (16 ký tự, không có khoảng trắng)

### Bước 2: Cấu hình trên Render

1. Vào Render Dashboard → Chọn service của bạn
2. Vào **Environment** tab
3. Thêm các biến môi trường sau:

```env
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
```

**Lưu ý quan trọng:**
- `SMTP_USERNAME`: Email Gmail của bạn
- `SMTP_PASSWORD`: App Password (KHÔNG phải mật khẩu Gmail thường)
- `EMAIL_FROM`: Có thể giống `SMTP_USERNAME`

### Bước 3: Deploy lại

Sau khi thêm environment variables, Render sẽ tự động deploy lại service.

## Giải pháp 2: Bật Debug Mode (Test/Development)

Nếu bạn chỉ muốn test mà không cần gửi email thật:

1. Vào Render Dashboard → **Environment** tab
2. Thêm biến:

```env
EMAIL_DEBUG_MODE=true
```

3. Khi bật debug mode:
   - Email sẽ KHÔNG được gửi thật
   - Mã xác thực sẽ được in ra console/logs
   - Bạn có thể xem mã trong Render Logs

### Xem mã xác thực trong Debug Mode

1. Vào Render Dashboard → **Logs** tab
2. Gửi request forgot-password
3. Tìm dòng log: `🔧 [DEBUG MODE] Mã xác thực cho email@example.com: 123456`

## Giải pháp 3: Sử dụng Email Service khác

### SendGrid
```env
SMTP_SERVER=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USERNAME=apikey
SMTP_PASSWORD=your-sendgrid-api-key
EMAIL_FROM=noreply@yourdomain.com
```

### Mailgun
```env
SMTP_SERVER=smtp.mailgun.org
SMTP_PORT=587
SMTP_USERNAME=your-mailgun-username
SMTP_PASSWORD=your-mailgun-password
EMAIL_FROM=noreply@yourdomain.com
```

### Outlook/Office 365
```env
SMTP_SERVER=smtp.office365.com
SMTP_PORT=587
SMTP_USERNAME=your-email@outlook.com
SMTP_PASSWORD=your-password
EMAIL_FROM=your-email@outlook.com
```

## Kiểm tra cấu hình

### Cách 1: Xem logs trên Render
1. Vào **Logs** tab
2. Tìm các dòng:
   - `📧 Đang kết nối SMTP server: ...`
   - `✅ Email xác thực đã được gửi thành công`
   - Hoặc `❌ Lỗi...` nếu có lỗi

### Cách 2: Test với Debug Mode
1. Bật `EMAIL_DEBUG_MODE=true`
2. Gửi request forgot-password
3. Xem logs để lấy mã xác thực

## Troubleshooting

### Lỗi: "SMTP_USERNAME hoặc SMTP_PASSWORD chưa được cấu hình"
- **Nguyên nhân**: Thiếu biến môi trường trên Render
- **Giải pháp**: Thêm đầy đủ các biến môi trường như hướng dẫn trên

### Lỗi: "Lỗi xác thực SMTP: Sai username hoặc password"
- **Nguyên nhân**: 
  - Dùng mật khẩu Gmail thay vì App Password
  - App Password sai
- **Giải pháp**: 
  - Tạo lại App Password
  - Đảm bảo dùng App Password (16 ký tự), không phải mật khẩu thường

### Lỗi: "Không thể kết nối đến SMTP server"
- **Nguyên nhân**: 
  - SMTP_SERVER hoặc SMTP_PORT sai
  - Firewall chặn
- **Giải pháp**: 
  - Kiểm tra lại SMTP_SERVER và SMTP_PORT
  - Thử dùng port 465 với SSL (cần sửa code)

### Email không đến inbox
- Kiểm tra Spam folder
- Kiểm tra logs xem email có được gửi thành công không
- Thử với email khác

## Lưu ý bảo mật

1. **KHÔNG commit file `.env`** lên Git
2. **KHÔNG hardcode** credentials trong code
3. Chỉ dùng **App Password**, không dùng mật khẩu chính
4. **Rotate** App Password định kỳ
5. Trong production, nên dùng email service chuyên nghiệp (SendGrid, Mailgun, AWS SES)

## Test nhanh

Sau khi cấu hình, test bằng cách:

```bash
# Gửi POST request
curl -X POST https://your-app.onrender.com/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com"}'
```

Nếu thành công, bạn sẽ nhận được:
```json
{
  "message": "Mã xác thực đã được gửi đến email của bạn."
}
```

