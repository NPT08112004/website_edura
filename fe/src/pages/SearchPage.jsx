// /frontend/src/pages/SearchPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Swal from "sweetalert2";
import { getSchools, getCategories, searchDocuments } from "../api";
import "../assets/styles/SearchPage.css";

const fmtDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
};

export default function SearchPage() {
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [schools, setSchools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // load lookups
  useEffect(() => {
    (async () => {
      try {
        const [scs, cats] = await Promise.all([getSchools(), getCategories()]);
        setSchools(scs || []);
        setCategories(cats || []);
      } catch (e) {
        Swal.fire({ icon: "error", title: "Lỗi tải danh mục", text: e.message });
      }
    })();
  }, []);

  // search
  const doSearch = async (e) => {
    if (e) e.preventDefault();
    try {
      setLoading(true);
      const res = await searchDocuments({ q, schoolId, categoryId });
      setItems(res.items || []);
    } catch (e) {
      Swal.fire({ icon: "error", title: "Lỗi tìm kiếm", text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="search-container">
      <h2>Tìm kiếm tài liệu</h2>

      <form className="search-bar" onSubmit={doSearch}>
        <input
          type="text"
          placeholder="Tìm theo tên hoặc từ khóa..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          <option value="">— Tất cả Trường —</option>
          {schools.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>

        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">— Tất cả Thể loại —</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>

        <button type="submit" disabled={loading}>
          {loading ? "Đang tìm..." : "Tìm"}
        </button>
      </form>

      <div className="grid">
        {items.map((it) => (
          <div
            key={it._id}
            className="card"
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/documents/${it._id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate(`/documents/${it._id}`);
            }}
          >
            <div className="thumb">
              {it.image_url ? (
                <img src={it.image_url} alt={it.title} />
              ) : (
                <div className="noimg">Không có ảnh</div>
              )}
            </div>

            <div className="meta">
              <div className="title">
                <Link
                  to={`/documents/${it._id}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {it.title}
                </Link>
              </div>
              <div className="line">{it.categoryName || "—"}</div>
              <div className="line">{it.schoolName || "—"}</div>
              <div className="line">{it.uploaderName || "—"}</div>
              <div className="line">{fmtDate(it.createdAt) || "—"}</div>
            </div>
          </div>
        ))}

        {!loading && items.length === 0 && (
          <div className="empty">Không có kết quả phù hợp.</div>
        )}
      </div>
    </div>
  );
}
