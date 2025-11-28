import React, { useState, useEffect, useRef, useCallback } from 'react';
import { loginUser, loginWithGoogle } from '../api';
import Swal from 'sweetalert2'; 
import { Eye, EyeOff } from 'lucide-react';
import ForgotPassword from './ForgotPassword';
import '../assets/styles/LoginForm.css';

export default function LoginForm({ switchToRegister, switchToHome, bgImage, logo }) {
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const googleButtonRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
    if (isLoading) return;

        setIsLoading(true);
        try {
      // Đăng nhập bằng họ và tên
      const data = await loginUser(fullName.trim(), password);
            localStorage.setItem('edura_token', data.token);
            localStorage.setItem('edura_user', JSON.stringify(data.user));

            Swal.fire({
                icon: 'success',
                title: 'Đăng nhập thành công!',
        timer: 1100,
                showConfirmButton: false
            });

            window.location.href = '/';
        } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Không đăng nhập được',
        text: error?.message || 'Sai tài khoản/mật khẩu'
      });
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = useCallback(async (credential) => {
        if (isGoogleLoading) return;
        
        setIsGoogleLoading(true);
        try {
            const data = await loginWithGoogle(credential);
            localStorage.setItem('edura_token', data.token);
            localStorage.setItem('edura_user', JSON.stringify(data.user));

            Swal.fire({
                icon: 'success',
                title: 'Đăng nhập thành công!',
                timer: 1100,
                showConfirmButton: false
            });

            window.location.href = '/';
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Đăng nhập Google thất bại',
                text: error?.message || 'Không thể đăng nhập bằng Google'
            });
        } finally {
            setIsGoogleLoading(false);
        }
    }, [isGoogleLoading]);

    useEffect(() => {
        // Lấy Google Client ID từ environment
        const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        
        // Kiểm tra xem client_id có được cấu hình không
        if (!googleClientId || googleClientId.trim() === '') {
            console.warn('VITE_GOOGLE_CLIENT_ID chưa được cấu hình. Vui lòng thêm vào file .env');
            // Ẩn nút Google nếu không có client_id
            if (googleButtonRef.current) {
                googleButtonRef.current.style.display = 'none';
            }
            return;
        }

        // Khởi tạo Google Sign-In khi component mount
        const initGoogleSignIn = () => {
            if (!window.google) {
                console.error('Google Sign-In script chưa được load');
                return;
            }

            if (!googleButtonRef.current) {
                console.error('Google button ref chưa sẵn sàng');
                return;
            }

            try {
                window.google.accounts.id.initialize({
                    client_id: googleClientId,
                    callback: (response) => {
                        if (response.credential) {
                            handleGoogleSignIn(response.credential);
                        } else {
                            console.error('Google Sign-In không trả về credential');
                            Swal.fire({
                                icon: 'error',
                                title: 'Đăng nhập Google thất bại',
                                text: 'Không nhận được thông tin từ Google'
                            });
                        }
                    },
                    error_callback: (error) => {
                        console.error('Google Sign-In error:', error);
                        Swal.fire({
                            icon: 'error',
                            title: 'Lỗi đăng nhập Google',
                            text: error?.message || 'Có lỗi xảy ra khi đăng nhập bằng Google'
                        });
                    }
                });

                // Render nút Google Sign-In
                window.google.accounts.id.renderButton(
                    googleButtonRef.current,
                    {
                        theme: 'outline',
                        size: 'large',
                        width: '100%',
                        text: 'signin_with',
                        locale: 'vi'
                    }
                );
            } catch (error) {
                console.error('Lỗi khởi tạo Google Sign-In:', error);
                if (googleButtonRef.current) {
                    googleButtonRef.current.innerHTML = '<p style="color: red; text-align: center;">Lỗi khởi tạo Google Sign-In</p>';
                }
            }
        };

        // Kiểm tra xem Google script đã load chưa
        if (window.google && window.google.accounts && window.google.accounts.id) {
            initGoogleSignIn();
        } else {
            // Nếu chưa load, đợi script load xong
            let attempts = 0;
            const maxAttempts = 50; // 5 giây (50 * 100ms)
            
            const checkGoogle = setInterval(() => {
                attempts++;
                if (window.google && window.google.accounts && window.google.accounts.id) {
                    clearInterval(checkGoogle);
                    initGoogleSignIn();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkGoogle);
                    console.error('Google Sign-In script không load được sau 5 giây');
                    if (googleButtonRef.current) {
                        googleButtonRef.current.innerHTML = '<p style="color: red; text-align: center;">Không thể load Google Sign-In</p>';
                    }
                }
            }, 100);
        }
        
        // Cleanup function
        return () => {
            // Cleanup nếu cần
        };
    }, [handleGoogleSignIn]);

    // Hiển thị ForgotPassword nếu showForgotPassword = true
    if (showForgotPassword) {
        // Kiểm tra xem fullName có phải là email không
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const initialEmail = emailRegex.test(fullName.trim()) ? fullName.trim().toLowerCase() : '';
        
        return (
            <ForgotPassword
                switchToLogin={() => setShowForgotPassword(false)}
                bgImage={bgImage}
                logo={logo}
                initialEmail={initialEmail}
            />
        );
    }

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
          </div>
          <span className="page-title">Đăng nhập</span>
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
          </div>

          {/* Form */}
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {/* Full Name field */}
            <div className="form-field">
              <input
                type="text"
                placeholder="Email"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            {/* Password field */}
            <div className="form-field password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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

            {/* Forgot password link */}
            <div className="forgot-password">
              <a 
                href="#" 
                className="link-blue"
                onClick={(e) => {
                  e.preventDefault();
                  setShowForgotPassword(true);
                }}
              >
                Quên mật khẩu?
              </a>
            </div>

            {/* Login button */}
            <button type="submit" className="login-button" disabled={isLoading}>
              {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>

            {/* Divider */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              margin: '20px 0',
              color: '#666',
              fontSize: '14px'
            }}>
              <div style={{ flex: 1, height: '1px', background: '#e0e0e0' }}></div>
              <span style={{ padding: '0 12px' }}>hoặc</span>
              <div style={{ flex: 1, height: '1px', background: '#e0e0e0' }}></div>
            </div>

            {/* Google Sign-In button */}
            {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
              <div 
                ref={googleButtonRef}
                style={{ 
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: '20px'
                }}
              ></div>
            ) : (
              <div style={{ 
                padding: '12px',
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '4px',
                marginBottom: '20px',
                fontSize: '14px',
                color: '#856404',
                textAlign: 'center'
              }}>
                ⚠️ Google Sign-In chưa được cấu hình. Vui lòng thêm VITE_GOOGLE_CLIENT_ID vào file .env
              </div>
            )}
            
            {/* Registration prompt */}
            <div className="registration-prompt">
              <span className="prompt-text">Bạn mới biết đến Edura?</span>
              <a 
                href="#" 
                className="link-blue register-link"
                onClick={(e) => {
                  e.preventDefault();
                  switchToRegister?.();
                }}
              >
                Đăng ký
              </a>
            </div>
            
            {/* Back to home link */}
            <div className="back-to-home">
              <a 
                href="#" 
                className="link-blue"
                onClick={(e) => {
                  e.preventDefault();
                  switchToHome?.();
                }}
              >
                ← Về trang chủ
              </a>
            </div>
        </form>
        </div>
      </main>
    </div>
    );
}
