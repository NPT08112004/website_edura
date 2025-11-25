// src/components/DocumentViewer.jsx
// Layout kiểu Scribd. Xem trước & tải file qua BE /api/documents/:id/raw (proxy S3) => tránh CORS.

import React, { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import {
  Download, Share2, Printer, Bookmark, ArrowLeft, Sparkles, Menu, Search, X, Globe, Paperclip, Send
} from "lucide-react";
import { io } from "socket.io-client";
import {
  getDocumentById,
  getDocumentRawUrl,
  incrementDocumentViews,
  getDocuments,
  getChatHistory,
  uploadChatImage,
  getDocumentReactions,
  updateDocumentReaction,
  getDocumentComments,
  postDocumentComment,
} from "../api";
import Sidebar from "./Sidebar";
import MessageDropdown from "./MessageDropdown";
import { getInitials } from "../utils/avatarUtils";
import "../assets/styles/DocumentViewer.css";
import "../assets/styles/HomePage.css";
import "../assets/styles/DocumentDetail.css";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export default function DocumentViewer({ documentId, onBack }) {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('edura_token'));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('edura_user') || '{}');
    } catch {
      return {};
    }
  });

  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [suggestedDocuments, setSuggestedDocuments] = useState([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [conversationKey, setConversationKey] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [partner, setPartner] = useState(null);
  const [me, setMe] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("edura_user") || "null");
    } catch {
      return null;
    }
  });
  const [sending, setSending] = useState(false);
  const [reactionCounts, setReactionCounts] = useState({ likes: 0, dislikes: 0 });
  const [myReaction, setMyReaction] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fetchedMessageIds = useRef(new Set());

  useEffect(() => {
    const handleStorageChange = () => {
      setIsLoggedIn(!!localStorage.getItem('edura_token'));
      try {
        const storedUser = JSON.parse(localStorage.getItem('edura_user') || '{}');
        setUser(storedUser);
        setMe(storedUser);
      } catch {
        setUser({});
        setMe(null);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    let alive = true;
    setPdfLoading(true);
    (async () => {
      try {
        const m = await getDocumentById(documentId);
        if (alive) setMeta(m || null);
        try {
          const viewResult = await incrementDocumentViews(documentId);
          if (alive && viewResult?.views !== undefined && m) {
            setMeta({ ...m, views: viewResult.views });
          }
        } catch (viewError) {
          console.warn("Không thể cập nhật lượt xem:", viewError);
        }
      } catch (e) {
        console.error(e);
        Swal.fire("Lỗi", String(e?.message || e), "error");
        onBack?.();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [documentId]);

  useEffect(() => {
    if (meta) {
      fetchReactions();
      fetchComments();
      loadSuggestedDocuments();
    }
  }, [meta]);

  const loadSuggestedDocuments = async () => {
    if (!meta || !meta.keywords || meta.keywords.length === 0) {
      setSuggestedDocuments([]);
      return;
    }

    try {
      setSuggestedLoading(true);
      // Lấy từ khóa đầu tiên để tìm kiếm
      const searchKeyword = Array.isArray(meta.keywords) ? meta.keywords[0] : meta.keywords;
      
      // Tìm kiếm tài liệu có từ khóa tương đồng, loại trừ tài liệu hiện tại
      const data = await getDocuments(searchKeyword, {}, 1, 8);
      
      let documentsList = [];
      if (Array.isArray(data)) {
        documentsList = data;
      } else if (data && data.documents && Array.isArray(data.documents)) {
        documentsList = data.documents;
      } else if (data && Array.isArray(data.data)) {
        documentsList = data.data;
      } else if (data && typeof data === 'object') {
        const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
        if (arrayKeys.length > 0) {
          documentsList = data[arrayKeys[0]];
        }
      }
      
      // Lọc bỏ tài liệu hiện tại và giới hạn 7 tài liệu
      const filtered = documentsList
        .filter(doc => doc._id !== documentId && doc.id !== documentId)
        .slice(0, 7);
      
      setSuggestedDocuments(filtered);
    } catch (error) {
      console.error("Lỗi khi tải tài liệu gợi ý:", error);
      setSuggestedDocuments([]);
    } finally {
      setSuggestedLoading(false);
    }
  };

  const rawUrl = useMemo(() => getDocumentRawUrl(documentId), [documentId]);
  const fileUrl = meta?.s3_url || meta?.s3Url || "";
  const isPdf = fileUrl?.toLowerCase().endsWith(".pdf");

  const summaryDisplay = useMemo(() => {
    if (!meta?.summary) return { text: "", needsExpand: false };
    const trimmed = meta.summary.trim();
    if (!trimmed) return { text: "", needsExpand: false };
    
    // Ước tính: ~60 ký tự mỗi dòng (với line-height 1.7 và font-size 15px)
    // 4 dòng = ~240 ký tự
    const maxChars = 240;
    
    if (trimmed.length <= maxChars) {
      return { text: trimmed, needsExpand: false };
    }
    
    if (summaryExpanded) {
      return { text: trimmed, needsExpand: true, isExpanded: true };
    }
    
    // Cắt text và tìm khoảng trắng gần nhất để không cắt giữa từ
    let result = trimmed.slice(0, maxChars);
    const lastSpace = result.lastIndexOf(' ');
    const lastNewline = result.lastIndexOf('\n');
    const cutPoint = Math.max(lastSpace, lastNewline);
    
    if (cutPoint > maxChars * 0.7) {
      result = result.slice(0, cutPoint);
    }
    
    return { text: result, needsExpand: true, isExpanded: false };
  }, [meta?.summary, summaryExpanded]);

  const formatRelativeTime = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      const now = new Date();
      const diff = now - date;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      const weeks = Math.floor(days / 7);
      const months = Math.floor(days / 30);
      const years = Math.floor(days / 365);

      if (seconds < 60) return "Vừa xong";
      if (minutes < 60) return `${minutes} phút trước`;
      if (hours < 24) return `${hours} giờ trước`;
      if (days < 7) return `${days} ngày trước`;
      if (weeks < 4) return `${weeks} tuần trước`;
      if (months < 12) return `${months} tháng trước`;
      if (years >= 1) return `${years} năm trước`;
      return date.toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: "numeric" });
    } catch (err) {
      return "";
    }
  };

  const ensureSocket = () => {
    if (socketRef.current) return socketRef.current;
    const token = localStorage.getItem("edura_token");
    if (!token) throw new Error("NOT_AUTH");
    const socket = io(BASE_URL, {
      transports: ["websocket"],
      query: { token },
    });

    socket.on("chat:joined", (payload) => {
      if (payload?.conversationKey) setConversationKey(payload.conversationKey);
    });

    socket.on("chat:message", (payload) => {
      if (!payload?.id) return;
      fetchedMessageIds.current ??= new Set();
      if (fetchedMessageIds.current.has(payload.id)) return;
      fetchedMessageIds.current.add(payload.id);
      setMessages((prev) => [...prev, payload]);
    });

    socket.on("chat:error", (payload) => {
      setChatError(payload?.message || "Có lỗi xảy ra trong phiên chat.");
    });

    socketRef.current = socket;
    return socket;
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!chatOpen || !meta?.uploaderId) return;

    const token = localStorage.getItem("edura_token");
    if (!token) {
      Swal.fire("Thông báo", "Bạn cần đăng nhập để nhắn tin.", "info");
      setChatOpen(false);
      return;
    }

    let cancelled = false;
    setChatLoading(true);
    setChatError("");

    getChatHistory(documentId, meta.uploaderId)
      .then((payload) => {
        if (cancelled) return;
        const history = payload?.messages || [];
        fetchedMessageIds.current = new Set(history.map((m) => m.id));
        setMessages(history);
        if (payload?.conversationKey) setConversationKey(payload.conversationKey);
        if (payload?.partner) setPartner(payload.partner);
        if (payload?.me) setMe(payload.me);
        const socket = ensureSocket();
        socket.emit("chat:join", {
          documentId,
          targetUserId: meta.uploaderId,
        });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setChatError(err?.message || "Không thể tải lịch sử chat");
      })
      .finally(() => {
        if (!cancelled) setChatLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chatOpen, meta?.uploaderId, documentId]);

  useEffect(() => () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const openChat = () => {
    if (!meta?.uploaderId) return;
    const token = localStorage.getItem("edura_token");
    if (!token) {
      Swal.fire("Thông báo", "Bạn cần đăng nhập để nhắn tin với người đăng.", "info");
      return;
    }
    setChatOpen(true);
  };

  const closeChat = () => {
    if (socketRef.current && conversationKey) {
      socketRef.current.emit("chat:leave", { conversationKey });
    }
    setChatOpen(false);
  };

  const handleSendMessage = () => {
    const text = chatInput.trim();
    if (!text || !meta?.uploaderId) return;
    try {
      const socket = ensureSocket();
      setSending(true);
      socket.emit("chat:message", {
        conversationKey,
        documentId,
        targetUserId: meta.uploaderId,
        type: "text",
        content: text,
      });
      setChatInput("");
    } catch (err) {
      console.error(err);
      setChatError("Không gửi được tin nhắn.");
    } finally {
      setSending(false);
    }
  };

  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !meta?.uploaderId) return;
    event.target.value = "";
    try {
      setSending(true);
      const res = await uploadChatImage(documentId, meta.uploaderId, file);
      if (res?.conversationKey && !conversationKey) setConversationKey(res.conversationKey);
      const socket = ensureSocket();
      socket.emit("chat:message", {
        conversationKey: res?.conversationKey || conversationKey,
        documentId,
        targetUserId: meta.uploaderId,
        type: "image",
        imageUrl: res?.imageUrl,
      });
    } catch (err) {
      console.error(err);
      setChatError(err?.message || "Không gửi được hình ảnh.");
    } finally {
      setSending(false);
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const fmt = (n) => {
    try { return Number(n || 0).toLocaleString("vi-VN"); } catch { return n; }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await getDocuments(searchQuery.trim(), {});
        let results = [];
        if (Array.isArray(data)) {
          results = data;
        } else if (data && data.documents && Array.isArray(data.documents)) {
          results = data.documents;
        } else if (data && Array.isArray(data.data)) {
          results = data.data;
        } else if (data && typeof data === 'object') {
          const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
          if (arrayKeys.length > 0) {
            results = data[arrayKeys[0]];
          }
        }
        const limitedResults = results.slice(0, 5);
        setSearchResults(limitedResults);
        setShowSearchResults(limitedResults.length > 0);
      } catch (error) {
        console.error('Lỗi tìm kiếm:', error);
        setSearchResults([]);
        setShowSearchResults(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/?search=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  const handleDocumentClick = (docId) => {
    window.location.href = `/document/${docId}`;
  };

  function handleDownload() {
    const fn = (meta?.title || "document").replace(/[\/:*?"<>|]+/g, "_");
    const a = document.createElement("a");
    a.href = `${rawUrl}?download=1&filename=${encodeURIComponent(fn)}`;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    Swal.fire({ icon: "success", title: "Đã sao chép liên kết", timer: 1200, showConfirmButton: false });
  }

  const fetchReactions = async () => {
    try {
      const res = await getDocumentReactions(documentId);
      setReactionCounts({ likes: res?.likes || 0, dislikes: res?.dislikes || 0 });
      setMyReaction(res?.myReaction || null);
    } catch (err) {
      console.warn("Không tải được phản ứng:", err);
    }
  };

  const fetchComments = async () => {
    try {
      setCommentsLoading(true);
      const res = await getDocumentComments(documentId);
      setComments(Array.isArray(res) ? res : []);
    } catch (err) {
      console.warn("Không tải được bình luận:", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleReaction = async (action) => {
    const token = localStorage.getItem("edura_token");
    if (!token) {
      Swal.fire("Thông báo", "Vui lòng đăng nhập để tương tác.", "info");
      return;
    }
    const nextAction = myReaction === action ? "none" : action;
    try {
      const res = await updateDocumentReaction(documentId, nextAction);
      setReactionCounts({ likes: res?.likes || 0, dislikes: res?.dislikes || 0 });
      setMyReaction(res?.myReaction || null);
    } catch (err) {
      Swal.fire("Lỗi", err?.message || "Không thể cập nhật phản ứng.", "error");
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("edura_token");
    if (!token) {
      Swal.fire("Thông báo", "Vui lòng đăng nhập để bình luận.", "info");
      return;
    }
    const content = commentInput.trim();
    if (!content) return;
    try {
      const res = await postDocumentComment(documentId, content);
      setComments((prev) => [...prev, res]);
      setCommentInput("");
    } catch (err) {
      Swal.fire("Lỗi", err?.message || "Không gửi được bình luận.", "error");
    }
  };

  if (loading) {
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
            <form className="search-container" onSubmit={handleSearch}>
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
                  type="button"
                  className="clear-search"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={16} />
                </button>
              )}
            </form>
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
        <div className="scribd-wrap" style={{ paddingTop: '80px' }}>
          <div className="scribd-center">
            <div className="viewer-loading"><p>Đang tải tài liệu…</p></div>
          </div>
        </div>
      </div>
    );
  }

  if (!meta) {
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
            <form className="search-container" onSubmit={handleSearch}>
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
                  type="button"
                  className="clear-search"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={16} />
                </button>
              )}
            </form>
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
        <div className="scribd-wrap" style={{ paddingTop: '80px' }}>
          <div className="scribd-center"><p>Không tìm thấy tài liệu</p></div>
        </div>
      </div>
    );
  }

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
          <div style={{ position: 'relative', width: '100%' }}>
            <form className="search-container" onSubmit={handleSearch}>
              <Search className="search-icon" size={20} />
              <input
                type="text"
                className="search-input"
                placeholder="Tìm kiếm tài liệu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchQuery.trim() && searchResults.length > 0) {
                    setShowSearchResults(true);
                  }
                }}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowSearchResults(false);
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </form>
            {showSearchResults && searchResults.length > 0 && (
              <div 
                className="search-results-dropdown" 
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  zIndex: 1000,
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}
              >
                {searchResults.map((doc) => (
                  <div
                    key={doc._id || doc.id}
                    className="search-result-item"
                    onClick={() => handleDocumentClick(doc._id || doc.id)}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-gray)',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '4px' }}>
                      {doc.title || 'Không có tiêu đề'}
                    </div>
                    {doc.summary && (
                      <div style={{ fontSize: '13px', color: 'var(--text-gray)', lineHeight: '1.4' }}>
                        {doc.summary.length > 100 ? doc.summary.substring(0, 100) + '...' : doc.summary}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: 'var(--text-gray)', marginTop: '4px' }}>
                      {doc.views || 0} lượt xem
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isSearching && searchQuery.trim() && (
              <div className="search-results-dropdown" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 1000,
                padding: '16px',
                textAlign: 'center',
                color: '#6b7280'
              }}>
                Đang tìm kiếm...
              </div>
            )}
            {!isSearching && searchQuery.trim() && searchResults.length === 0 && (
              <div className="search-results-dropdown" style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 1000,
                padding: '16px',
                textAlign: 'center',
                color: '#6b7280'
              }}>
                Không tìm thấy kết quả
              </div>
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

      <div className="scribd-page" style={{ paddingTop: '0' }}>
        {/* Top bar giản lược */}
        <header className="scribd-topbar">
          <div className="topbar-left">
          </div>
          <div className="topbar-center">
            <button className="btn green" onClick={handleDownload}><Download size={18} /> Download</button>
            <button className="icon-btn" title="Lưu"><Bookmark size={18} /></button>
            <button className="icon-btn" title="In" onClick={() => window.open(rawUrl, "_blank")}><Printer size={18} /></button>
            <button className="icon-btn" title="Chia sẻ" onClick={copyLink}><Share2 size={18} /></button>
          </div>
          <div className="topbar-right" />
        </header>

      <div className="scribd-wrap">
        {/* LEFT */}
        <aside className="scribd-left">
          <h1 className="doc-title">{meta.title || "Document"}</h1>
          <div className="doc-stats">
            <span>0% tốt</span>
            <span>•</span>
            <span>{fmt(meta.views || 0)} lượt xem</span>
          </div>
          {meta.summary ? (
            <div className="summary-content">
              <p className={`doc-desc summary-text ${summaryExpanded ? "expanded" : ""}`}>{summaryDisplay.text}</p>
              {summaryDisplay.needsExpand && (
                <button 
                  className="summary-toggle"
                  onClick={() => setSummaryExpanded(!summaryExpanded)}
                >
                  {summaryExpanded ? "Thu gọn" : "Xem thêm"}
                </button>
              )}
            </div>
          ) : null}
          <div className="ai-badge">
            <Sparkles size={14} />
            {meta.uploaderId ? (
              <button className="meta-chip meta-chip--action" onClick={openChat}>
                Người đăng tài liệu: {meta.uploaderName || meta.uploader || meta.creator || 'Không xác định'}
                <span className="meta-chip__hint">Nhắn tin</span>
              </button>
            ) : (
              <span>Người đăng tài liệu: {meta.uploaderName || meta.uploader || meta.creator || 'Không xác định'}</span>
            )}
          </div>
          <div className="reaction-bar">
            <button
              className={`reaction-button ${myReaction === "like" ? "is-active" : ""}`}
              onClick={() => handleReaction("like")}
            >
              👍 <span>{reactionCounts.likes}</span>
            </button>
            <button
              className={`reaction-button ${myReaction === "dislike" ? "is-active" : ""}`}
              onClick={() => handleReaction("dislike")}
            >
              👎 <span>{reactionCounts.dislikes}</span>
            </button>
          </div>
          <div className="document-comments">
            <h2 className="document-comments__title">Bình luận</h2>
            <form className="comment-form" onSubmit={handleSubmitComment}>
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Chia sẻ cảm nghĩ về tài liệu này..."
                rows={3}
              />
              <button type="submit" disabled={!commentInput.trim()}>Gửi</button>
            </form>
            <div className="comment-list">
              {commentsLoading ? (
                <div className="comment-placeholder">Đang tải bình luận…</div>
              ) : comments.length ? (
                comments.map((c) => (
                  <div key={c.id} className="comment-item">
                    <div className="comment-avatar">
                      {getInitials(c.user?.fullName, c.user?.username)}
                    </div>
                    <div className="comment-body">
                      <div className="comment-meta">
                        <span className="comment-author">{c.user?.fullName || c.user?.username || "Người dùng"}</span>
                        <span className="comment-time">{formatRelativeTime(c.createdAt)}</span>
                      </div>
                      <p>{c.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="comment-placeholder">Chưa có bình luận nào.</div>
              )}
            </div>
          </div>
          <div className="left-actions">
            <button className="btn wide green" onClick={handleDownload}><Download size={18} /> Download</button>
            <button className="btn wide" onClick={() => window.open(rawUrl, "_blank")}><Printer size={18} /> Mở tab mới</button>
            <button className="btn wide" onClick={copyLink}><Share2 size={18} /> Copy link</button>
          </div>
        </aside>

        {/* CENTER: iframe xem trước qua /raw (không CORS, nền trắng) */}
        <main className="scribd-center">
          <div className="pdf-stage">
            {isPdf ? (
              <>
                {pdfLoading && (
                  <div className="pdf-loading-overlay">
                    <div className="pdf-loading-spinner">
                      <div className="spinner-ring"></div>
                      <div className="spinner-ring"></div>
                      <div className="spinner-ring"></div>
                    </div>
                    <p className="pdf-loading-text">Đang tải tài liệu...</p>
                  </div>
                )}
                <iframe
                  title="pdf"
                  className="pdf-frame"
                  src={`${rawUrl}?embedded=true#toolbar=0&navpanes=0&scrollbar=0`}
                  onLoad={() => setPdfLoading(false)}
                  style={{ opacity: pdfLoading ? 0 : 1, transition: 'opacity 0.3s ease' }}
                />
              </>
            ) : (
              <div className="no-preview">
                <div className="no-preview-icon">
                  <Download size={48} />
                </div>
                <p>Định dạng này không xem trước được. Vui lòng tải xuống.</p>
                <button className="btn green" onClick={handleDownload}><Download size={18} /> Tải xuống</button>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT (gợi ý – tuỳ dữ liệu) */}
        <aside className="scribd-right">
          <div className="suggest-title">Tài liệu liên quan</div>
          {suggestedLoading ? (
            <ul className="suggest-list">
              <li className="suggest-item placeholder"><div className="suggest-thumb">PDF</div><div className="suggest-info"><div className="suggest-name">Đang tải...</div><div className="suggest-pages">-</div></div></li>
            </ul>
          ) : suggestedDocuments.length > 0 ? (
            <ul className="suggest-list">
              {suggestedDocuments.map((doc) => (
                <li
                  key={doc._id || doc.id}
                  className="suggest-item"
                  onClick={() => {
                    window.location.href = `/document/${doc._id || doc.id}`;
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <div className="suggest-thumb">
                    {doc.image_url ? (
                      <img src={doc.image_url} alt={doc.title || "Document"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      "PDF"
                    )}
                  </div>
                  <div className="suggest-info">
                    <div className="suggest-name">{doc.title || "Không có tiêu đề"}</div>
                    <div className="suggest-pages">{doc.pages || 0} trang</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="suggest-list">
              <li className="suggest-item placeholder"><div className="suggest-thumb">PDF</div><div className="suggest-info"><div className="suggest-name">Chưa có tài liệu liên quan</div><div className="suggest-pages">-</div></div></li>
            </ul>
          )}
        </aside>
        </div>
      </div>

      {chatOpen && (
        <div className="chat-mini">
          <div className="chat-mini__window">
            <header className="chat-mini__header">
              <div>
                <div className="chat-mini__title">{meta.uploaderName || 'Người đăng'}</div>
                {partner?.username && <div className="chat-mini__subtitle">@{partner.username}</div>}
              </div>
              <button className="chat-mini__close" onClick={closeChat}>
                <X size={18} />
              </button>
            </header>

            <div className="chat-mini__body">
              {chatLoading ? (
                <div className="chat-mini__placeholder">Đang tải hội thoại…</div>
              ) : (
                <div className="chat-mini__messages">
                  {messages.map((msg) => {
                    const isMe = me && msg.senderId === me.id;
                    const timeLabel = msg.createdAt
                      ? new Date(msg.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
                      : "";
                    return (
                      <div key={msg.id} className={`chat-bubble ${isMe ? "chat-bubble--me" : ""}`}>
                        <div className="chat-bubble__content">
                          {msg.type === "image" && msg.imageUrl ? (
                            <img src={msg.imageUrl} alt="Ảnh đính kèm" />
                          ) : (
                            <p>{msg.content}</p>
                          )}
                        </div>
                        <span className="chat-bubble__time">{timeLabel}</span>
                      </div>
                    );
                  })}
                  {chatError && <div className="chat-mini__error">{chatError}</div>}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <footer className="chat-mini__footer">
              <label className="chat-mini__upload" title="Gửi hình ảnh">
                <input type="file" accept="image/*" onChange={handleImageSelected} />
                <Paperclip size={18} />
              </label>
              <textarea
                className="chat-mini__input"
                placeholder="Nhập tin nhắn..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                disabled={sending}
                rows={1}
              />
              <button
                className="chat-mini__send"
                onClick={handleSendMessage}
                disabled={sending || !chatInput.trim()}
              >
                <Send size={18} />
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
