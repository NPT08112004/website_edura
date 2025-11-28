// src/api.js
// API wrapper cho FE (React). ĐÃ THÊM: presignUpload(), registerDocument() cho flow Direct-to-S3.

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://edura-website.onrender.com";

/* -------------------- core HTTP helper -------------------- */
async function http(method, url, body, isForm = false) {
  const token = localStorage.getItem("edura_token");

  const headers = {};
  // Không set Content-Type cho FormData (trình duyệt tự thêm boundary)
  if (!isForm) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${url}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch (fetchError) {
    // Bắt lỗi network (Failed to fetch, CORS, etc.)
    console.error("Network error:", fetchError);
    const errorMsg = fetchError.message || "Failed to fetch";
    if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
      throw new Error(
        `Không thể kết nối đến server tại ${BASE_URL}. Vui lòng kiểm tra:\n- Backend đã chạy chưa?\n- URL API có đúng không?\n- Có vấn đề về mạng hoặc CORS không?`
      );
    }
    throw new Error(`Lỗi kết nối: ${errorMsg}`);
  }

  // cố gắng parse JSON
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // có thể là blob (khi gọi /raw); để null
  }

  if (!res.ok) {
    const msg = payload?.error || payload?.message || `HTTP ${res.status}`;
    // Nếu 401 → xóa token để FE tự điều hướng login nếu muốn
    if (res.status === 401) {
      try {
        localStorage.removeItem("edura_token");
        localStorage.removeItem("edura_user");
      } catch {}
    }
    throw new Error(msg);
  }

  // Nếu không có JSON thì trả object rỗng
  return payload ?? {};
}

/* small helpers */
const qs = (obj = {}) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

/* -------------------- Lookups -------------------- */
export async function seedLookups(optionalPayload) {
  return http("POST", "/api/lookups/seed", optionalPayload || null, false);
}
export async function getSchools() {
  return http("GET", "/api/lookups/schools");
}
export async function getCategories() {
  return http("GET", "/api/lookups/categories");
}
export async function getPopularSchools(limit = 12) {
  const params = new URLSearchParams({ limit });
  return http("GET", `/api/lookups/schools/popular?${params.toString()}`);
}
export async function searchSchools(query, limit = 8) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("limit", limit);
  const qsString = params.toString();
  return http("GET", `/api/lookups/schools/search${qsString ? `?${qsString}` : ""}`);
}
export async function getSchoolById(schoolId) {
  if (!schoolId) throw new Error("schoolId is required");
  return http("GET", `/api/lookups/schools/${schoolId}`);
}

/* -------------------- Auth -------------------- */
export async function loginUser(username, password) {
  const data = await http("POST", "/api/auth/login", { username, password });
  if (!data?.token) throw new Error("Đăng nhập thất bại: không nhận được token.");

  localStorage.setItem("edura_token", data.token);
  if (data.user) localStorage.setItem("edura_user", JSON.stringify(data.user));
  return data;
}
export async function loginWithGoogle(idToken) {
  const data = await http("POST", "/api/auth/google", { idToken });
  if (!data?.token) throw new Error("Đăng nhập Google thất bại: không nhận được token.");

  localStorage.setItem("edura_token", data.token);
  if (data.user) localStorage.setItem("edura_user", JSON.stringify(data.user));
  return data;
}
export async function registerUser(username, password, fullName) {
  return http("POST", "/api/auth/register", { username, password, fullName });
}
export async function forgotPassword(email) {
  return http("POST", "/api/auth/forgot-password", { email });
}
export async function resetPassword(email, code, newPassword) {
  return http("POST", "/api/auth/reset-password", { email, code, newPassword });
}
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("edura_user") || "null");
  } catch {
    return null;
  }
}
export function logout() {
  localStorage.removeItem("edura_token");
  localStorage.removeItem("edura_user");
  // (tuỳ bạn) điều hướng ngay về trang chủ
  // window.location.href = "/";
}

/* -------------------- Admin -------------------- */
export async function promoteUser(payload) {
  return http("POST", "/api/admin/promote", payload);
}
export async function getUsers() {
  return http("GET", "/api/admin/users");
}
export async function deleteUser(userId) {
  return http("DELETE", `/api/admin/users/${userId}`);
}
export async function lockUser(userId) {
  return http("POST", `/api/admin/users/${userId}/lock`);
}
export async function unlockUser(userId) {
  return http("POST", `/api/admin/users/${userId}/unlock`);
}

/* -------------------- Documents -------------------- */
// Danh sách + filter với pagination
export async function getDocuments(search = "", filters = {}, page = 1, limit = 12) {
  const params = {
    search,
    type: filters.type,
    length: filters.length,
    fileType: filters.fileType,
    uploadDate: filters.uploadDate,
    language: filters.language,
    schoolId: filters.schoolId,
    categoryId: filters.categoryId,
    page,
    limit,
  };
  const query = qs(params);
  return http("GET", `/api/documents${query ? `?${query}` : ""}`);
}

// Chi tiết 1 document
export async function getDocumentById(documentId) {
  return http("GET", `/api/documents/${documentId}`);
}

// Cập nhật lượt xem
export async function incrementDocumentViews(documentId) {
  return http("POST", `/api/documents/${documentId}/view`);
}

// URL stream PDF cho pdf.js (dùng trong PdfViewer/DocumentViewer)
export function getDocumentRawUrl(documentId) {
  return `${BASE_URL}/api/documents/${documentId}/raw`;
}

// Upload tài liệu qua route cũ (fallback, không tối ưu bằng direct-to-S3)
export async function uploadDocument(file, title, schoolId, categoryId, imageFile) {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  form.append("schoolId", schoolId);
  form.append("categoryId", categoryId);
  if (imageFile) form.append("image", imageFile);
  return http("POST", "/api/documents/upload", form, true);
}

// Tải xuống file PDF qua /raw
export async function downloadDocument(documentId, filename = "document.pdf") {
  const url = getDocumentRawUrl(documentId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${localStorage.getItem("edura_token") || ""}` },
  });
  if (!res.ok) throw new Error(`Không tải được file: HTTP ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* -------------------- NEW: Direct-to-S3 flow -------------------- */
// Cấp presigned URL để FE PUT trực tiếp file lên S3
export async function presignUpload({ ext, contentType }) {
  return http("POST", "/api/documents/presign", { ext, contentType });
}

// Đăng ký metadata sau khi đã PUT thành công lên S3 (BE xử lý AI/thumbnail async)
export async function registerDocument({ title, schoolId, categoryId, s3Key, imageUrl }) {
  return http("POST", "/api/documents/register", { title, schoolId, categoryId, s3Key, imageUrl });
}

// ... các export khác giữ nguyên

export async function getDocumentText(documentId) {
  return http("GET", `/api/documents/${documentId}/text`);
}

export async function getDocumentsBySchool({ schoolId, search = "", page = 1, limit = 12 } = {}) {
  if (!schoolId) throw new Error("schoolId is required");
  const params = new URLSearchParams({
    schoolId,
    page,
    limit,
  });
  if (search) params.set("search", search);
  return http("GET", `/api/mobile/documents?${params.toString()}`);
}

/* --- QUIZ APIs --- */
/* Quiz APIs */
export async function createQuizFromDoc(file, { title, schoolId, categoryId } = {}) {
  const token = localStorage.getItem("edura_token");
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  if (schoolId) form.append("schoolId", schoolId);
  if (categoryId) form.append("categoryId", categoryId);

  const res = await fetch(`${BASE_URL}/api/quizzes/from-doc`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Create quiz failed");
  return payload;
}

export async function listQuizzesAll() { // mặc định lấy tất cả
  return http("GET", `/api/quizzes?mine=0`);
}
export async function listMyQuizzes() {
  return http("GET", `/api/quizzes?mine=1`);
}
export async function getQuiz(quizId) {
  return http("GET", `/api/quizzes/${quizId}`);
}
export async function startQuiz(quizId) {
  const token = localStorage.getItem("edura_token");
  const res = await fetch(`${BASE_URL}/api/quizzes/${quizId}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Start quiz failed");
  return payload;
}
export async function submitQuiz(quizId, answers) {
  return http("POST", `/api/quizzes/${quizId}/submit`, { answers });
}

// --- TOPUP ---
export async function topupPoints(amountVND) {
  const token = localStorage.getItem("edura_token");
  const res = await fetch(`${BASE_URL}/api/payments/topup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amountVND }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Topup failed");
  return payload;
}

// Tạo payment request với Momo hoặc Banking
export async function createPayment(amountVND, method, returnUrl) {
  return http("POST", "/api/payments/create-payment", { 
    amountVND, 
    method, 
    returnUrl 
  });
}

// Kiểm tra trạng thái thanh toán
export async function checkPaymentStatus(orderId) {
  return http("GET", `/api/payments/check-payment/${orderId}`);
}

// Verify và cộng điểm thủ công (khi webhook không hoạt động)
export async function verifyPayment(orderId) {
  return http("POST", `/api/payments/verify-payment/${orderId}`);
}

/* -------------------- Profile -------------------- */
// Lấy thông tin profile của user hiện tại
export async function getMyProfile() {
  return http("GET", "/api/profile/me");
}

// Cập nhật fullname
export async function updateMyProfile(fullName) {
  return http("PUT", "/api/profile/me", { fullName });
}

// Upload avatar
export async function uploadMyAvatar(file) {
  const form = new FormData();
  form.append("avatar", file);
  return http("POST", "/api/profile/avatar", form, true);
}

// Lấy danh sách tài liệu của user hiện tại
export async function getMyDocuments() {
  return http("GET", "/api/profile/documents");
}

// Xóa tài liệu theo ID
export async function deleteDocumentById(documentId) {
  return http("DELETE", `/api/documents/${documentId}`);
}

// Lấy lịch sử xem tài liệu
export async function getMyViewHistory() {
  return http("GET", "/api/profile/view-history");
}

// Lấy tài liệu đã lưu (favorites)
export async function getMySavedDocuments() {
  return http("GET", "/api/mobile/documents/saved");
}

/* -------------------- Chat -------------------- */
export async function getChatHistory(documentId, targetUserId) {
  const params = new URLSearchParams({ documentId, targetUserId });
  return http("GET", `/api/chat/history?${params.toString()}`);
}

export async function uploadChatImage(documentId, targetUserId, file) {
  const form = new FormData();
  form.append("documentId", documentId);
  form.append("targetUserId", targetUserId);
  form.append("file", file);
  return http("POST", "/api/chat/upload", form, true);
}

export async function getChatConversations() {
  return http("GET", "/api/chat/conversations");
}

// Lấy tài liệu nổi bật trong tuần
export async function getFeaturedDocumentsWeek(limit = 3) {
  return http("GET", `/api/documents/featured-week?limit=${limit}`);
}

/* -------------------- Document social -------------------- */
export async function getDocumentReactions(documentId) {
  return http("GET", `/api/documents/${documentId}/reactions`);
}

export async function updateDocumentReaction(documentId, action) {
  return http("POST", `/api/documents/${documentId}/reactions`, { action });
}

export async function getDocumentComments(documentId) {
  return http("GET", `/api/documents/${documentId}/comments`);
}

export async function postDocumentComment(documentId, content) {
  return http("POST", `/api/documents/${documentId}/comments`, { content });
}
