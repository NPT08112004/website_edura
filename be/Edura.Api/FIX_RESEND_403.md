# 🔧 Khắc phục lỗi 403 Resend: "You can only send testing emails"

## ⚠️ Vấn đề

Lỗi khi gửi email reset password:
```
Resend API trả về lỗi 403: You can only send testing emails to your own email address (xxx@gmail.com). 
To send emails to other recipients, please verify a domain at resend.com/domains
```

## 🔍 Nguyên nhân

Resend có 2 chế độ:

1. **Test Mode (Mặc định khi mới đăng ký):**
   - Chỉ gửi được đến email đã đăng ký tài khoản Resend
   - Không thể gửi đến email khác
   - Lỗi 403 nếu cố gửi đến email khác

2. **Production Mode (Sau khi verify domain):**
   - Có thể gửi đến bất kỳ email nào
   - Cần verify domain riêng

## ✅ Giải pháp NGAY LẬP TỨC (1 phút)

### Bước 1: Cập nhật Environment Variable

Vào **Render Dashboard** → **Environment**, cập nhật:

```env
EMAIL_FROM=onboarding@resend.dev
```

**QUAN TRỌNG:** 
- ✅ Phải là `onboarding@resend.dev` (chính xác)
- ❌ KHÔNG dùng email khác nếu chưa verify domain

### Bước 2: Deploy lại

Render sẽ tự động deploy lại sau khi save.

### Bước 3: Test lại

Gửi request forgot-password và kiểm tra logs:
- Tìm `✅ [RESEND] Email đã được gửi thành công`
- Kiểm tra email inbox

## 🎯 Tại sao `onboarding@resend.dev` hoạt động?

- ✅ Resend cho phép gửi từ `onboarding@resend.dev` đến bất kỳ email nào
- ✅ Không cần verify domain
- ✅ Hoạt động ngay sau khi có API key
- ✅ Đủ dùng cho test và development

## 📋 Cấu hình đầy đủ

```env
# Resend Configuration
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your-api-key-here
EMAIL_FROM=onboarding@resend.dev
```

## 🔄 Giải pháp lâu dài (Production)

Nếu muốn dùng email chuyên nghiệp hơn:

1. **Mua domain riêng** (ví dụ: `yourdomain.com`)
2. **Verify domain trong Resend:**
   - Vào Resend Dashboard → Domains → Add Domain
   - Thêm DNS records theo hướng dẫn
3. **Cập nhật EMAIL_FROM:**
   ```env
   EMAIL_FROM=noreply@yourdomain.com
   ```

## ✅ Checklist

- [ ] Đã đổi `EMAIL_FROM=onboarding@resend.dev`
- [ ] Đã save và đợi deploy xong
- [ ] Đã test và xem logs
- [ ] Email đã được gửi thành công

## 💡 Lưu ý

- **Test/Development:** Dùng `onboarding@resend.dev` là đủ
- **Production:** Nên verify domain riêng để có email chuyên nghiệp hơn
- **Free tier:** `onboarding@resend.dev` hoạt động tốt, không cần mua domain

