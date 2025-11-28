import React, { useMemo, useState } from 'react';
import { Users, FileText, Home, LogOut, Shield } from 'lucide-react';
import MessageDropdown from './MessageDropdown';
import Logo from './Logo';
import { getInitials, hasValidAvatar, getAvatarUrl } from '../utils/avatarUtils';
import '../assets/styles/AdminDashboard.css';

export default function AdminDashboard() {
  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('edura_user') || '{}'); }
    catch { return {}; }
  }, []);

  const isLoggedIn = !!localStorage.getItem('edura_token');
  const isAdmin = me?.role === 'admin';

  const avatarUrl = me?.avatarUrl;
  const displayAvatarUrl = getAvatarUrl(avatarUrl);
  const avatarInitials = getInitials(me?.fullName, me?.username);
  const avatarAlt = me?.fullName || me?.username || 'Người dùng';

  function onLogout() {
    localStorage.removeItem('edura_token');
    localStorage.removeItem('edura_user');
    window.location.href = '/';
  }

  function onGoHome() {
    window.location.href = '/';
  }

  function onManageUsers() {
    window.location.href = '/admin/users';
  }

  function onManageDocuments() {
    window.location.href = '/admin/documents';
  }

  if (!isLoggedIn || !isAdmin) {
    window.location.href = '/';
    return null;
  }

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <header className="admin-dashboard-header">
        <div className="header-left">
          <div
            className="logo-section"
            onClick={() => window.location.href = '/'}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
          >
            <Logo showText={false} size="default" />
            <div>
              <h1 className="logo">Edura Admin</h1>
              <p className="logo-subtitle">Trang quản trị hệ thống</p>
            </div>
          </div>
        </div>
        <div className="header-right">
          <MessageDropdown />
          <div className="user-info">
            <div className="user-avatar">
              <img
                src={displayAvatarUrl}
                alt={avatarAlt}
                onError={(e) => {
                  e.target.style.display = 'none';
                  const placeholder = e.target.parentElement.querySelector('.user-avatar-initials');
                  if (placeholder) {
                    placeholder.style.display = 'flex';
                  }
                }}
              />
              <span className="user-avatar-initials" style={{ display: 'none' }}>{avatarInitials}</span>
            </div>
            <div className="user-details">
              <span className="user-name">{me.username || 'Admin'}</span>
              <span className="user-role">Quản trị viên</span>
            </div>
          </div>
          <button className="btn-home" onClick={onGoHome}>
            <Home size={18} />
            <span>Trang chủ</span>
          </button>
          <button className="btn-logout" onClick={onLogout}>
            <LogOut size={18} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="admin-dashboard-main">
        <div className="dashboard-container">
          <div className="dashboard-header">
            <h2>Chọn chức năng quản lý</h2>
            <p className="dashboard-subtitle">Vui lòng chọn một trong các tùy chọn bên dưới</p>
          </div>

          <div className="dashboard-cards">
            <div className="dashboard-card" onClick={onManageUsers}>
              <div className="card-icon card-icon-users">
                <Users size={48} />
              </div>
              <div className="card-content">
                <h3>Quản lý người dùng</h3>
                <p>Xem, chỉnh sửa, khóa/mở khóa và xóa người dùng trong hệ thống</p>
              </div>
              <div className="card-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
            </div>

            <div className="dashboard-card" onClick={onManageDocuments}>
              <div className="card-icon card-icon-documents">
                <FileText size={48} />
              </div>
              <div className="card-content">
                <h3>Quản lý tài liệu</h3>
                <p>Xem, chỉnh sửa và xóa các tài liệu đã được đăng tải trong hệ thống</p>
              </div>
              <div className="card-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
