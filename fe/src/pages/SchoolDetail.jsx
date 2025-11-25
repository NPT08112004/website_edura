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

  if (loadingSchool) {
    return (
      <div className="school-detail-loading">
        <Loader size={32} className="spin" />
        <span>Đang tải thông tin trường...</span>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="school-detail-loading">
        <p>{errorMessage || "Không tìm thấy trường bạn yêu cầu."}</p>
        <button onClick={() => navigate("/schools")}>Quay lại danh sách trường</button>
      </div>
    );
  }

  return (
    <div className="school-detail-page">
      <header className="school-detail-header">
        <button className="back-btn" onClick={() => navigate("/schools")}>
          <ArrowLeft size={16} />
          Trở về danh sách trường
        </button>
      </header>

      <section className="school-hero-banner">
        <div className="school-meta">
          <p>University &bull; #{school.shortName || school.name}</p>
          <h1>{school.name}</h1>
          <p className="school-counter">
            {school.documentCount || 0} tài liệu được chia sẻ bởi sinh viên của trường.
          </p>
        </div>
        <form className="school-doc-search" onSubmit={handleSearchSubmit}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search for courses in this university"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit">Tìm tài liệu</button>
        </form>
      </section>

      <section className="school-documents-section">
        <div className="section-heading">
          <h2>Courses &amp; documents</h2>
          {activeQuery && (
            <p>
              Kết quả cho từ khóa <strong>{activeQuery}</strong>
            </p>
          )}
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
                  onClick={() => navigate(`/document/${doc._id}`)}
                >
                  <div className="document-icon">
                    <BookOpen size={24} />
                  </div>
                  <div className="document-info">
                    <h3>{doc.title}</h3>
                    <p>{doc.summary || "Tài liệu chia sẻ bởi cộng đồng Edura."}</p>
                    <div className="document-meta">
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
    </div>
  );
}

