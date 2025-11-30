import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, Loader, BookOpen } from "lucide-react";
import { getSchoolById, getDocumentsBySchool } from "../api";
import "../assets/styles/SchoolDetail.css";

const PAGE_SIZE = 12;

export default function SchoolDetail() {
  const navigate = useNavigate();
  const { schoolId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [school, setSchool] = useState(null);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");

  const initialQuery = searchParams.get("q") || "";
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);

  useEffect(() => {
    const paramQuery = searchParams.get("q") || "";
    setSearchInput(paramQuery);
    setActiveQuery(paramQuery);
  }, [schoolId]);  // reset when navigating to another school

  useEffect(() => {
    const loadSchool = async () => {
      try {
        setLoadingSchool(true);
        const data = await getSchoolById(schoolId);
        setSchool(data);
        setErrorMessage("");
      } catch (error) {
        console.error("Failed to load school info", error);
        setErrorMessage("Không tìm thấy thông tin trường. Vui lòng quay lại.");
      } finally {
        setLoadingSchool(false);
      }
    };
    loadSchool();
  }, [schoolId]);

  useEffect(() => {
    const loadDocs = async () => {
      try {
        setLoadingDocs(true);
        const data = await getDocumentsBySchool({
          schoolId,
          search: activeQuery,
          page: 1,
          limit: PAGE_SIZE,
        });
        const items = data?.items || [];
        setDocs(items);
        const total = data?.total || items.length;
        setHasMore(PAGE_SIZE < total);
        setPage(1);
        setErrorMessage("");
      } catch (error) {
        console.error("Failed to load documents", error);
        setDocs([]);
        setHasMore(false);
        setErrorMessage("Không thể tải danh sách tài liệu của trường.");
      } finally {
        setLoadingDocs(false);
      }
    };
    setSearchParams(activeQuery ? { q: activeQuery } : {});
    loadDocs();
  }, [schoolId, activeQuery, setSearchParams]);

  const handleLoadMore = async () => {
    try {
      const nextPage = page + 1;
      const data = await getDocumentsBySchool({
        schoolId,
        search: activeQuery,
        page: nextPage,
        limit: PAGE_SIZE,
      });
      const items = data?.items || [];
      setDocs((prev) => {
        const merged = [...prev, ...items];
        const total = data?.total ?? merged.length;
        setHasMore(nextPage * PAGE_SIZE < total);
        return merged;
      });
      setPage(nextPage);
    } catch (error) {
      console.error("Failed to load more documents", error);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setActiveQuery(searchInput.trim());
  };

  return (
    <div className="school-detail-page">
      {loadingSchool ? (
        <div className="school-detail-loading">
          <Loader size={32} className="spin" />
          <span>Đang tải thông tin trường...</span>
        </div>
      ) : !school ? (
        <div className="school-detail-loading">
          <p>{errorMessage || "Không tìm thấy trường bạn yêu cầu."}</p>
          <button onClick={() => navigate("/schools")}>Quay lại danh sách trường</button>
        </div>
      ) : (
        <>
          <header className="school-detail-header">
            <div className="school-detail-header-inner">
              <button
                className="back-btn"
                onClick={() => navigate("/schools")}
                aria-label="Quay lại danh sách trường"
              >
                <ArrowLeft size={16} />
                <span>Trở về danh sách trường</span>
              </button>
            </div>
          </header>

          <main>
            <section
              className="school-hero-banner"
              aria-labelledby="school-title"
            >
              <div className="school-hero-layout">
                <div className="school-meta">
                  <p className="school-tagline">
                    University &bull; #{school.shortName || school.name}
                  </p>
                  <h1 id="school-title">{school.name}</h1>
                  <p className="school-counter">
                    {school.documentCount || 0} tài liệu được chia sẻ bởi sinh viên
                    của trường.
                  </p>

                  <div className="school-meta-grid">
                    {school.city && (
                      <span className="school-pill">
                        <span className="dot" />
                        {school.city}
                      </span>
                    )}
                    {school.country && (
                      <span className="school-pill">
                        <span className="dot" />
                        {school.country}
                      </span>
                    )}
                    <span className="school-pill">
                      <span className="dot" />
                      Kho tài liệu số của Edura
                    </span>
                  </div>
                </div>

                <aside className="school-hero-panel" aria-label="Tổng quan tài liệu">
                  <div className="hero-stat">
                    <p className="hero-stat-label">Tài liệu hiện có</p>
                    <p className="hero-stat-value">
                      {school.documentCount || docs.length || 0}
                    </p>
                  </div>
                  <p className="hero-stat-subtitle">
                    Khám phá tài liệu học tập, đề thi và ghi chú được chia sẻ bởi
                    cộng đồng sinh viên.
                  </p>
                </aside>
              </div>

              <form
                className="school-doc-search"
                onSubmit={handleSearchSubmit}
                role="search"
                aria-label="Tìm tài liệu trong trường này"
              >
                <Search size={18} aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Tìm kiếm môn học, tài liệu trong trường này"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <button type="submit">Tìm tài liệu</button>
              </form>
            </section>

            <section
              className="school-documents-section"
              aria-label="Danh sách tài liệu của trường"
            >
              <div className="section-heading">
                <div>
                  <h2>Courses &amp; documents</h2>
                  {activeQuery ? (
                    <p className="section-subtitle">
                      Kết quả cho từ khóa <strong>{activeQuery}</strong>
                    </p>
                  ) : (
                    <p className="section-subtitle">
                      Hiển thị {docs.length} tài liệu trong tổng số{" "}
                      {school.documentCount || docs.length || 0}.
                    </p>
                  )}
                </div>
              </div>

              {loadingDocs ? (
                <div className="documents-loading">
                  <Loader size={24} className="spin" />
                  <span>Đang tải tài liệu...</span>
                </div>
              ) : docs.length === 0 ? (
                <div className="documents-empty">
                  <p>Chưa có tài liệu nào phù hợp với yêu cầu.</p>
                  <button
                    onClick={() => {
                      setSearchInput("");
                      setActiveQuery("");
                    }}
                  >
                    Xem tất cả tài liệu của trường
                  </button>
                </div>
              ) : (
                <>
                  <div className="documents-grid">
                    {docs.map((doc) => (
                      <article
                        key={doc._id}
                        className="document-card"
                        role="button"
                        tabIndex={0}
                        aria-label={doc.title}
                        onClick={() => navigate(`/document/${doc._id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/document/${doc._id}`);
                          }
                        }}
                      >
                        <div className="document-icon" aria-hidden="true">
                          <BookOpen size={24} />
                        </div>
                        <div className="document-info">
                          <h3>{doc.title}</h3>
                          <p className="document-summary">
                            {doc.summary || "Tài liệu từ cộng đồng Edura."}
                          </p>
                          <div className="document-meta">
                            {(doc.type || doc.fileType || doc.categoryName) && (
                              <span className="document-type">
                                {(doc.type || doc.fileType || doc.categoryName)
                                  .toString()
                                  .toUpperCase()}
                              </span>
                            )}
                            <span>{doc.views || 0} lượt xem</span>
                            {doc.pages ? <span>{doc.pages} trang</span> : null}
                            {doc.uploader ? <span>By {doc.uploader}</span> : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  {hasMore && (
                    <div className="load-more-wrapper">
                      <button onClick={handleLoadMore}>Tải thêm tài liệu</button>
                    </div>
                  )}
                </>
              )}
            </section>
          </main>
        </>
      )}
    </div>
  );
}

