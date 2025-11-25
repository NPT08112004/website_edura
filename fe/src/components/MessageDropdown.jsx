import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getChatConversations } from '../api';
import { getInitials, hasValidAvatar } from '../utils/avatarUtils';
import '../assets/styles/MessageDropdown.css';

export default function MessageDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const isLoggedIn = !!localStorage.getItem('edura_token');

  useEffect(() => {
    if (isOpen && isLoggedIn) {
      loadConversations();
    }
  }, [isOpen, isLoggedIn]);

  // Đóng dropdown khi click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const data = await getChatConversations();
      // Backend trả về { conversations: [...], me: {...} }
      const convs = data?.conversations || data || [];
      setConversations(Array.isArray(convs) ? convs : []);
    } catch (error) {
      console.error('Error loading conversations:', error);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
  };

  const getLastMessagePreview = (lastMessage) => {
    if (!lastMessage) return 'Chưa có tin nhắn';
    if (lastMessage.type === 'image') return '📷 Đã gửi một ảnh';
    return lastMessage.content || 'Chưa có tin nhắn';
  };

  const handleConversationClick = (conversation) => {
    setIsOpen(false);
    navigate('/message');
  };

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="message-dropdown-container" ref={dropdownRef}>
      <button
        className="message-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Tin nhắn"
      >
        <MessageCircle size={20} />
        {unreadCount > 0 && (
          <span className="message-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="message-dropdown">
          <div className="message-dropdown-header">
            <h3>Tin nhắn</h3>
            <button
              className="message-dropdown-close"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </div>

          <div className="message-dropdown-content">
            {loading ? (
              <div className="message-loading">Đang tải...</div>
            ) : conversations.length === 0 ? (
              <div className="message-empty">
                <MessageCircle size={48} />
                <p>Chưa có cuộc trò chuyện nào</p>
              </div>
            ) : (
              <div className="message-list">
                {conversations.map((conversation) => {
                  const partner = conversation.partner;
                  const lastMessage = conversation.lastMessage;
                  const document = conversation.document;
                  
                  return (
                    <div
                      key={conversation.conversationKey}
                      className="message-item"
                      onClick={() => handleConversationClick(conversation)}
                    >
                      <div className="message-avatar">
                        {hasValidAvatar(partner?.avatarUrl) ? (
                          <img 
                            src={partner.avatarUrl} 
                            alt={partner.fullName || partner.username}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextElementSibling?.classList.add('show');
                            }}
                          />
                        ) : null}
                        {!hasValidAvatar(partner?.avatarUrl) && (
                          <div className="message-avatar-placeholder show">
                            {getInitials(partner?.fullName, partner?.username)}
                          </div>
                        )}
                      </div>
                      <div className="message-info">
                        <div className="message-header">
                          <span className="message-name">
                            {partner?.fullName || partner?.username || 'Người dùng'}
                          </span>
                          {lastMessage?.createdAt && (
                            <span className="message-time">
                              {formatTime(lastMessage.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="message-preview">
                          {getLastMessagePreview(lastMessage)}
                        </div>
                        {document?.title && (
                          <div className="message-document">
                            📄 {document.title}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="message-dropdown-footer">
            <button
              className="message-view-all"
              onClick={() => {
                setIsOpen(false);
                navigate('/message');
              }}
            >
              Xem tất cả tin nhắn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

