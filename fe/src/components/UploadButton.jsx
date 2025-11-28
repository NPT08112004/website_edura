// /frontend/src/components/UploadButton.jsx
import React, { useState, useEffect } from 'react';
import { X, Upload as UploadIcon } from 'lucide-react';
import { uploadDocument, getSchools, getCategories, seedLookups } from '../api';
import Swal from 'sweetalert2';
import '../assets/styles/UploadButton.css';

function UploadButton({ isOpen, onClose, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [title, setTitle] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [schools, setSchools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [scs, cats] = await Promise.all([getSchools(), getCategories()]);
      if ((!scs || scs.length === 0) || (!cats || cats.length === 0)) {
        await seedLookups();
        const [scs2, cats2] = await Promise.all([getSchools(), getCategories()]);
        setSchools(scs2 || []);
        setCategories(cats2 || []);
      } else {
        setSchools(scs || []);
        setCategories(cats || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    setImage(f || null);
    if (f) {
      const url = URL.createObjectURL(f);
      setImagePreview(url);
    } else {
      setImagePreview('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title || !file || !schoolId || !categoryId) {
      Swal.fire({
        icon: 'warning',
        title: 'Thiếu thông tin',
        text: 'Vui lòng điền đầy đủ thông tin và chọn file.'
      });
      return;
    }

    const okTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const okExt = /\.(pdf|docx?|PDF|DOCX?)$/;

    if (!okTypes.includes(file.type) && !okExt.test(file.name)) {
      Swal.fire({
        icon: 'error',
        title: 'Sai định dạng',
        text: 'Chỉ chấp nhận PDF hoặc Word (.doc/.docx).'
      });
      return;
    }

    if (image && !/^image\/(png|jpe?g|webp)$/i.test(image.type)) {
      Swal.fire({
        icon: 'error',
        title: 'Ảnh không hợp lệ',
        text: 'Chỉ chấp nhận PNG/JPG/JPEG/WEBP.'
      });
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadDocument(file, title, schoolId, categoryId, image);
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
      
      // Reset form
      setTitle('');
      setFile(null);
      setSchoolId('');
      setCategoryId('');
      setImage(null);
      setImagePreview('');
      const inputPdf = document.getElementById('uploadFileInput');
      const inputImg = document.getElementById('uploadImageInput');
      if (inputPdf) inputPdf.value = '';
      if (inputImg) inputImg.value = '';
      
      onClose();
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Upload thất bại',
        text: err.message || 'Có lỗi xảy ra khi upload tài liệu.'
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="upload-modal-overlay" onClick={onClose} />
      <div className="upload-modal">
        <div className="upload-modal-header">
          <h2>Tải tài liệu lên</h2>
          <button className="upload-modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form className="upload-modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="uploadTitle">Tên tài liệu *</label>
            <input
              type="text"
              id="uploadTitle"
              placeholder="Nhập tên tài liệu"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isUploading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="uploadSchool">Trường học *</label>
            <select
              id="uploadSchool"
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              required
              disabled={isUploading}
            >
              <option value="">Chọn trường học</option>
              {schools.map(s => (
                <option key={s._id || s.id} value={s._id || s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="uploadCategory">Thể loại *</label>
            <select
              id="uploadCategory"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              disabled={isUploading}
            >
              <option value="">Chọn thể loại</option>
              {categories.map(c => (
                <option key={c._id || c.id} value={c._id || c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="uploadFileInput">Tệp tài liệu (PDF/Word) *</label>
            <input
              type="file"
              id="uploadFileInput"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files[0])}
              required
              disabled={isUploading}
            />
            {file && (
              <div className="file-info">
                <UploadIcon size={16} />
                <span>{file.name}</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="uploadImageInput">Ảnh minh hoạ (tùy chọn)</label>
            <input
              type="file"
              id="uploadImageInput"
              accept="image/png, image/jpeg, image/jpg, image/webp"
              onChange={onPickImage}
              disabled={isUploading}
            />
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="Preview" />
              </div>
            )}
          </div>

          <div className="upload-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={isUploading}>
              Hủy
            </button>
            <button type="submit" className="btn-submit" disabled={isUploading}>
              {isUploading ? 'Đang tải lên...' : 'Tải lên'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default UploadButton;
