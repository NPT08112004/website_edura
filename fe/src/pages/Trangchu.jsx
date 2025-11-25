import React, { useEffect, useMemo, useState } from "react";
import {
  Globe,
  Search,
  ArrowRight,
  Sparkles,
  BookOpen,
  Users,
  Clock,
  ChevronRight,
  Flame,
  Lightbulb,
} from "lucide-react";
import MessageDropdown from "../components/MessageDropdown";
import Footer from "../components/Footer";
import { getFeaturedDocumentsWeek, getCategories, checkPaymentStatus, getMyProfile } from "../api";
import Swal from "sweetalert2";
import "../assets/styles/Trangchu.css";

export default function Trangchu() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem("edura_token")
  );
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("edura_user") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const handleStorageChange = () => {
      setIsLoggedIn(!!localStorage.getItem("edura_token"));
      try {
        setUser(JSON.parse(localStorage.getItem("edura_user") || "{}"));
      } catch {
        setUser({});
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Check pending payment khi component mount (user quay lại từ Momo)
  useEffect(() => {
    const checkPendingPayment = async () => {
      if (!isLoggedIn) return;
      
      const pendingOrderId = localStorage.getItem('pending_payment_orderId');
      if (!pendingOrderId) return;
      
      console.log('[Trangchu] Found pending payment orderId:', pendingOrderId);
      
      try {
        // Gọi check payment status - endpoint này sẽ auto-query Momo và cộng điểm nếu thành công
        const status = await checkPaymentStatus(pendingOrderId);
        console.log('[Trangchu] Payment status check result:', status);
        
        if (status.status === 'completed') {
          // Thanh toán thành công, cập nhật điểm
          const currentBalance = status.currentBalance !== undefined 
            ? status.currentBalance 
            : (status.points + (JSON.parse(localStorage.getItem('edura_user') || '{}').points || 0));
          
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
          console.log('[Trangchu] Payment still pending, will check again later');
        } else {
          // Failed hoặc status khác, xóa pending orderId
          localStorage.removeItem('pending_payment_orderId');
        }
      } catch (error) {
        console.error('[Trangchu] Error checking pending payment:', error);
        // Không xóa orderId nếu có lỗi, để có thể thử lại
      }
    };
    
    checkPendingPayment();
  }, [isLoggedIn]);

  const stats = useMemo(
    () => [
      { label: "Tài liệu đã được chia sẻ", value: "5,200+" },
      { label: "Sinh viên đang sử dụng", value: "1,300+" },
      { label: "Truy cập mọi lúc mọi nơi", value: "24/7" },
    ],
    []
  );

  const suggestedKeywords = useMemo(
    () => [
      "Giải tích 1",
      "Hệ điều hành",
      "Cấu trúc dữ liệu",
      "Tiếng Anh chuyên ngành",
      "Marketing căn bản",
    ],
    []
  );

  const [featuredDocuments, setFeaturedDocuments] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  useEffect(() => {
    const loadFeaturedDocuments = async () => {
      try {
        setFeaturedLoading(true);
        const res = await getFeaturedDocumentsWeek(5);
        const docs = res?.documents || [];
        
        // Format dữ liệu để hiển thị
        const formatted = docs.map((doc) => ({
          _id: doc._id,
          title: doc.title || "Không có tiêu đề",
          meta: doc.meta || "Tài liệu",
          badges: doc.badges || [],
          grade: doc.grade || "N/A",
          gradeScore: doc.gradeScore || "0.0",
          views: `${doc.views || 0} lượt xem`,
          downloads: `${doc.downloads || 0} lượt tải`,
          time: doc.time || "Không xác định",
        }));
        
        setFeaturedDocuments(formatted);
      } catch (error) {
        console.error("Lỗi khi tải tài liệu nổi bật:", error);
        setFeaturedDocuments([]);
      } finally {
        setFeaturedLoading(false);
      }
    };
    
    loadFeaturedDocuments();
  }, []);

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCategoriesLoading(true);
        const cats = await getCategories();
        setCategories(cats || []);
      } catch (error) {
        console.error("Lỗi khi tải danh mục:", error);
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };
    
    loadCategories();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/home?search=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  const handleKeywordClick = (keyword) => {
    window.location.href = `/home?search=${encodeURIComponent(keyword)}`;
  };

  const quickLinks = useMemo(
    () => [
      {
        icon: <Sparkles size={16} />,
        title: "Tài liệu vừa tải lên",
        description: "Xem những file mới nhất từ cộng đồng",
      },
      {
        icon: <Flame size={16} />,
        title: "Đề cương ôn thi cuối kì",
        description: "Tổng hợp đề cương được xem nhiều",
      },
      {
        icon: <Lightbulb size={16} />,
        title: "Tài liệu theo trường",
        description: "Lọc tài liệu theo trường / khoa của bạn",
      },
      {
        icon: <BookOpen size={16} />,
        title: "Tài liệu mình đã lưu",
        description: "Tất cả tài liệu bạn đã bookmark",
      },
    ],
    []
  );

  const menuItems = useMemo(
    () => [
      { key: "about", label: "Edura là gì?", href: "/#gioi-thieu" },
      { key: "quiz", label: "Trắc nghiệm", href: "/quizzes" },
      { key: "messages", label: "Nhắn tin", href: "/message" },
      { key: "schools", label: "Trường học", href: "/schools" },
      { key: "all", label: "Tất cả tài liệu", href: "/home" },
    ],
    []
  );

  const isAdmin = user?.role === "admin";

  const handleNavClick = (item) => {
    if (item.href) {
      window.location.href = item.href;
    }
  };

  const handleUploadClick = () => {
    window.location.href = "/upload";
  };

  const handleAdminClick = () => {
    window.location.href = "/admin";
  };

  return (
    <div className="trangchu-page">
      <div className="floating-shape floating-shape--top" aria-hidden="true" />
      <div className="floating-shape floating-shape--left" aria-hidden="true" />
      <div className="floating-shape floating-shape--left-center" aria-hidden="true" />
      <div className="floating-shape floating-shape--center" aria-hidden="true" />
      <div className="floating-shape floating-shape--bottom" aria-hidden="true" />
      <header className="home-header">
        <div className="header-left">
          <div
            className="logo-section"
            onClick={() => (window.location.href = "/")}
            style={{ cursor: "pointer" }}
          >
            <div className="logo-badge">
              <span className="logo-number">87</span>
            </div>
            <span className="brand-text">Edura</span>
          </div>
        </div>
        <div className="header-center">
          <nav className="trangchu-nav">
            {menuItems.map((item) => (
              <button
                key={item.key}
                className="trangchu-nav__link"
                onClick={() => handleNavClick(item)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="header-right">
          <div className="language-selector">
            <Globe size={18} />
            <span>Tiếng Việt</span>
          </div>
          <div className="header-action-buttons">
            <button className="header-upload-btn" onClick={handleUploadClick}>
              Tải tài liệu lên
            </button>
            {isAdmin && (
              <button className="header-admin-btn" onClick={handleAdminClick}>
                Quản lý
              </button>
            )}
          </div>
          {isLoggedIn ? (
            <>
              <MessageDropdown />
              <span className="user-email-header">
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
            <button
              className="login-button-header"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = "/login";
              }}
            >
              Đăng nhập
            </button>
          )}
        </div>
      </header>

      <main className="trangchu-main">
        <section className="hero-section">
          <div className="hero-left">
            <span className="hero-badge">
              <Sparkles size={16} />
              BETA Chia sẻ tài liệu, tiết kiệm thời gian ôn thi
            </span>
            <h1 className="hero-title">
              Nơi sinh viên <span>chia sẻ tài liệu học tập</span>,{" "}
              <span>đề cương</span>, <span>đề thi</span> chỉ trong vài cú click.
            </h1>
            <p className="hero-subtitle">
              Tìm kiếm nhanh tài liệu theo môn học, trường, hoặc từ khóa. Tải
              lên tài liệu của bạn để giúp cộng đồng &amp; tích điểm thưởng.
            </p>
            <div className="hero-actions">
              <button
                className="hero-primary"
                onClick={() => {
                  window.location.href = "/home";
                }}
              >
                <Search size={18} />
                Bắt đầu tìm tài liệu
              </button>
              <button
                className="hero-secondary"
                onClick={() => (window.location.href = "/upload")}
              >
                <UploadIcon />
                Tải tài liệu đầu tiên của bạn
              </button>
            </div>
            <div className="hero-stats">
              {stats.map((item) => (
                <div key={item.label} className="hero-stat">
                  <span className="hero-stat-value">{item.value}</span>
                  <span className="hero-stat-label">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-right">
            <div className="search-card">
              <h3>Tìm nhanh tài liệu</h3>
              <p>Gõ tên môn học, mã môn, hoặc từ khóa bất kỳ.</p>
              <form className="search-input-wrapper" onSubmit={handleSearch}>
                <input
                  type="text"
                  placeholder="Ví dụ: Giải tích 1, Hệ điều hành, Mác - Lênin..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="search-button">
                  <Search size={18} />
                  Tìm
                </button>
              </form>
              <div className="suggested-keywords">
                <span className="suggested-label">Từ khóa gợi ý:</span>
                <div className="keyword-list">
                  {suggestedKeywords.map((keyword) => (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() => handleKeywordClick(keyword)}
                      style={{ cursor: "pointer" }}
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
              </div>
              <div className="search-note">
                <span>
                  💡 Mẹo: Gõ <strong>"mã môn + đề cương"</strong> để tìm đúng tài
                  liệu bạn cần.
                </span>
                <span>🔍 Sắp có: lọc theo trường &amp; khoa</span>
              </div>
            </div>
          </div>
        </section>

        <section className="content-section">
          <div className="featured-documents">
            <div className="section-header">
              <div>
                <h2>Tài liệu nổi bật tuần này</h2>
                <p>Được xem nhiều &amp; đánh giá cao bởi cộng đồng sinh viên.</p>
              </div>
              <button
                className="see-all"
                onClick={() => (window.location.href = "/home")}
              >
                Xem tất cả <ArrowRight size={16} />
              </button>
            </div>

            <div className="document-list">
              {featuredLoading ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                  Đang tải tài liệu nổi bật...
                </div>
              ) : featuredDocuments.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                  Chưa có tài liệu nổi bật trong tuần này.
                </div>
              ) : (
                featuredDocuments.map((doc) => (
                  <article
                    key={doc._id || doc.title}
                    className="document-card-v2"
                    onClick={() => {
                      if (doc._id) {
                        window.location.href = `/document/${doc._id}`;
                      }
                    }}
                    style={{ cursor: doc._id ? "pointer" : "default" }}
                  >
                    <div className="doc-icon">
                      <BookOpen size={28} />
                    </div>
                    <div className="doc-info">
                      <div className="doc-header">
                        <h3>{doc.title}</h3>
                        <div className="doc-grade">
                          <span className="grade-badge">{doc.grade}</span>
                          <span className="grade-score">({doc.gradeScore})</span>
                        </div>
                      </div>
                      <p className="doc-meta">{doc.meta}</p>
                      <div className="doc-tags">
                        {doc.badges && doc.badges.length > 0 ? (
                          doc.badges.map((badge, idx) => (
                            <span key={idx}>{badge}</span>
                          ))
                        ) : (
                          <span>Tài liệu</span>
                        )}
                      </div>
                    </div>
                    <div className="doc-stats">
                      <div className="doc-stat">
                        <Users size={16} />
                        <span>{doc.views}</span>
                      </div>
                      <div className="doc-stat">
                        <DownloadIcon />
                        <span>{doc.downloads}</span>
                      </div>
                      <div className="doc-stat">
                        <Clock size={16} />
                        <span>{doc.time}</span>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <aside className="sidebar-widgets">
            <div className="category-card">
              <div className="section-header">
                <div>
                  <h2>Khám phá theo ngành học</h2>
                  <p>Chọn ngành để xem tài liệu liên quan.</p>
                </div>
              </div>
              <div className="category-list">
                {categoriesLoading ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                    Đang tải danh mục...
                  </div>
                ) : categories.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                    Chưa có danh mục nào.
                  </div>
                ) : (
                  <>
                    {categories.slice(0, 7).map((category) => (
                      <button
                        key={category._id || category.name}
                        onClick={() => {
                          if (category._id) {
                            window.location.href = `/home?categoryId=${category._id}`;
                          }
                        }}
                        style={{ cursor: category._id ? "pointer" : "default" }}
                      >
                        {category.name || category}
                        <ChevronRight size={14} />
                      </button>
                    ))}
                    {categories.length > 7 && (
                      <button
                        onClick={() => {
                          window.location.href = `/home`;
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        Xem thêm...
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="quick-links-card">
              <div className="section-header">
                <div>
                  <h2>Lối tắt hữu ích</h2>
                  <p>Truy cập nhanh những khu vực quan trọng.</p>
                </div>
              </div>
              <div className="quick-links">
                {quickLinks.map((link) => (
                  <button key={link.title} className="quick-link-item">
                    <span className="quick-link-icon">{link.icon}</span>
                    <span>
                      <strong>{link.title}</strong>
                      <small>{link.description}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 5v14M5 12l7-7 7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15V3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

