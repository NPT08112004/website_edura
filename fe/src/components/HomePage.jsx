import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X, Globe, Filter, List, Grid, Menu } from 'lucide-react';
import { getDocuments, getSchools, getCategories } from '../api';
import Sidebar from './Sidebar';
import DateRangePicker from './DateRangePicker';
import MessageDropdown from './MessageDropdown';
import Footer from './Footer';
import Swal from 'sweetalert2';
import '../assets/styles/HomePage.css';

export default function HomePage({ switchToLogin, switchToRegister, switchToUpload, onDocumentClick }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [schools, setSchools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    type: '',
    length: '',
    fileType: '',
    uploadDate: '',
    language: '',
    schoolId: '',
    categoryId: ''
  });
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  
  // Get user info from localStorage
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('edura_token'));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('edura_user') || '{}');
    } catch {
      return {};
    }
  });

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = () => {
      setIsLoggedIn(!!localStorage.getItem('edura_token'));
      try {
        setUser(JSON.parse(localStorage.getItem('edura_user') || '{}'));
      } catch {
        setUser({});
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    // Đọc categoryId và search từ URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const categoryIdFromUrl = urlParams.get('categoryId');
    const searchFromUrl = urlParams.get('search');
    
    if (categoryIdFromUrl) {
      setFilters(prev => ({ ...prev, categoryId: categoryIdFromUrl }));
    }
    
    if (searchFromUrl) {
      setSearchQuery(searchFromUrl);
    }
    
    loadFilters();
    loadDocuments();
  }, []);

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      setCurrentPage(1); // Reset về trang 1 khi search/filter thay đổi
      loadDocuments();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filters]);

  // Load lại khi chuyển trang
  useEffect(() => {
    if (currentPage > 0) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const loadFilters = async () => {
    try {
      const [schoolsData, categoriesData] = await Promise.all([
        getSchools(),
        getCategories()
      ]);
      setSchools(schoolsData || []);
      setCategories(categoriesData || []);
    } catch (error) {
      console.error('Error loading filters:', error);
    }
  };

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      // Gọi API với pagination - chỉ tải 12 items mỗi lần để tối ưu tốc độ
      const data = await getDocuments(searchQuery, filters, currentPage, itemsPerPage);
      
      // Xử lý response: backend trả về object với pagination hoặc array (tương thích ngược)
      let documentsList = [];
      let totalCount = 0;
      
      if (Array.isArray(data)) {
        // Tương thích ngược: nếu backend trả về array (không có pagination)
        documentsList = data;
        totalCount = data.length;
      } else if (data && data.documents && Array.isArray(data.documents)) {
        // Response mới với pagination từ backend
        documentsList = data.documents;
        totalCount = data.total || 0;
      } else if (data && Array.isArray(data.data)) {
        documentsList = data.data;
        totalCount = data.total || 0;
      } else if (data && typeof data === 'object') {
        // Thử tìm bất kỳ property nào là array
        const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
        if (arrayKeys.length > 0) {
          documentsList = data[arrayKeys[0]];
          totalCount = data.total || 0;
        }
      }
      
      setDocuments(documentsList);
      setTotalDocuments(totalCount);
    } catch (error) {
      console.error('Error loading documents:', error);
      setDocuments([]);
      setTotalDocuments(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => {
    setFilters({
      type: '',
      length: '',
      fileType: '',
      uploadDate: '',
      language: '',
      schoolId: '',
      categoryId: ''
    });
    setSearchQuery('');
    setCurrentPage(1); // Reset về trang 1 khi clear filters
  };

  // Tính toán pagination - sử dụng totalDocuments từ backend
  // Nếu backend không trả về total, dùng documents.length (tương thích ngược)
  const totalPages = Math.ceil((totalDocuments || documents.length) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  // Backend đã trả về đúng items cho trang hiện tại, không cần slice
  const currentDocuments = documents;

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


  const formatDate = useCallback((dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  }, []);

  // Xác định loại file từ s3_url
  const getFileType = useCallback((s3Url) => {
    if (!s3Url) return 'pdf'; // Default to PDF
    const url = s3Url.toLowerCase();
    if (url.endsWith('.pdf')) {
      return 'pdf';
    } else if (url.endsWith('.docx') || url.endsWith('.doc')) {
      return 'doc';
    }
    return 'pdf'; // Default
  }, []);

  // Render file type icon
  const renderFileIcon = useCallback((fileType) => {
    if (fileType === 'doc') {
      return (
        <span className="file-type-icon file-type-doc">
          <span className="file-type-label">DOC</span>
        </span>
      );
    } else {
      return (
        <span className="file-type-icon file-type-pdf">
          <span className="file-type-label">PDF</span>
        </span>
      );
    }
  }, []);

  // Memoized document cards để tối ưu render
  const processedDocuments = useMemo(() => {
    return currentDocuments.map((doc) => {
      const rawTotalReviews = doc.totalReviews ?? ((doc.likes || 0) + (doc.dislikes || 0) + (doc.commentCount || 0));
      const totalReviews = Number.isFinite(rawTotalReviews) ? rawTotalReviews : parseInt(rawTotalReviews, 10) || 0;
      const rawPages = doc.pages ?? doc.pageCount ?? doc.page_count ?? (doc.metadata?.pages);
      const pageCount = Number.isFinite(rawPages) ? rawPages : parseInt(rawPages, 10) || 0;

      return {
        ...doc,
        totalReviews,
        pageCount,
        image_url: doc.image_url || doc.imageUrl,
        uploader: doc.uploader || doc.uploaderName || doc.user?.name || doc.user?.username || 'Người dùng',
        category: doc.category?.name || doc.categoryName || doc.category_name
      };
    });
  }, [currentDocuments]);

  return (
    <div className="home-page">
      {/* Sidebar */}
             <Sidebar
               isOpen={isSidebarOpen}
               onClose={() => setIsSidebarOpen(false)}
               onUploadClick={() => {
                 setIsSidebarOpen(false);
                 // Kiểm tra đăng nhập trước khi chuyển đến trang upload
                 if (!isLoggedIn) {
                   Swal.fire({
                     icon: 'warning',
                     title: 'Yêu cầu đăng nhập',
                     text: 'Bạn cần đăng nhập để tải tài liệu lên.',
                     confirmButtonText: 'Đăng nhập',
                     showCancelButton: true,
                     cancelButtonText: 'Hủy'
                   }).then((result) => {
                     if (result.isConfirmed && switchToLogin) {
                       switchToLogin();
                     }
                   });
                   return;
                 }
                 if (switchToUpload) {
                   switchToUpload();
                 } else {
                   window.location.href = '/upload';
                 }
               }}
             />


      {/* Header */}
      <header className="home-header">
        <div className="header-left">
          <button 
            className="menu-toggle"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Mở menu"
          >
            <Menu size={24} />
          </button>
          <div 
            className="logo-section" 
            onClick={() => window.location.href = '/'}
            style={{ cursor: 'pointer' }}
          >
            <div className="logo-badge">
              <span className="logo-number">87</span>
            </div>
            <span className="brand-text">Edura</span>
          </div>
        </div>

        <div className="header-center">
          <div className="search-container">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              className="search-input"
              placeholder="Tìm kiếm tài liệu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search"
                onClick={() => setSearchQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="header-right">
          <div className="language-selector">
            <Globe size={18} />
            <span>Tiếng Việt</span>
          </div>
          {isLoggedIn ? (
            <>
              <MessageDropdown />
              <span className="user-email-header">
                {user.fullName || user.username || 'Người dùng'}
              </span>
              <button 
                className="logout-button-header" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  localStorage.removeItem('edura_token');
                  localStorage.removeItem('edura_user');
                  setIsLoggedIn(false);
                  setUser({});
                  // Reload to reset state
                  window.location.href = '/';
                }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <button className="login-button-header" onClick={(e) => { e.preventDefault(); switchToLogin?.(); }}>
              Đăng nhập
            </button>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="filters-section">
        <div className="filters-container">
          <select
            className="filter-select"
            value={filters.categoryId}
            onChange={(e) => handleFilterChange('categoryId', e.target.value)}
          >
            <option value="">Loại</option>
            {categories.map((cat) => (
              <option key={cat._id || cat.id} value={cat._id || cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={filters.length}
            onChange={(e) => handleFilterChange('length', e.target.value)}
          >
            <option value="">Chiều dài</option>
            <option value="short">Ngắn (&lt;10 trang)</option>
            <option value="medium">Trung bình (10-50 trang)</option>
            <option value="long">Dài (&gt;50 trang)</option>
          </select>

          <select
            className="filter-select"
            value={filters.fileType}
            onChange={(e) => handleFilterChange('fileType', e.target.value)}
          >
            <option value="">Loại tập tin</option>
            <option value="pdf">PDF</option>
            <option value="docx">Word</option>
          </select>

          <DateRangePicker
            value={filters.uploadDate}
            onChange={(value) => handleFilterChange('uploadDate', value)}
          />

          <select
            className="filter-select"
            value={filters.schoolId}
            onChange={(e) => handleFilterChange('schoolId', e.target.value)}
          >
            <option value="">Trường học</option>
            {schools.map((school) => (
              <option key={school._id || school.id} value={school._id || school.id}>
                {school.name}
              </option>
            ))}
          </select>

          <button className="clear-filters-btn" onClick={clearAllFilters}>
            Xóa tất cả
          </button>
        </div>
      </div>

      {/* Results Summary */}
      <div className="results-summary">
        <span className="results-count">
          {documents.length > 0 
            ? `Hiển thị ${startIndex + 1}-${startIndex + documents.length} trong tổng ${(totalDocuments || documents.length).toLocaleString('vi-VN')} kết quả`
            : 'Không có kết quả'}
          {searchQuery && ` cho "${searchQuery}"`}
        </span>
        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <List size={20} />
          </button>
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <Grid size={20} />
          </button>
        </div>
      </div>

      {/* Documents List */}
      <main className="documents-container">
        {isLoading ? (
          <div className={`documents-${viewMode}`}>
            {[...Array(12)].map((_, i) => (
              <div key={i} className="document-card skeleton-card">
                <div className="skeleton-thumbnail"></div>
                <div className="doc-content">
                  <div className="skeleton-meta">
                    <div className="skeleton-line short"></div>
                    <div className="skeleton-line short"></div>
                    <div className="skeleton-line short"></div>
                  </div>
                  <div className="skeleton-title">
                    <div className="skeleton-line long"></div>
                    <div className="skeleton-line medium"></div>
                  </div>
                  <div className="skeleton-description">
                    <div className="skeleton-line"></div>
                    <div className="skeleton-line"></div>
                    <div className="skeleton-line short"></div>
                  </div>
                  <div className="skeleton-footer">
                    <div className="skeleton-line short"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="no-results">Không tìm thấy tài liệu nào</div>
        ) : (
          <>
          <div className={`documents-${viewMode}`}>
              {processedDocuments.map((doc) => (
                <div 
                  key={doc._id || doc.id} 
                  className="document-card"
                  onClick={() => onDocumentClick?.(doc._id || doc.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="doc-thumbnail">
                    {doc.image_url ? (
                      <img 
                        src={doc.image_url} 
                        alt={doc.title || 'Document'} 
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          const placeholder = e.target.parentElement.querySelector('.thumbnail-placeholder');
                          if (placeholder) {
                            placeholder.style.display = 'flex';
                          }
                        }}
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        <span>PDF</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="doc-content">
                    <div className="doc-meta">
                      <span>{doc.totalReviews.toLocaleString('vi-VN')} đánh giá</span>
                      <span>•</span>
                      <span>{(doc.views || 0).toLocaleString('vi-VN')} lượt xem</span>
                      <span>•</span>
                      <span>{doc.pageCount.toLocaleString('vi-VN')} trang</span>
                    </div>
                    
                    <h3 className="doc-title">
                      {renderFileIcon(getFileType(doc.s3_url || doc.s3Url))}
                      {doc.title}
                    </h3>
                    
                    {doc.summary && (
                      <p className="doc-description">{doc.summary}</p>
                    )}
                    
                    <div className="doc-footer">
                      <span className="doc-uploader">
                        <strong>Được tải lên bởi</strong> {doc.uploader} <strong>vào ngày</strong> {formatDate(doc.created_at || doc.createdAt || doc.upload_date)}
                      </span>
                      {doc.category && (
                        <span className="doc-category">{doc.category}</span>
                      )}
                    </div>
                  </div>

                  <div className="doc-actions">
                    <button className="action-btn" title="Tải xuống">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button className="action-btn" title="Lưu">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
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
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

