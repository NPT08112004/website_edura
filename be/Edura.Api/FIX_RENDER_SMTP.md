# 🔧 Khắc phục lỗi "Network is unreachable" trên Render

## ⚠️ Vấn đề

Lỗi: `[Errno 101] Network is unreachable`

**Nguyên nhân:** Render chặn kết nối SMTP trực tiếp (port 587) để tránh spam.

## ✅ Giải pháp 1: Dùng SMTP_SSL (Port 465)

### Bước 1: Cập nhật Environment Variables trên Render

Vào **Render Dashboard** → **Environment**, cập nhật:

```env
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
```

**Thay đổi quan trọng:**
- `SMTP_PORT=465` (thay vì 587)
- Thêm `SMTP_USE_SSL=true` (mới)

### Bước 2: Deploy lại

Render sẽ tự động deploy lại sau khi save.

### Bước 3: Test

Gửi request forgot-password và kiểm tra logs.

---

## ✅ Giải pháp 2: Dùng Email Service API (Khuyến nghị)

Render thường chặn SMTP, nên tốt nhất là dùng email service API:

### Option A: SendGrid (Free tier: 100 emails/ngày)

1. **Đăng ký:** https://sendgrid.com
2. **Tạo API Key:**
   - Settings → API Keys → Create API Key
   - Copy API key

3. **Cập nhật code** để dùng SendGrid API (cần sửa `email_service.py`)

### Option B: Mailgun (Free tier: 5,000 emails/tháng)

1. **Đăng ký:** https://www.mailgun.com
2. **Lấy API key** từ dashboard
3. **Cập nhật code** để dùng Mailgun API

### Option C: AWS SES (Rất rẻ, $0.10/1000 emails)

1. **Setup AWS SES**
2. **Lấy credentials**
3. **Cập nhật code**

---

## ✅ Giải pháp 3: Bật Debug Mode (Test tạm thời)

Nếu chỉ cần test, bật debug mode:

```env
EMAIL_DEBUG_MODE=true
```

Mã xác thực sẽ hiển thị trong logs, không cần gửi email thật.

---

## 🔍 Kiểm tra

Sau khi cập nhật, xem logs:

1. Vào **Render Dashboard** → **Logs**
2. Tìm dòng: `📧 [STEP 1] Đang kết nối SMTP server: smtp.gmail.com:465 (SSL: True)`
3. Nếu thấy `✅ [STEP 1] Kết nối SMTP_SSL thành công` → Thành công!

---

## 📝 Checklist

- [ ] Đã đổi `SMTP_PORT=465`
- [ ] Đã thêm `SMTP_USE_SSL=true`
- [ ] Đã save và đợi deploy xong
- [ ] Đã test và xem logs
- [ ] Nếu vẫn lỗi → Xem xét dùng email service API

---

## 💡 Lưu ý

- **Port 465 với SSL** thường hoạt động tốt hơn trên Render
- Nếu vẫn không được, **email service API** là giải pháp tốt nhất
- **Debug mode** chỉ dùng để test, không dùng production

