import React, { useState } from 'react';
import { registerUser } from '../api';
import Swal from 'sweetalert2';
import { Eye, EyeOff } from 'lucide-react';
import '../assets/styles/RegisterForm.css';

export default function RegisterForm({ switchToLogin, switchToHome, bgImage, logo }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    if (!fullName.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Lỗi',
        text: 'Vui lòng nhập họ và tên.'
      });
      return;
    }

    if (!email.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Lỗi',
        text: 'Vui lòng nhập email.'
      });
      return;
    }

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Swal.fire({
        icon: 'warning',
        title: 'Lỗi',
        text: 'Email không hợp lệ. Vui lòng nhập đúng định dạng email.'
      });
      return;
    }

    if (password !== confirmPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'Lỗi',
        text: 'Mật khẩu nhập lại không khớp.'
      });
      return;
    }

    setIsLoading(true);
    try {
      // Dùng email làm username
      await registerUser(email.trim(), password, fullName.trim());
      
      Swal.fire({
        icon: 'success',
        title: 'Đăng ký thành công!',
        text: 'Bạn có thể đăng nhập ngay bây giờ.',
        timer: 1500,
        showConfirmButton: false
      });
      
      // Chuyển sang giao diện đăng nhập sau khi đăng ký thành công
      switchToLogin();
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Lỗi',
        text: error?.message || 'Đăng ký thất bại'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="register-page"
      style={bgImage ? { backgroundImage: `url(${bgImage})` } : {}}
    >
      {/* Header bar */}
      <header className="register-header">
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
          <span className="page-title">Đăng ký</span>
        </div>
        <div className="header-right">
          <a href="#" className="nav-link">Hỗ trợ</a>
          <a href="#" className="nav-link">Tiếng Việt</a>
        </div>
      </header>

      {/* Main content */}
      <main className="register-main">
        <div className="register-card">
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
          <form className="register-form" onSubmit={handleSubmit} noValidate>
            {/* Full Name field */}
            <div className="form-field">
              <input
                type="text"
                placeholder="Họ và tên"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            {/* Email field */}
            <div className="form-field">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
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
                autoComplete="new-password"
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

            {/* Confirm Password field */}
            <div className="form-field password-field">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
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

            {/* Register button */}
            <button type="submit" className="register-button" disabled={isLoading}>
              {isLoading ? 'Đang đăng ký...' : 'Đăng ký'}
            </button>

            {/* Login prompt */}
            <div className="login-prompt">
              <span className="prompt-text">Đã có tài khoản?</span>
              <a 
                href="#" 
                className="link-blue register-link"
                onClick={(e) => {
                  e.preventDefault();
                  switchToLogin?.();
                }}
              >
                Đăng nhập
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
