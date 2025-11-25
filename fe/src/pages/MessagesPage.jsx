import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Paperclip, Send, MessageCircle, Loader2, Menu, Globe } from "lucide-react";

import {
  getChatConversations,
  getChatHistory,
  uploadChatImage,
} from "../api";

import Sidebar from "../components/Sidebar";
import MessageDropdown from "../components/MessageDropdown";
import { getInitials, hasValidAvatar } from "../utils/avatarUtils";
import "../assets/styles/MessagesPage.css";
import "../assets/styles/HomePage.css";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export default function MessagesPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [me, setMe] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [conversationKey, setConversationKey] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("edura_token"));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("edura_user") || "{}");
    } catch {
      return {};
    }
  });

  const socketRef = useRef(null);
  const activeKeyRef = useRef("");
  const fetchedMessageIds = useRef(new Set());
  const initialConversationChosen = useRef(false);
  const messagesEndRef = useRef(null);

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

  const ensureSocket = () => {
    if (socketRef.current) return socketRef.current;
    const token = localStorage.getItem("edura_token");
    if (!token) throw new Error("NOT_AUTH");
    const socket = io(BASE_URL, {
      transports: ["websocket"],
      query: { token },
    });

    socket.on("chat:joined", (payload) => {
      if (payload?.conversationKey) {
        setConversationKey(payload.conversationKey);
        activeKeyRef.current = payload.conversationKey;
      }
    });

    socket.on("chat:message", (payload) => {
      if (!payload?.id) return;
      fetchedMessageIds.current ??= new Set();
      if (!fetchedMessageIds.current.has(payload.id)) {
        fetchedMessageIds.current.add(payload.id);
        if (payload.conversationKey === activeKeyRef.current) {
          setMessages((prev) => [...prev, payload]);
        }
      }
      refreshConversations({ keepActive: true });
    });

    socket.on("chat:error", (payload) => {
      setChatError(payload?.message || "Có lỗi trong phiên chat.");
    });

    socketRef.current = socket;
    return socket;
  };

  const refreshConversations = async ({ keepActive = false } = {}) => {
    const token = localStorage.getItem("edura_token");
    if (!token) {
      SwalFallback();
      return;
    }
    try {
      const data = await getChatConversations();
      const convs = data?.conversations || [];
      setConversations(convs);
      if (!me && data?.me) setMe(data.me);

      if (!initialConversationChosen.current && convs.length) {
        initialConversationChosen.current = true;
        handleSelectConversation(convs[0]);
      } else if (keepActive && activeKeyRef.current) {
        const found = convs.find((c) => c.conversationKey === activeKeyRef.current);
        if (found) {
          setActiveConversation((prev) => ({ ...found, conversationKey: activeKeyRef.current }));
        }
      }
    } catch (err) {
      console.error(err);
      if (err?.message === "JWT hết hạn. Vui lòng đăng nhập lại." || err?.message === "Thiếu Bearer token") {
        SwalFallback();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("edura_token");
    if (!token) {
      SwalFallback();
      return;
    }
    refreshConversations();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const SwalFallback = () => {
    alert("Bạn cần đăng nhập để sử dụng chức năng nhắn tin.");
    navigate("/login");
  };

  const handleSelectConversation = async (conversation) => {
    if (!conversation) return;
    const partnerId = conversation.partner?.id || conversation.partnerId;
    if (!partnerId) {
      setChatError("Không xác định được người nhận.");
      return;
    }

    try {
      setChatLoading(true);
      setChatError("");

      const history = await getChatHistory(conversation.documentId, partnerId);
      const msgs = history?.messages || [];
      fetchedMessageIds.current = new Set(msgs.map((m) => m.id));
      setMessages(msgs);
      if (history?.me) setMe(history.me);
      const key = history?.conversationKey || conversation.conversationKey;
      setConversationKey(key);
      activeKeyRef.current = key;

      const partnerInfo = history?.partner || conversation.partner;
      const updated = {
        ...conversation,
        partner: partnerInfo,
        conversationKey: key,
        document: conversation.document,
      };
      setActiveConversation(updated);

      const socket = ensureSocket();
      if (socket && key) {
        if (conversationKey && socketRef.current) {
          socketRef.current.emit("chat:leave", { conversationKey });
        }
        socket.emit("chat:join", {
          documentId: conversation.documentId,
          targetUserId: partnerId,
        });
      }
    } catch (err) {
      console.error(err);
      setChatError(err?.message || "Không thể tải hội thoại.");
    } finally {
      setChatLoading(false);
    }
  };

  const handleSendMessage = () => {
    const text = chatInput.trim();
    if (!text || !activeConversation?.partner?.id) return;
    try {
      const socket = ensureSocket();
      setSending(true);
      socket.emit("chat:message", {
        conversationKey,
        documentId: activeConversation.documentId,
        targetUserId: activeConversation.partner.id,
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
    if (!file || !activeConversation?.partner?.id) return;
    event.target.value = "";
    try {
      setSending(true);
      const res = await uploadChatImage(activeConversation.documentId, activeConversation.partner.id, file);
      const socket = ensureSocket();
      socket.emit("chat:message", {
        conversationKey: res?.conversationKey || conversationKey,
        documentId: activeConversation.documentId,
        targetUserId: activeConversation.partner.id,
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

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatPreview = (conv) => {
    if (!conv?.lastMessage) return "Bắt đầu cuộc trò chuyện";
    if (conv.lastMessage.type === "image") return "[Ảnh]";
    return conv.lastMessage.content || "Bắt đầu cuộc trò chuyện";
  };

  const formatTime = (iso) => {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      return date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
    } catch {
      return "";
    }
  };

  const emptyState = useMemo(() => (
    <div className="messages-empty">
      <MessageCircle size={42} />
      <h2>Chưa có cuộc trò chuyện</h2>
      <p>Hãy mở một tài liệu và nhắn tin với người đăng để bắt đầu.</p>
    </div>
  ), []);

  if (loading) {
    return (
      <div className="messages-page messages-page--loading">
        <Loader2 className="spinner" size={28} />
        <p>Đang tải hội thoại…</p>
      </div>
    );
  }

  return (
    <div className="home-page">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
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
            onClick={() => navigate("/")}
            style={{ cursor: "pointer" }}
          >
            <div className="logo-badge">
              <span className="logo-number">87</span>
            </div>
            <span className="brand-text">Edura</span>
          </div>
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
                navigate("/login");
              }}
            >
              Đăng nhập
            </button>
          )}
        </div>
      </header>

      <div className="messages-page">
        <aside className="messages-sidebar">
        <div className="messages-sidebar__header">
          <h1>Hộp thư</h1>
          <p>{conversations.length} cuộc trò chuyện</p>
        </div>
        <div className="messages-list">
          {conversations.length === 0 ? (
            emptyState
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.conversationKey === activeConversation?.conversationKey;
              return (
                <button
                  key={conversation.conversationKey}
                  className={`messages-item ${isActive ? "is-active" : ""}`}
                  onClick={() => handleSelectConversation(conversation)}
                >
                  <div className="messages-item__avatar">
                    {getInitials(conversation.partner?.fullName, conversation.partner?.username)}
                  </div>
                  <div className="messages-item__body">
                    <div className="messages-item__row">
                      <span className="messages-item__name">
                        {conversation.partner?.fullName || conversation.partner?.username || "Người dùng"}
                      </span>
                      <span className="messages-item__time">
                        {formatTime(conversation.lastMessage?.createdAt)}
                      </span>
                    </div>
                    <div className="messages-item__preview">{formatPreview(conversation)}</div>
                    {conversation.document?.title && (
                      <div className="messages-item__doc">{conversation.document.title}</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="messages-chat">
        {activeConversation ? (
          <div className="messages-chat__panel">
            <header className="messages-chat__header">
              <div>
                <h2>{activeConversation.partner?.fullName || activeConversation.partner?.username || "Người dùng"}</h2>
                <p>{activeConversation.document?.title || "Từ tài liệu"}</p>
              </div>
              {activeConversation.documentId && (
                <button
                  className="messages-chat__link"
                  onClick={() => navigate(`/document/${activeConversation.documentId}`)}
                >
                  Xem tài liệu
                </button>
              )}
            </header>

            <div className="messages-chat__body">
              {chatLoading ? (
                <div className="messages-chat__placeholder">Đang tải hội thoại…</div>
              ) : (
                <div className="messages-chat__messages">
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

            <footer className="messages-chat__footer">
              <label className="chat-mini__upload" title="Gửi hình ảnh">
                <input type="file" accept="image/*" onChange={handleImageSelected} />
                <Paperclip size={18} />
              </label>
              <textarea
                className="chat-mini__input"
                placeholder="Nhập tin nhắn..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
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
        ) : (
          <div className="messages-chat__placeholder">
            <MessageCircle size={48} />
            <h2>Chọn một cuộc trò chuyện</h2>
            <p>Danh sách bên trái hiển thị các cuộc trò chuyện gần đây.</p>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
