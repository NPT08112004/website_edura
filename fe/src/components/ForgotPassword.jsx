import React, { useState, useRef } from 'react';
import { forgotPassword, resetPassword } from '../api';
import Swal from 'sweetalert2';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import '../assets/styles/LoginForm.css';

export default function ForgotPassword({ switchToLogin, bgImage, logo, initialEmail = '' }) {
    const [step, setStep] = useState(initialEmail ? 2 : 1); // 1: nhập email, 2: nhập mã và mật khẩu mới
    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const sendCodeLockRef = useRef(false);
    const resetLockRef = useRef(false);

    const triggerSendCode = async ({ auto = false } = {}) => {
        if (sendCodeLockRef.current) return false;
        sendCodeLockRef.current = true;
        setIsSendingCode(true);
        try {
            await forgotPassword(email.trim());
            Swal.fire({
                icon: 'success',
                title: 'Thành công!',
                text: 'Mã xác thực đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.',
                timer: 2000,
                showConfirmButton: false
            });
            if (!auto) {
                setStep(2);
            }
            return true;
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Lỗi',
                text: error?.message || 'Không thể gửi mã xác thực. Vui lòng thử lại.'
            });
            if (auto) {
                setStep(1);
            }
            return false;
        } finally {
            setIsSendingCode(false);
            sendCodeLockRef.current = false;
        }
    };

    // Tự động gửi mã nếu có initialEmail khi component mount
    React.useEffect(() => {
        if (initialEmail && step === 2 && email) {
            triggerSendCode({ auto: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSendCode = async (e) => {
        e.preventDefault();
        if (isSendingCode) return;

        if (!email.trim()) {
            Swal.fire({
                icon: 'error',
                title: 'Lỗi',
                text: 'Vui lòng nhập email.'
            });
            return;
        }

        // Kiểm tra định dạng email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            Swal.fire({
                icon: 'error',
                title: 'Lỗi',
                text: 'Email không hợp lệ. Vui lòng nhập đúng định dạng email.'
            });
            return;
        }

        await triggerSendCode();
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (isResetting || resetLockRef.current) return;

        if (!code.trim() || !newPassword.trim() || !confirmPassword.trim()) {
            Swal.fire({
                icon: 'error',
                title: 'Lỗi',
                text: 'Vui lòng nhập đầy đủ mã xác thực và mật khẩu mới.'
            });
            return;
        }

        // Bỏ ràng buộc độ dài mật khẩu - cho phép tự do đặt mật khẩu
        if (!newPassword.trim()) {
            Swal.fire({
                icon: 'error',
                title: 'Lỗi',
                text: 'Mật khẩu không được để trống.'
            });
            return;
        }

        if (newPassword !== confirmPassword) {
            Swal.fire({
                icon: 'error',
                title: 'Lỗi',
                text: 'Mật khẩu xác nhận không khớp.'
            });
            return;
        }

        resetLockRef.current = true;
        setIsResetting(true);
        try {
            await resetPassword(email.trim(), code.trim(), newPassword.trim());
            Swal.fire({
                icon: 'success',
                title: 'Thành công!',
                text: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
                timer: 2000,
                showConfirmButton: false
            }).then(() => {
                if (switchToLogin) {
                    switchToLogin();
                }
            });
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Lỗi',
                text: error?.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.'
            });
        } finally {
            setIsResetting(false);
            resetLockRef.current = false;
        }
    };

    return (
        <div 
            className="login-page"
            style={bgImage ? { backgroundImage: `url(${bgImage})` } : {}}
        >
            {/* Header bar */}
            <header className="login-header">
                <div className="header-left">
                    <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                        onClick={() => window.location.href = '/'}
                    >
                        {logo ? (
                            <img src={logo} alt="Logo" className="header-logo" />
                        ) : (
                            <div className="logo-badge">
                                <span className="logo-number">87</span>
                            </div>
                        )}
                        <span className="brand-text">Edura</span>
                    </div>
                    <span className="page-title">Quên mật khẩu</span>
                </div>
                <div className="header-right">
                    <a href="#" className="nav-link">Hỗ trợ</a>
                    <a href="#" className="nav-link">Tiếng Việt</a>
                </div>
            </header>

            {/* Main content */}
            <main className="login-main">
                <div className="login-card">
                    {/* Logo trong card */}
                    <div className="card-brand">
                        {logo ? (
                            <img src={logo} alt="Brand" className="card-logo" />
                        ) : (
                            <div className="card-logo-badge">
                                <span className="card-logo-number">87</span>
                            </div>
                        )}
                        <span className="card-brand-text">Edura</span>
                    </div>

                    {/* Form */}
                    {step === 1 ? (
                        <form className="login-form" onSubmit={handleSendCode} noValidate>
                            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                                <h2 style={{ fontSize: '24px', marginBottom: '10px', color: '#333' }}>
                                    Quên mật khẩu?
                                </h2>
                                <p style={{ color: '#666', fontSize: '14px' }}>
                                    Nhập email (username) của bạn để nhận mã xác thực
                                </p>
                            </div>

                            {/* Email/Username field */}
                            <div className="form-field">
                                <input
                                    type="text"
                                    placeholder="Email (username)"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="username"
                                    disabled={isSendingCode}
                                />
                            </div>

                            {/* Send code button */}
                            <button type="submit" className="login-button" disabled={isSendingCode}>
                                {isSendingCode ? 'Đang gửi...' : 'Gửi mã xác thực'}
                            </button>

                            {/* Back to login */}
                            <div className="back-to-home">
                                <a 
                                    href="#" 
                                    className="link-blue"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (switchToLogin) switchToLogin();
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                                >
                                    <ArrowLeft size={16} />
                                    Quay lại đăng nhập
                                </a>
                            </div>
                        </form>
                    ) : (
                        <form className="login-form" onSubmit={handleResetPassword} noValidate>
                            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                                <h2 style={{ fontSize: '24px', marginBottom: '10px', color: '#333' }}>
                                    Đặt lại mật khẩu
                                </h2>
                                <p style={{ color: '#666', fontSize: '14px' }}>
                                    Nhập mã xác thực và mật khẩu mới
                                </p>
                            </div>

                            {/* Email field (readonly) */}
                            <div className="form-field">
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    disabled
                                    style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                                />
                            </div>

                            {/* Verification code field */}
                            <div className="form-field">
                                <input
                                    type="text"
                                    placeholder="Mã xác thực (6 chữ số)"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    required
                                    maxLength="6"
                                    disabled={isResetting}
                                    style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '20px', fontWeight: 'bold' }}
                                />
                            </div>

                            {/* New password field */}
                            <div className="form-field password-field">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Mật khẩu mới"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                    disabled={isResetting}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>

                            {/* Confirm password field */}
                            <div className="form-field password-field">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    placeholder="Xác nhận mật khẩu mới"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                    disabled={isResetting}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                >
                                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>

                            {/* Reset password button */}
                            <button type="submit" className="login-button" disabled={isResetting}>
                                {isResetting ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
                            </button>

                            {/* Resend code */}
                            <div style={{ textAlign: 'center', marginTop: '10px' }}>
                                <a 
                                    href="#" 
                                    className="link-blue"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setStep(1);
                                        setCode('');
                                        setNewPassword('');
                                        setConfirmPassword('');
                                    }}
                                >
                                    Gửi lại mã xác thực
                                </a>
                            </div>

                            {/* Back to login */}
                            <div className="back-to-home">
                                <a 
                                    href="#" 
                                    className="link-blue"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (switchToLogin) switchToLogin();
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                                >
                                    <ArrowLeft size={16} />
                                    Quay lại đăng nhập
                                </a>
                            </div>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}

