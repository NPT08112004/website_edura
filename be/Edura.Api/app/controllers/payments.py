from flask import Blueprint, request, jsonify
from datetime import datetime
from bson import ObjectId
import math
import uuid
import json

from app.services.mongo_service import mongo_collections as dbs
from app.controllers.auth import decode_jwt_strict
from app.services.payment_service import MomoPaymentService, VietQRService

payments_bp = Blueprint('payments', __name__, url_prefix='/api/payments')

def _cur_user():
    token = request.headers.get('Authorization','').replace('Bearer ','').strip()
    p = decode_jwt_strict(token)
    return ObjectId(p.get('sub') or p.get('userId') or p.get('id'))

def _complete_payment_transaction(transaction, *, amount=None, method=None, trans_id=None,
                                   source="webhook", extra_meta=None, auto_verified=False):
    """
    Hoàn tất giao dịch: cộng điểm (nếu chưa), tạo point txn và cập nhật trạng thái payment
    Returns dict: {points, current_points, already_processed}
    """
    if not transaction:
        raise ValueError("Transaction data is required")

    order_id = transaction.get("orderId")
    user_id = transaction.get("userId")
    
    print(f"[PAYMENT COMPLETE] Starting completion for orderId: {order_id}, userId: {user_id}")
    
    # Validate user_id
    if not user_id:
        raise ValueError(f"Transaction {order_id} missing userId")
    
    raw_amount = amount if amount is not None else transaction.get("amount", 0)
    try:
        amount = int(raw_amount or 0)
    except (TypeError, ValueError):
        print(f"[PAYMENT COMPLETE WARNING] Invalid amount: {raw_amount}, using 0")
        amount = 0
    
    if amount <= 0:
        print(f"[PAYMENT COMPLETE WARNING] Amount is 0 or negative, using transaction amount")
        amount = transaction.get("amount", 0)
    
    method = method or transaction.get("method") or "momo"
    points_value = transaction.get("points")
    try:
        points = int(points_value) if points_value is not None else ((amount // 20000) * 50)
    except (TypeError, ValueError):
        points = (amount // 20000) * 50
    
    print(f"[PAYMENT COMPLETE] Calculated: amount={amount}, points={points}, method={method}")

    # Kiểm tra xem đã có point transaction chưa (tránh duplicate)
    existing_point_txn = dbs.point_txns.find_one({
        "meta.orderId": order_id,
        "type": "topup"
    })

    already_processed = existing_point_txn is not None
    
    if already_processed:
        print(f"[PAYMENT COMPLETE] Point transaction already exists for {order_id}: {existing_point_txn.get('_id')}, skip adding points.")
    else:
        print(f"[PAYMENT COMPLETE] No existing point transaction, proceeding to add points...")
        
        # Cộng điểm cho user
        update_result = dbs.users.update_one({"_id": user_id}, {"$inc": {"points": points}})
        print(f"[PAYMENT COMPLETE] Updated user {user_id} points (+{points}). Modified: {update_result.modified_count}")
        
        if update_result.modified_count == 0:
            # Kiểm tra xem user có tồn tại không
            user_check = dbs.users.find_one({"_id": user_id}, {"_id": 1})
            if not user_check:
                raise ValueError(f"User {user_id} not found in database")
            print(f"[PAYMENT COMPLETE WARNING] User exists but points not updated. User might already have points from another source.")

        meta = {
            "amountVND": amount,
            "orderId": order_id,
            "method": method
        }
        if extra_meta:
            meta.update(extra_meta)

        point_txn_result = dbs.point_txns.insert_one({
            "userId": user_id,
            "type": "topup",
            "points": points,
            "meta": meta,
            "createdAt": datetime.utcnow()
        })
        print(f"[PAYMENT COMPLETE] Point transaction created: {point_txn_result.inserted_id}")

    update_fields = {
        "status": "completed",
        "completedAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
        "completedSource": source,
        "autoVerified": bool(auto_verified)
    }
    if trans_id:
        update_fields["transId"] = trans_id

    update_result = dbs.payment_transactions.update_one(
        {"orderId": order_id},
        {"$set": update_fields}
    )
    print(f"[PAYMENT COMPLETE] Transaction {order_id} updated. Modified: {update_result.modified_count}")

    user = dbs.users.find_one({"_id": user_id}, {"points": 1})
    current_points = user.get("points", 0) if user else 0
    print(f"[PAYMENT COMPLETE] User {user_id} current balance: {current_points}")

    return {
        "points": points,
        "current_points": current_points,
        "already_processed": already_processed
    }

def _auto_query_and_complete_momo(transaction):
    """
    Thử gọi API query của MoMo để cập nhật trạng thái giao dịch đang pending.
    Returns True nếu auto verify thành công (điểm đã được cộng trong lần gọi này).
    """
    try:
        if not transaction or transaction.get("method") != "momo":
            print(f"[AUTO VERIFY] Transaction method is not momo: {transaction.get('method') if transaction else 'None'}")
            return False

        order_id = transaction.get("orderId")
        request_id = transaction.get("requestId")
        if not request_id:
            print(f"[AUTO VERIFY] Transaction {order_id} không có requestId, bỏ qua auto query.")
            return False

        print(f"[AUTO VERIFY] Starting query for order {order_id} with requestId {request_id}")
        momo_service = MomoPaymentService()
        query_result = momo_service.query_payment_status(order_id, request_id)
        
        print(f"[AUTO VERIFY] Query result: {json.dumps(query_result, default=str)}")
        
        # Lưu query result vào transaction
        dbs.payment_transactions.update_one(
            {"orderId": order_id},
            {"$set": {
                "lastQueriedAt": datetime.utcnow(),
                "lastQueryResult": query_result
            }}
        )

        # Kiểm tra resultCode: 0 = thành công, có transId
        result_code = query_result.get("resultCode")
        trans_id = query_result.get("transId")
        
        print(f"[AUTO VERIFY] resultCode: {result_code}, transId: {trans_id}")
        
        if result_code == 0 and trans_id:
            print(f"[AUTO VERIFY] MoMo confirm success for {order_id}, proceeding to complete transaction.")
            completion = _complete_payment_transaction(
                transaction,
                amount=query_result.get("amount") or transaction.get("amount", 0),
                method="momo",
                trans_id=trans_id,
                source="auto_query",
                extra_meta={"queryResult": query_result},
                auto_verified=True
            )
            print(f"[AUTO VERIFY] Completion result: already_processed={completion['already_processed']}, points={completion['points']}")
            return not completion["already_processed"]
        elif result_code == 0 and not trans_id:
            print(f"[AUTO VERIFY] resultCode is 0 but no transId, payment might still be processing")
        else:
            print(f"[AUTO VERIFY] Query for {order_id} not successful. resultCode: {result_code}, message: {query_result.get('message')}")
        
        return False
    except Exception as e:
        print(f"[AUTO VERIFY ERROR] {e}")
        import traceback
        print(f"[AUTO VERIFY ERROR] Traceback: {traceback.format_exc()}")
        return False

@payments_bp.post('/topup')
def topup():
    """Endpoint cũ - giữ lại để tương thích (manual confirmation)"""
    user_id = _cur_user()
    body = request.get_json(force=True) or {}
    amount = int(body.get("amountVND", 0))
    if amount < 20000:
        return jsonify({"error":"MIN_20000"}), 400
    # quy tắc: mỗi 20k => 50 điểm (lấy floor)
    points = (amount // 20000) * 50

    dbs.users.update_one({"_id": user_id}, {"$inc": {"points": points}})
    dbs.point_txns.insert_one({
        "userId": user_id, "type": "topup", "points": points,
        "meta": {"amountVND": amount}, "createdAt": datetime.utcnow()
    })
    u = dbs.users.find_one({"_id": user_id}, {"points":1})
    return jsonify({"added": points, "balance": int(u.get("points",0))})


def _apply_rate_limit_if_available(route_func):
    """Apply rate limiting nếu flask-limiter có sẵn"""
    try:
        from flask import current_app
        limiter = current_app.config.get('LIMITER')
        if limiter:
            return limiter.limit("10 per minute")(route_func)
    except Exception:
        pass
    return route_func

@payments_bp.post('/create-payment')
@_apply_rate_limit_if_available
def create_payment():
    """
    Tạo payment request với Momo hoặc VietQR
    
    Body:
        - amountVND: Số tiền (VNĐ)
        - method: "momo" hoặc "banking"
        - returnUrl: URL để redirect sau khi thanh toán (optional)
    """
    try:
        user_id = _cur_user()
        body = request.get_json(force=True) or {}
        method = body.get("method", "momo")  # "momo" or "banking"
        
        # Validate amount với validation utilities
        try:
            from app.utils.validation import validate_amount
            amount = validate_amount(int(body.get("amountVND", 0)), min_amount=20000, max_amount=10000000)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except (TypeError, ValueError):
            return jsonify({"error": "Số tiền phải là số nguyên"}), 400
        
        # Tính số điểm sẽ nhận
        points = (amount // 20000) * 50
        
        # Tạo order ID duy nhất
        order_id = f"EDURA_{user_id}_{int(datetime.utcnow().timestamp() * 1000)}"
        
        # Lưu transaction vào database
        transaction = {
            "orderId": order_id,
            "userId": user_id,
            "amount": amount,
            "points": points,
            "method": method,
            "status": "pending",  # pending, completed, failed, cancelled
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        
        dbs.payment_transactions.insert_one(transaction)
        
        if method == "momo":
            # Tạo payment request với Momo
            momo_service = MomoPaymentService()
            # Dùng order_info không dấu để tránh lỗi encoding với ASCII
            # Hoặc có thể dùng tiếng Anh: "Top up {points} points - Edura"
            order_info = f"Nap {points} diem - Edura"  # Không dấu để tương thích với ASCII encoding
            return_url = body.get("returnUrl")
            
            result = momo_service.create_payment_request(
                order_id=order_id,
                amount=amount,
                order_info=order_info,
                return_url=return_url
            )
            
            print(f"[PAYMENT DEBUG] MoMo result: {result}")
            
            if result.get("success"):
                payment_url = result.get("payment_url")
                qr_code_url = result.get("qr_code_url")
                
                print(f"[PAYMENT DEBUG] payment_url: {payment_url}")
                print(f"[PAYMENT DEBUG] qr_code_url: {qr_code_url}")
                
                # Cập nhật transaction với payment info
                dbs.payment_transactions.update_one(
                    {"orderId": order_id},
                    {"$set": {
                        "paymentUrl": payment_url,
                        "qrCodeUrl": qr_code_url,
                        "requestId": result.get("request_id"),
                        "updatedAt": datetime.utcnow()
                    }}
                )
                
                response_data = {
                    "success": True,
                    "orderId": order_id,
                    "paymentUrl": payment_url,
                    "qrCodeUrl": qr_code_url,
                    "amount": amount,
                    "points": points
                }
                
                print(f"[PAYMENT DEBUG] Response data: {response_data}")
                
                return jsonify(response_data), 200
            else:
                error_msg = result.get("error", "Không thể tạo payment request")
                result_code = result.get("result_code")
                print(f"[PAYMENT ERROR] {error_msg}, result_code: {result_code}")
                return jsonify({
                    "error": error_msg,
                    "result_code": result_code
                }), 400
                
        elif method == "banking":
            # Tạo QR code với VietQR
            vietqr_service = VietQRService()
            add_info = f"EDURA-{order_id}"
            
            result = vietqr_service.create_qr_code(
                amount=amount,
                add_info=add_info
            )
            
            if result.get("success"):
                # Cập nhật transaction với QR info
                dbs.payment_transactions.update_one(
                    {"orderId": order_id},
                    {"$set": {
                        "qrCodeUrl": result.get("qr_code_url"),
                        "qrDataUrl": result.get("qr_data_url"),
                        "accountNo": result.get("account_no"),
                        "accountName": result.get("account_name"),
                        "updatedAt": datetime.utcnow()
                    }}
                )
                
                return jsonify({
                    "success": True,
                    "orderId": order_id,
                    "qrCodeUrl": result.get("qr_code_url"),
                    "qrDataUrl": result.get("qr_data_url"),
                    "accountNo": result.get("account_no"),
                    "accountName": result.get("account_name"),
                    "amount": amount,
                    "points": points
                }), 200
            else:
                return jsonify({
                    "error": result.get("error", "Không thể tạo QR code")
                }), 400
        else:
            return jsonify({"error": "Phương thức thanh toán không hợp lệ"}), 400
            
    except Exception as e:
        print(f"[ERROR] create_payment: {e}")
        return jsonify({"error": f"Lỗi server: {str(e)}"}), 500


@payments_bp.post('/momo/webhook')
def momo_webhook():
    """
    Webhook endpoint để nhận callback từ Momo khi thanh toán hoàn tất
    """
    try:
        # Log request info để debug
        print(f"[MOMO WEBHOOK] ========== WEBHOOK CALLED ==========")
        print(f"[MOMO WEBHOOK] Headers: {dict(request.headers)}")
        print(f"[MOMO WEBHOOK] Method: {request.method}")
        print(f"[MOMO WEBHOOK] Remote Address: {request.remote_addr}")
        
        # Thử parse JSON từ request
        try:
            data = request.get_json(force=True) or {}
        except Exception as json_error:
            print(f"[MOMO WEBHOOK ERROR] Failed to parse JSON: {json_error}")
            print(f"[MOMO WEBHOOK] Raw data: {request.get_data(as_text=True)}")
            # Vẫn trả về 200 để Momo không retry
            return jsonify({"error": "Invalid JSON"}), 200
        
        print(f"[MOMO WEBHOOK] Received data: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        # Tạm thời bỏ qua signature verification để test (có thể bật lại sau)
        # momo_service = MomoPaymentService()
        # if not momo_service.verify_webhook(data):
        #     print("[WARNING] Momo webhook signature không hợp lệ")
        #     return jsonify({"error": "Invalid signature"}), 400
        
        order_id = data.get("orderId") or data.get("order_id")
        result_code = data.get("resultCode") or data.get("result_code")
        
        # Thử parse amount với nhiều format
        amount_raw = data.get("amount") or data.get("amountVND") or 0
        try:
            amount = int(amount_raw)
        except (TypeError, ValueError):
            print(f"[MOMO WEBHOOK WARNING] Invalid amount: {amount_raw}, using 0")
            amount = 0
            
        trans_id = data.get("transId") or data.get("trans_id")
        
        print(f"[MOMO WEBHOOK] Parsed - orderId: {order_id}, resultCode: {result_code}, amount: {amount}, transId: {trans_id}")
        
        if not order_id:
            print("[MOMO WEBHOOK ERROR] Missing orderId in webhook data")
            # Trả về 200 để Momo không retry với invalid data
            return jsonify({"error": "Missing orderId"}), 200
        
        # Tìm transaction
        transaction = dbs.payment_transactions.find_one({"orderId": order_id})
        if not transaction:
            print(f"[MOMO WEBHOOK WARNING] Không tìm thấy transaction với orderId: {order_id}")
            print(f"[MOMO WEBHOOK] Available transactions (last 5):")
            recent = list(dbs.payment_transactions.find({}, {"orderId": 1, "status": 1, "createdAt": 1}).sort("createdAt", -1).limit(5))
            for t in recent:
                print(f"  - {t.get('orderId')}: {t.get('status')}")
            # Trả về 200 để Momo không retry
            return jsonify({"error": "Transaction not found"}), 200
        
        print(f"[MOMO WEBHOOK] Found transaction: status={transaction.get('status')}, userId={transaction.get('userId')}, amount={transaction.get('amount')}")
        
        # Kiểm tra đã xử lý chưa
        if transaction.get("status") == "completed":
            print(f"[MOMO WEBHOOK INFO] Transaction {order_id} đã được xử lý trước đó")
            # Kiểm tra xem đã có point transaction chưa
            point_txn = dbs.point_txns.find_one({"meta.orderId": order_id, "type": "topup"})
            if point_txn:
                print(f"[MOMO WEBHOOK INFO] Point transaction exists: {point_txn.get('_id')}")
            else:
                print(f"[MOMO WEBHOOK WARNING] Transaction marked completed but no point transaction found!")
            return jsonify({"message": "Already processed"}), 200
        
        # Xử lý theo result code
        # Momo resultCode: 0 = success, các giá trị khác = failed
        if result_code == 0:  # Thành công
            print(f"[MOMO WEBHOOK] Processing payment success for order {order_id}")
            try:
                completion = _complete_payment_transaction(
                    transaction,
                    amount=amount if amount > 0 else transaction.get("amount", 0),
                    method="momo",
                    trans_id=trans_id,
                    source="momo_webhook",
                    extra_meta={"transId": trans_id, "webhook_data": data},
                    auto_verified=False
                )
                print(f"[MOMO WEBHOOK SUCCESS] Completion result: {json.dumps(completion, default=str)}")
                
                if completion["already_processed"]:
                    print(f"[MOMO WEBHOOK] Points already added for order {order_id}")
                    return jsonify({"message": "Already processed"}), 200
                
                print(f"[MOMO WEBHOOK] Successfully added {completion['points']} points. New balance: {completion['current_points']}")
                return jsonify({
                    "message": "Success",
                    "points": completion["points"],
                    "currentBalance": completion["current_points"]
                }), 200
            except Exception as completion_error:
                print(f"[MOMO WEBHOOK ERROR] Error in _complete_payment_transaction: {completion_error}")
                import traceback
                print(f"[MOMO WEBHOOK ERROR] Traceback: {traceback.format_exc()}")
                # Vẫn trả về 200 để Momo không retry, nhưng log lỗi
                return jsonify({"error": "Failed to complete transaction", "message": str(completion_error)}), 200
        else:
            # Thanh toán thất bại
            error_msg = data.get("message") or data.get("errorMessage") or f"Payment failed with resultCode: {result_code}"
            print(f"[MOMO WEBHOOK] Payment failed: {error_msg} (resultCode: {result_code})")
            dbs.payment_transactions.update_one(
                {"orderId": order_id},
                {"$set": {
                    "status": "failed",
                    "errorMessage": error_msg,
                    "resultCode": result_code,
                    "updatedAt": datetime.utcnow()
                }}
            )
            return jsonify({"message": "Payment failed"}), 200
            
    except Exception as e:
        print(f"[MOMO WEBHOOK ERROR] Unexpected error: {e}")
        import traceback
        print(f"[MOMO WEBHOOK ERROR] Traceback: {traceback.format_exc()}")
        # Trả về 200 để Momo không retry, nhưng log lỗi để debug
        return jsonify({"error": str(e)}), 200


@payments_bp.post('/vietqr/webhook')
def vietqr_webhook():
    """
    Webhook endpoint để nhận callback từ VietQR khi có giao dịch banking
    """
    try:
        data = request.get_json(force=True) or {}
        
        # VietQR webhook format (cần kiểm tra tài liệu thực tế)
        # Giả sử format: { "orderId": "...", "amount": 20000, "status": "success", ... }
        order_id = data.get("orderId") or data.get("order_id")
        amount = int(data.get("amount", 0))
        status = data.get("status", "").lower()
        
        if not order_id:
            return jsonify({"error": "Missing orderId"}), 400
        
        # Tìm transaction
        transaction = dbs.payment_transactions.find_one({"orderId": order_id})
        if not transaction:
            print(f"[WARNING] Không tìm thấy transaction với orderId: {order_id}")
            return jsonify({"error": "Transaction not found"}), 404
        
        # Kiểm tra đã xử lý chưa
        if transaction.get("status") == "completed":
            return jsonify({"message": "Already processed"}), 200
        
        # Xử lý nếu thành công
        if status == "success" or status == "completed":
            user_id = transaction.get("userId")
            points = transaction.get("points", (amount // 20000) * 50)
            
            # Cộng điểm cho user
            dbs.users.update_one({"_id": user_id}, {"$inc": {"points": points}})
            
            # Ghi transaction point
            dbs.point_txns.insert_one({
                "userId": user_id,
                "type": "topup",
                "points": points,
                "meta": {
                    "amountVND": amount,
                    "orderId": order_id,
                    "method": "banking"
                },
                "createdAt": datetime.utcnow()
            })
            
            # Cập nhật transaction status
            dbs.payment_transactions.update_one(
                {"orderId": order_id},
                {"$set": {
                    "status": "completed",
                    "completedAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                }}
            )
            
            print(f"[SUCCESS] Đã cộng {points} điểm cho user {user_id} từ Banking payment")
            return jsonify({"message": "Success"}), 200
        else:
            # Thanh toán thất bại
            dbs.payment_transactions.update_one(
                {"orderId": order_id},
                {"$set": {
                    "status": "failed",
                    "errorMessage": data.get("message", "Payment failed"),
                    "updatedAt": datetime.utcnow()
                }}
            )
            return jsonify({"message": "Payment failed"}), 200
            
    except Exception as e:
        print(f"[ERROR] vietqr_webhook: {e}")
        return jsonify({"error": str(e)}), 500


@payments_bp.get('/check-payment/<order_id>')
def check_payment_status(order_id):
    """
    Kiểm tra trạng thái thanh toán của một order
    """
    try:
        user_id = _cur_user()  # Xác thực user
        
        print(f"[CHECK PAYMENT STATUS] User {user_id} checking status for order {order_id}")
        
        transaction = dbs.payment_transactions.find_one({"orderId": order_id})
        if not transaction:
            print(f"[CHECK PAYMENT STATUS ERROR] Transaction not found: {order_id}")
            return jsonify({"error": "Transaction not found"}), 404
        
        # Kiểm tra xem transaction có thuộc về user này không
        if transaction.get("userId") != user_id:
            print(f"[CHECK PAYMENT STATUS ERROR] Unauthorized: user {user_id} trying to check order {order_id} owned by {transaction.get('userId')}")
            return jsonify({"error": "Unauthorized"}), 403
        
        status = transaction.get("status")
        method = transaction.get("method")
        auto_verified = False

        # Nếu MoMo vẫn pending, tự động gọi query để xác nhận
        if status == "pending" and method == "momo":
            print(f"[CHECK PAYMENT STATUS] Attempting auto verify for pending MoMo order {order_id}")
            print(f"[CHECK PAYMENT STATUS] Transaction has requestId: {transaction.get('requestId')}")
            
            # Thử auto query
            auto_verify_result = _auto_query_and_complete_momo(transaction)
            print(f"[CHECK PAYMENT STATUS] Auto verify result: {auto_verify_result}")
            
            if auto_verify_result:
                auto_verified = True
                # Reload transaction để lấy status mới
                transaction = dbs.payment_transactions.find_one({"orderId": order_id})
                if transaction:
                    status = transaction.get("status")
                    method = transaction.get("method")
                    print(f"[CHECK PAYMENT STATUS] After auto verify, new status: {status}")
                else:
                    print(f"[CHECK PAYMENT STATUS ERROR] Transaction disappeared after auto verify!")
            else:
                print(f"[CHECK PAYMENT STATUS] Auto verify did not complete payment, status still pending")
        
        print(f"[CHECK PAYMENT STATUS] Order {order_id} status: {status}, method: {method}")
        
        # Lấy điểm hiện tại của user (luôn luôn để đảm bảo tính chính xác)
        user = dbs.users.find_one({"_id": user_id}, {"points": 1})
        current_points = user.get("points", 0) if user else 0
        
        print(f"[CHECK PAYMENT STATUS] User {user_id} current points: {current_points}")
        
        # Nếu transaction đã completed, trả về thông tin
        if status == "completed":
            print(f"[CHECK PAYMENT STATUS] Order {order_id} is completed, returning full info")
            return jsonify({
                "orderId": order_id,
                "status": status,
                "amount": transaction.get("amount"),
                "points": transaction.get("points"),
                "method": method,
                "currentBalance": current_points,
                "autoVerified": auto_verified,
                "createdAt": transaction.get("createdAt").isoformat() if transaction.get("createdAt") else None,
                "completedAt": transaction.get("completedAt").isoformat() if transaction.get("completedAt") else None
            }), 200
        
        # Trả về thông tin cho pending/failed status
        print(f"[CHECK PAYMENT STATUS] Order {order_id} status is {status}, returning status info")
        return jsonify({
            "orderId": order_id,
            "status": status,
            "amount": transaction.get("amount"),
            "points": transaction.get("points"),
            "method": method,
            "currentBalance": current_points,  # Vẫn trả về currentBalance để frontend có thể hiển thị
            "autoVerified": auto_verified,
            "createdAt": transaction.get("createdAt").isoformat() if transaction.get("createdAt") else None,
            "completedAt": transaction.get("completedAt").isoformat() if transaction.get("completedAt") else None
        }), 200
        
    except Exception as e:
        print(f"[CHECK PAYMENT STATUS ERROR] {e}")
        import traceback
        print(f"[CHECK PAYMENT STATUS ERROR] Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


@payments_bp.post('/verify-payment/<order_id>')
def verify_and_complete_payment(order_id):
    """
    Endpoint để manual verify và cộng điểm cho transaction
    Dùng khi webhook không hoạt động hoặc cần verify thủ công
    """
    try:
        user_id = _cur_user()
        
        print(f"[VERIFY PAYMENT] User {user_id} requesting verify for order {order_id}")
        
        transaction = dbs.payment_transactions.find_one({"orderId": order_id})
        if not transaction:
            print(f"[VERIFY PAYMENT ERROR] Transaction not found: {order_id}")
            return jsonify({"error": "Transaction not found"}), 404
        
        # Kiểm tra quyền
        if transaction.get("userId") != user_id:
            print(f"[VERIFY PAYMENT ERROR] Unauthorized: user {user_id} trying to verify order {order_id} owned by {transaction.get('userId')}")
            return jsonify({"error": "Unauthorized"}), 403
        
        # Kiểm tra đã xử lý chưa
        if transaction.get("status") == "completed":
            print(f"[VERIFY PAYMENT INFO] Transaction {order_id} already completed")
            # Vẫn trả về điểm hiện tại của user
            user = dbs.users.find_one({"_id": user_id}, {"points": 1})
            current_points = user.get("points", 0) if user else 0
            return jsonify({
                "success": True,
                "message": "Transaction already completed",
                "status": "completed",
                "points": transaction.get("points"),
                "currentBalance": current_points
            }), 200
        
        # Chỉ cho phép verify nếu status là pending
        if transaction.get("status") != "pending":
            print(f"[VERIFY PAYMENT ERROR] Transaction {order_id} status is {transaction.get('status')}, cannot verify")
            return jsonify({"error": "Transaction cannot be verified"}), 400
        
        # Kiểm tra xem đã có point transaction cho order_id này chưa (tránh duplicate)
        existing_point_txn = dbs.point_txns.find_one({
            "meta.orderId": order_id,
            "type": "topup"
        })
        
        if existing_point_txn:
            print(f"[VERIFY PAYMENT WARNING] Đã có point transaction cho order_id {order_id}, bỏ qua cộng điểm")
            if transaction.get("status") != "completed":
                dbs.payment_transactions.update_one(
                    {"orderId": order_id},
                    {"$set": {
                        "status": "completed",
                        "completedAt": datetime.utcnow(),
                        "updatedAt": datetime.utcnow(),
                        "verified_manually": True
                    }}
                )
            user = dbs.users.find_one({"_id": user_id}, {"points": 1})
            current_points = user.get("points", 0) if user else 0
            return jsonify({
                "success": True,
                "message": "Already processed",
                "points": transaction.get("points"),
                "currentBalance": current_points,
                "status": "completed"
            }), 200
        
        completion = _complete_payment_transaction(
            transaction,
            amount=transaction.get("amount", 0),
            method=transaction.get("method"),
            source="manual_verify",
            extra_meta={"verified_manually": True},
            auto_verified=False
        )
        
        print(f"[VERIFY PAYMENT SUCCESS] Đã cộng {completion['points']} điểm cho user {user_id} từ manual verify payment")
        
        return jsonify({
            "success": True,
            "message": "Payment verified and points added",
            "points": completion["points"],
            "currentBalance": completion["current_points"],
            "status": "completed"
        }), 200
        
    except Exception as e:
        print(f"[VERIFY PAYMENT ERROR] {e}")
        import traceback
        print(f"[VERIFY PAYMENT ERROR] Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
