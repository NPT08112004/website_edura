import React, { useMemo, useEffect, useState } from 'react';
import { getDocuments, getSchools, getCategories } from '../api';
import Swal from 'sweetalert2';
import { 
  Search, 
  Filter, 
  FileText, 
  FileCheck, 
  FileX, 
  Shield, 
  Trash2, 
  LogOut,
  RefreshCw,
  Calendar,
  Mail,
  Home,
  Eye,
  Download
} from 'lucide-react';
import MessageDropdown from './MessageDropdown';
import { getInitials, hasValidAvatar } from '../utils/avatarUtils';
import '../assets/styles/AdminDocumentPage.css';

export default function AdminDocumentPage() {
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [q, setQ] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [schools, setSchools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const itemsPerPage = 50; // Số items mỗi trang cho admin

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
    if (!isAdmin)    return (window.location.href = '/');
    loadData();
  }, [isLoggedIn, isAdmin]);

  useEffect(() => {
    // Reload documents when filters change - reset về trang 1
    if (isLoggedIn && isAdmin) {
      setCurrentPage(1);
      const timer = setTimeout(() => {
        loadDocuments();
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, fileTypeFilter, categoryFilter]);

  useEffect(() => {
    // Reload documents when page changes (chỉ khi đã load data lần đầu)
    if (isLoggedIn && isAdmin && currentPage > 0 && schools.length > 0) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  async function loadData() {
    try {
      const [schoolsData, categoriesData] = await Promise.all([
        getSchools(),
        getCategories()
      ]);
      setSchools(schoolsData || []);
      setCategories(categoriesData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    loadDocuments();
  }

  async function loadDocuments() {
    setLoadingDocuments(true);
    try {
      const filters = {
        fileType: fileTypeFilter !== 'all' ? fileTypeFilter : '',
        categoryId: categoryFilter !== 'all' ? categoryFilter : ''
      };
      
      // Load chỉ 1 trang với pagination
      const data = await getDocuments(q, filters, currentPage, itemsPerPage);
      
      // Xử lý cả hai trường hợp: array hoặc object với documents property
      let documentsList = [];
      let totalCount = 0;
      
      if (Array.isArray(data)) {
        // Trường hợp API trả về array trực tiếp (không có pagination)
        documentsList = data;
        totalCount = data.length;
      } else if (data && data.documents && Array.isArray(data.documents)) {
        documentsList = data.documents;
        totalCount = data.total || documentsList.length;
      } else if (data && Array.isArray(data.data)) {
        documentsList = data.data;
        totalCount = data.total || documentsList.length;
      } else if (data && typeof data === 'object') {
        const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
        if (arrayKeys.length > 0) {
          documentsList = data[arrayKeys[0]];
          totalCount = data.total || documentsList.length;
        }
      }
      
      setDocuments(documentsList);
      setTotalDocuments(totalCount);
    } catch (err) {
      console.error('Error loading documents:', err);
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
      setLoadingDocuments(false);
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

  function onViewDocument(docId) {
    window.open(`/document/${docId}`, '_blank');
  }

  function onDeleteDocument(doc) {
    Swal.fire({
      title: 'Xác nhận xóa',
      text: `Xóa tài liệu "${doc.title}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Xóa',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#dc2626'
    }).then((result) => {
      if (result.isConfirmed) {
        // TODO: Implement delete document API call
        Swal.fire({
          icon: 'info',
          title: 'Chức năng đang phát triển',
          text: 'Chức năng xóa tài liệu đang được phát triển.',
          confirmButtonText: 'Đóng'
        });
      }
    });
  }

  // Không cần filter nữa vì đã filter ở backend
  const filtered = documents;

  // Stats: Tổng số luôn lấy từ totalDocuments (tổng số trong database)
  // Các stats khác (PDF/Word/WithImage) hiển thị số lượng trong trang hiện tại
  // để tránh phải load tất cả dữ liệu chỉ để đếm
  const stats = {
    total: totalDocuments, // Tổng số từ database (luôn đúng, không phụ thuộc trang)
    pdf: documents.filter(d => {
      const url = (d.s3_url || d.s3Url || '').toLowerCase();
      return url.endsWith('.pdf');
    }).length, // Số PDF trong trang hiện tại
    word: documents.filter(d => {
      const url = (d.s3_url || d.s3Url || '').toLowerCase();
      return url.endsWith('.docx') || url.endsWith('.doc');
    }).length, // Số Word trong trang hiện tại
    withImage: documents.filter(d => d.image_url || d.imageUrl).length // Số có ảnh trong trang hiện tại
  };

  // Tính toán pagination
  const totalPages = Math.ceil(totalDocuments / itemsPerPage);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    // Scroll to top khi chuyển trang
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Tạo mảng số trang để hiển thị
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5; // Hiển thị tối đa 5 nút trang
    const pageNum = Number(currentPage) || 1;
    const total = Number(totalPages) || 1;
    
    if (total <= maxVisiblePages) {
      // Nếu tổng số trang <= 5, hiển thị tất cả
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Logic hiển thị trang thông minh
      if (pageNum <= 3) {
        // Ở đầu: 1, 2, 3, 4, ... last
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        if (total > 5) {
          pages.push('...');
          pages.push(total);
        }
      } else if (pageNum >= total - 2) {
        // Ở cuối: 1, ..., n-3, n-2, n-1, n
        pages.push(1);
        if (total > 5) {
          pages.push('...');
        }
        for (let i = total - 3; i <= total; i++) {
          pages.push(i);
        }
      } else {
        // Ở giữa: 1, ..., current-1, current, current+1, ..., last
        pages.push(1);
        pages.push('...');
        for (let i = pageNum - 1; i <= pageNum + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(total);
      }
    }
    return pages;
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

  const getFileType = (s3Url) => {
    if (!s3Url) return 'pdf';
    const url = s3Url.toLowerCase();
    if (url.endsWith('.pdf')) return 'pdf';
    if (url.endsWith('.docx') || url.endsWith('.doc')) return 'word';
    return 'pdf';
  };

  if (!isLoggedIn || !isAdmin) return null;

  return (
    <div className="admin-document-page">
      {/* Header */}
      <header className="admin-document-header">
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
              <p className="logo-subtitle">Quản lý tài liệu</p>
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
      <main className="admin-document-main">
        <div className="admin-document-container">
          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card stat-total">
              <div className="stat-icon">
                <FileText size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Tổng tài liệu</div>
              </div>
            </div>
            <div className="stat-card stat-pdf">
              <div className="stat-icon">
                <FileCheck size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.pdf}</div>
                <div className="stat-label">File PDF (trang này)</div>
              </div>
            </div>
            <div className="stat-card stat-word">
              <div className="stat-icon">
                <FileText size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.word}</div>
                <div className="stat-label">File Word (trang này)</div>
              </div>
            </div>
            <div className="stat-card stat-image">
              <div className="stat-icon">
                <FileCheck size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.withImage}</div>
                <div className="stat-label">Có ảnh (trang này)</div>
              </div>
            </div>
          </div>

          {/* Filters Section */}
          <div className="filters-section">
            <div className="filters-header">
              <h2>Quản lý tài liệu</h2>
              <button className="btn-refresh" onClick={loadDocuments} disabled={loadingDocuments}>
                <RefreshCw size={18} className={loadingDocuments ? 'spinning' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
            <div className="filters-row">
              <div className="search-box">
                <Search size={20} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Tìm kiếm theo tiêu đề, tóm tắt, người đăng..."
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
                  value={fileTypeFilter} 
                  onChange={(e) => setFileTypeFilter(e.target.value)}
                >
                  <option value="all">Tất cả loại file</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">Word</option>
                </select>
              </div>
              <div className="filter-group">
                <Filter size={18} />
                <select 
                  className="filter-select" 
                  value={categoryFilter} 
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">Tất cả thể loại</option>
                  {categories.map(cat => (
                    <option key={cat._id || cat.id} value={cat._id || cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Documents Table */}
          <div className="table-card">
            <div className="table-header">
              <h3>Danh sách tài liệu</h3>
              <span className="table-count">
                Hiển thị {filtered.length} / {totalDocuments} tài liệu
              </span>
            </div>

            {loadingDocuments ? (
              <div className="loading-state">
                <RefreshCw size={32} className="spinning" />
                <p>Đang tải dữ liệu...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <FileText size={48} />
                <p>Không tìm thấy tài liệu nào</p>
                <span>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</span>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="documents-table">
                  <thead>
                    <tr>
                      <th>Tài liệu</th>
                      <th>Người đăng</th>
                      <th>Loại file</th>
                      <th>Thể loại</th>
                      <th>Ngày đăng</th>
                      <th className="actions-col">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((doc) => {
                      const fileType = getFileType(doc.s3_url || doc.s3Url);
                      return (
                        <tr key={doc._id || doc.id}>
                          <td>
                            <div className="document-cell">
                              {doc.image_url || doc.imageUrl ? (
                                <img 
                                  src={doc.image_url || doc.imageUrl} 
                                  alt={doc.title}
                                  className="document-thumbnail"
                                />
                              ) : (
                                <div className="document-thumbnail-placeholder">
                                  <FileText size={24} />
                                </div>
                              )}
                              <div className="document-info-cell">
                                <div className="document-title-cell">{doc.title}</div>
                                <div className="document-summary">{doc.summary || '-'}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="uploader-cell">
                              {doc.uploaderName || doc.uploader || doc.user?.name || doc.user?.username || '-'}
                            </div>
                          </td>
                          <td>
                            <span className={`file-type-badge ${fileType === 'pdf' ? 'file-pdf' : 'file-word'}`}>
                              {fileType === 'pdf' ? <FileText size={14} /> : <FileText size={14} />}
                              <span>{fileType === 'pdf' ? 'PDF' : 'Word'}</span>
                            </span>
                          </td>
                          <td>
                            <span className="category-badge">
                              {doc.category?.name || doc.category_name || '-'}
                            </span>
                          </td>
                          <td>
                            <div className="date-cell">
                              <Calendar size={14} />
                              <span>{fmtDate(doc.createdAt || doc.created_at || doc.upload_date)}</span>
                            </div>
                          </td>
                          <td className="actions-col">
                            <div className="action-buttons">
                              <button
                                className="action-btn btn-view"
                                onClick={() => onViewDocument(doc._id || doc.id)}
                                title="Xem tài liệu"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                className="action-btn btn-delete"
                                onClick={() => onDeleteDocument(doc)}
                                title="Xóa tài liệu"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination" style={{ marginTop: '24px', padding: '20px 0' }}>
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Trang trước"
                >
                  ‹
                </button>
                
                {getPageNumbers().map((page, index) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                        ...
                      </span>
                    );
                  }
                  const pageNum = Number(page);
                  const isActive = Number(currentPage) === pageNum;
                  return (
                    <button
                      key={`page-${pageNum}-${index}`}
                      className={`pagination-btn ${isActive ? 'active' : ''}`}
                      onClick={() => handlePageChange(pageNum)}
                      aria-label={`Trang ${pageNum}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Trang sau"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

