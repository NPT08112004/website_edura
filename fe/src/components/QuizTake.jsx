// src/QuizTake.jsx
import React, { useEffect, useState } from 'react';
import { submitQuiz } from '../api';
import Swal from 'sweetalert2';
import { ArrowLeft, Menu, Search, Globe } from 'lucide-react';
import Sidebar from './Sidebar';
import MessageDropdown from './MessageDropdown';
import '../assets/styles/Quiz.css';
import '../assets/styles/HomePage.css';

export default function QuizTake() {
  const [paper, setPaper] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
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
    try {
      const obj = JSON.parse(localStorage.getItem('current_quiz') || 'null');
      setPaper(obj);
    } catch {
      setPaper(null);
    }
  }, []);

  if (!paper) {
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
          <div className="quiz-container">
            <div className="quiz-error">
              Không tìm thấy đề thi. Hãy quay lại danh sách và bấm <b>Bắt đầu</b> để vào làm bài.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = async () => {
    const arr = paper.questions.map(q => ({
      qid: q.id,
      choice: answers[q.id] || null
    }));

    const missing = arr.filter(a => !a.choice).length;
    if (missing > 0) {
      const ok = await Swal.fire({
        icon: 'question',
        title: 'Chưa chọn hết đáp án',
        text: `Bạn còn ${missing} câu chưa chọn. Vẫn nộp bài?`,
        showCancelButton: true,
        confirmButtonText: 'Vẫn nộp',
        cancelButtonText: 'Quay lại'
      });
      if (!ok.isConfirmed) return;
    }

    setSubmitting(true);
    try {
      const { correct, total } = await submitQuiz(paper.quizId, arr);
      setResult({ correct, total });
      await Swal.fire({
        icon: 'success',
        title: 'Kết quả',
        text: `Bạn đúng ${correct} / ${total} câu`,
        confirmButtonText: 'Đóng'
      });
    } catch (e) {
      console.error('[QuizTake] submit error:', e);
      Swal.fire({
        icon: 'error',
        title: 'Lỗi',
        text: e.message || 'Nộp bài thất bại'
      });
    } finally {
      setSubmitting(false);
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
        <div className="quiz-take-container">
        <div className="quiz-take-header">
          <h2>{paper.title || 'Bài trắc nghiệm'}</h2>
        </div>

        {result && (
          <div className="quiz-result-banner">
            Kết quả: Đúng {result.correct} / {result.total} câu
          </div>
        )}

        <div className="quiz-questions">
          {paper.questions.map((q, idx) => (
            <div key={q.id} className="quiz-question">
              <div className="quiz-question-number">
                Câu {idx + 1}:
              </div>
              <div className="quiz-question-text">
                {q.text}
              </div>
              <div className="quiz-choices">
                {q.choices.map((c) => (
                  <label key={c.id} className="quiz-choice">
                    <input
                      type="radio"
                      name={q.id}
                      value={c.id}
                      checked={answers[q.id] === c.id}
                      onChange={() => setAnswers({ ...answers, [q.id]: c.id })}
                      disabled={!!result}
                    />
                    <span className="choice-label">
                      {c.id}. {c.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="quiz-actions">
          <button 
            className="quiz-submit-btn" 
            onClick={onSubmit} 
            disabled={submitting || !!result}
          >
            {submitting ? 'Đang nộp...' : result ? 'Đã nộp bài' : 'Nộp bài'}
          </button>
          <a
            href="/quizzes"
            className="quiz-back-btn"
            onClick={(e) => {
              e.preventDefault();
              localStorage.removeItem('current_quiz');
              window.location.href = '/quizzes';
            }}
          >
            <ArrowLeft size={18} />
            <span>Về danh sách</span>
          </a>
        </div>
        </div>
      </div>
    </div>
  );
}
