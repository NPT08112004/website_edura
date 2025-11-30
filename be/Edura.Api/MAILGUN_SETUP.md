# 📧 Hướng dẫn cấu hình Mailgun cho Reset Password

## Tổng quan

Hệ thống đã được cập nhật để sử dụng **Mailgun API** thay vì SMTP trực tiếp. Mailgun hoạt động tốt trên Render Free tier vì không bị chặn như SMTP ports.

## ✅ Ưu điểm của Mailgun

- ✅ **Hoạt động trên Render Free tier** (không bị chặn như SMTP)
- ✅ **Free tier: 5,000 emails/tháng** (đủ cho hầu hết ứng dụng)
- ✅ **API đơn giản**, không cần cấu hình phức tạp
- ✅ **Reliability cao**, ít lỗi hơn SMTP
- ✅ **Tracking và analytics** tích hợp sẵn

## 📋 Bước 1: Đăng ký Mailgun

1. Truy cập: https://www.mailgun.com
2. Đăng ký tài khoản miễn phí
3. Xác thực email và số điện thoại

## 📋 Bước 2: Tạo Domain (Sandbox hoặc Custom)

### Option A: Dùng Sandbox Domain (Test nhanh)

1. Vào **Sending** → **Domains**
2. Bạn sẽ thấy một **Sandbox Domain** có dạng: `sandbox1234567890abcdef.mailgun.org`
3. **Lưu ý:** Sandbox domain chỉ gửi được đến email đã verify trong Mailgun
4. Để test, vào **Sending** → **Authorized Recipients** và thêm email của bạn

### Option B: Dùng Custom Domain (Production)

1. Vào **Sending** → **Domains** → **Add New Domain**
2. Nhập domain của bạn (ví dụ: `mail.yourdomain.com`)
3. Làm theo hướng dẫn để thêm DNS records:
   - TXT record cho verification
   - MX records
   - CNAME records
4. Đợi DNS propagate (có thể mất vài phút đến vài giờ)

## 📋 Bước 3: Lấy API Key

1. Vào **Settings** → **API Keys**
2. Copy **Private API key** (bắt đầu bằng `key-`)
3. **Lưu ý:** Không share API key này công khai!

## 📋 Bước 4: Cấu hình trên Render

1. Vào **Render Dashboard** → Chọn service của bạn
2. Vào **Environment** tab
3. Thêm các biến môi trường sau:

```env
# Mailgun Configuration
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=key-your-api-key-here
MAILGUN_DOMAIN=sandbox1234567890abcdef.mailgun.org
EMAIL_FROM=noreply@sandbox1234567890abcdef.mailgun.org

# Optional: Debug mode (chỉ dùng để test)
EMAIL_DEBUG_MODE=false
```

**Giải thích:**
- `EMAIL_PROVIDER=mailgun`: Chọn Mailgun làm provider (mặc định)
- `MAILGUN_API_KEY`: API key từ Mailgun dashboard
- `MAILGUN_DOMAIN`: Domain bạn đã tạo (sandbox hoặc custom)
- `EMAIL_FROM`: Email gửi đi (phải match với domain)

## 📋 Bước 5: Deploy lại

Sau khi thêm environment variables, Render sẽ tự động deploy lại service.

## 🧪 Bước 6: Test

1. Gửi request forgot-password với email đã verify (nếu dùng sandbox)
2. Kiểm tra logs trong Render Dashboard
3. Tìm dòng: `✅ [MAILGUN] Email đã được gửi thành công`

## 🔍 Troubleshooting

### Lỗi: "MAILGUN_API_KEY hoặc MAILGUN_DOMAIN chưa được cấu hình"

**Nguyên nhân:** Thiếu environment variables

**Giải pháp:**
- Kiểm tra lại các biến: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`
- Đảm bảo đã save và deploy lại

### Lỗi: "Mailgun API trả về lỗi 401"

**Nguyên nhân:** API key không đúng

**Giải pháp:**
- Kiểm tra lại API key trong Mailgun dashboard
- Đảm bảo copy đầy đủ (bao gồm `key-` prefix)

### Lỗi: "Mailgun API trả về lỗi 403"

**Nguyên nhân:** 
- Domain chưa được verify (nếu dùng custom domain)
- Email nhận chưa được authorize (nếu dùng sandbox domain)

**Giải pháp:**
- Với sandbox: Vào **Sending** → **Authorized Recipients** và thêm email
- Với custom domain: Kiểm tra DNS records đã đúng chưa

### Email không đến inbox

**Nguyên nhân:** 
- Email vào spam folder
- Sandbox domain chỉ gửi được đến email đã verify

**Giải pháp:**
- Kiểm tra spam folder
- Với sandbox: Đảm bảo email đã được thêm vào Authorized Recipients

## 🔄 Fallback về SMTP

Nếu muốn dùng SMTP thay vì Mailgun (ví dụ: đã có paid plan trên Render):

```env
EMAIL_PROVIDER=smtp
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
```

## 📊 So sánh Mailgun vs SMTP

| Tính năng | Mailgun | SMTP |
|-----------|---------|------|
| Render Free tier | ✅ Hoạt động | ❌ Bị chặn |
| Render Paid | ✅ Hoạt động | ✅ Hoạt động |
| Free tier | 5,000 emails/tháng | N/A |
| Setup | Đơn giản | Phức tạp hơn |
| Reliability | Cao | Trung bình |

## 💡 Khuyến nghị

- **Free tier trên Render:** Dùng Mailgun (bắt buộc)
- **Paid plan trên Render:** Có thể dùng Mailgun hoặc SMTP
- **Production:** Nên dùng Mailgun với custom domain để có deliverability tốt hơn

## 📚 Tài liệu tham khảo

- Mailgun Documentation: https://documentation.mailgun.com/
- Mailgun API Reference: https://documentation.mailgun.com/en/latest/api_reference.html

