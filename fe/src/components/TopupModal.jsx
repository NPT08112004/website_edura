import React, { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { X, QrCode, Smartphone, CreditCard, Coins, Loader } from 'lucide-react';
import { createPayment, checkPaymentStatus, verifyPayment } from '../api';
import '../assets/styles/TopupModal.css';

export default function TopupModal({ isOpen, onClose, onTopupSuccess }) {
  const [amount, setAmount] = useState(20000);
  const [selectedMethod, setSelectedMethod] = useState('momo'); // 'momo' or 'banking' (banking tạm thời bị ẩn)
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState('pending'); // pending, completed, failed
  const [isVerifying, setIsVerifying] = useState(false);
  const pollingIntervalRef = useRef(null);

  // Tính số điểm sẽ nhận được
  const points = Math.floor(amount / 20000) * 50;

  // Cleanup polling khi component unmount hoặc modal đóng
  useEffect(() => {
    if (!isOpen) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setPaymentData(null);
      setOrderId(null);
      setPaymentStatus('pending');
      setIsVerifying(false);
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [isOpen]);
  
  // Refresh điểm khi modal đóng sau khi thanh toán thành công
  useEffect(() => {
    if (!isOpen && paymentStatus === 'completed' && onTopupSuccess) {
      // Đảm bảo điểm được cập nhật ngay cả khi modal đã đóng
      // Gọi lại onTopupSuccess để refresh điểm
      const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
      if (storedUser.points !== undefined) {
        onTopupSuccess({ 
          balance: storedUser.points,
          added: 0 // Không cộng thêm, chỉ refresh
        });
      }
    }
  }, [isOpen, paymentStatus, onTopupSuccess]);

  // Polling để kiểm tra trạng thái thanh toán
  useEffect(() => {
    if (orderId && paymentStatus === 'pending' && isOpen) {
      console.log('[TopupModal] Starting polling for orderId:', orderId);
      
      pollingIntervalRef.current = setInterval(async () => {
        try {
          console.log('[TopupModal] Checking payment status for:', orderId);
          const status = await checkPaymentStatus(orderId);
          console.log('[TopupModal] Payment status response:', status);
          
          if (status.status === 'completed') {
            console.log('[TopupModal] Payment completed detected!');
            setPaymentStatus('completed');
            
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            
            // Lấy số dư từ API response (ưu tiên) hoặc tính toán
            const currentBalance = status.currentBalance !== undefined 
              ? status.currentBalance 
              : (status.points + (JSON.parse(localStorage.getItem('edura_user') || '{}').points || 0));
            
            console.log('[TopupModal] Payment completed:', { 
              orderId, 
              points: status.points, 
              currentBalance,
              status 
            });
            
            // Cập nhật điểm TRƯỚC KHI hiển thị thông báo
            if (onTopupSuccess) {
              console.log('[TopupModal] Calling onTopupSuccess with:', { balance: currentBalance, added: status.points });
              // Gọi ngay lập tức để cập nhật điểm
              await onTopupSuccess({ 
                balance: currentBalance,
                added: status.points 
              });
              console.log('[TopupModal] onTopupSuccess completed');
            } else {
              console.warn('[TopupModal] onTopupSuccess callback is not provided');
            }
            
            Swal.fire({
              icon: 'success',
              title: 'Thanh toán thành công!',
              html: `
                <p>Bạn đã nhận được <strong>${status.points} điểm</strong></p>
                <p>Số dư hiện tại: <strong>${currentBalance} điểm</strong></p>
                ${status.autoVerified ? '<p style="color: #2563EB; font-size: 12px;">Đã tự động xác minh thanh toán</p>' : ''}
              `,
              timer: 2000,
              showConfirmButton: false
            }).then(() => {
              onClose();
            });
          } else if (status.status === 'failed') {
            console.log('[TopupModal] Payment failed');
            setPaymentStatus('failed');
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          } else {
            console.log('[TopupModal] Payment still pending, status:', status.status);
          }
        } catch (error) {
          console.error('[TopupModal] Error checking payment status:', error);
        }
      }, 3000); // Kiểm tra mỗi 3 giây
      
      // Cleanup function
      return () => {
        if (pollingIntervalRef.current) {
          console.log('[TopupModal] Cleaning up polling interval');
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    }
  }, [orderId, paymentStatus, isOpen, onTopupSuccess, onClose]);

  if (!isOpen) return null;

  const handleAmountChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    if (value >= 20000) {
      setAmount(value);
    } else {
      setAmount(20000);
    }
  };

  const handleCreatePayment = async () => {
    if (amount < 20000) {
      Swal.fire({
        icon: 'error',
        title: 'Lỗi',
        text: 'Số tiền tối thiểu là 20.000 VNĐ'
      });
      return;
    }

    setIsCreatingPayment(true);
    try {
      const returnUrl = `${window.location.origin}/quizzes`;
      const data = await createPayment(amount, selectedMethod, returnUrl);

      if (data.success) {
        setPaymentData(data);
        setOrderId(data.orderId);
        setPaymentStatus('pending');
        
        // Nếu là Momo và có paymentUrl, chuyển hướng thẳng sang trang Momo QR
        if (selectedMethod === 'momo' && data.paymentUrl) {
          // Lưu orderId vào localStorage để có thể kiểm tra trạng thái sau khi quay lại
          localStorage.setItem('pending_payment_orderId', data.orderId);
          
          // Chuyển hướng thẳng đến trang thanh toán Momo
          window.location.href = data.paymentUrl;
          return; // Không hiển thị modal QR nữa
        }
        
        // Nếu là banking hoặc không có paymentUrl, hiển thị QR trong modal
        Swal.fire({
          icon: 'info',
          title: 'Đã tạo yêu cầu thanh toán',
          text: 'Vui lòng quét QR code để thanh toán. Hệ thống sẽ tự động cập nhật điểm khi thanh toán thành công.',
          timer: 3000,
          showConfirmButton: false
        });
      } else {
        throw new Error(data.error || 'Không thể tạo payment request');
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Lỗi',
        text: error.message || 'Không thể tạo payment request. Vui lòng thử lại.'
      });
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const presetAmounts = [20000, 50000, 100000, 200000, 500000];

  return (
    <div className="topup-modal-overlay" onClick={onClose}>
      <div className="topup-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="topup-modal-header">
          <h2>Nạp tiền</h2>
          <button className="topup-modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="topup-modal-body">
          {/* Chọn phương thức thanh toán */}
          <div className="payment-methods">
            <button
              type="button"
              className={`payment-method-btn ${selectedMethod === 'momo' ? 'active' : ''}`}
              onClick={() => {
                setSelectedMethod('momo');
                // Reset payment data khi đổi phương thức
                setPaymentData(null);
                setOrderId(null);
                setPaymentStatus('pending');
              }}
              disabled={isCreatingPayment}
            >
              <Smartphone size={20} />
              <span>Ví MoMo</span>
            </button>
            {/* Tạm thời ẩn phương thức Ngân hàng (VietQR) */}
            {/* <button
              type="button"
              className={`payment-method-btn ${selectedMethod === 'banking' ? 'active' : ''}`}
              onClick={() => {
                setSelectedMethod('banking');
                // Reset payment data khi đổi phương thức
                setPaymentData(null);
                setOrderId(null);
                setPaymentStatus('pending');
              }}
              disabled={isCreatingPayment}
            >
              <CreditCard size={20} />
              <span>Ngân hàng</span>
            </button> */}
          </div>

          {!paymentData ? (
            <>
              {/* Nhập số tiền */}
              <div className="amount-section">
                <label className="amount-label">Số tiền nạp (VNĐ)</label>
                <div className="amount-input-wrapper">
                  <input
                    type="number"
                    className="amount-input"
                    value={amount}
                    onChange={handleAmountChange}
                    min="20000"
                    step="10000"
                    placeholder="Nhập số tiền"
                    disabled={isCreatingPayment}
                  />
                  <span className="amount-currency">VNĐ</span>
                </div>
                
                {/* Preset amounts */}
                <div className="preset-amounts">
                  {presetAmounts.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      className={`preset-amount-btn ${amount === preset ? 'active' : ''}`}
                      onClick={() => setAmount(preset)}
                      disabled={isCreatingPayment}
                    >
                      {preset.toLocaleString('vi-VN')}đ
                    </button>
                  ))}
                </div>

                {/* Hiển thị số điểm sẽ nhận */}
                <div className="points-preview">
                  <Coins size={18} />
                  <span>Bạn sẽ nhận được: <strong>{points} điểm</strong></span>
                  <span className="points-rate">(20.000 VNĐ = 50 điểm)</span>
                </div>
              </div>

              <button 
                type="button"
                className="topup-confirm-btn" 
                onClick={handleCreatePayment}
                disabled={isCreatingPayment || amount < 20000}
                style={{ width: '100%', marginTop: '20px' }}
              >
                {isCreatingPayment ? (
                  <>
                    <Loader size={16} className="spinning" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ marginLeft: '8px' }}>Đang tạo...</span>
                  </>
                ) : (
                  'Tạo mã thanh toán'
                )}
              </button>
            </>
          ) : (
            <>
              {/* QR Code */}
              <div className="qr-section">
                <div className="qr-code-wrapper">
                  {paymentData.qrCodeUrl && !paymentData.qrCodeUrl.startsWith('momo://') ? (
                    <img 
                      src={paymentData.qrCodeUrl} 
                      alt="QR Code" 
                      className="qr-code-image"
                      onError={(e) => {
                        console.error('[TopupModal] QR code image load error:', e);
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="qr-loading" style={{ padding: '40px', textAlign: 'center' }}>
                      <Loader size={40} className="spinning" style={{ animation: 'spin 1s linear infinite' }} />
                      <p>Đang tạo QR code...</p>
                    </div>
                  )}
                </div>
                
                {selectedMethod === 'momo' && paymentData.paymentUrl && (
                  (() => {
                    const isMomoDeepLink = paymentData.paymentUrl.startsWith('momo://');
                    
                    if (isMomoDeepLink) {
                      // Nếu là momo:// deep link, hiển thị nút copy và hướng dẫn
                      return (
                        <div style={{ marginTop: '16px' }}>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(paymentData.paymentUrl);
                                Swal.fire({
                                  icon: 'success',
                                  title: 'Đã copy!',
                                  text: 'Đã copy link thanh toán. Mở ứng dụng MoMo và dán link vào thanh tìm kiếm.',
                                  timer: 3000,
                                  showConfirmButton: false
                                });
                              } catch (error) {
                                console.error('[TopupModal] Copy error:', error);
                                Swal.fire({
                                  icon: 'error',
                                  title: 'Lỗi',
                                  text: 'Không thể copy link. Vui lòng thử lại.'
                                });
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '12px 20px',
                              backgroundColor: '#2563EB',
                              color: 'white',
                              borderRadius: '12px',
                              border: 'none',
                              fontWeight: '600',
                              width: '100%',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Smartphone size={18} />
                            <span>Copy link thanh toán</span>
                          </button>
                          <p style={{ 
                            fontSize: '12px', 
                            color: '#666', 
                            marginTop: '8px', 
                            textAlign: 'center' 
                          }}>
                            Sau khi copy, mở ứng dụng MoMo và dán link vào thanh tìm kiếm
                          </p>
                        </div>
                      );
                    } else {
                      // Nếu là HTTP URL, dùng link bình thường
                      return (
                        <a 
                          href={paymentData.paymentUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="payment-link-btn"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '12px 20px',
                            backgroundColor: '#2563EB',
                            color: 'white',
                            borderRadius: '12px',
                            textDecoration: 'none',
                            fontWeight: '600',
                            marginTop: '16px',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Smartphone size={18} />
                          <span>Mở MoMo App</span>
                        </a>
                      );
                    }
                  })()
                )}

                <div className="qr-instructions">
                  <h3>Hướng dẫn thanh toán:</h3>
                  <ol>
                    {selectedMethod === 'momo' ? (
                      <>
                        <li>Mở ứng dụng MoMo trên điện thoại</li>
                        <li>Quét mã QR bên trên hoặc nhấn "Mở MoMo App"</li>
                        <li>Xác nhận thanh toán trong ứng dụng</li>
                        <li>Hệ thống sẽ tự động cập nhật điểm sau khi thanh toán thành công</li>
                      </>
                    ) : (
                      <>
                        <li>Mở ứng dụng ngân hàng trên điện thoại</li>
                        <li>Quét mã QR bên trên</li>
                        <li>Kiểm tra thông tin và xác nhận chuyển khoản</li>
                        <li>Hệ thống sẽ tự động cập nhật điểm sau khi nhận được xác nhận</li>
                      </>
                    )}
                  </ol>
                </div>
              </div>

              {/* Thông tin tài khoản (cho banking) */}
              {selectedMethod === 'banking' && paymentData.accountNo && (
                <div className="bank-info">
                  <h4>Thông tin chuyển khoản:</h4>
                  <div className="bank-details">
                    <p><strong>Số tài khoản:</strong> {paymentData.accountNo}</p>
                    <p><strong>Chủ tài khoản:</strong> {paymentData.accountName}</p>
                    <p><strong>Số tiền:</strong> {amount.toLocaleString('vi-VN')} VNĐ</p>
                    <p><strong>Nội dung:</strong> EDURA-{orderId}</p>
                  </div>
                </div>
              )}

              {/* Payment Status */}
              {paymentStatus === 'pending' && (
                <>
                  <div className="payment-status-pending" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderRadius: '12px',
                    color: '#2563EB',
                    fontWeight: '500',
                    marginTop: '16px'
                  }}>
                    <Loader size={20} className="spinning" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Đang chờ thanh toán... (Hệ thống đang kiểm tra)</span>
                  </div>
                  
                  {/* Nút verify thủ công nếu webhook không hoạt động */}
                  <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '12px',
                    border: '2px solid #2563EB'
                  }}>
                    <p style={{ 
                      margin: '0 0 12px 0', 
                      fontSize: '14px', 
                      color: '#1e40af',
                      fontWeight: '600',
                      textAlign: 'center'
                    }}>
                      Đã thanh toán trong ứng dụng MoMo?
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!orderId) return;
                        
                        const result = await Swal.fire({
                          title: 'Xác nhận thanh toán',
                          text: 'Bạn đã hoàn tất thanh toán trong ứng dụng MoMo chưa?',
                          icon: 'question',
                          showCancelButton: true,
                          confirmButtonText: 'Đã thanh toán',
                          cancelButtonText: 'Chưa',
                          confirmButtonColor: '#2563EB'
                        });
                        
                        if (result.isConfirmed) {
                          setIsVerifying(true);
                          try {
                            console.log('[TopupModal] Starting manual verify for order:', orderId);
                            const verifyResult = await verifyPayment(orderId);
                            console.log('[TopupModal] Verify result:', verifyResult);
                            
                            if (verifyResult.success) {
                              setPaymentStatus('completed');
                              if (pollingIntervalRef.current) {
                                clearInterval(pollingIntervalRef.current);
                                pollingIntervalRef.current = null;
                              }
                              
                              // Lấy số dư từ API response (ưu tiên) hoặc tính toán
                              const currentBalance = verifyResult.currentBalance !== undefined 
                                ? verifyResult.currentBalance 
                                : (verifyResult.points + (JSON.parse(localStorage.getItem('edura_user') || '{}').points || 0));
                              
                              console.log('[TopupModal] Manual verify completed:', { 
                                orderId, 
                                points: verifyResult.points, 
                                currentBalance,
                                verifyResult 
                              });
                              
                              // Cập nhật điểm TRƯỚC KHI hiển thị thông báo
                              if (onTopupSuccess) {
                                console.log('[TopupModal] Calling onTopupSuccess (manual verify) with:', { balance: currentBalance, added: verifyResult.points });
                                // Gọi ngay lập tức để cập nhật điểm
                                await onTopupSuccess({ 
                                  balance: currentBalance,
                                  added: verifyResult.points 
                                });
                                console.log('[TopupModal] onTopupSuccess (manual verify) completed');
                              }
                              
                              Swal.fire({
                                icon: 'success',
                                title: 'Thanh toán thành công!',
                                html: `
                                  <p>Bạn đã nhận được <strong>${verifyResult.points} điểm</strong></p>
                                  <p style="margin-top: 8px; font-size: 14px; color: #666;">Số dư hiện tại: <strong>${currentBalance} điểm</strong></p>
                                `,
                                timer: 3000,
                                showConfirmButton: false
                              }).then(() => {
                                onClose();
                              });
                            } else {
                              throw new Error(verifyResult.error || 'Không thể xác minh thanh toán');
                            }
                          } catch (error) {
                            console.error('[TopupModal] Verify error:', error);
                            Swal.fire({
                              icon: 'error',
                              title: 'Lỗi',
                              text: error.message || 'Không thể xác minh thanh toán. Vui lòng thử lại sau.'
                            });
                          } finally {
                            setIsVerifying(false);
                          }
                        }
                      }}
                      disabled={isVerifying}
                      style={{
                        width: '100%',
                        padding: '14px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        fontWeight: '600',
                        cursor: isVerifying ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        opacity: isVerifying ? 0.6 : 1,
                        fontSize: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      {isVerifying ? (
                        <>
                          <Loader size={18} className="spinning" style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Đang xác minh...</span>
                        </>
                      ) : (
                        <>
                          <span>✓</span>
                          <span>Đã thanh toán - Xác minh ngay</span>
                        </>
                      )}
                    </button>
                    <p style={{ 
                      margin: '8px 0 0 0', 
                      fontSize: '12px', 
                      color: '#666',
                      textAlign: 'center'
                    }}>
                      Nếu hệ thống chưa tự động cập nhật điểm, nhấn nút này để xác minh thủ công
                    </p>
                  </div>
                </>
              )}

              {paymentStatus === 'failed' && (
                <div className="payment-status-failed" style={{
                  padding: '12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '12px',
                  color: '#ef4444',
                  fontWeight: '500',
                  marginTop: '16px',
                  textAlign: 'center'
                }}>
                  Thanh toán thất bại. Vui lòng thử lại.
                </div>
              )}

              <button 
                type="button"
                className="topup-cancel-btn" 
                onClick={() => {
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                  setPaymentData(null);
                  setOrderId(null);
                  setPaymentStatus('pending');
                }}
                style={{ width: '100%', marginTop: '16px' }}
              >
                Tạo giao dịch mới
              </button>
            </>
          )}
        </div>

        <div className="topup-modal-footer">
          <button className="topup-cancel-btn" onClick={onClose}>
            {paymentData ? 'Đóng' : 'Hủy'}
          </button>
        </div>
      </div>
    </div>
  );
}

