# 📧 Hướng dẫn cấu hình Resend.com cho Reset Password

## Tổng quan

Hệ thống đã được cập nhật để sử dụng **Resend.com API** làm email provider mặc định. Resend là một email service hiện đại, đơn giản và hoạt động tốt trên Render Free tier.

## ✅ Ưu điểm của Resend

- ✅ **Hoạt động trên Render Free tier** (không bị chặn như SMTP)
- ✅ **Free tier: 3,000 emails/tháng** (đủ cho hầu hết ứng dụng)
- ✅ **API đơn giản và hiện đại**, dễ sử dụng
- ✅ **Deliverability cao**, email ít bị vào spam
- ✅ **Setup nhanh**, chỉ cần API key
- ✅ **Developer-friendly**, documentation rõ ràng

## 📋 Bước 1: Đăng ký Resend

1. Truy cập: https://resend.com
2. Click **Sign Up** và đăng ký tài khoản miễn phí
3. Xác thực email của bạn

## 📋 Bước 2: Lấy API Key

1. Sau khi đăng nhập, bạn sẽ thấy dashboard
2. Vào **API Keys** (hoặc **Settings** → **API Keys**)
3. Click **Create API Key**
4. Đặt tên cho API key (ví dụ: "Edura Production")
5. Copy **API Key** (bắt đầu bằng `re_`)
6. **Lưu ý:** API key chỉ hiển thị một lần, hãy lưu lại ngay!

## 📋 Bước 3: Verify Domain (Tùy chọn - Khuyến nghị cho Production)

### ⚠️ Lưu ý quan trọng về Domain

**Resend KHÔNG cho phép sử dụng các domain miễn phí công cộng:**
- ❌ `*.vercel.app` (Vercel)
- ❌ `*.netlify.app` (Netlify)
- ❌ `*.github.io` (GitHub Pages)
- ❌ `*.herokuapp.com` (Heroku)
- ❌ `*.render.com` (Render)
- ❌ Các domain miễn phí khác

**Resend CHỈ cho phép:**
- ✅ Domain bạn sở hữu (đã mua)
- ✅ Domain có quyền quản lý DNS

### Option A: Dùng Email mặc định (Test nhanh - Khuyến nghị cho Free tier)

**⚠️ QUAN TRỌNG:** Resend có 2 chế độ:

1. **Test Mode (Mặc định khi mới đăng ký):**
   - Chỉ gửi được đến email đã đăng ký tài khoản Resend
   - Không thể gửi đến email khác
   - Lỗi 403 nếu cố gửi đến email khác

2. **Production Mode (Sau khi verify domain):**
   - Có thể gửi đến bất kỳ email nào
   - Cần verify domain riêng

**Giải pháp cho Test Mode:**

**Cách 1: Dùng `onboarding@resend.dev` (Khuyến nghị)**
- ✅ Có thể gửi đến bất kỳ email nào (không cần verify domain)
- ✅ Setup ngay lập tức
- ✅ Đủ dùng cho test và development

**Cách 2: Test với email đã đăng ký Resend**
- Chỉ test với email bạn dùng để đăng ký Resend
- Không thể test với email khác

**Cách 3: Verify domain (Production)**
- Mua domain riêng
- Verify domain trong Resend
- Có thể gửi đến bất kỳ email nào

**Cách dùng:**
```env
EMAIL_FROM=onboarding@resend.dev
```

### Option B: Verify Domain riêng (Production)

**Chỉ dùng nếu bạn có domain riêng đã mua!**

1. Vào **Domains** → **Add Domain**
2. Nhập domain của bạn (ví dụ: `yourdomain.com` hoặc `mail.yourdomain.com`)
   - **Lưu ý:** Phải là domain bạn sở hữu, không phải domain miễn phí
3. Làm theo hướng dẫn để thêm DNS records:
   - **SPF record** (TXT)
   - **DKIM record** (TXT)
   - **DMARC record** (TXT - tùy chọn)
4. Đợi DNS propagate (thường mất 5-15 phút)
5. Sau khi verify, bạn có thể dùng email từ domain đó (ví dụ: `noreply@yourdomain.com`)

### Option C: Mua domain rẻ (Nếu cần domain riêng)

Nếu bạn cần domain riêng nhưng chưa có, có thể mua domain rẻ:
- **Namecheap:** ~$1-10/năm cho .com
- **Cloudflare Registrar:** Giá gốc, không markup
- **Google Domains:** ~$12/năm cho .com

**Lưu ý:** Với free tier của Resend (3,000 emails/tháng), bạn có thể dùng `onboarding@resend.dev` mà không cần mua domain.

## 📋 Bước 4: Cấu hình trên Render

1. Vào **Render Dashboard** → Chọn service của bạn
2. Vào **Environment** tab
3. Thêm các biến môi trường sau:

```env
# Resend Configuration (Mặc định)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your-api-key-here
EMAIL_FROM=onboarding@resend.dev
```

**Giải thích:**
- `EMAIL_PROVIDER=resend`: Chọn Resend làm provider (mặc định)
- `RESEND_API_KEY`: API key từ Resend dashboard (bắt đầu bằng `re_`)
- `EMAIL_FROM`: Email gửi đi
  - **Khuyến nghị:** `onboarding@resend.dev` (không cần verify domain, hoạt động ngay)
  - **Production:** `noreply@yourdomain.com` (chỉ dùng nếu đã có domain riêng và đã verify)

**⚠️ Lưu ý:** 
- KHÔNG dùng domain miễn phí như `*.vercel.app`, `*.netlify.app`, etc.
- Nếu không có domain riêng, dùng `onboarding@resend.dev` là đủ!

## 📋 Bước 5: Deploy lại

Sau khi thêm environment variables, Render sẽ tự động deploy lại service.

## 🧪 Bước 6: Test

1. Gửi request forgot-password với email của bạn
2. Kiểm tra logs trong Render Dashboard
3. Tìm dòng: `✅ [RESEND] Email đã được gửi thành công`
4. Kiểm tra inbox (và spam folder nếu cần)

## 🔍 Troubleshooting

### Lỗi: "RESEND_API_KEY chưa được cấu hình"

**Nguyên nhân:** Thiếu environment variable

**Giải pháp:**
- Kiểm tra lại biến `RESEND_API_KEY` trong Render
- Đảm bảo đã copy đầy đủ API key (bao gồm `re_` prefix)
- Đảm bảo đã save và deploy lại

### Lỗi: "Resend API trả về lỗi 401"

**Nguyên nhân:** API key không đúng hoặc đã bị revoke

**Giải pháp:**
- Kiểm tra lại API key trong Resend dashboard
- Tạo API key mới nếu cần
- Đảm bảo copy đầy đủ (không có khoảng trắng thừa)

### Lỗi: "We don't allow free public domains"

**Nguyên nhân:** Bạn đang cố thêm domain miễn phí công cộng (ví dụ: `*.vercel.app`, `*.netlify.app`)

**Giải pháp:**
- ✅ **Dùng `onboarding@resend.dev`** - Không cần verify domain, hoạt động ngay!
- ✅ Hoặc mua domain riêng nếu cần domain custom
- ❌ KHÔNG thể dùng domain miễn phí từ Vercel, Netlify, GitHub, etc.

### Lỗi: "You can only send testing emails to your own email address" (403)

**Nguyên nhân:** 
- Bạn đang ở **Test Mode** của Resend
- Resend chỉ cho phép gửi đến email đã đăng ký tài khoản
- Bạn đang cố gửi đến email khác

**Giải pháp:**

**Option 1: Dùng `onboarding@resend.dev` (Khuyến nghị nhất)**
```env
EMAIL_FROM=onboarding@resend.dev
```
- ✅ Có thể gửi đến bất kỳ email nào
- ✅ Không cần verify domain
- ✅ Hoạt động ngay

**Option 2: Test với email đã đăng ký Resend**
- Chỉ test với email bạn dùng để đăng ký Resend
- Tạm thời đủ để test chức năng

**Option 3: Verify domain (Production)**
- Mua domain riêng
- Verify domain trong Resend dashboard
- Có thể gửi đến bất kỳ email nào với domain đã verify

### Lỗi: "Resend API trả về lỗi 422"

**Nguyên nhân:** 
- Email `EMAIL_FROM` chưa được verify (nếu dùng custom domain)
- Format email không đúng

**Giải pháp:**
- Nếu dùng `onboarding@resend.dev`: Đảm bảo đúng format (không cần verify)
- Nếu dùng custom domain: Đảm bảo domain đã được verify trong Resend
- Kiểm tra format email trong `EMAIL_FROM`

### Email không đến inbox

**Nguyên nhân:** 
- Email vào spam folder
- Domain chưa được verify (nếu dùng custom domain)

**Giải pháp:**
- Kiểm tra spam folder
- Verify domain trong Resend dashboard
- Kiểm tra DNS records đã đúng chưa

### Lỗi: "Rate limit exceeded"

**Nguyên nhân:** Đã vượt quá giới hạn free tier (3,000 emails/tháng)

**Giải pháp:**
- Kiểm tra usage trong Resend dashboard
- Nâng cấp lên paid plan nếu cần
- Hoặc đợi đến tháng sau

## 🔄 Fallback về Mailgun hoặc SMTP

Nếu muốn dùng Mailgun thay vì Resend:

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

## 📊 So sánh Resend vs Mailgun vs SMTP

| Tính năng | Resend | Mailgun | SMTP |
|-----------|--------|---------|------|
| Render Free tier | ✅ Hoạt động | ✅ Hoạt động | ❌ Bị chặn |
| Render Paid | ✅ Hoạt động | ✅ Hoạt động | ✅ Hoạt động |
| Free tier | 3,000 emails/tháng | 5,000 emails/tháng | N/A |
| Setup | Rất đơn giản | Đơn giản | Phức tạp |
| API | REST API hiện đại | REST API | SMTP protocol |
| Deliverability | Cao | Cao | Trung bình |
| Developer Experience | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## 💡 Khuyến nghị

- **Free tier trên Render:** Dùng Resend (mặc định) hoặc Mailgun
- **Paid plan trên Render:** Có thể dùng Resend, Mailgun hoặc SMTP
- **Production:** Nên dùng Resend với custom domain để có deliverability tốt nhất
- **Test/Development:** Dùng `onboarding@resend.dev` để test nhanh

## 🎯 Tại sao chọn Resend?

1. **API đơn giản:** Chỉ cần 1 API key, không cần cấu hình phức tạp
2. **Developer-friendly:** Documentation rõ ràng, SDK tốt
3. **Deliverability cao:** Email ít bị vào spam
4. **Free tier đủ dùng:** 3,000 emails/tháng cho hầu hết ứng dụng
5. **Hiện đại:** API RESTful, dễ tích hợp

## 📚 Tài liệu tham khảo

- Resend Documentation: https://resend.com/docs
- Resend API Reference: https://resend.com/docs/api-reference/emails/send-email
- Resend Python SDK: https://resend.com/docs/send-with-python

## 🚀 Quick Start (Không cần domain!)

1. Đăng ký Resend: https://resend.com
2. Lấy API key từ dashboard (API Keys → Create API Key)
3. **QUAN TRỌNG:** Thêm vào Render với `onboarding@resend.dev`:
   ```env
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_your-api-key
   EMAIL_FROM=onboarding@resend.dev
   ```
4. Deploy lại - Xong! ✅

**⚠️ Lưu ý QUAN TRỌNG:** 
- ✅ **BẮT BUỘC** dùng `onboarding@resend.dev` để gửi đến email bất kỳ
- ❌ Nếu dùng email khác (ví dụ: email đã đăng ký), chỉ gửi được đến email đó
- ✅ KHÔNG cần verify domain nếu dùng `onboarding@resend.dev`
- ✅ KHÔNG cần mua domain riêng để bắt đầu
- ✅ Hoạt động ngay sau khi có API key

