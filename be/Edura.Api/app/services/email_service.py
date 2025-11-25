# app/services/email_service.py
import smtplib
import os
import traceback
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from dotenv import load_dotenv

load_dotenv()

# Cấu hình email từ biến môi trường
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USERNAME)

# Debug mode - nếu True thì chỉ in ra console thay vì gửi email thật
DEBUG_MODE = os.getenv("EMAIL_DEBUG_MODE", "false").lower() == "true"

def send_verification_code_email(to_email, verification_code):
    """
    Gửi email chứa mã xác thực đến người dùng.
    
    Args:
        to_email: Email người nhận
        verification_code: Mã xác thực 6 chữ số
    
    Returns:
        tuple: (success: bool, error_message: str)
    """
    # Kiểm tra cấu hình
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        error_msg = "SMTP_USERNAME hoặc SMTP_PASSWORD chưa được cấu hình trong file .env"
        print(f"❌ Lỗi cấu hình email: {error_msg}")
        return False, error_msg
    
    # Debug mode - chỉ in ra console
    if DEBUG_MODE:
        print(f"🔧 [DEBUG MODE] Mã xác thực cho {to_email}: {verification_code}")
        print(f"📧 [DEBUG MODE] Email sẽ được gửi từ {EMAIL_FROM} đến {to_email}")
        return True, None
    
    try:
        # Tạo message
        msg = MIMEMultipart()
        msg['From'] = formataddr(("Edura", EMAIL_FROM))
        msg['To'] = to_email
        msg['Subject'] = "Mã xác thực đặt lại mật khẩu - Edura"
        
        # Nội dung email
        body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #4CAF50;">Đặt lại mật khẩu Edura</h2>
              <p>Xin chào,</p>
              <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Edura của mình.</p>
              <p>Mã xác thực của bạn là:</p>
              <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                <h1 style="color: #4CAF50; font-size: 32px; margin: 0; letter-spacing: 5px;">{verification_code}</h1>
              </div>
              <p>Mã này sẽ hết hạn sau 10 phút.</p>
              <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
            </div>
          </body>
        </html>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        # Gửi email
        print(f"📧 Đang kết nối SMTP server: {SMTP_SERVER}:{SMTP_PORT}")
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
        
        print(f"🔐 Đang bật TLS...")
        server.starttls()
        
        print(f"🔑 Đang đăng nhập với username: {SMTP_USERNAME}")
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        
        print(f"📤 Đang gửi email đến {to_email}...")
        text = msg.as_string()
        server.sendmail(EMAIL_FROM, to_email, text)
        server.quit()
        
        print(f"✅ Email xác thực đã được gửi thành công đến {to_email}")
        return True, None
        
    except smtplib.SMTPAuthenticationError as e:
        error_msg = f"Lỗi xác thực SMTP: Sai username hoặc password. Kiểm tra lại SMTP_USERNAME và SMTP_PASSWORD trong file .env"
        print(f"❌ {error_msg}")
        print(f"Chi tiết lỗi: {str(e)}")
        return False, error_msg
        
    except smtplib.SMTPConnectError as e:
        error_msg = f"Không thể kết nối đến SMTP server {SMTP_SERVER}:{SMTP_PORT}. Kiểm tra lại SMTP_SERVER và SMTP_PORT trong file .env"
        print(f"❌ {error_msg}")
        print(f"Chi tiết lỗi: {str(e)}")
        return False, error_msg
        
    except smtplib.SMTPException as e:
        error_msg = f"Lỗi SMTP: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"Traceback: {traceback.format_exc()}")
        return False, error_msg
        
    except Exception as e:
        error_msg = f"Lỗi không xác định khi gửi email: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"Traceback: {traceback.format_exc()}")
        return False, error_msg

