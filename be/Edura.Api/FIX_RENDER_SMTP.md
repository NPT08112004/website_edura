# 🔧 Khắc phục lỗi "Network is unreachable" trên Render

## ⚠️ Vấn đề

Lỗi: `[Errno 101] Network is unreachable`

**Nguyên nhân:** Render **chặn toàn bộ outbound SMTP ports** trên **Free tier**:
- **Port 25** (SMTP)
- **Port 465** (SMTPS/SSL)
- **Port 587** (SMTP/TLS)

**Thời gian áp dụng:** Từ ngày **26 tháng 9 năm 2025** trên tất cả các khu vực.

**Lưu ý quan trọng:**
- ✅ **Free tier**: Bị chặn hoàn toàn
- ✅ **Paid plans**: **KHÔNG bị chặn** - vẫn cho phép SMTP bình thường

## ✅ Giải pháp 1: Nâng cấp lên Paid Plan (Khuyến nghị nhất)

**Nếu bạn đang dùng Free tier**, cách đơn giản nhất là nâng cấp lên bất kỳ gói trả phí nào:
- Starter Plan ($7/tháng)
- Standard Plan ($25/tháng)
- Pro Plan ($85/tháng)

Sau khi nâng cấp, **tất cả SMTP ports (25, 465, 587) sẽ hoạt động bình thường**.

---

## ✅ Giải pháp 2: Dùng SMTP_SSL (Port 465) - CHỈ ÁP DỤNG CHO PAID PLANS

⚠️ **Lưu ý:** Giải pháp này **KHÔNG hoạt động** trên Free tier vì port 465 cũng bị chặn.

Nếu bạn đã có paid plan, có thể dùng:

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

## ✅ Giải pháp 3: Dùng SendGrid.com API (ĐÃ TÍCH HỢP SẴN - Mặc định - Khuyến nghị)

✅ **Hệ thống đã được tích hợp SendGrid.com API sẵn và là mặc định!** Chỉ cần cấu hình environment variables.

### Cấu hình SendGrid (5 phút)

1. **Đăng ký SendGrid:** https://sendgrid.com (Free tier: 100 emails/ngày)

2. **Verify Sender Identity:**
   - Vào **Settings** → **Sender Authentication** → **Single Sender Verification**
   - Tạo và verify email của bạn (có thể dùng email cá nhân)

3. **Tạo API Key:**
   - Vào **Settings** → **API Keys** → **Create API Key**
   - Copy API key (bắt đầu bằng `SG.`)

4. **Cấu hình trên Render:**
   ```env
   EMAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=SG_your-api-key-here
   EMAIL_FROM=your-verified-email@example.com
   ```

5. **Deploy lại** - Xong! ✅

📖 **Xem hướng dẫn chi tiết:** `SENDGRID_SETUP.md`

### Option khác: Resend.com API (ĐÃ TÍCH HỢP SẴN)

Nếu muốn dùng Resend thay vì SendGrid:

1. **Đăng ký Resend:** https://resend.com (Free tier: 3,000 emails/tháng)

2. **Lấy API Key:**
   - Vào dashboard → **API Keys** → **Create API Key**
   - Copy API key (bắt đầu bằng `re_`)

3. **Cấu hình trên Render:**
   ```env
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_your-api-key-here
   EMAIL_FROM=onboarding@resend.dev
   ```

📖 **Xem hướng dẫn chi tiết:** `RESEND_SETUP.md`

### Option khác: Mailgun API (ĐÃ TÍCH HỢP SẴN)

Nếu muốn dùng Mailgun thay vì Resend:

1. **Đăng ký Mailgun:** https://www.mailgun.com (Free tier: 5,000 emails/tháng)

2. **Lấy thông tin:**
   - Vào **Settings** → **API Keys** → Copy Private API key
   - Vào **Sending** → **Domains** → Copy domain (sandbox hoặc custom)

3. **Cấu hình trên Render:**
   ```env
   EMAIL_PROVIDER=mailgun
   MAILGUN_API_KEY=key-your-api-key-here
   MAILGUN_DOMAIN=sandbox1234567890abcdef.mailgun.org
   EMAIL_FROM=noreply@sandbox1234567890abcdef.mailgun.org
   ```

📖 **Xem hướng dẫn chi tiết:** `MAILGUN_SETUP.md`

### Option khác: SendGrid (Free tier: 100 emails/ngày)

Nếu muốn dùng SendGrid, cần cập nhật code trong `email_service.py`:

1. **Đăng ký:** https://sendgrid.com
2. **Tạo API Key:**
   - Settings → API Keys → Create API Key
   - Copy API key

3. **Cập nhật code** để dùng SendGrid API

### Option khác: AWS SES (Rất rẻ, $0.10/1000 emails)

1. **Setup AWS SES**
2. **Lấy credentials**
3. **Cập nhật code** trong `email_service.py`

---

## ✅ Giải pháp 4: Bật Debug Mode (Test tạm thời)

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

### Tóm tắt các giải pháp:

1. **Free tier:**
   - ❌ Không thể dùng SMTP trực tiếp (ports 25, 465, 587 đều bị chặn)
   - ✅ **BẮT BUỘC** phải dùng Email Service API
   - ✅ **Khuyến nghị:** Resend.com (mặc định, setup nhanh nhất)
   - ✅ **Option khác:** Mailgun (5,000 emails/tháng free)
   - ✅ Hoặc nâng cấp lên paid plan

2. **Paid plans:**
   - ✅ Có thể dùng SMTP trực tiếp (ports 25, 465, 587 đều hoạt động)
   - ✅ Port 465 với SSL thường hoạt động tốt nhất
   - ✅ Hoặc vẫn có thể dùng Email Service API (Resend/Mailgun)

3. **Debug mode:**
   - Chỉ dùng để test, không dùng production

### Khuyến nghị:

- **Nếu đang dùng Free tier:** 
  - ✅ **SendGrid.com** (mặc định, 100 emails/ngày, đáng tin cậy nhất)
  - ✅ **Resend.com** (3,000 emails/tháng, setup nhanh nhất)
  - ✅ **Mailgun** (5,000 emails/tháng, nhiều nhất)
- **Nếu có ngân sách:** 
  - Nâng cấp lên Starter Plan ($7/tháng) để dùng SMTP trực tiếp
  - Hoặc tiếp tục dùng SendGrid/Resend/Mailgun (đơn giản hơn)

