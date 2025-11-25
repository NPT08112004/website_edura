import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { createQuizFromDoc, getSchools, getCategories } from '../api';
import { FileText, Upload, Menu, Search, Globe } from 'lucide-react';
import Sidebar from './Sidebar';
import MessageDropdown from './MessageDropdown';
import '../assets/styles/Quiz.css';
import '../assets/styles/HomePage.css';

export default function QuizUpload() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [schools, setSchools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
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

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([getSchools(), getCategories()]);
        setSchools(s.schools || s.data || s || []);
        setCategories(c.categories || c.data || c || []);
      } catch (e) {
        console.error('Load lookups error', e);
        Swal.fire({
          icon: 'error',
          title: 'Lỗi',
          text: 'Không thể tải danh sách trường và thể loại'
        });
      }
    })();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      return Swal.fire({
        icon: 'warning',
        title: 'Thiếu file',
        text: 'Vui lòng chọn file .doc hoặc .docx'
      });
    }
    if (!title.trim()) {
      return Swal.fire({
        icon: 'warning',
        title: 'Thiếu tên',
        text: 'Vui lòng nhập tên bộ trắc nghiệm'
      });
    }
    
    setLoading(true);
    try {
      const payload = await createQuizFromDoc(file, {
        title: title.trim(),
        schoolId: schoolId || undefined,
        categoryId: categoryId || undefined
      });
      Swal.fire({
        icon: 'success',
        title: 'Thành công',
        text: `Đã tạo: ${payload.title} (${payload.numQuestions} câu)`,
        confirmButtonText: 'Đóng'
      });
      window.location.href = '/quizzes';
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Lỗi',
        text: e.message || 'Không tạo được bài trắc nghiệm'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
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
              disabled
            />
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
      <div className="quiz-page" style={{ paddingTop: '80px' }}>
        <div className="quiz-upload-container">
        <div className="quiz-upload-header">
          <h2>Tạo trắc nghiệm từ DOC/DOCX</h2>
        </div>

        <form onSubmit={onSubmit} className="quiz-upload-form">
          <div className="quiz-form-group">
            <label htmlFor="quiz-title">
              Tên bộ trắc nghiệm <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              id="quiz-title"
              type="text"
              placeholder="VD: Ôn tập Chương 1 - SQL"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="quiz-form-row">
            <div className="quiz-form-group">
              <label htmlFor="quiz-school">Trường</label>
              <select 
                id="quiz-school"
                value={schoolId} 
                onChange={(e) => setSchoolId(e.target.value)}
                disabled={loading}
              >
                <option value="">-- Không chọn --</option>
                {schools.map(s => (
                  <option key={s._id || s.id} value={s._id || s.id}>
                    {s.name || s.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="quiz-form-group">
              <label htmlFor="quiz-category">Thể loại</label>
              <select 
                id="quiz-category"
                value={categoryId} 
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={loading}
              >
                <option value="">-- Không chọn --</option>
                {categories.map(c => (
                  <option key={c._id || c.id} value={c._id || c.id}>
                    {c.name || c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="quiz-form-group">
            <label htmlFor="quiz-file">
              Chọn file (.doc/.docx) <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input 
              id="quiz-file"
              type="file" 
              accept=".doc,.docx" 
              onChange={(ev) => setFile(ev.target.files?.[0] || null)}
              required
              disabled={loading}
            />
            {file && (
              <div style={{ 
                marginTop: 8, 
                padding: 12, 
                background: 'var(--bg-light)', 
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text-dark)',
                fontSize: 14
              }}>
                <FileText size={18} />
                <span>{file.name}</span>
              </div>
            )}
          </div>

          <button 
            type="submit"
            className="quiz-submit-form-btn" 
            disabled={loading}
          >
            {loading ? (
              <>
                <span>Đang tạo...</span>
              </>
            ) : (
              <>
                <Upload size={18} />
                <span>Tạo bài trắc nghiệm</span>
              </>
            )}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}
