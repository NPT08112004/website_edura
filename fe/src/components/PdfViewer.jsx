import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";
import "../assets/styles/PdfViewer.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export default function PdfViewer({
  url,                   // ví dụ: `${BASE_URL}/api/documents/${id}/raw`
  filename = "document.pdf",
  onSaveFavorite,        // optional
  onDownload             // optional (nếu muốn custom)
}) {
  const canvasRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Tải PDF trực tiếp bằng url (để pdf.js tự stream + Range)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");

    // kiểm tra nhanh content-type trước khi giao cho pdf.js
    fetch(url, { method: "HEAD" })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`HEAD ${r.status} ${r.statusText}`);
        }
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/pdf")) {
          throw new Error(`Content-Type nhận được: ${ct || "(trống)"} — không phải PDF`);
        }
      })
      .then(() => {
        const task = pdfjsLib.getDocument({
          url,
          disableStream: false,
          disableAutoFetch: false,
          withCredentials: false,
        });
        return task.promise;
      })
      .then((loaded) => {
        if (cancelled) return;
        setPdf(loaded);
        setPages(loaded.numPages);
        setPage(1);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("PDF load error:", e);
        setErr(
          e?.message?.includes("Content-Type")
            ? "Tệp không phải PDF hoặc link PDF không hợp lệ."
            : "Không thể tải PDF. Vui lòng thử lại."
        );
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      try { pdf?.destroy?.(); } catch (_) {}
    };
  }, [url]);

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current) return;
    try {
      const p = await pdf.getPage(page);
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await p.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) {
      console.error("Render page error:", e);
      setErr("Không thể render trang.");
    }
  }, [pdf, page, scale]);

  useEffect(() => { renderPage(); }, [renderPage]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.1, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.1, 0.5));
  const next = () => setPage((p) => Math.min(p + 1, pages));
  const prev = () => setPage((p) => Math.max(p - 1, 1));

  const handleDownload = async () => {
    try {
      // tải nguyên file từ /raw
      const r = await fetch(url);
      if (!r.ok) throw new Error("Tải file thất bại");
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/pdf")) throw new Error("File không phải PDF");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
      alert("Không thể tải xuống.");
    }
  };

  return (
    <div className="pdfviewer">
      <div className="pdfviewer__toolbar">
        <button title="Download" onClick={onDownload || handleDownload}>⭳</button>
        <button title="Lưu yêu thích" onClick={onSaveFavorite}>★</button>
        <div className="pdfviewer__sep" />
        <button onClick={zoomOut}>–</button>
        <span>{page} / {pages}</span>
        <button onClick={zoomIn}>+</button>
        <div className="pdfviewer__sep" />
        <button onClick={prev}>←</button>
        <button onClick={next}>→</button>
        <div className="pdfviewer__search">
          <input placeholder="Find in document…" disabled />
          <span>🔎</span>
        </div>
      </div>

      <div className="pdfviewer__canvasWrap">
        {loading && <div className="pdfviewer__state">Đang tải PDF…</div>}
        {!!err && <div className="pdfviewer__error">{err}</div>}
        <canvas ref={canvasRef} style={{ display: err ? "none" : "block" }} />
      </div>
    </div>
  );
}
