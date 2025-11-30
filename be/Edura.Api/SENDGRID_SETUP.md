# 📧 Hướng dẫn cấu hình SendGrid.com cho Reset Password

## Tổng quan

Hệ thống đã được cập nhật để sử dụng **SendGrid.com API** làm email provider mặc định. SendGrid là một email service phổ biến, đáng tin cậy và hoạt động tốt trên Render Free tier.

## ✅ Ưu điểm của SendGrid

- ✅ **Hoạt động trên Render Free tier** (không bị chặn như SMTP)
- ✅ **Free tier: 100 emails/ngày** (đủ cho hầu hết ứng dụng)
- ✅ **API đơn giản**, REST API chuẩn
- ✅ **Deliverability cao**, email ít bị vào spam
- ✅ **Reliability cao**, ít downtime
- ✅ **Tracking và analytics** tích hợp sẵn

## 📋 Bước 1: Đăng ký SendGrid

1. Truy cập: https://sendgrid.com
2. Click **Start for free** và đăng ký tài khoản miễn phí
3. Xác thực email của bạn
4. Hoàn tất onboarding process

## 📋 Bước 2: Verify Sender Identity

SendGrid yêu cầu verify sender identity trước khi gửi email.

### Option A: Single Sender Verification (Nhanh nhất - Khuyến nghị)

1. Vào **Settings** → **Sender Authentication** → **Single Sender Verification**
2. Click **Create New Sender**
3. Điền thông tin:
   - **From Email Address**: Email của bạn (ví dụ: `noreply@yourdomain.com` hoặc email cá nhân)
   - **From Name**: Tên hiển thị (ví dụ: "Edura")
   - **Reply To**: Email nhận reply (có thể giống From Email)
4. Click **Create**
5. **Kiểm tra email** và click link verify trong email từ SendGrid
6. Sau khi verify, bạn có thể dùng email này để gửi

**Lưu ý:**
- ✅ Có thể verify email cá nhân (Gmail, Yahoo, etc.)
- ✅ Không cần domain riêng
- ✅ Hoạt động ngay sau khi verify

### Option B: Domain Authentication (Production)

1. Vào **Settings** → **Sender Authentication** → **Domain Authentication**
2. Click **Authenticate Your Domain**
3. Chọn DNS provider của bạn
4. Thêm DNS records theo hướng dẫn:
   - CNAME records
   - TXT records
5. Đợi DNS propagate (thường 5-15 phút)
6. Sau khi verify, bạn có thể dùng bất kỳ email nào từ domain đó

## 📋 Bước 3: Tạo API Key

1. Vào **Settings** → **API Keys**
2. Click **Create API Key**
3. Đặt tên cho API key (ví dụ: "Edura Production")
4. Chọn quyền: **Full Access** (hoặc **Restricted Access** với quyền Mail Send)
5. Click **Create & View**
6. **Copy API Key ngay** (chỉ hiển thị một lần!)
7. Lưu API key vào nơi an toàn

**Lưu ý:** 
- API key bắt đầu bằng `SG.`
- Không share API key này công khai!

## 📋 Bước 4: Cấu hình trên Render

1. Vào **Render Dashboard** → Chọn service của bạn
2. Vào **Environment** tab
3. Thêm các biến môi trường sau:

```env
# SendGrid Configuration (Mặc định)
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.your-api-key-here
EMAIL_FROM=your-verified-email@example.com
```

**Giải thích:**
- `EMAIL_PROVIDER=sendgrid`: Chọn SendGrid làm provider (mặc định)
- `SENDGRID_API_KEY`: API key từ SendGrid dashboard (bắt đầu bằng `SG.`)
- `EMAIL_FROM`: Email đã được verify trong SendGrid (Single Sender hoặc Domain)

## 📋 Bước 5: Deploy lại

Sau khi thêm environment variables, Render sẽ tự động deploy lại service.

## 🧪 Bước 6: Test

1. Gửi request forgot-password với email của bạn
2. Kiểm tra logs trong Render Dashboard
3. Tìm dòng: `✅ [SENDGRID] Email đã được gửi thành công`
4. Kiểm tra email inbox (và spam folder nếu cần)

## 🔍 Troubleshooting

### Lỗi: "SENDGRID_API_KEY chưa được cấu hình"

**Nguyên nhân:** Thiếu environment variable

**Giải pháp:**
- Kiểm tra lại biến `SENDGRID_API_KEY` trong Render
- Đảm bảo đã copy đầy đủ API key (bao gồm `SG.` prefix)
- Đảm bảo đã save và deploy lại

### Lỗi: "SendGrid API trả về lỗi 401"

**Nguyên nhân:** API key không đúng hoặc đã bị revoke

**Giải pháp:**
- Kiểm tra lại API key trong SendGrid dashboard
- Tạo API key mới nếu cần
- Đảm bảo API key có quyền "Mail Send"

### Lỗi: "SendGrid API trả về lỗi 403"

**Nguyên nhân:** 
- Sender identity chưa được verify
- Email `EMAIL_FROM` chưa được verify

**Giải pháp:**
- Vào SendGrid Dashboard → Settings → Sender Authentication
- Verify Single Sender hoặc Domain
- Đảm bảo `EMAIL_FROM` trùng với email đã verify

### Lỗi: "SendGrid API trả về lỗi 400"

**Nguyên nhân:** 
- Format email không đúng
- Thiếu thông tin trong payload

**Giải pháp:**
- Kiểm tra `EMAIL_FROM` có đúng format email không
- Kiểm tra logs để xem error message chi tiết

### Email không đến inbox

**Nguyên nhân:** 
- Email vào spam folder
- Sender reputation thấp (nếu mới verify)

**Giải pháp:**
- Kiểm tra spam folder
- Đảm bảo đã verify sender identity đúng cách
- Với Single Sender, có thể mất vài phút để email đến inbox

### Rate limit exceeded

**Nguyên nhân:** Đã vượt quá giới hạn free tier (100 emails/ngày)

**Giải pháp:**
- Kiểm tra usage trong SendGrid dashboard
- Nâng cấp lên paid plan nếu cần
- Hoặc đợi đến ngày hôm sau

## 🔄 Fallback về Resend, Mailgun hoặc SMTP

Nếu muốn dùng Resend thay vì SendGrid:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your-api-key-here
EMAIL_FROM=onboarding@resend.dev
```

Nếu muốn dùng Mailgun:

```env
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=key-your-api-key-here
MAILGUN_DOMAIN=your-domain.mailgun.org
EMAIL_FROM=noreply@your-domain.mailgun.org
```

Nếu muốn dùng SMTP (chỉ hoạt động trên Render Paid):

```env
EMAIL_PROVIDER=smtp
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
```

## 📊 So sánh SendGrid vs Resend vs Mailgun vs SMTP

| Tính năng | SendGrid | Resend | Mailgun | SMTP |
|-----------|----------|--------|---------|------|
| Render Free tier | ✅ Hoạt động | ✅ Hoạt động | ✅ Hoạt động | ❌ Bị chặn |
| Render Paid | ✅ Hoạt động | ✅ Hoạt động | ✅ Hoạt động | ✅ Hoạt động |
| Free tier | 100 emails/ngày | 3,000 emails/tháng | 5,000 emails/tháng | N/A |
| Setup | Đơn giản | Rất đơn giản | Đơn giản | Phức tạp |
| API | REST API | REST API | REST API | SMTP protocol |
| Verify | Single Sender hoặc Domain | Domain (hoặc onboarding@resend.dev) | Domain | N/A |
| Deliverability | Cao | Cao | Cao | Trung bình |
| Developer Experience | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## 💡 Khuyến nghị

- **Free tier trên Render:** 
  - ✅ **SendGrid** (mặc định, 100 emails/ngày, đáng tin cậy)
  - ✅ **Resend** (3,000 emails/tháng, setup nhanh nhất)
  - ✅ **Mailgun** (5,000 emails/tháng, nhiều nhất)
- **Paid plan trên Render:** Có thể dùng SendGrid, Resend, Mailgun hoặc SMTP
- **Production:** Nên dùng SendGrid với Domain Authentication để có deliverability tốt nhất

## 🎯 Tại sao chọn SendGrid?

1. **Đáng tin cậy:** SendGrid là một trong những email service lớn nhất
2. **Free tier đủ dùng:** 100 emails/ngày cho hầu hết ứng dụng
3. **Deliverability cao:** Email ít bị vào spam
4. **Tracking tích hợp:** Analytics và tracking sẵn có
5. **Documentation tốt:** Tài liệu đầy đủ và rõ ràng

## 📚 Tài liệu tham khảo

- SendGrid Documentation: https://docs.sendgrid.com/
- SendGrid API Reference: https://docs.sendgrid.com/api-reference
- SendGrid Python SDK: https://github.com/sendgrid/sendgrid-python

## 🚀 Quick Start

1. Đăng ký SendGrid: https://sendgrid.com
2. Verify Single Sender: Settings → Sender Authentication → Single Sender Verification
3. Tạo API Key: Settings → API Keys → Create API Key
4. Thêm vào Render:
   ```env
   EMAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=SG_your-api-key
   EMAIL_FROM=your-verified-email@example.com
   ```
5. Deploy lại - Xong! ✅

