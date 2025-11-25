// src/components/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Eye, Link2, Trash2, ExternalLink, FileText, Clock3 } from "lucide-react";
import {
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
  getMyDocuments,
  deleteDocumentById,
  getMyViewHistory,
  getDocumentRawUrl,
} from "../api";
import "../assets/styles/Profile.css";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState(null);
  const [fullName, setFullName] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [tab, setTab] = useState("mine"); // mine | history
  const [myDocs, setMyDocs] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const info = await getMyProfile();
        setMe(info);
        setFullName(info?.fullName || "");
        const [docs, his] = await Promise.all([getMyDocuments(), getMyViewHistory()]);
        setMyDocs(docs || []);
        setHistory(his || []);
      } catch (e) {
        alert(e.message || "Lỗi tải hồ sơ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onPickAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const trimmedName = fullName.trim();
      let updatedAvatarUrl = me?.avatarUrl;

      if (trimmedName) {
        await updateMyProfile(trimmedName);
      }

      if (avatarFile) {
        const r = await uploadMyAvatar(avatarFile);
        updatedAvatarUrl = r.avatarUrl || r.avatar_url || updatedAvatarUrl;
        setAvatarPreview("");
        setAvatarFile(null);
      }

      setMe((prev) => ({
        ...(prev || {}),
        fullName: trimmedName || prev?.fullName,
        avatarUrl: updatedAvatarUrl,
      }));

      try {
        const stored = JSON.parse(localStorage.getItem("edura_user") || "{}");
        if (trimmedName) stored.fullName = trimmedName;
        if (updatedAvatarUrl) stored.avatarUrl = updatedAvatarUrl;
        localStorage.setItem("edura_user", JSON.stringify(stored));
      } catch {}

      alert("Đã lưu thay đổi");
    } catch (e) {
      alert(e.message || "Lỗi lưu hồ sơ");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteDoc = async (id) => {
    if (!window.confirm("Xoá tài liệu này?")) return;
    try {
      await deleteDocumentById(id);
      setMyDocs((arr) => arr.filter((x) => x.id !== id && x._id !== id));
      alert("Đã xoá");
    } catch (e) {
      alert(e.message || "Xoá thất bại");
    }
  };

  const avatarSrc = useMemo(() => {
    if (avatarPreview) return avatarPreview;
    return me?.avatarUrl || "/images/default-avatar.png";
  }, [avatarPreview, me?.avatarUrl]);

  const joinedAt = useMemo(() => {
    if (!me?.createdAt) return null;
    const date = new Date(me.createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [me?.createdAt]);

  const processedDocs = useMemo(() => {
    if (!Array.isArray(myDocs)) return [];
    return myDocs
      .map((doc) => {
        const id = doc.id || doc._id;
        if (!id) return null;
        const rawPages =
          doc.pages ??
          doc.pageCount ??
          doc.page_count ??
          doc.metadata?.pages ??
          doc.totalPages;
        const pageCount = Number.isFinite(rawPages) ? rawPages : parseInt(rawPages, 10) || 0;
        const rawDate = doc.created_at || doc.createdAt || doc.upload_date;
        const dateObj = rawDate ? new Date(rawDate) : null;
        const s3Url = (doc.s3_url || doc.s3Url || "").toLowerCase();
        const fileType = s3Url.endsWith(".doc") || s3Url.endsWith(".docx") ? "doc" : "pdf";
        return {
          id,
          title: doc.title || "Tài liệu không tên",
          summary: doc.summary || doc.description || "Tài liệu chưa có mô tả.",
          views: doc.views || 0,
          pageCount,
          createdDate: dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj : null,
          fileType,
          image: doc.image_url || doc.imageUrl || "/images/pdf-placeholder.jpg",
        };
      })
      .filter(Boolean);
  }, [myDocs]);

  const docSummary = useMemo(() => {
    return processedDocs.reduce(
      (acc, doc) => {
        acc.totalViews += doc.views || 0;
        acc.totalPages += doc.pageCount || 0;
        return acc;
      },
      { totalViews: 0, totalPages: 0 }
    );
  }, [processedDocs]);

  const processedHistory = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return history.map((item, idx) => {
      const viewedAt = item.viewedAt ? new Date(item.viewedAt) : null;
      return {
        key: item.documentId || idx,
        title: item.title || "Tài liệu",
        image: item.image_url || "/images/pdf-placeholder.jpg",
        viewedText: viewedAt && !Number.isNaN(viewedAt.getTime())
          ? viewedAt.toLocaleString("vi-VN")
          : "Không xác định",
        documentId: item.documentId,
      };
    });
  }, [history]);

  const formatDocDate = (date) => {
    if (!date) return "Chưa rõ ngày tải lên";
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const truncateSummary = (text, limit = 200) => {
    if (!text) return "";
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).trim()}…`;
  };

  const handleOpenViewer = (docId) => {
    if (!docId) return;
    window.open(`/document/${docId}`, "_blank", "noopener");
  };

  const handleOpenRaw = (docId) => {
    if (!docId) return;
    window.open(getDocumentRawUrl(docId), "_blank", "noopener");
  };

  const handleCopyLink = async (docId) => {
    if (!docId) return;
    const shareUrl = `${window.location.origin}/document/${docId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Đã sao chép liên kết tài liệu!");
    } catch {
      alert("Không thể sao chép liên kết. Vui lòng thử lại.");
    }
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="profile-loading__spinner" />
        <div className="profile-loading__ghost" />
        <p className="profile-loading__text">Đang tải hồ sơ…</p>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <header className="profile-hero">
        <div className="profile-hero__bg" />
        <div className="profile-hero__waves" />

        <div className="profile-hero__inner">
          <div className="profile-hero__avatar-block">
            <div className="profile-hero__avatar-frame">
              <img src={avatarSrc} alt="avatar" className="profile-hero__avatar" />
              <div className="profile-hero__avatar-ring" />
            </div>
            <label className="profile-hero__upload">
              Thay ảnh
              <input type="file" accept="image/*" onChange={onPickAvatar} hidden />
            </label>
          </div>

          <div className="profile-hero__info">
            <div className="profile-tags">
              <span className="profile-tag">{me?.username || "Chưa có username"}</span>
              {joinedAt && <span className="profile-tag">Thành viên từ {joinedAt}</span>}
              <span className="profile-tag">Vai trò: {me?.role === "admin" ? "Quản trị" : "Thành viên"}</span>
            </div>

            <h1 className="profile-title">{me?.fullName?.trim() || me?.username || "Người dùng"}</h1>
            <p className="profile-subtitle">{me?.email ? `Email: ${me.email}` : "Chưa cập nhật email."}</p>

            <div className="profile-stats">
              <div className="profile-stat">
                <div className="profile-stat__label">Tài liệu</div>
                <div className="profile-stat__value">{myDocs.length}</div>
                <p className="profile-stat__hint">Đã đăng tải</p>
              </div>
              <div className="profile-stat">
                <div className="profile-stat__label">Lịch sử</div>
                <div className="profile-stat__value">{history.length}</div>
                <p className="profile-stat__hint">Tài liệu đã xem</p>
              </div>
              <div className="profile-stat">
                <div className="profile-stat__label">Điểm</div>
                <div className="profile-stat__value">{me?.points ?? 0}</div>
                <p className="profile-stat__hint">Điểm tích lũy</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="profile-content">
        <section className="profile-card profile-card--info">
          <div className="profile-card__header">
            <div>
              <h2 className="profile-card__title">Chỉnh sửa thông tin cá nhân</h2>
              <p className="profile-card__description">
                Cập nhật họ tên và ảnh đại diện để mọi người dễ dàng nhận ra bạn hơn.
              </p>
            </div>
            <button className="profile-card__home" onClick={() => (window.location.href = "/")}>
              ← Về trang chủ
            </button>
          </div>

          <div className="profile-form-grid">
            <div className="profile-form">
              <label className="profile-form__label">Họ và tên</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="profile-form__input"
                placeholder="Nhập họ tên của bạn"
              />

              <div className="profile-form__row">
                <div>
                  <div className="profile-form__label">Username</div>
                  <div className="profile-form__readOnly">{me?.username || "-"}</div>
                </div>
                <div>
                  <div className="profile-form__label">Email</div>
                  <div className="profile-form__readOnly">{me?.email || "-"}</div>
                </div>
              </div>
            </div>

            <aside className="profile-tips">
              <h3 className="profile-tips__title">Lưu ý khi cập nhật</h3>
              <ul className="profile-tips__list">
                <li>Ảnh nên có kích thước tối thiểu 300×300px để hiển thị sắc nét.</li>
                <li>Họ tên sẽ được hiển thị công khai cho người dùng khác.</li>
                <li>Định dạng ảnh hỗ trợ: PNG, JPG, JPEG, WEBP.</li>
              </ul>
            </aside>
          </div>

          <div className="profile-card__footer">
            <p>
              Hệ thống sẽ lưu thay đổi của bạn ngay sau khi bấm nút. Bạn có thể thay đổi nhiều lần nếu muốn.
            </p>
            <button className="profile-save" onClick={onSave} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-tabs">
            <button
              className={`profile-tabs__button ${tab === "mine" ? "is-active" : ""}`}
              onClick={() => setTab("mine")}
            >
              Tài liệu của tôi
            </button>
            <button
              className={`profile-tabs__button ${tab === "history" ? "is-active" : ""}`}
              onClick={() => setTab("history")}
            >
              Lịch sử đã xem
            </button>
          </div>

          {tab === "mine" ? (
            <div className="profile-grid">
              {processedDocs.length ? (
                <>
                  <div className="profile-doc-summary">
                    <div className="profile-doc-summary__item">
                      <span className="label">Tổng tài liệu</span>
                      <strong>{processedDocs.length}</strong>
                    </div>
                    <div className="profile-doc-summary__item">
                      <span className="label">Tổng lượt xem</span>
                      <strong>{docSummary.totalViews.toLocaleString("vi-VN")}</strong>
                    </div>
                    <div className="profile-doc-summary__item">
                      <span className="label">Tổng số trang</span>
                      <strong>{docSummary.totalPages.toLocaleString("vi-VN")}</strong>
                    </div>
                  </div>
                  {processedDocs.map((doc) => (
                    <article key={doc.id} className="profile-doc">
                      <div className="profile-doc__media">
                        <img src={doc.image} alt="thumbnail" loading="lazy" />
                        <span className={`profile-doc__badge profile-doc__badge--${doc.fileType}`}>
                          {doc.fileType.toUpperCase()}
                        </span>
                      </div>
                      <div className="profile-doc__body">
                        <div className="profile-doc__top">
                          <div>
                            <h3 className="profile-doc__title">{doc.title}</h3>
                            <p className="profile-doc__date">Tải lên {formatDocDate(doc.createdDate)}</p>
                          </div>
                        </div>
                        <p className="profile-doc__summary">{truncateSummary(doc.summary)}</p>
                        <div className="profile-doc__stats">
                          <span>
                            <Eye size={16} />
                            {doc.views.toLocaleString("vi-VN")} lượt xem
                          </span>
                          {doc.pageCount ? (
                            <span>
                              <BookOpen size={16} />
                              {doc.pageCount.toLocaleString("vi-VN")} trang
                            </span>
                          ) : null}
                        </div>
                        <div className="profile-doc__actions">
                          <button
                            className="profile-doc__btn profile-doc__btn--primary"
                            onClick={() => handleOpenViewer(doc.id)}
                          >
                            <ExternalLink size={16} />
                            Mở viewer
                          </button>
                          <button
                            className="profile-doc__btn"
                            onClick={() => handleOpenRaw(doc.id)}
                          >
                            <FileText size={16} />
                            Tệp gốc
                          </button>
                          <button
                            className="profile-doc__btn profile-doc__btn--ghost"
                            onClick={() => handleCopyLink(doc.id)}
                          >
                            <Link2 size={16} />
                            Sao chép link
                          </button>
                          <button
                            className="profile-doc__btn profile-doc__btn--danger"
                            onClick={() => onDeleteDoc(doc.id)}
                          >
                            <Trash2 size={16} />
                            Xoá
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </>
              ) : (
                <div className="profile-empty">
                  <div className="profile-empty__icon">📂</div>
                  <p className="profile-empty__title">Bạn chưa đăng tài liệu nào.</p>
                  <p className="profile-empty__subtitle">Hãy chia sẻ tài liệu đầu tiên để giúp cộng đồng học tập.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="profile-grid">
              {processedHistory.length ? (
                processedHistory.map((h) => (
                  <article key={h.key} className="profile-doc profile-doc--history">
                    <div className="profile-doc__media">
                      <img src={h.image} alt="thumbnail" loading="lazy" />
                    </div>
                    <div className="profile-doc__body">
                      <h3 className="profile-doc__title">{h.title}</h3>
                      <div className="profile-doc__stats">
                        <span>
                          <Clock3 size={16} />
                          Xem lúc {h.viewedText}
                        </span>
                      </div>
                      <p className="profile-doc__summary">
                        Nhấn nút bên dưới để mở lại tài liệu này trong tab mới.
                      </p>
                      <div className="profile-doc__actions">
                        <button
                          className="profile-doc__btn profile-doc__btn--primary"
                          onClick={() => handleOpenViewer(h.documentId)}
                        >
                          <ExternalLink size={16} />
                          Mở lại tài liệu
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="profile-empty">
                  <div className="profile-empty__icon">🕘</div>
                  <p className="profile-empty__title">Chưa có lịch sử xem.</p>
                  <p className="profile-empty__subtitle">Những tài liệu bạn mở sẽ được lưu lại tại đây để tiện truy cập.</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
