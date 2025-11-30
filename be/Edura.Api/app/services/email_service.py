# app/services/email_service.py
import os
import traceback
import requests
from dotenv import load_dotenv

load_dotenv()

# Cấu hình Resend từ biến môi trường
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@example.com")

# Fallback: Cấu hình Mailgun (nếu không dùng Resend)
MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN")

# Fallback: Cấu hình SMTP cũ (nếu không dùng Resend/Mailgun)
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

# Debug mode - nếu True thì chỉ in ra console thay vì gửi email thật
DEBUG_MODE = os.getenv("EMAIL_DEBUG_MODE", "false").lower() == "true"

# Chọn phương thức gửi email: 'resend' (mặc định), 'mailgun', hoặc 'smtp'
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "resend").lower()

def send_verification_code_email(to_email, verification_code):
    """
    Gửi email chứa mã xác thực đến người dùng.
    Hỗ trợ Resend API (mặc định), Mailgun API, và SMTP (fallback).
    
    Args:
        to_email: Email người nhận
        verification_code: Mã xác thực 6 chữ số
    
    Returns:
        tuple: (success: bool, error_message: str)
    """
    # Debug mode - chỉ in ra console
    if DEBUG_MODE:
        print(f"🔧 [DEBUG MODE] Mã xác thực cho {to_email}: {verification_code}")
        print(f"📧 [DEBUG MODE] Email sẽ được gửi từ {EMAIL_FROM} đến {to_email}")
        return True, None
    
    # Chọn provider dựa trên EMAIL_PROVIDER
    if EMAIL_PROVIDER == "resend":
        return _send_via_resend(to_email, verification_code)
    elif EMAIL_PROVIDER == "mailgun":
        return _send_via_mailgun(to_email, verification_code)
    else:
        return _send_via_smtp(to_email, verification_code)


def _send_via_resend(to_email, verification_code):
    """
    Gửi email qua Resend API.
    
    Args:
        to_email: Email người nhận
        verification_code: Mã xác thực 6 chữ số
    
    Returns:
        tuple: (success: bool, error_message: str)
    """
    # Kiểm tra cấu hình Resend
    print(f"🔍 [DEBUG] Kiểm tra cấu hình Resend:")
    print(f"   - RESEND_API_KEY: {'SET' if RESEND_API_KEY else 'NOT SET'}")
    print(f"   - EMAIL_FROM: {EMAIL_FROM}")
    print(f"   - DEBUG_MODE: {DEBUG_MODE}")
    
    if not RESEND_API_KEY:
        error_msg = "RESEND_API_KEY chưa được cấu hình trong file .env"
        print(f"❌ Lỗi cấu hình Resend: {error_msg}")
        return False, error_msg
    
    try:
        # Nội dung email HTML
        html_body = f"""
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
        
        # Text version (fallback)
        text_body = f"""
Đặt lại mật khẩu Edura

Xin chào,

Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Edura của mình.

Mã xác thực của bạn là: {verification_code}

Mã này sẽ hết hạn sau 10 phút.

Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.

---
Email này được gửi tự động, vui lòng không trả lời.
        """
        
        # Chuẩn bị request
        api_url = "https://api.resend.com/emails"
        
        # Headers
        headers = {
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Payload
        payload = {
            "from": EMAIL_FROM,
            "to": [to_email],
            "subject": "Mã xác thực đặt lại mật khẩu - Edura",
            "html": html_body,
            "text": text_body
        }
        
        print(f"📧 [RESEND] Đang gửi email đến {to_email} qua Resend API...")
        print(f"   - API URL: {api_url}")
        print(f"   - From: {EMAIL_FROM}")
        
        # Gửi request
        response = requests.post(
            api_url,
            headers=headers,
            json=payload,
            timeout=10
        )
        
        # Kiểm tra response
        if response.status_code == 200:
            response_data = response.json()
            print(f"✅ [RESEND] Email đã được gửi thành công")
            print(f"   - Email ID: {response_data.get('id', 'N/A')}")
            return True, None
        else:
            # Parse error response để hiển thị message rõ ràng hơn
            try:
                error_data = response.json()
                error_message = error_data.get('message', '')
                
                # Xử lý lỗi 403 - Test mode restriction
                if response.status_code == 403 and 'testing emails' in error_message.lower():
                    detailed_error = (
                        f"Resend API lỗi 403: Bạn đang ở chế độ Test Mode. "
                        f"Resend chỉ cho phép gửi đến email đã đăng ký tài khoản. "
                        f"Giải pháp: Đổi EMAIL_FROM thành 'onboarding@resend.dev' để gửi đến email bất kỳ. "
                        f"Chi tiết: {error_message}"
                    )
                    print(f"❌ [RESEND] {detailed_error}")
                    return False, detailed_error
                
                # Lỗi khác
                error_msg = f"Resend API trả về lỗi {response.status_code}: {error_message or response.text}"
                print(f"❌ [RESEND] {error_msg}")
                return False, error_msg
            except:
                # Nếu không parse được JSON
                error_msg = f"Resend API trả về lỗi {response.status_code}: {response.text}"
                print(f"❌ [RESEND] {error_msg}")
                return False, error_msg
            
    except requests.exceptions.RequestException as e:
        error_msg = f"Lỗi kết nối đến Resend API: {str(e)}"
        print(f"❌ [RESEND] {error_msg}")
        print(f"   Traceback: {traceback.format_exc()}")
        return False, error_msg
    except Exception as e:
        error_msg = f"Lỗi không xác định khi gửi email qua Resend: {str(e)}"
        print(f"❌ [RESEND] {error_msg}")
        print(f"   Traceback: {traceback.format_exc()}")
        return False, error_msg


def _send_via_mailgun(to_email, verification_code):
    """
    Gửi email qua Mailgun API.
    
    Args:
        to_email: Email người nhận
        verification_code: Mã xác thực 6 chữ số
    
    Returns:
        tuple: (success: bool, error_message: str)
    """
    # Kiểm tra cấu hình Mailgun
    print(f"🔍 [DEBUG] Kiểm tra cấu hình Mailgun:")
    print(f"   - MAILGUN_API_KEY: {'SET' if MAILGUN_API_KEY else 'NOT SET'}")
    print(f"   - MAILGUN_DOMAIN: {MAILGUN_DOMAIN if MAILGUN_DOMAIN else 'NOT SET'}")
    print(f"   - EMAIL_FROM: {EMAIL_FROM}")
    print(f"   - DEBUG_MODE: {DEBUG_MODE}")
    
    if not MAILGUN_API_KEY or not MAILGUN_DOMAIN:
        error_msg = "MAILGUN_API_KEY hoặc MAILGUN_DOMAIN chưa được cấu hình trong file .env"
        print(f"❌ Lỗi cấu hình Mailgun: {error_msg}")
        return False, error_msg
    
    try:
        # Nội dung email HTML
        html_body = f"""
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
        
        # Text version (fallback)
        text_body = f"""
Đặt lại mật khẩu Edura

Xin chào,

Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Edura của mình.

Mã xác thực của bạn là: {verification_code}

Mã này sẽ hết hạn sau 10 phút.

Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.

---
Email này được gửi tự động, vui lòng không trả lời.
        """
        
        # Chuẩn bị request
        api_url = f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages"
        
        # Authentication: Basic Auth với api:key
        auth = ("api", MAILGUN_API_KEY)
        
        # Data payload
        data = {
            "from": f"Edura <{EMAIL_FROM}>",
            "to": to_email,
            "subject": "Mã xác thực đặt lại mật khẩu - Edura",
            "text": text_body,
            "html": html_body
        }
        
        print(f"📧 [MAILGUN] Đang gửi email đến {to_email} qua Mailgun API...")
        print(f"   - API URL: {api_url}")
        print(f"   - From: {EMAIL_FROM}")
        
        # Gửi request
        response = requests.post(
            api_url,
            auth=auth,
            data=data,
            timeout=10
        )
        
        # Kiểm tra response
        if response.status_code == 200:
            print(f"✅ [MAILGUN] Email đã được gửi thành công")
            print(f"   - Message ID: {response.json().get('id', 'N/A')}")
            return True, None
        else:
            error_msg = f"Mailgun API trả về lỗi {response.status_code}: {response.text}"
            print(f"❌ [MAILGUN] {error_msg}")
            return False, error_msg
            
    except requests.exceptions.RequestException as e:
        error_msg = f"Lỗi kết nối đến Mailgun API: {str(e)}"
        print(f"❌ [MAILGUN] {error_msg}")
        print(f"   Traceback: {traceback.format_exc()}")
        return False, error_msg
    except Exception as e:
        error_msg = f"Lỗi không xác định khi gửi email qua Mailgun: {str(e)}"
        print(f"❌ [MAILGUN] {error_msg}")
        print(f"   Traceback: {traceback.format_exc()}")
        return False, error_msg


def _send_via_smtp(to_email, verification_code):
    """
    Gửi email qua SMTP (fallback method).
    
    Args:
        to_email: Email người nhận
        verification_code: Mã xác thực 6 chữ số
    
    Returns:
        tuple: (success: bool, error_message: str)
    """
    import smtplib
    import ssl
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from email.utils import formataddr
    
    # Kiểm tra cấu hình
    print(f"🔍 [DEBUG] Kiểm tra cấu hình SMTP:")
    print(f"   - SMTP_SERVER: {SMTP_SERVER}")
    print(f"   - SMTP_PORT: {SMTP_PORT}")
    print(f"   - SMTP_USERNAME: {SMTP_USERNAME if SMTP_USERNAME else 'NOT SET'}")
    print(f"   - SMTP_PASSWORD: {'SET' if SMTP_PASSWORD else 'NOT SET'} (length: {len(SMTP_PASSWORD) if SMTP_PASSWORD else 0})")
    print(f"   - EMAIL_FROM: {EMAIL_FROM}")
    print(f"   - DEBUG_MODE: {DEBUG_MODE}")
    
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        error_msg = "SMTP_USERNAME hoặc SMTP_PASSWORD chưa được cấu hình trong file .env"
        print(f"❌ Lỗi cấu hình email: {error_msg}")
        return False, error_msg
    
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
        print(f"📧 [STEP 1] Đang kết nối SMTP server: {SMTP_SERVER}:{SMTP_PORT} (SSL: {SMTP_USE_SSL})")
        try:
            if SMTP_USE_SSL:
                # Dùng SMTP_SSL cho port 465 (Render thường cần SSL thay vì TLS)
                print(f"   Sử dụng SMTP_SSL (port 465)...")
                context = ssl.create_default_context()
                server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=10, context=context)
                print(f"✅ [STEP 1] Kết nối SMTP_SSL thành công")
            else:
                # Dùng SMTP thường rồi bật TLS cho port 587
                server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
                print(f"✅ [STEP 1] Kết nối SMTP thành công")
        except Exception as e:
            error_msg = f"Không thể kết nối đến SMTP server {SMTP_SERVER}:{SMTP_PORT}. Lỗi: {str(e)}"
            print(f"❌ [STEP 1] {error_msg}")
            print(f"   💡 Gợi ý: Render có thể chặn kết nối SMTP. Thử:")
            print(f"      1. Dùng SMTP_USE_SSL=true với port 465")
            print(f"      2. Hoặc dùng email service API (SendGrid, Mailgun) thay vì SMTP trực tiếp")
            print(f"   Traceback: {traceback.format_exc()}")
            raise
        
        if not SMTP_USE_SSL:
            print(f"🔐 [STEP 2] Đang bật TLS...")
            try:
                server.starttls()
                print(f"✅ [STEP 2] TLS đã được bật")
            except Exception as e:
                error_msg = f"Không thể bật TLS. Lỗi: {str(e)}"
                print(f"❌ [STEP 2] {error_msg}")
                print(f"   Traceback: {traceback.format_exc()}")
                server.quit()
                raise
        else:
            print(f"✅ [STEP 2] SSL đã được bật (không cần TLS)")
        
        print(f"🔑 [STEP 3] Đang đăng nhập với username: {SMTP_USERNAME}")
        print(f"   Password length: {len(SMTP_PASSWORD)} ký tự")
        try:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            print(f"✅ [STEP 3] Đăng nhập thành công")
        except smtplib.SMTPAuthenticationError as e:
            error_msg = f"Lỗi xác thực SMTP: Sai username hoặc password. Chi tiết: {str(e)}"
            print(f"❌ [STEP 3] {error_msg}")
            print(f"   💡 Gợi ý: Đảm bảo dùng App Password (16 ký tự), không phải mật khẩu Gmail thường")
            server.quit()
            raise
        except Exception as e:
            error_msg = f"Lỗi khi đăng nhập SMTP: {str(e)}"
            print(f"❌ [STEP 3] {error_msg}")
            print(f"   Traceback: {traceback.format_exc()}")
            server.quit()
            raise
        
        print(f"📤 [STEP 4] Đang gửi email đến {to_email}...")
        try:
            text = msg.as_string()
            server.sendmail(EMAIL_FROM, to_email, text)
            print(f"✅ [STEP 4] Email đã được gửi")
        except Exception as e:
            error_msg = f"Lỗi khi gửi email: {str(e)}"
            print(f"❌ [STEP 4] {error_msg}")
            print(f"   Traceback: {traceback.format_exc()}")
            server.quit()
            raise
        
        server.quit()
        print(f"✅ Email xác thực đã được gửi thành công đến {to_email}")
        return True, None
        
    except smtplib.SMTPAuthenticationError as e:
        error_msg = f"Lỗi xác thực SMTP: Sai username hoặc password. Chi tiết: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"   Error code: {e.smtp_code if hasattr(e, 'smtp_code') else 'N/A'}")
        print(f"   Error message: {e.smtp_error if hasattr(e, 'smtp_error') else str(e)}")
        print(f"   Full traceback: {traceback.format_exc()}")
        return False, error_msg
        
    except smtplib.SMTPConnectError as e:
        error_msg = f"Không thể kết nối đến SMTP server {SMTP_SERVER}:{SMTP_PORT}. Lỗi: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"   Full traceback: {traceback.format_exc()}")
        return False, error_msg
        
    except smtplib.SMTPException as e:
        error_msg = f"Lỗi SMTP: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"   Error type: {type(e).__name__}")
        print(f"   Full traceback: {traceback.format_exc()}")
        return False, error_msg
        
    except Exception as e:
        error_msg = f"Lỗi không xác định khi gửi email: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"   Error type: {type(e).__name__}")
        print(f"   Full traceback: {traceback.format_exc()}")
        return False, error_msg

