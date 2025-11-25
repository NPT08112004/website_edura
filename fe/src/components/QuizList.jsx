import React, { useEffect, useState, useMemo } from 'react';
import { listQuizzesAll, startQuiz, topupPoints, getMyProfile, checkPaymentStatus } from '../api';
import Swal from 'sweetalert2';
import { Plus, Menu, Search, X, Globe, Play, Calendar, FileText, User, School, Tag, ChevronLeft, ChevronRight, Coins, Wallet } from 'lucide-react';
import Sidebar from './Sidebar';
import MessageDropdown from './MessageDropdown';
import TopupModal from './TopupModal';
import '../assets/styles/Quiz.css';
import '../assets/styles/HomePage.css';

export default function QuizList() {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userPoints, setUserPoints] = useState(0);
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  
  const itemsPerPage = 9;
  
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('edura_token'));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('edura_user') || '{}');
    } catch {
      return {};
    }
  });

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

  // Check pending payment khi component mount (user quay lại từ Momo)
  useEffect(() => {
    const checkPendingPayment = async () => {
      if (!isLoggedIn) return;
      
      const pendingOrderId = localStorage.getItem('pending_payment_orderId');
      if (!pendingOrderId) return;
      
      console.log('[QuizList] Found pending payment orderId:', pendingOrderId);
      
      try {
        // Gọi check payment status - endpoint này sẽ auto-query Momo và cộng điểm nếu thành công
        const status = await checkPaymentStatus(pendingOrderId);
        console.log('[QuizList] Payment status check result:', status);
        
        if (status.status === 'completed') {
          // Thanh toán thành công, cập nhật điểm
          const currentBalance = status.currentBalance !== undefined 
            ? status.currentBalance 
            : (status.points + (JSON.parse(localStorage.getItem('edura_user') || '{}').points || 0));
          
          setUserPoints(currentBalance);
          const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
          const updatedUser = { ...storedUser, points: currentBalance };
          localStorage.setItem('edura_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
          
          // Xóa pending orderId
          localStorage.removeItem('pending_payment_orderId');
          
          // Hiển thị thông báo thành công
          Swal.fire({
            icon: 'success',
            title: 'Thanh toán thành công!',
            html: `
              <p>Bạn đã nhận được <strong>${status.points} điểm</strong></p>
              <p>Số dư hiện tại: <strong>${currentBalance} điểm</strong></p>
              ${status.autoVerified ? '<p style="color: #2563EB; font-size: 12px; margin-top: 8px;">Đã tự động xác minh thanh toán</p>' : ''}
            `,
            timer: 3000,
            showConfirmButton: false
          });
        } else if (status.status === 'pending') {
          // Vẫn đang pending, giữ lại orderId để check lại sau
          console.log('[QuizList] Payment still pending, will check again later');
        } else {
          // Failed hoặc status khác, xóa pending orderId
          localStorage.removeItem('pending_payment_orderId');
        }
      } catch (error) {
        console.error('[QuizList] Error checking pending payment:', error);
        // Không xóa orderId nếu có lỗi, để có thể thử lại
      }
    };
    
    checkPendingPayment();
  }, [isLoggedIn]);

  // Load user points
  useEffect(() => {
    const loadUserPoints = async () => {
      if (isLoggedIn) {
        try {
          // Thử lấy từ localStorage trước
          const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
          if (storedUser.points !== undefined) {
            setUserPoints(storedUser.points || 0);
          } else {
            // Nếu không có trong localStorage, gọi API
            const profile = await getMyProfile();
            setUserPoints(profile.points || 0);
            // Cập nhật lại localStorage
            if (profile.points !== undefined) {
              const updatedUser = { ...storedUser, points: profile.points };
              localStorage.setItem('edura_user', JSON.stringify(updatedUser));
              setUser(updatedUser);
            }
          }
        } catch (error) {
          console.error('Error loading user points:', error);
          // Fallback: lấy từ user object nếu có
          const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
          setUserPoints(storedUser.points || 0);
        }
      } else {
        setUserPoints(0);
      }
    };
    loadUserPoints();
  }, [isLoggedIn]);

  async function load() {
    setLoading(true);
    try {
      const data = await listQuizzesAll();
      const quizzes = data.quizzes || [];
      setAllItems(quizzes);
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: 'error',
        title: 'Lỗi',
        text: e.message || 'Không thể tải danh sách trắc nghiệm'
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(()=>{ load(); }, []);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return allItems;
    }

    const query = searchQuery.toLowerCase().trim();
    return allItems.filter(quiz => {
      const title = (quiz.title || '').toLowerCase();
      const creatorName = (quiz.creatorName || '').toLowerCase();
      const creatorEmail = (quiz.creatorEmail || '').toLowerCase();
      const schoolName = (quiz.schoolName || '').toLowerCase();
      const categoryName = (quiz.categoryName || '').toLowerCase();
      
      return title.includes(query) ||
             creatorName.includes(query) ||
             creatorEmail.includes(query) ||
             schoolName.includes(query) ||
             categoryName.includes(query);
    });
  }, [searchQuery, allItems]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = useMemo(() => {
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, startIndex, endIndex]);

  const onStart = async (id) => {
    try {
      const payload = await startQuiz(id);
      
      // Cập nhật điểm nếu backend trả về currentBalance
      if (payload.currentBalance !== undefined && payload.currentBalance !== null) {
        const newBalance = Number(payload.currentBalance);
        if (!isNaN(newBalance)) {
          console.log('[QuizList] Cập nhật điểm sau khi bắt đầu làm bài:', newBalance);
          setUserPoints(newBalance);
          const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
          const updatedUser = { ...storedUser, points: newBalance };
          localStorage.setItem('edura_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
        }
      }
      
      localStorage.setItem('current_quiz', JSON.stringify(payload));
      window.location.href = `/quiz/${id}`;
    } catch (e) {
      if (String(e.message).includes('NOT_ENOUGH_POINTS')) {
        const ret = await Swal.fire({
          icon: 'warning',
          title: 'Thiếu điểm',
          text: 'Cần 5 điểm để bắt đầu. Bạn muốn nạp 20k để +50 điểm không?',
          showCancelButton: true,
          confirmButtonText: 'Nạp ngay',
          cancelButtonText: 'Hủy'
        });
        if (ret.isConfirmed) {
          try {
            const result = await topupPoints(20000);
            // Cập nhật điểm sau khi nạp
            if (result.balance !== undefined) {
              setUserPoints(result.balance);
              const updatedUser = { ...user, points: result.balance };
              localStorage.setItem('edura_user', JSON.stringify(updatedUser));
              setUser(updatedUser);
            }
            Swal.fire('Thành công', 'Bạn đã được +50 điểm. Bấm Bắt đầu lại để vào làm bài.', 'success');
          } catch (err) {
            Swal.fire('Lỗi', err.message || 'Nạp thất bại', 'error');
          }
        }
      } else {
        Swal.fire('Lỗi', e.message || 'Không bắt đầu được', 'error');
      }
    }
  };

  if (loading) {
    return (
      <div className="quiz-page">
        <div className="quiz-container">
          <div className="quiz-loading">Đang tải...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onUploadClick={() => {
          setIsSidebarOpen(false);
          if (!isLoggedIn) {
            Swal.fire({
              icon: 'warning',
              title: 'Yêu cầu đăng nhập',
              text: 'Bạn cần đăng nhập để tải tài liệu lên.',
              confirmButtonText: 'Đăng nhập',
              showCancelButton: true,
              cancelButtonText: 'Hủy'
            }).then((result) => {
              if (result.isConfirmed) {
                window.location.href = '/login';
              }
            });
            return;
          }
          window.location.href = '/upload';
        }}
        onAdminClick={user?.role === 'admin' ? () => {
          setIsSidebarOpen(false);
          window.location.href = '/admin';
        } : undefined}
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
              placeholder="Tìm kiếm trắc nghiệm..."
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
              {/* Hiển thị số điểm và nút nạp tiền */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  padding: '6px 12px',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                  borderRadius: '8px',
                  color: '#2563EB',
                  fontWeight: '600',
                  fontSize: '14px'
                }}>
                  <Coins size={16} />
                  <span>{userPoints} điểm</span>
                </div>
                <button
                  onClick={() => setIsTopupModalOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    backgroundColor: '#2563EB',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#1d4ed8';
                    e.target.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#2563EB';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  <Wallet size={16} />
                  <span>Nạp tiền</span>
                </button>
              </div>
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
                  setUserPoints(0);
                  window.location.href = '/';
                }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <button 
              className="login-button-header" 
              onClick={(e) => { 
                e.preventDefault(); 
                window.location.href = '/login';
              }}
            >
              Đăng nhập
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="quiz-page" style={{ paddingTop: '80px' }}>
        <div className="quiz-container">
          <div className="quiz-header">
            <h2>
              {searchQuery 
                ? `Kết quả tìm kiếm: "${searchQuery}" (${filteredItems.length} bài)`
                : `Tất cả bài trắc nghiệm (${filteredItems.length} bài)`
              }
            </h2>
            <a href="/quizzes/new" className="quiz-create-btn">
              <Plus size={18} />
              <span>Tạo từ DOC/DOCX</span>
            </a>
          </div>

        {filteredItems.length === 0 && !loading ? (
          <div className="quiz-empty">
            <p>
              {searchQuery 
                ? `Không tìm thấy bài trắc nghiệm nào với từ khóa "${searchQuery}"`
                : 'Chưa có bài trắc nghiệm nào'
              }
            </p>
          </div>
        ) : (
          <>
            <div className="quiz-list">
              {currentItems.map(i => (
              <div key={i.id} className="quiz-card">
                <div className="quiz-card-header">
                  <h3 className="quiz-title">{i.title}</h3>
                </div>

                {i.creatorName && (
                  <div className="quiz-creator">
                    Người tạo: <b>{i.creatorName}</b>{i.creatorEmail ? ` (${i.creatorEmail})` : ''}
                  </div>
                )}

                <div className="quiz-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} />
                    {i.numQuestions || 0} câu hỏi
                  </span>
                  {i.createdAt && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} />
                      {new Date(i.createdAt).toLocaleDateString('vi-VN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  )}
                </div>

                <div className="quiz-badges">
                  {i.schoolName && (
                    <span className="quiz-badge badge-school">
                      <School size={12} />
                      <span>Trường: {i.schoolName}</span>
                    </span>
                  )}
                  {i.categoryName && (
                    <span className="quiz-badge badge-category">
                      <Tag size={12} />
                      <span>Thể loại: {i.categoryName}</span>
                    </span>
                  )}
                </div>

                <button 
                  className="quiz-start-btn" 
                  onClick={() => onStart(i.id)}
                >
                  <Play size={18} style={{ marginRight: '8px' }} />
                  <span>Bắt đầu</span>
                </button>
              </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="quiz-pagination">
                <button
                  className="pagination-btn"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  aria-label="Trang trước"
                >
                  <ChevronLeft size={18} />
                  <span>Trước</span>
                </button>

                <div className="pagination-pages">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          className={`pagination-page ${currentPage === page ? 'active' : ''}`}
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </button>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return <span key={page} className="pagination-ellipsis">...</span>;
                    }
                    return null;
                  })}
                </div>

                <button
                  className="pagination-btn"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Trang sau"
                >
                  <span>Sau</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* Topup Modal */}
      <TopupModal
        isOpen={isTopupModalOpen}
        onClose={() => setIsTopupModalOpen(false)}
        onTopupSuccess={async (data) => {
          // Cập nhật điểm sau khi nạp thành công
          console.log('[QuizList] onTopupSuccess called with:', data);
          
          try {
            // Ưu tiên dùng balance từ callback (đã được tính từ backend)
            if (data.balance !== undefined && data.balance !== null) {
              console.log('[QuizList] Updating points from callback data:', data.balance);
              const balanceNum = Number(data.balance);
              if (!isNaN(balanceNum)) {
                setUserPoints(balanceNum);
                const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
                const updatedUser = { ...storedUser, points: balanceNum };
                localStorage.setItem('edura_user', JSON.stringify(updatedUser));
                setUser(updatedUser);
                console.log('[QuizList] Points updated successfully to:', balanceNum);
              } else {
                console.warn('[QuizList] Invalid balance value:', data.balance);
                throw new Error('Invalid balance value');
              }
            } else {
              // Fallback: Lấy điểm mới từ API
              console.log('[QuizList] Balance not in callback, fetching from API...');
              const profile = await getMyProfile();
              if (profile.points !== undefined && profile.points !== null) {
                const pointsNum = Number(profile.points);
                console.log('[QuizList] Points from API:', pointsNum);
                if (!isNaN(pointsNum)) {
                  setUserPoints(pointsNum);
                  const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
                  const updatedUser = { ...storedUser, points: pointsNum };
                  localStorage.setItem('edura_user', JSON.stringify(updatedUser));
                  setUser(updatedUser);
                  console.log('[QuizList] Points updated from API to:', pointsNum);
                } else {
                  console.warn('[QuizList] Invalid points from API:', profile.points);
                }
              } else {
                console.warn('[QuizList] No points in profile response');
              }
            }
          } catch (error) {
            console.error('[QuizList] Error updating points:', error);
            // Fallback cuối cùng: thử lấy từ API
            try {
              console.log('[QuizList] Fallback: Fetching points from API...');
              const profile = await getMyProfile();
              if (profile.points !== undefined && profile.points !== null) {
                const pointsNum = Number(profile.points);
                if (!isNaN(pointsNum)) {
                  setUserPoints(pointsNum);
                  const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
                  const updatedUser = { ...storedUser, points: pointsNum };
                  localStorage.setItem('edura_user', JSON.stringify(updatedUser));
                  setUser(updatedUser);
                  console.log('[QuizList] Points updated from API (fallback) to:', pointsNum);
                }
              }
            } catch (fallbackError) {
              console.error('[QuizList] Fallback error:', fallbackError);
            }
          }
        }}
      />
    </div>
  );
}
