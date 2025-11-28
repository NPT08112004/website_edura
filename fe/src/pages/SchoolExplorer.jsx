import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Search, ArrowRight, Loader, Globe, Menu, Sparkles, TrendingUp, BookOpen } from "lucide-react";
import { getPopularSchools, searchSchools } from "../api";
import MessageDropdown from "../components/MessageDropdown";
import Sidebar from "../components/Sidebar";
import Logo from "../components/Logo";
import "../assets/styles/SchoolExplorer.css";

export default function SchoolExplorer() {
  const navigate = useNavigate();
  const [popularSchools, setPopularSchools] = useState([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isLoggedIn = !!localStorage.getItem("edura_token");
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("edura_user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const loadPopular = async () => {
      try {
        setPopularLoading(true);
        const data = await getPopularSchools(16);
        setPopularSchools(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load popular schools", error);
        setErrorMessage("Không thể tải danh sách trường nổi bật. Vui lòng thử lại sau.");
      } finally {
        setPopularLoading(false);
      }
    };
    loadPopular();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setErrorMessage("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        // Tăng số lượng kết quả từ 8 lên 20 để hiển thị nhiều hơn
        const results = await searchSchools(searchQuery.trim(), 20);
        setSearchResults(results || []);
        if (!results || results.length === 0) {
          setErrorMessage("Không tìm thấy trường phù hợp với từ khóa.");
        } else {
          setErrorMessage("");
        }
      } catch (error) {
        console.error("Failed to search schools", error);
        setErrorMessage("Không thể tìm kiếm trường học lúc này.");
      } finally {
        setSearching(false);
      }
    }, 300); // Giảm debounce từ 350ms xuống 300ms để phản hồi nhanh hơn

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setErrorMessage("Vui lòng nhập tên trường cần tìm.");
      return;
    }
    if (searchResults.length > 0) {
      navigate(`/schools/${searchResults[0]._id}`);
    }
  };

  const handleSchoolClick = (school) => {
    navigate(`/schools/${school._id}`);
  };

  const handleQuickSearch = (schoolName) => {
    setSearchQuery(schoolName);
  };

  const handleUploadClick = () => {
    navigate("/upload");
    setIsSidebarOpen(false);
  };

  const handleAdminClick = () => {
    navigate("/admin");
    setIsSidebarOpen(false);
  };

  // Top 6 schools for quick suggestions
  const quickSuggestions = useMemo(() => {
    return popularSchools.slice(0, 6);
  }, [popularSchools]);

  // Highlight search query in text
  const highlightText = (text, query) => {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="highlight-match">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="school-explorer-page">
      <div className="floating-shape floating-shape--top" aria-hidden="true" />
      <div className="floating-shape floating-shape--left" aria-hidden="true" />
      <div className="floating-shape floating-shape--left-center" aria-hidden="true" />
      <div className="floating-shape floating-shape--center" aria-hidden="true" />
      <div className="floating-shape floating-shape--bottom" aria-hidden="true" />
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        onUploadClick={handleUploadClick}
        onAdminClick={isAdmin ? handleAdminClick : undefined}
      />
      
      <header className="school-explorer-header">
        <div className="header-left">
          <button 
            className="menu-toggle"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Mở menu"
          >
            <Menu size={24} />
          </button>
          <Logo 
            onClick={() => navigate("/")}
            showText={false}
            size="default"
          />
        </div>
        <div className="header-center"></div>
        <div className="header-right">
          <div className="language-selector">
            <Globe size={18} />
            <span>Tiếng Việt</span>
          </div>
          {isLoggedIn ? (
            <>
              <MessageDropdown />
              <span 
                className="user-email-header"
                onClick={() => navigate('/profile')}
                style={{ cursor: 'pointer' }}
              >
                {user.fullName || user.username || "Người dùng"}
              </span>
              <button
                className="logout-button-header"
                onClick={(e) => {
                  e.preventDefault();
                  localStorage.removeItem("edura_token");
                  localStorage.removeItem("edura_user");
                  window.location.href = "/";
                }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <button
                className="login-button-header"
                onClick={() => navigate("/login")}
              >
                Đăng nhập
              </button>
              <button
                className="register-button-header"
                onClick={() => navigate("/register")}
              >
                Đăng ký
              </button>
            </>
          )}
        </div>
      </header>

      <main className="school-explorer-main">
        {/* Hero Search Section */}
        <section className="search-hero-section">
          <div className="hero-content">
            <div className="hero-badge">
              <Sparkles size={16} />
              <span>Tìm kiếm trường học của bạn</span>
            </div>
            <h1 className="hero-title">
              Khám phá <span className="highlight">tài liệu học tập</span> từ cộng đồng sinh viên
            </h1>
            <p className="hero-subtitle">
              Tìm kiếm theo tên trường, khoa hoặc mã môn học để truy cập hàng nghìn tài liệu được chia sẻ
            </p>
          </div>

          {/* Main Search Bar */}
          <div className="main-search-container">
            <form className="main-search-form" onSubmit={handleSearchSubmit}>
              <div className="search-bar-wrapper">
                <div className="search-icon-wrapper">
                  <Search size={24} />
                </div>
                <input
                  type="text"
                  placeholder="Ví dụ: Đại học Bách khoa, Đại học Kinh tế, Đại học Công nghệ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="main-search-input"
                  autoFocus
                  aria-label="Tìm kiếm trường học"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="clear-search-button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Xóa tìm kiếm"
                  >
                    ×
                  </button>
                )}
                <button 
                  type="submit" 
                  className="search-submit-button"
                  disabled={searching}
                  aria-label="Tìm kiếm"
                >
                  {searching ? (
                    <Loader size={20} className="spin" />
                  ) : (
                    <>
                      <Search size={18} />
                      <span>Tìm kiếm</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Suggestions */}
            {!searchQuery && quickSuggestions.length > 0 && (
              <div className="quick-suggestions">
                <div className="suggestions-header">
                  <TrendingUp size={16} />
                  <span>Tìm kiếm nhanh:</span>
                </div>
                <div className="suggestions-list">
                  {quickSuggestions.map((school) => (
                    <button
                      key={school._id}
                      type="button"
                      className="suggestion-chip"
                      onClick={() => handleQuickSearch(school.name)}
                    >
                      <Building2 size={14} />
                      <span>{school.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search Status */}
            {searching && (
              <div className="search-status-message">
                <Loader size={18} className="spin" />
                <span>Đang tìm kiếm trường học...</span>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && !searching && (
              <div className="search-error-message" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="search-results-container">
              <div className="results-header">
                <h2>Tìm thấy {searchResults.length} trường học</h2>
              </div>
              <div className="search-results-grid">
                {searchResults.map((school) => (
                  <button
                    key={school._id}
                    type="button"
                    className="result-card"
                    onClick={() => handleSchoolClick(school)}
                  >
                    <div className="result-card-icon">
                      <Building2 size={24} />
                    </div>
                    <div className="result-card-content">
                      <h3 className="result-card-title">
                        {highlightText(school.name, searchQuery)}
                      </h3>
                      {school.shortName && school.shortName.toLowerCase() !== school.name.toLowerCase() && (
                        <div className="result-card-subtitle">
                          {highlightText(school.shortName, searchQuery)}
                        </div>
                      )}
                      <div className="result-card-meta">
                        <BookOpen size={14} />
                        <span>{school.documentCount || 0} tài liệu</span>
                      </div>
                    </div>
                    <div className="result-card-arrow">
                      <ArrowRight size={18} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Popular Schools Section - Only show when no search query */}
        {!searchQuery && (
          <section className="popular-schools-section">
            <div className="section-header">
              <div className="section-title-wrapper">
                <TrendingUp size={24} />
                <h2 className="section-title">Trường học phổ biến</h2>
              </div>
              <p className="section-subtitle">
                Khám phá các trường đại học và học viện được nhiều sinh viên quan tâm
              </p>
            </div>
            {popularLoading ? (
              <div className="loading-state">
                <Loader size={32} className="spin" />
                <p>Đang tải danh sách trường...</p>
              </div>
            ) : popularSchools.length === 0 ? (
              <div className="empty-state">
                <Building2 size={48} />
                <p>Hiện chưa có trường nổi bật để hiển thị</p>
                <span>Hãy quay lại sau để xem các trường phổ biến</span>
              </div>
            ) : (
              <div className="popular-grid">
                {popularSchools.map((school) => (
                  <article
                    key={school._id}
                    className="school-card"
                    onClick={() => handleSchoolClick(school)}
                  >
                    <div className="school-card-icon">
                      <Building2 size={24} />
                    </div>
                    <div className="school-card-content">
                      <h3 className="school-card-title">{school.name}</h3>
                      <div className="school-card-meta">
                        <BookOpen size={14} />
                        <span className="document-count">
                          {school.documentCount || 0} tài liệu
                        </span>
                      </div>
                    </div>
                    <div className="school-card-arrow">
                      <ArrowRight size={18} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

