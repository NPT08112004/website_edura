import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronRight, Upload, Settings } from 'lucide-react';
import { getInitials, hasValidAvatar } from '../utils/avatarUtils';
import '../assets/styles/Sidebar.css';

export default function Sidebar({ isOpen, onClose, onUploadClick, onAdminClick }) {
  const navigate = useNavigate();
  const [expandedItems, setExpandedItems] = useState({});
  
  // Get user info from localStorage
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('edura_user') || '{}');
    } catch {
      return {};
    }
  })();
  
  const userName = user?.fullName || user?.username || 'Người dùng';
  const userAvatar = user?.avatarUrl;
  const hasAvatar = hasValidAvatar(userAvatar);
  const userInitials = getInitials(user?.fullName, user?.username);
  
  const handleProfileClick = () => {
    navigate('/profile');
    onClose();
  };

  const toggleItem = (itemKey) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
  };

  const menuItems = [
    { key: 'about', label: 'Edura là gì?', hasArrow: false },
    { key: 'quiz', label: 'Trắc nghiệm', hasArrow: false, href: '/quizzes' },
    { key: 'messages', label: 'Nhắn tin', hasArrow: false, href: '/message' },
    { key: 'culture', label: 'Văn hoá', hasArrow: true },
    { key: 'entertainment', label: 'Giải trí và thủ công', hasArrow: true },
    { key: 'personal', label: 'Phát triển cá nhân', hasArrow: true },
    { key: 'all', label: 'Tất cả tài liệu', hasArrow: false }
  ];

  return (
    <>
      {/* Overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      
      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div 
            className="sidebar-user"
            onClick={handleProfileClick}
            style={{ cursor: 'pointer' }}
          >
            <div className="user-avatar">
              {hasAvatar ? (
                <img 
                  src={userAvatar} 
                  alt="Avatar" 
                  onError={(e) => { 
                    e.target.style.display = 'none';
                    e.target.nextElementSibling?.classList.add('show');
                  }} 
                />
              ) : null}
              {!hasAvatar && (
                <div className="user-avatar-placeholder show">
                  {userInitials}
                </div>
              )}
            </div>
            <span className="user-name">{userName}</span>
          </div>
          <button className="sidebar-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-menu">
          <ul>
            {menuItems.map((item) => (
              <li key={item.key} className="menu-item">
                <a 
                  href={item.href || "#"} 
                  className="menu-link"
                  onClick={(e) => {
                    if (item.href) {
                      e.preventDefault();
                      window.location.href = item.href;
                      onClose();
                    } else {
                      e.preventDefault();
                      if (item.hasArrow) {
                        toggleItem(item.key);
                      }
                    }
                  }}
                >
                  <span>{item.label}</span>
                  {item.hasArrow && (
                    <ChevronRight 
                      size={16} 
                      className={`arrow-icon ${expandedItems[item.key] ? 'expanded' : ''}`}
                    />
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Upload Section */}
        <div className="sidebar-upload-section">
          <button className="upload-menu-button" onClick={onUploadClick}>
            <Upload size={18} />
            <span>Tải tài liệu lên</span>
          </button>
          {onAdminClick && (
            <button 
              className="upload-menu-button admin-menu-button" 
              onClick={onAdminClick}
            >
              <Settings size={18} />
              <span>Quản lý</span>
            </button>
          )}
        </div>

        {/* App Download Section */}
        <div className="sidebar-app-section">
          <h3 className="app-section-title">Nhận ứng dụng miễn phí của chúng tôi</h3>
          <div className="app-buttons">
            <button className="app-store-btn">
              <span>Télécharger dans l'App Store</span>
            </button>
            <button className="play-store-btn">
              <span>DISPONIBLE SUR Google Play</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

