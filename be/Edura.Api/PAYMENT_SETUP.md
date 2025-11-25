# Hướng dẫn cấu hình Payment Gateway (Momo & VietQR)

## Cấu hình biến môi trường

Thêm các biến sau vào file `.env` trong thư mục `Edura.Api`:

### Momo Payment Gateway

```env
# Momo Payment Gateway Config
MOMO_PARTNER_CODE=your_partner_code
MOMO_ACCESS_KEY=your_access_key
MOMO_SECRET_KEY=your_secret_key
MOMO_ENVIRONMENT=sandbox  # sandbox hoặc production
```

### VietQR (Banking)

```env
# VietQR Config
VIETQR_CLIENT_ID=your_client_id
VIETQR_API_KEY=your_api_key
VIETQR_ACCOUNT_NO=your_account_number
VIETQR_ACCOUNT_NAME=EDURA COMPANY
VIETQR_ACQ_ID=970415  # Mã ngân hàng (970415 = Vietcombank)
```

### Webhook URL

```env
# Base URL cho webhook (cần public URL để Momo/VietQR gọi được)
WEBHOOK_BASE_URL=https://your-domain.com
# Hoặc dùng ngrok cho development:
# WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io
```

## Đăng ký Momo Payment Gateway

1. **Đăng ký tài khoản Merchant:**
   - Truy cập: https://developers.momo.vn/
   - Đăng ký tài khoản doanh nghiệp
   - Hoàn tất xác thực doanh nghiệp

2. **Lấy thông tin API:**
   - Vào Dashboard → API Integration
   - Copy `Partner Code`, `Access Key`, `Secret Key`
   - Dán vào file `.env`

3. **Cấu hình Webhook:**
   - Trong Momo Dashboard, cấu hình IPN URL: `https://your-domain.com/api/payments/momo/webhook`
   - Webhook này sẽ nhận callback khi thanh toán hoàn tất

## Đăng ký VietQR

1. **Đăng ký tài khoản:**
   - Truy cập: https://www.vietqr.io/
   - Đăng ký tài khoản và xác thực

2. **Lấy thông tin API:**
   - Vào Dashboard → API Keys
   - Copy `Client ID` và `API Key`
   - Dán vào file `.env`

3. **Cấu hình tài khoản ngân hàng:**
   - Thêm số tài khoản ngân hàng của bạn
   - Chọn ngân hàng (ACQ ID):
     - 970415: Vietcombank
     - 970436: Techcombank
     - 970422: Vietinbank
     - ... (xem danh sách đầy đủ tại VietQR)

4. **Cấu hình Webhook:**
   - Trong VietQR Dashboard, cấu hình webhook URL: `https://your-domain.com/api/payments/vietqr/webhook`
   - Hoặc sử dụng Transaction Sync API để đồng bộ giao dịch

## Testing với Ngrok (Development)

Để test webhook trong môi trường development:

1. **Cài đặt Ngrok:**
   ```bash
   # Download từ https://ngrok.com/
   # Hoặc: npm install -g ngrok
   ```

2. **Chạy Ngrok:**
   ```bash
   ngrok http 5000
   ```

3. **Cập nhật .env:**
   ```env
   WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io
   ```

4. **Cấu hình webhook trong Momo/VietQR dashboard:**
   - Sử dụng URL từ Ngrok: `https://your-ngrok-url.ngrok.io/api/payments/momo/webhook`

## Flow thanh toán

### Momo:
1. User chọn số tiền → Frontend gọi `/api/payments/create-payment` với `method: "momo"`
2. Backend tạo payment request với Momo API → Trả về `paymentUrl` và `qrCodeUrl`
3. User quét QR hoặc mở `paymentUrl` → Thanh toán trong MoMo App
4. Momo gọi webhook `/api/payments/momo/webhook` → Backend tự động cộng điểm
5. Frontend polling `/api/payments/check-payment/{orderId}` → Hiển thị kết quả

### Banking (VietQR):
1. User chọn số tiền → Frontend gọi `/api/payments/create-payment` với `method: "banking"`
2. Backend tạo QR code với VietQR API → Trả về `qrCodeUrl` và thông tin tài khoản
3. User quét QR bằng app ngân hàng → Chuyển khoản
4. VietQR gọi webhook `/api/payments/vietqr/webhook` → Backend tự động cộng điểm
5. Frontend polling `/api/payments/check-payment/{orderId}` → Hiển thị kết quả

## Kiểm tra

1. Khởi động lại server Flask
2. Thử tạo payment request từ frontend
3. Kiểm tra console log để xem chi tiết:
   - ✅ Nếu thành công: "Payment request created successfully"
   - ❌ Nếu lỗi: Sẽ hiển thị chi tiết lỗi cụ thể

## Lưu ý bảo mật

- **KHÔNG commit file `.env` lên Git**
- Giữ `SECRET_KEY` và `API_KEY` bí mật
- Sử dụng HTTPS cho webhook URL trong production
- Xác minh signature trong webhook để tránh fake requests

## Troubleshooting

### Lỗi: "Momo credentials chưa được cấu hình"
- Kiểm tra file `.env` có đầy đủ `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`

### Lỗi: "Invalid signature" từ Momo
- Kiểm tra lại `MOMO_SECRET_KEY` có đúng không
- Đảm bảo thứ tự các tham số trong signature đúng

### Webhook không nhận được callback
- Kiểm tra `WEBHOOK_BASE_URL` có đúng và public không
- Kiểm tra firewall/network có chặn không
- Với development, dùng Ngrok để expose local server

### QR code không hiển thị
- Kiểm tra API response có `qrCodeUrl` không
- Kiểm tra CORS nếu load từ domain khác

