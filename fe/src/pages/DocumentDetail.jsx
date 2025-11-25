import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Paperclip, Send, X } from "lucide-react";

import {
  getDocumentById,
  getChatHistory,
  uploadChatImage,
  getDocumentReactions,
  updateDocumentReaction,
  getDocumentComments,
  postDocumentComment,
} from "../api";
import PdfViewer from "../components/PdfViewer";
import { getInitials } from "../utils/avatarUtils";
import "../assets/styles/DocumentDetail.css";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [conversationKey, setConversationKey] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [partner, setPartner] = useState(null);
  const [me, setMe] = useState(null);
  const [sending, setSending] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [reactionCounts, setReactionCounts] = useState({ likes: 0, dislikes: 0 });
  const [myReaction, setMyReaction] = useState(null);
  const [comments, setComments] = useState([]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fetchedMessageIds = useRef(new Set());

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    getDocumentById(id)
      .then((d) => {
        if (!cancel) setDoc(d);
      })
      .catch((err) => {
        console.error(err);
        if (!cancel) navigate("/search");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [id, navigate]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("edura_user") || "null");
      if (stored && stored.id) setMe((prev) => prev || stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!chatOpen || !doc?.uploaderId) return;

    const token = localStorage.getItem("edura_token");
    if (!token) {
      alert("Bạn cần đăng nhập để nhắn tin với người đăng tài liệu.");
      setChatOpen(false);
      return;
    }

    let cancelled = false;
    setChatLoading(true);
    setChatError("");

    getChatHistory(id, doc.uploaderId)
      .then((payload) => {
        if (cancelled) return;
        const history = payload?.messages || [];
        fetchedMessageIds.current = new Set(history.map((m) => m.id));
        setMessages(history);
        if (payload?.conversationKey) {
          setConversationKey(payload.conversationKey);
        }
        if (payload?.partner) setPartner(payload.partner);
        if (payload?.me) setMe(payload.me);

        const socket = ensureSocket();
        socket.emit("chat:join", {
          documentId: id,
          targetUserId: doc.uploaderId,
        });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setChatError(err?.message || "Không tải được lịch sử chat");
      })
      .finally(() => {
        if (!cancelled) setChatLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chatOpen, doc?.uploaderId, id]);

  useEffect(() => {
    if (doc) {
      fetchReactions();
      fetchComments();
    }
  }, [doc, id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

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

  const handleOpenChat = () => {
    if (!doc?.uploaderId) return;
    const token = localStorage.getItem("edura_token");
    if (!token) {
      alert("Vui lòng đăng nhập để trò chuyện với người đăng.");
      return;
    }
    setChatOpen(true);
  };

  const handleCloseChat = () => {
    if (socketRef.current && conversationKey) {
      socketRef.current.emit("chat:leave", { conversationKey });
    }
    setChatOpen(false);
  };

  const summaryDisplay = useMemo(() => {
    if (!doc?.summary) return { text: "", needsExpand: false };
    const trimmed = doc.summary.trim();
    if (!trimmed) return { text: "", needsExpand: false };
    
    // Ước tính: ~60 ký tự mỗi dòng (với line-height 1.7 và font-size 14px)
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
  }, [doc?.summary, summaryExpanded]);

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

  const handleSendMessage = () => {
    const text = chatInput.trim();
    if (!text || !doc?.uploaderId) return;
    try {
      const socket = ensureSocket();
      setSending(true);
      socket.emit("chat:message", {
        conversationKey,
        documentId: id,
        targetUserId: doc.uploaderId,
        type: "text",
        content: text,
      });
      setChatInput("");
    } catch (err) {
      console.error(err);
      setChatError("Không gửi được tin nhắn. Hãy thử lại.");
    } finally {
      setSending(false);
    }
  };

  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !doc?.uploaderId) return;
    event.target.value = "";
    try {
      setSending(true);
      const res = await uploadChatImage(id, doc.uploaderId, file);
      if (res?.conversationKey && !conversationKey) {
        setConversationKey(res.conversationKey);
      }
      const socket = ensureSocket();
      socket.emit("chat:message", {
        conversationKey: res?.conversationKey || conversationKey,
        documentId: id,
        targetUserId: doc.uploaderId,
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

  const fetchReactions = async () => {
    try {
      const res = await getDocumentReactions(id);
      setReactionCounts({ likes: res?.likes || 0, dislikes: res?.dislikes || 0 });
      setMyReaction(res?.myReaction || null);
    } catch (err) {
      console.warn("Không tải được số lượt thích:", err);
    }
  };

  const fetchComments = async () => {
    try {
      setCommentsLoading(true);
      const res = await getDocumentComments(id);
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
      alert("Vui lòng đăng nhập để tương tác.");
      return;
    }
    const nextAction = myReaction === action ? "none" : action;
    try {
      const res = await updateDocumentReaction(id, nextAction);
      setReactionCounts({ likes: res?.likes || 0, dislikes: res?.dislikes || 0 });
      setMyReaction(res?.myReaction || null);
    } catch (err) {
      alert(err?.message || "Không thể cập nhật phản ứng.");
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("edura_token");
    if (!token) {
      alert("Vui lòng đăng nhập để bình luận.");
      return;
    }
    const content = commentInput.trim();
    if (!content) return;
    try {
      const res = await postDocumentComment(id, content);
      setComments((prev) => [...prev, res]);
      setCommentInput("");
    } catch (err) {
      alert(err?.message || "Không gửi được bình luận.");
    }
  };

  if (loading) {
    return <div className="document-detail__loading">Đang tải…</div>;
  }

  if (!doc) {
    return <div className="document-detail__loading">Không tìm thấy tài liệu.</div>;
  }

  return (
    <div className="document-detail">
      <div className="document-detail__layout">
        <aside className="document-detail__sidebar">
          <Link className="document-detail__back" to="/search">
            ← Quay lại tìm kiếm
          </Link>
          <h1 className="document-detail__title">{doc.title}</h1>

          <div className="document-detail__meta">
            {doc.categoryName && <span className="meta-chip">{doc.categoryName}</span>}
            {doc.schoolName && <span className="meta-chip">{doc.schoolName}</span>}
            {doc.createdAt && (
              <span className="meta-chip">{new Date(doc.createdAt).toLocaleDateString("vi-VN")}</span>
            )}
            {doc.uploaderName && doc.uploaderId ? (
              <button className="meta-chip meta-chip--action" onClick={handleOpenChat}>
                {doc.uploaderName}
                <span className="meta-chip__hint">Nhắn tin</span>
              </button>
            ) : (
              doc.uploaderName && <span className="meta-chip">{doc.uploaderName}</span>
            )}
          </div>

          <section className="document-detail__section">
            <h2>Tóm tắt</h2>
            {doc?.summary ? (
              <div className="summary-content">
                <p className={summaryExpanded ? "summary-text expanded" : "summary-text"}>{summaryDisplay.text}</p>
                {summaryDisplay.needsExpand && (
                  <button 
                    className="summary-toggle"
                    onClick={() => setSummaryExpanded(!summaryExpanded)}
                  >
                    {summaryExpanded ? "Thu gọn" : "Xem thêm"}
                  </button>
                )}
              </div>
            ) : (
              <p className="summary-empty">Tài liệu chưa có mô tả.</p>
            )}
          </section>

          <section className="document-detail__section">
            <h2>Phản hồi</h2>
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
          </section>

          <section className="document-detail__section document-comments">
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
                      {(c.user?.fullName || c.user?.username || "?").slice(0, 2).toUpperCase()}
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
          </section>
        </aside>

        <section className="document-detail__viewer">
          <PdfViewer
            url={`${BASE_URL}/api/documents/${id}/raw`}
            filename={doc.title || "document"}
          />
        </section>
      </div>

      {chatOpen && (
        <div className="chat-mini">
          <div className="chat-mini__window">
            <header className="chat-mini__header">
              <div>
                <div className="chat-mini__title">{doc.uploaderName || "Người đăng"}</div>
                {partner?.username && (
                  <div className="chat-mini__subtitle">@{partner.username}</div>
                )}
              </div>
              <button className="chat-mini__close" onClick={handleCloseChat}>
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
                      ? new Date(msg.createdAt).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";
                    return (
                      <div
                        key={msg.id}
                        className={`chat-bubble ${isMe ? "chat-bubble--me" : ""}`}
                      >
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
