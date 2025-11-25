# app/services/payment_service.py
import os
import hmac
import hashlib
import json
import requests
import uuid
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# Momo Payment Gateway Config
MOMO_PARTNER_CODE = os.getenv("MOMO_PARTNER_CODE")
MOMO_ACCESS_KEY = os.getenv("MOMO_ACCESS_KEY")
MOMO_SECRET_KEY = os.getenv("MOMO_SECRET_KEY")
MOMO_ENVIRONMENT = os.getenv("MOMO_ENVIRONMENT", "sandbox")  # sandbox or production

# VietQR Config
VIETQR_CLIENT_ID = os.getenv("VIETQR_CLIENT_ID")
VIETQR_API_KEY = os.getenv("VIETQR_API_KEY")
VIETQR_ACCOUNT_NO = os.getenv("VIETQR_ACCOUNT_NO")
VIETQR_ACCOUNT_NAME = os.getenv("VIETQR_ACCOUNT_NAME", "EDURA COMPANY")
VIETQR_ACQ_ID = os.getenv("VIETQR_ACQ_ID", "970415")  # Vietcombank

# Base URL for webhook
WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL", "http://localhost:5000")


class MomoPaymentService:
    """Service để tích hợp với Momo Payment Gateway - Viết lại theo format chính thức"""
    
    def __init__(self):
        if MOMO_ENVIRONMENT == "production":
            self.endpoint = "https://payment.momo.vn/v2/gateway/api/create"
            self.query_endpoint = "https://payment.momo.vn/v2/gateway/api/query"
            self.webhook_url = f"{WEBHOOK_BASE_URL}/api/payments/momo/webhook"
        else:
            self.endpoint = "https://test-payment.momo.vn/v2/gateway/api/create"
            self.query_endpoint = "https://test-payment.momo.vn/v2/gateway/api/query"
            self.webhook_url = f"{WEBHOOK_BASE_URL}/api/payments/momo/webhook"
    
    def create_payment_request(self, order_id: str, amount: int, order_info: str, return_url: str = None):
        """
        Tạo payment request với Momo - Viết lại theo format chính thức từ MoMo API
        
        Args:
            order_id: Mã đơn hàng duy nhất
            amount: Số tiền (VNĐ)
            order_info: Thông tin đơn hàng (nên dùng tiếng Anh hoặc không dấu để tránh lỗi encoding)
            return_url: URL để redirect sau khi thanh toán (optional)
        
        Returns:
            dict: Chứa payment_url và qr_code_url
        """
        if not MOMO_PARTNER_CODE or not MOMO_ACCESS_KEY or not MOMO_SECRET_KEY:
            raise ValueError("Momo credentials chưa được cấu hình trong .env")
        
        # Parameters theo format của MoMo API
        partner_code = MOMO_PARTNER_CODE
        access_key = MOMO_ACCESS_KEY
        secret_key = MOMO_SECRET_KEY
        redirect_url = return_url or self.webhook_url
        ipn_url = self.webhook_url
        amount_str = str(amount)  # MoMo yêu cầu amount là string
        request_id = str(uuid.uuid4())
        request_type = "captureWallet"
        extra_data = ""  # pass empty value
        
        # Tạo raw signature theo đúng format của MoMo
        # Format: accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl
        # &orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode&redirectUrl=$redirectUrl
        # &requestId=$requestId&requestType=$requestType
        raw_signature = (
            f"accessKey={access_key}&"
            f"amount={amount_str}&"
            f"extraData={extra_data}&"
            f"ipnUrl={ipn_url}&"
            f"orderId={order_id}&"
            f"orderInfo={order_info}&"
            f"partnerCode={partner_code}&"
            f"redirectUrl={redirect_url}&"
            f"requestId={request_id}&"
            f"requestType={request_type}"
        )
        
        # Tạo signature bằng HMAC SHA256
        # Dùng ascii encoding như trong ví dụ chính thức
        # Nếu order_info có ký tự đặc biệt, cần xử lý trước
        try:
            signature = hmac.new(
                bytes(secret_key, 'ascii'),
                bytes(raw_signature, 'ascii'),
                hashlib.sha256
            ).hexdigest()
        except UnicodeEncodeError:
            # Nếu có ký tự không phải ASCII trong raw_signature, thử dùng utf-8
            signature = hmac.new(
                bytes(secret_key, 'utf-8'),
                bytes(raw_signature, 'utf-8'),
                hashlib.sha256
            ).hexdigest()
        
        # JSON object send to MoMo endpoint (theo đúng format ví dụ)
        request_body = {
            'partnerCode': partner_code,
            'partnerName': "Edura",
            'storeId': "EduraStore",
            'requestId': request_id,
            'amount': amount_str,
            'orderId': order_id,
            'orderInfo': order_info,
            'redirectUrl': redirect_url,
            'ipnUrl': ipn_url,
            'lang': "vi",
            'extraData': extra_data,
            'requestType': request_type,
            'signature': signature
        }
        
        try:
            # Convert to JSON string để set Content-Length header
            data = json.dumps(request_body)
            content_length = len(data)
            
            # Debug: In raw signature và request body (ẩn sensitive data)
            print(f"[MOMO DEBUG] Raw signature: {raw_signature[:100]}...")
            print(f"[MOMO DEBUG] Request to: {self.endpoint}")
            print(f"[MOMO DEBUG] Order ID: {order_id}, Amount: {amount_str}")
            
            # Gửi request đến MoMo endpoint
            response = requests.post(
                self.endpoint,
                data=data,
                headers={
                    'Content-Type': 'application/json',
                    'Content-Length': str(content_length)
                },
                timeout=10
            )
            
            # Debug response status
            print(f"[MOMO DEBUG] Response status: {response.status_code}")
            
            response.raise_for_status()
            result = response.json()
            
            # Debug full response
            print(f"[MOMO DEBUG] Full response: {json.dumps(result, indent=2)}")
            
            # Kiểm tra resultCode (0 = thành công)
            result_code = result.get("resultCode")
            if result_code == 0:
                pay_url = result.get("payUrl")
                qr_code_url = result.get("qrCodeUrl") or result.get("qrCode") or pay_url
                
                print(f"[MOMO SUCCESS] payUrl: {pay_url}")
                print(f"[MOMO SUCCESS] qrCodeUrl: {qr_code_url}")
                
                if not qr_code_url:
                    print("[MOMO WARNING] Không có qrCodeUrl trong response, dùng payUrl")
                    qr_code_url = pay_url
                
                return {
                    "success": True,
                    "payment_url": pay_url,
                    "qr_code_url": qr_code_url,
                    "order_id": order_id,
                    "request_id": request_id
                }
            else:
                error_msg = result.get("message", "Lỗi không xác định từ Momo")
                print(f"[MOMO ERROR] resultCode: {result_code}, message: {error_msg}")
                print(f"[MOMO ERROR] Full error response: {json.dumps(result, indent=2)}")
                return {
                    "success": False,
                    "error": error_msg,
                    "result_code": result_code,
                    "full_response": result  # Trả về full response để debug
                }
        except requests.exceptions.RequestException as e:
            print(f"[MOMO ERROR] Request exception: {str(e)}")
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_response = e.response.json()
                    print(f"[MOMO ERROR] Error response: {json.dumps(error_response, indent=2)}")
                except:
                    print(f"[MOMO ERROR] Error response text: {e.response.text}")
            return {
                "success": False,
                "error": f"Lỗi kết nối đến MoMo API: {str(e)}"
            }
        except Exception as e:
            print(f"[MOMO ERROR] Unexpected error: {str(e)}")
            import traceback
            print(f"[MOMO ERROR] Traceback: {traceback.format_exc()}")
            return {
                "success": False,
                "error": f"Lỗi khi gọi Momo API: {str(e)}"
            }

    def query_payment_status(self, order_id: str, request_id: str):
        """
        Gọi API query của MoMo để lấy trạng thái giao dịch

        Returns:
            dict: success/resultCode/message/transId/amount/raw
        """
        if not MOMO_PARTNER_CODE or not MOMO_ACCESS_KEY or not MOMO_SECRET_KEY:
            raise ValueError("Momo credentials chưa được cấu hình trong .env")

        if not order_id or not request_id:
            raise ValueError("order_id và request_id là bắt buộc để query trạng thái")

        partner_code = MOMO_PARTNER_CODE
        access_key = MOMO_ACCESS_KEY
        secret_key = MOMO_SECRET_KEY

        raw_signature = (
            f"accessKey={access_key}&"
            f"orderId={order_id}&"
            f"partnerCode={partner_code}&"
            f"requestId={request_id}"
        )

        signature = hmac.new(
            bytes(secret_key, "utf-8"),
            bytes(raw_signature, "utf-8"),
            hashlib.sha256
        ).hexdigest()

        payload = {
            "partnerCode": partner_code,
            "requestId": request_id,
            "orderId": order_id,
            "signature": signature,
            "lang": "vi"
        }

        try:
            print(f"[MOMO QUERY] Querying status for order {order_id} (requestId={request_id})")
            response = requests.post(
                self.query_endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            print(f"[MOMO QUERY] Response status: {response.status_code}")
            response.raise_for_status()
            result = response.json()
            print(f"[MOMO QUERY] Full response: {json.dumps(result, indent=2)}")

            amount = result.get("amount")
            try:
                amount = int(amount)
            except (TypeError, ValueError):
                amount = None

            query_data = {
                "success": result.get("resultCode") == 0,
                "resultCode": result.get("resultCode"),
                "message": result.get("message"),
                "transId": result.get("transId"),
                "amount": amount,
                "payType": result.get("payType"),
                "extraData": result.get("extraData"),
                "raw": result
            }
            return query_data
        except requests.exceptions.RequestException as e:
            print(f"[MOMO QUERY ERROR] Request exception: {str(e)}")
            if hasattr(e, "response") and e.response is not None:
                try:
                    print(f"[MOMO QUERY ERROR] Body: {e.response.json()}")
                except Exception:
                    print(f"[MOMO QUERY ERROR] Body text: {e.response.text}")
            return {
                "success": False,
                "message": f"Request exception: {str(e)}"
            }
        except Exception as e:
            print(f"[MOMO QUERY ERROR] Unexpected: {str(e)}")
            import traceback
            print(traceback.format_exc())
            return {
                "success": False,
                "message": str(e)
            }
    
    def verify_webhook(self, data: dict):
        """
        Xác minh webhook từ Momo
        
        Args:
            data: Dữ liệu từ webhook
        
        Returns:
            bool: True nếu hợp lệ
        """
        try:
            signature = data.get("signature", "")
            # Tạo raw signature theo format của Momo webhook
            raw_signature = (
                f"accessKey={data.get('accessKey', '')}&"
                f"amount={data.get('amount', 0)}&"
                f"extraData={data.get('extraData', '')}&"
                f"message={data.get('message', '')}&"
                f"orderId={data.get('orderId', '')}&"
                f"orderInfo={data.get('orderInfo', '')}&"
                f"orderType={data.get('orderType', '')}&"
                f"partnerCode={data.get('partnerCode', '')}&"
                f"payType={data.get('payType', '')}&"
                f"requestId={data.get('requestId', '')}&"
                f"responseTime={data.get('responseTime', '')}&"
                f"resultCode={data.get('resultCode', '')}&"
                f"transId={data.get('transId', '')}"
            )
            
            expected_signature = hmac.new(
                MOMO_SECRET_KEY.encode('utf-8'),
                raw_signature.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            
            return hmac.compare_digest(signature, expected_signature)
        except Exception as e:
            print(f"[ERROR] verify_webhook: {e}")
            return False


class VietQRService:
    """Service để tích hợp với VietQR API"""
    
    def __init__(self):
        self.base_url = "https://api.vietqr.io/v2/generate"
    
    def create_qr_code(self, amount: int, add_info: str, template: str = "compact"):
        """
        Tạo QR code cho banking transfer
        
        Args:
            amount: Số tiền (VNĐ)
            add_info: Nội dung chuyển khoản
            template: Template QR (compact hoặc qr_only)
        
        Returns:
            dict: Chứa qr_code_url và qr_data_url
        """
        if not VIETQR_CLIENT_ID or not VIETQR_API_KEY:
            raise ValueError("VietQR credentials chưa được cấu hình trong .env")
        
        if not VIETQR_ACCOUNT_NO:
            raise ValueError("VietQR_ACCOUNT_NO chưa được cấu hình trong .env")
        
        headers = {
            "x-client-id": VIETQR_CLIENT_ID,
            "x-api-key": VIETQR_API_KEY,
            "Content-Type": "application/json"
        }
        
        payload = {
            "accountNo": VIETQR_ACCOUNT_NO,
            "accountName": VIETQR_ACCOUNT_NAME,
            "acqId": VIETQR_ACQ_ID,
            "addInfo": add_info,
            "amount": str(amount),
            "template": template
        }
        
        try:
            response = requests.post(self.base_url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            result = response.json()
            
            if result.get("code") == "00":
                data = result.get("data", {})
                return {
                    "success": True,
                    "qr_code_url": data.get("qrCode"),
                    "qr_data_url": data.get("qrDataURL"),
                    "account_no": VIETQR_ACCOUNT_NO,
                    "account_name": VIETQR_ACCOUNT_NAME,
                    "amount": amount
                }
            else:
                return {
                    "success": False,
                    "error": result.get("desc", "Lỗi không xác định từ VietQR")
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Lỗi khi gọi VietQR API: {str(e)}"
            }
    
    def verify_transaction(self, transaction_id: str):
        """
        Xác minh giao dịch từ VietQR (nếu có API)
        Trong thực tế, cần tích hợp với webhook của VietQR
        """
        # TODO: Implement khi có webhook từ VietQR
        pass

