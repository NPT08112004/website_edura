// /frontend/src/MainPage.jsx
import React, { useState, useEffect } from 'react';
import { uploadDocument, getSchools, getCategories, seedLookups } from './api';
import Swal from 'sweetalert2';
import './assets/styles/MainPage.css';
import { NavLink, useNavigate } from 'react-router-dom'; // <-- THÊM DÒNG NÀY

function MainPage() {
  const [file, setFile] = useState(null);
  const [image, setImage] = useState(null);            // <-- NEW
  const [imagePreview, setImagePreview] = useState(""); // <-- NEW
  const [title, setTitle] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [schools, setSchools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const user = JSON.parse(localStorage.getItem('edura_user') || '{}');
  const isLoggedIn = !!localStorage.getItem('edura_token');

  useEffect(() => {
    if (!isLoggedIn) {
      window.location.href = '/';
      return;
    }
    Promise.all([getSchools(), getCategories()])
      .then(async ([scs, cats]) => {
        if ((!scs || scs.length === 0) || (!cats || cats.length === 0)) {
          await seedLookups();
          const [scs2, cats2] = await Promise.all([getSchools(), getCategories()]);
          setSchools(scs2); setCategories(cats2);
        } else { setSchools(scs); setCategories(cats); }
      })
      .catch(err => Swal.fire({ icon: 'error', title: 'Lỗi', text: err.message }));
  }, [isLoggedIn]);

  if (!isLoggedIn) return null;

  const handleLogout = () => {
    localStorage.removeItem('edura_token');
    localStorage.removeItem('edura_user');
    window.location.href = '/';
  };

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    setImage(f || null);
    if (f) {
      const url = URL.createObjectURL(f);
      setImagePreview(url);
    } else {
      setImagePreview("");
    }
  };

  const handleSubmitUpload = async (e) => {
    e.preventDefault();
    if (!title || !file || !schoolId || !categoryId) {
      Swal.fire({ icon: 'warning', title: 'Thiếu thông tin', text: 'Hãy nhập đủ 4 trường và chọn file PDF.' });
      return;
    }
    const okTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];
const okExt = /\.(pdf|docx?|PDF|DOCX?)$/;

if (!okTypes.includes(file.type) && !okExt.test(file.name)) {
  Swal.fire({ icon: 'error', title: 'Sai định dạng', text: 'Chỉ chấp nhận PDF hoặc Word (.doc/.docx).' });
  return;
}

    if (image && !/^image\/(png|jpe?g|webp)$/i.test(image.type)) {
      Swal.fire({ icon: 'error', title: 'Ảnh không hợp lệ', text: 'Chỉ chấp nhận PNG/JPG/JPEG/WEBP.' });
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadDocument(file, title, schoolId, categoryId, image /* <-- NEW */);
      Swal.fire({
        icon: 'success',
        title: 'Thành công',
        html: `
          <div><b>Đã lưu S3 (PDF):</b> <a href="${result.s3_url}" target="_blank" rel="noreferrer">Mở file</a></div>
          ${result.image_url ? `<div style="margin-top:6px"><b>Ảnh:</b> <a href="${result.image_url}" target="_blank" rel="noreferrer">Xem ảnh</a></div>` : ''}
          <div style="margin-top:8px"><b>Tóm tắt:</b> ${result.summary}</div>
          <div style="margin-top:8px"><b>Keywords:</b> ${Array.isArray(result.keywords) ? result.keywords.join(', ') : ''}</div>
        `
      });
      // reset
      setTitle(''); setFile(null); setSchoolId(''); setCategoryId('');
      setImage(null); setImagePreview("");
      const inputPdf = document.getElementById('uploadFileInput'); if (inputPdf) inputPdf.value = '';
      const inputImg = document.getElementById('uploadImageInput'); if (inputImg) inputImg.value = '';
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Upload thất bại', text: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="main-layout">
      <header className="navbar">
        <div className="logo"><h1><span style={{color:'#28a745'}}>Edu</span><span style={{color:'#007bff'}}>ra</span></h1></div>
        <div className="nav-actions">
          <span className="user-greeting">Xin chào, {user.fullName || user.username}!</span>
          <button onClick={handleLogout} className="logout-btn">Đăng xuất</button>
        </div>
      </header>

      {/* Sidebar */}
<aside className="sidebar">
  <div className="brand">Edura</div>

  <nav className="menu">
    <NavLink
      to="/upload"
      className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
      end
    >
      Tài liệu của tôi
    </NavLink>

    <NavLink
      to="/search"
      className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
    >
      Tìm kiếm tài liệu
    </NavLink>

    <div className="menu-item disabled">Khóa học</div>
  </nav>
</aside>

      <main className="content-area">
        <h2 style={{borderBottom:'2px solid #eee', paddingBottom:10}}>Tải lên Tài liệu mới</h2>

        <form onSubmit={handleSubmitUpload} className="upload-form-container">
          <input
            type="text"
            placeholder="1. Tên tài liệu (bắt buộc)"
            value={title}
            onChange={e=>setTitle(e.target.value)}
            required
            disabled={isUploading}
            style={{marginBottom:15, padding:10, width:'100%', border:'1px solid #ccc', borderRadius:4}}
          />

          <select
            value={schoolId}
            onChange={e=>setSchoolId(e.target.value)}
            disabled={isUploading}
            style={{marginBottom:15, padding:10, width:'100%', border:'1px solid #ccc', borderRadius:4}}
          >
            <option value="">2. Chọn Trường</option>
            {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>

          <select
            value={categoryId}
            onChange={e=>setCategoryId(e.target.value)}
            disabled={isUploading}
            style={{marginBottom:15, padding:10, width:'100%', border:'1px solid #ccc', borderRadius:4}}
          >
            <option value="">3. Chọn Thể loại</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>

          {/* === 4. Chọn file PDF === */}
<label htmlFor="uploadFileInput" style={{fontWeight:600, display:'block', margin:'8px 0 6px'}}>
  4. Chọn tệp tài liệu (PDF) <span style={{fontWeight:400, color:'#6c757d'}}>— chỉ .pdf</span>
</label>
<input
  type="file"
  id="uploadFileInput"
  accept=".pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  onChange={e=>setFile(e.target.files[0])}
  required
  disabled={isUploading}
  style={{marginBottom:12, width:'100%'}}
/>


{/* === 5. (Tuỳ chọn) Chọn ảnh minh hoạ === */}
<label htmlFor="uploadImageInput" style={{fontWeight:600, display:'block', margin:'14px 0 6px'}}>
  5. Ảnh minh hoạ (tuỳ chọn) <span style={{fontWeight:400, color:'#6c757d'}}>— .png, .jpg, .jpeg, .webp</span>
</label>
<input
  type="file"
  id="uploadImageInput"
  accept="image/png, image/jpeg, image/jpg, image/webp"
  onChange={onPickImage}
  disabled={isUploading}
  style={{marginBottom: imagePreview ? 6 : 15, width:'100%'}}
/>

{imagePreview && (
  <div style={{marginBottom:15}}>
    <img
      src={imagePreview}
      alt="Xem trước ảnh minh hoạ"
      style={{maxWidth:240, maxHeight:160, border:'1px solid #ddd', borderRadius:6}}
    />
  </div>
)}


          <button type="submit" disabled={isUploading} className="upload-btn-main">
            {isUploading ? 'Đang tóm tắt & tải lên...' : '4. Xử lý AI & Tải PDF '}
          </button>
        </form>
      </main>
    </div>
  );
}
export default MainPage;
