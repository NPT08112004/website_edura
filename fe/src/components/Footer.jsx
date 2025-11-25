import React from 'react';
import { Facebook, Twitter, Instagram, Linkedin, ArrowUp } from 'lucide-react';
import '../assets/styles/Footer.css';

const socialLinks = [
  { icon: Facebook, label: 'Facebook', href: 'https://facebook.com' },
  { icon: Twitter, label: 'Twitter', href: 'https://twitter.com' },
  { icon: Instagram, label: 'Instagram', href: 'https://instagram.com' },
  { icon: Linkedin, label: 'LinkedIn', href: 'https://www.linkedin.com' }
];

const exploreLinks = [
  { label: 'Tất cả tài liệu', href: '/home' },
  { label: 'Trường học', href: '/schools' },
  { label: 'Trắc nghiệm', href: '/quizzes' },
  { label: 'Edura là gì?', href: '/#gioi-thieu' }
];

const accountLinks = [
  { label: 'Đăng nhập', href: '/login' },
  { label: 'Đăng ký', href: '/register' },
  { label: 'Hồ sơ của tôi', href: '/profile' },
  { label: 'Tải tài liệu lên', href: '/upload' }
];

const supportLinks = [
  { label: 'Nhắn tin', href: '/message' },
  { label: 'Trợ giúp', href: '/support' },
  { label: 'Liên hệ', href: '/contact' },
  { label: 'Chính sách bảo mật', href: '/privacy' }
];

const legalLinks = [
  { label: 'Điều khoản', href: '/terms' },
  { label: 'Bảo mật', href: '/privacy' },
  { label: 'Cookies', href: '/cookies' }
];

export default function Footer() {
  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="site-footer">
      <div className="footer-gradient" aria-hidden="true" />
      <div className="footer-container">
        <div className="footer-columns">
          <div className="footer-brand">
            <div className="logo-badge footer-logo">
              <span className="logo-number">87</span>
            </div>
            <h3>Edura</h3>
            <p>
              Nền tảng chia sẻ tài liệu học tập cho sinh viên. Tìm kiếm, chia sẻ và học tập cùng cộng đồng.
            </p>
            <div className="footer-socials">
              {socialLinks.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                >
                  <Icon size={18} />
                </a>
              ))}
            </div>
          </div>

          <div className="footer-links">
            <div>
              <h4>Khám phá</h4>
              <ul>
                {exploreLinks.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Tài khoản</h4>
              <ul>
                {accountLinks.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Hỗ trợ</h4>
              <ul>
                {supportLinks.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Edura. Tất cả quyền được bảo lưu.</span>
          <div className="footer-legal-links">
            {legalLinks.map((link) => (
              <a key={link.label} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <button
        className="footer-to-top"
        aria-label="Quay lại đầu trang"
        onClick={handleScrollTop}
      >
        <ArrowUp size={18} />
      </button>
    </footer>
  );
}

