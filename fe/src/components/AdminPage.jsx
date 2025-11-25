import React, { useMemo, useEffect, useState } from 'react';
import { getUsers, promoteUser, lockUser, unlockUser, deleteUser } from '../api';
import Swal from 'sweetalert2';
import { 
  Search, 
  Filter, 
  Users, 
  UserCheck, 
  UserX, 
  Shield, 
  Lock, 
  Unlock, 
  Trash2, 
  ArrowUp, 
  LogOut,
  RefreshCw,
  Calendar,
  Mail,
  Home
} from 'lucide-react';
import MessageDropdown from './MessageDropdown';
import { getInitials, hasValidAvatar } from '../utils/avatarUtils';
import '../assets/styles/AdminPage.css';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [avatarFailed, setAvatarFailed] = useState(false);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('edura_user') || '{}'); }
    catch { return {}; }
  }, []);

  const isLoggedIn = !!localStorage.getItem('edura_token');
  const isAdmin = me?.role === 'admin';

  const avatarUrl = me?.avatarUrl;
  const hasAvatar = hasValidAvatar(avatarUrl);
  const avatarInitials = getInitials(me?.fullName, me?.username);
  const avatarAlt = me?.fullName || me?.username || 'Người dùng';
  const showInitials = !hasAvatar || avatarFailed;

  useEffect(() => {
    if (!isLoggedIn) return (window.location.href = '/');
    if (!isAdmin)    return (window.location.href = '/upload');
    loadUsers();
  }, [isLoggedIn, isAdmin]);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const data = await getUsers();
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      console.error('Error loading users:', err);
      const errorMessage = err?.message || 'Không thể tải danh sách';
      let detailedMessage = errorMessage;
      
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        detailedMessage = 'Không thể kết nối đến server. Vui lòng kiểm tra:\n- Backend đã chạy chưa?\n- URL API có đúng không?\n- Có vấn đề về mạng không?';
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        detailedMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
        localStorage.removeItem('edura_token');
        localStorage.removeItem('edura_user');
        setTimeout(() => window.location.href = '/', 2000);
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        detailedMessage = 'Bạn không có quyền truy cập trang này.';
        setTimeout(() => window.location.href = '/', 2000);
      }
      
      Swal.fire({ 
        icon: 'error', 
        title: 'Lỗi', 
        text: detailedMessage,
        confirmButtonText: 'Đóng'
      });
    } finally {
      setLoadingUsers(false);
    }
  }

  async function onPromote(u) {
    if (u.role === 'admin') return;
    const { isConfirmed } = await Swal.fire({
      title: 'Nâng quyền Admin?',
      text: `Bạn muốn nâng "${u.username}" thành Admin.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Nâng quyền',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#2563eb'
    });
    if (!isConfirmed) return;
    try {
      await promoteUser({ userId: u.id });
      Swal.fire({ icon: 'success', title: 'Thành công', text: 'Đã nâng quyền người dùng.' });
      loadUsers();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Thất bại', text: err?.message || 'Không thể nâng quyền.' });
    }
  }

  async function onToggleLock(u) {
    const isSelf = u.id === me.id;
    if (isSelf) {
      Swal.fire({ icon: 'info', title: 'Không thể thực hiện', text: 'Bạn không thể khóa/mở khóa chính mình.' });
      return;
    }

    const locking = u.status !== 'locked';
    const { isConfirmed } = await Swal.fire({
      title: locking ? 'Khóa người dùng?' : 'Mở khóa người dùng?',
      text: `${locking ? 'Khóa' : 'Mở khóa'} "${u.username}"`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: locking ? 'Khóa' : 'Mở khóa',
      cancelButtonText: 'Hủy',
      confirmButtonColor: locking ? '#d33' : '#16a34a'
    });
    if (!isConfirmed) return;

    try {
      if (locking) await lockUser(u.id); else await unlockUser(u.id);
      Swal.fire({ icon: 'success', title: 'Thành công', text: locking ? 'Đã khóa' : 'Đã mở khóa' });
      loadUsers();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Thất bại', text: err?.message || 'Không thể cập nhật.' });
    }
  }

  async function onDelete(u) {
    const isSelf = u.id === me.id;
    if (u.role === 'admin') return Swal.fire({ icon: 'info', title: 'Không thể xóa', text: 'Không thể xóa tài khoản Admin.' });
    if (isSelf)             return Swal.fire({ icon: 'info', title: 'Không thể xóa', text: 'Bạn không thể xóa chính mình.' });

    const { isConfirmed } = await Swal.fire({
      title: 'Xác nhận xóa',
      text: `Xóa người dùng "${u.username}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xóa',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#dc2626'
    });
    if (!isConfirmed) return;

    try {
      await deleteUser(u.id);
      Swal.fire({ icon: 'success', title: 'Đã xóa' });
      loadUsers();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Thất bại', text: err?.message || 'Không thể xóa.' });
    }
  }

  function onLogout() {
    localStorage.removeItem('edura_token');
    localStorage.removeItem('edura_user');
    window.location.href = '/';
  }

  function onGoHome() {
    window.location.href = '/';
  }

  function onGoDashboard() {
    window.location.href = '/admin';
  }

  const filtered = users.filter(u => {
    const matchQ = q
      ? (u.username || '').toLowerCase().includes(q.toLowerCase()) ||
        (u.fullName || '').toLowerCase().includes(q.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(q.toLowerCase())
      : true;
    const matchRole = roleFilter === 'all' ? true : (u.role || 'user') === roleFilter;
    const matchStatus = statusFilter === 'all' ? true : (u.status || 'active') === statusFilter;
    return matchQ && matchRole && matchStatus;
  });

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    active: users.filter(u => u.status === 'active').length,
    locked: users.filter(u => u.status === 'locked').length
  };

  const fmtDate = (v) => {
    if (!v) return '-';
    const date = new Date(v);
    return date.toLocaleDateString('vi-VN', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  if (!isLoggedIn || !isAdmin) return null;

  return (
    <div className="admin-page">
      {/* Header */}
      <header className="admin-header">
        <div className="header-left">
          <div 
            className="logo-section"
            onClick={() => window.location.href = '/'}
            style={{ cursor: 'pointer' }}
          >
            <div className="logo-badge">
              <span className="logo-number">87</span>
            </div>
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
              {hasAvatar && !avatarFailed ? (
                <img
                  src={avatarUrl}
                  alt={avatarAlt}
                  onError={() => setAvatarFailed(true)}
                />
              ) : null}
              {showInitials && (
                <span className="user-avatar-initials">{avatarInitials}</span>
              )}
            </div>
            <div className="user-details">
              <span className="user-name">{me.username || 'Admin'}</span>
              <span className="user-role">Quản trị viên</span>
            </div>
          </div>
          <button className="btn-dashboard" onClick={onGoDashboard}>
            <Shield size={18} />
            <span>Bảng điều khiển</span>
          </button>
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
      <main className="admin-main">
        <div className="admin-container">
          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card stat-total">
              <div className="stat-icon">
                <Users size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Tổng người dùng</div>
              </div>
            </div>
            <div className="stat-card stat-admin">
              <div className="stat-icon">
                <Shield size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.admins}</div>
                <div className="stat-label">Quản trị viên</div>
              </div>
            </div>
            <div className="stat-card stat-active">
              <div className="stat-icon">
                <UserCheck size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.active}</div>
                <div className="stat-label">Đang hoạt động</div>
              </div>
            </div>
            <div className="stat-card stat-locked">
              <div className="stat-icon">
                <UserX size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.locked}</div>
                <div className="stat-label">Đã khóa</div>
              </div>
            </div>
          </div>

          {/* Filters Section */}
          <div className="filters-section">
            <div className="filters-header">
              <h2>Quản lý người dùng</h2>
              <button className="btn-refresh" onClick={loadUsers} disabled={loadingUsers}>
                <RefreshCw size={18} className={loadingUsers ? 'spinning' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
            <div className="filters-row">
              <div className="search-box">
                <Search size={20} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Tìm kiếm theo username, họ tên, email..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button className="clear-search" onClick={() => setQ('')}>
                    ×
                  </button>
                )}
              </div>
              <div className="filter-group">
                <Filter size={18} />
                <select 
                  className="filter-select" 
                  value={roleFilter} 
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="all">Tất cả vai trò</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </div>
              <div className="filter-group">
                <Filter size={18} />
                <select 
                  className="filter-select" 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="active">Hoạt động</option>
                  <option value="locked">Đã khóa</option>
                </select>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="table-card">
            <div className="table-header">
              <h3>Danh sách người dùng</h3>
              <span className="table-count">{filtered.length} người dùng</span>
            </div>

            {loadingUsers ? (
              <div className="loading-state">
                <RefreshCw size={32} className="spinning" />
                <p>Đang tải dữ liệu...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <Users size={48} />
                <p>Không tìm thấy người dùng nào</p>
                <span>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</span>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Người dùng</th>
                      <th>Email</th>
                      <th>Vai trò</th>
                      <th>Trạng thái</th>
                      <th>Ngày tạo</th>
                      <th className="actions-col">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => {
                      const isSelf = u.id === me.id;
                      const isAdminUser = u.role === 'admin';
                      const userInitials = getInitials(u.fullName, u.username);
                      const userHasAvatar = hasValidAvatar(u.avatarUrl);
                      return (
                        <tr key={u.id}>
                          <td>
                            <div className="user-cell">
                              <div className="user-avatar-small">
                                {userHasAvatar ? (
                                  <img
                                    src={u.avatarUrl}
                                    alt={u.fullName || u.username || 'Người dùng'}
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      const next = e.target.nextElementSibling;
                                      if (next) next.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <span
                                  className="user-avatar-initials"
                                  style={{ display: userHasAvatar ? 'none' : 'flex' }}
                                >
                                  {userInitials}
                                </span>
                              </div>
                              <div className="user-info-cell">
                                <div className="user-name-cell">{u.username}</div>
                                <div className="user-fullname">{u.fullName || '-'}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="email-cell">
                              {u.email ? (
                                <>
                                  <Mail size={14} />
                                  <span>{u.email}</span>
                                </>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`role-badge ${isAdminUser ? 'role-admin' : 'role-user'}`}>
                              {isAdminUser ? <Shield size={14} /> : <Users size={14} />}
                              <span>{u.role || 'user'}</span>
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${u.status === 'active' ? 'status-active' : 'status-locked'}`}>
                              {u.status === 'active' ? <UserCheck size={14} /> : <Lock size={14} />}
                              <span>{u.status === 'active' ? 'Hoạt động' : 'Đã khóa'}</span>
                            </span>
                          </td>
                          <td>
                            <div className="date-cell">
                              <Calendar size={14} />
                              <span>{fmtDate(u.createdAt)}</span>
                            </div>
                          </td>
                          <td className="actions-col">
                            <div className="action-buttons">
                              {!isAdminUser && (
                                <button
                                  className={`action-btn ${u.status === 'locked' ? 'btn-unlock' : 'btn-lock'}`}
                                  onClick={() => onToggleLock(u)}
                                  disabled={isSelf}
                                  title={u.status === 'locked' ? 'Mở khóa' : 'Khóa'}
                                >
                                  {u.status === 'locked' ? <Unlock size={16} /> : <Lock size={16} />}
                                </button>
                              )}
                              {!isAdminUser && (
                                <button
                                  className="action-btn btn-promote"
                                  onClick={() => onPromote(u)}
                                  disabled={isSelf}
                                  title="Nâng quyền Admin"
                                >
                                  <ArrowUp size={16} />
                                </button>
                              )}
                              {!isSelf && !isAdminUser && (
                                <button
                                  className="action-btn btn-delete"
                                  onClick={() => onDelete(u)}
                                  title="Xóa người dùng"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                              {(isSelf || isAdminUser) && (
                                <span className="action-disabled">
                                  {isSelf ? 'Bạn' : 'Admin'}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
