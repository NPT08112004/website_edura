import React, { useState, useEffect } from 'react';
import { Upload, X, FileText, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2, Home, ArrowLeft, LogIn, ShieldCheck, Sparkles } from 'lucide-react';
import { uploadDocument, getSchools, getCategories, seedLookups, searchSchools } from '../api';
import SearchableSelect from './SearchableSelect';
import Swal from 'sweetalert2';
import '../assets/styles/UploadPage.css';
import Footer from './Footer';

export default function UploadPage({ onBack, switchToLogin }) {
  const [file, setFile] = useState(null);
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [filePreview, setFilePreview] = useState(null);
  const [title, setTitle] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [schools, setSchools] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [dragImageActive, setDragImageActive] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('edura_token'));

  useEffect(() => {
    // Kiểm tra đăng nhập khi component mount
    const token = localStorage.getItem('edura_token');
    setIsLoggedIn(!!token);
    
    if (!token) {
      // Chưa đăng nhập -> hiển thị thông báo và chuyển hướng
      Swal.fire({
        icon: 'warning',
        title: 'Yêu cầu đăng nhập',
        text: 'Bạn cần đăng nhập để tải tài liệu lên.',
        confirmButtonText: 'Đăng nhập',
        showCancelButton: true,
        cancelButtonText: 'Hủy'
      }).then((result) => {
        if (result.isConfirmed) {
          // Chuyển đến trang đăng nhập
          if (switchToLogin) {
            switchToLogin();
          } else {
            window.location.href = '/'; // Quay về trang chủ
          }
        } else {
          window.location.href = '/'; // Quay về trang chủ nếu hủy
        }
      });
      return;
    }
    
    loadData();
  }, [switchToLogin]);

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

  const handleDrag = (e, type) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      if (type === 'file') setDragActive(true);
      else setDragImageActive(true);
    } else if (e.type === "dragleave") {
      if (type === 'file') setDragActive(false);
      else setDragImageActive(false);
    }
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'file') {
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    } else {
      setDragImageActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageSelect(e.dataTransfer.files[0]);
      }
    }
  };

  const handleFileSelect = (selectedFile) => {
    const okTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const okExt = /\.(pdf|docx?|PDF|DOCX?)$/;

    if (!okTypes.includes(selectedFile.type) && !okExt.test(selectedFile.name)) {
      Swal.fire({
        icon: 'error',
        title: 'Sai định dạng',
        text: 'Chỉ chấp nhận PDF hoặc Word (.doc/.docx).'
      });
      return;
    }

    setFile(selectedFile);
    
    // Create preview for PDF
    if (selectedFile.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview({
          type: 'pdf',
          name: selectedFile.name,
          size: selectedFile.size,
          url: e.target.result
        });
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setFilePreview({
        type: 'word',
        name: selectedFile.name,
        size: selectedFile.size
      });
    }
  };

  const handleImageSelect = (selectedImage) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(selectedImage.type)) {
      Swal.fire({
        icon: 'error',
        title: 'Ảnh không hợp lệ',
        text: 'Chỉ chấp nhận PNG/JPG/JPEG/WEBP.'
      });
      return;
    }

    setImage(selectedImage);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(selectedImage);
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

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      const result = await uploadDocument(file, title, schoolId, categoryId, image);
      clearInterval(progressInterval);
      setUploadProgress(100);

      Swal.fire({
        icon: 'success',
        title: 'Thành công!',
        html: `
          <div style="text-align: left;">
            <p><b>Đã lưu S3 (PDF):</b> <a href="${result.s3_url}" target="_blank" rel="noreferrer">Mở file</a></p>
            ${result.image_url ? `<p style="margin-top:8px"><b>Ảnh:</b> <a href="${result.image_url}" target="_blank" rel="noreferrer">Xem ảnh</a></p>` : ''}
            <p style="margin-top:8px"><b>Tóm tắt:</b> ${result.summary}</p>
            ${result.keywords && Array.isArray(result.keywords) ? `<p style="margin-top:8px"><b>Keywords:</b> ${result.keywords.join(', ')}</p>` : ''}
          </div>
        `,
        confirmButtonText: 'Đóng',
        showCancelButton: true,
        cancelButtonText: 'Ở lại trang',
        cancelButtonColor: '#6c757d'
      }).then((result) => {
        // Nếu bấm "Đóng" (confirm) thì chuyển hướng về trang chủ
        if (result.isConfirmed) {
          window.location.href = '/';
        }
        // Nếu bấm "Ở lại trang" (cancel) thì không làm gì, ở lại trang upload
      });

      // Reset form
      setTitle('');
      setFile(null);
      setFilePreview(null);
      setSchoolId('');
      setCategoryId('');
      setImage(null);
      setImagePreview('');
      setUploadProgress(0);
      
      // Không tự động chuyển hướng sau khi tóm tắt xong
      // Người dùng có thể ở lại trang để xem kết quả hoặc upload thêm tài liệu
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      Swal.fire({
        icon: 'error',
        title: 'Upload thất bại',
        text: err.message || 'Có lỗi xảy ra khi upload tài liệu.'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Nếu chưa đăng nhập, hiển thị thông báo yêu cầu đăng nhập
  if (!isLoggedIn) {
    return (
      <div className="upload-page">
        <div className="upload-container" style={{ maxWidth: '600px', padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ marginBottom: '30px' }}>
            <LogIn size={64} style={{ color: 'var(--blue)', marginBottom: '20px' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--gray-800)', marginBottom: '12px' }}>
              Yêu cầu đăng nhập
            </h2>
            <p style={{ fontSize: '16px', color: 'var(--gray-600)', marginBottom: '30px' }}>
              Bạn cần đăng nhập để tải tài liệu lên.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  if (switchToLogin) {
                    switchToLogin();
                  } else {
                    window.location.href = '/';
                  }
                }}
                style={{
                  padding: '12px 24px',
                  background: 'var(--blue)',
                  color: 'var(--white)',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.target.style.background = 'var(--blue-dark)'}
                onMouseOut={(e) => e.target.style.background = 'var(--blue)'}
              >
                <LogIn size={18} />
                Đăng nhập
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '12px 24px',
                  background: 'var(--white)',
                  color: 'var(--gray-700)',
                  border: '1px solid var(--border-gray)',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.target.style.background = 'var(--gray-50)';
                  e.target.style.borderColor = 'var(--gray-300)';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = 'var(--white)';
                  e.target.style.borderColor = 'var(--border-gray)';
                }}
              >
                Trở về trang chủ
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="upload-page">
      {/* Background Blob Shapes */}
      <div className="blob-shapes">
        <svg className="blob blob-1" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M227.513 18.8882C193.283 -3.6638 127.823 -8.48113 93.1172 23.8997C46.5194 67.3913 57.3145 118.867 55.0331 142.147C51.4995 178.209 19.2208 174.858 4.99876 216.932C-5.49546 247.962 0.533109 272.738 23.9 289.502C46.4999 305.712 93.1172 298.67 110.65 281.13C128.182 263.59 122.872 231.927 142.074 216.893C161.276 201.858 227.843 213.008 257.598 140.001C275.722 95.3434 261.733 41.4304 227.513 18.8882Z" fill="#A8D9C0" opacity="0.6"/>
        </svg>
        <svg className="blob blob-2" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M100 50C120 50 140 60 150 80C160 100 150 120 130 130C110 140 90 130 80 110C70 90 80 70 100 50Z" fill="#66B299" opacity="0.5"/>
        </svg>
        <svg className="blob blob-3" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M100 20C120 20 140 30 150 50C160 70 150 90 130 100C110 110 90 100 80 80C70 60 80 40 100 20Z" fill="#9999E0" opacity="0.5"/>
        </svg>
        <svg className="blob blob-4" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M50 150C30 150 20 170 30 190C40 210 60 220 80 210C100 200 110 180 100 160C90 140 70 150 50 150Z" fill="#6699CC" opacity="0.5"/>
        </svg>
        <svg className="blob blob-5" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M100 180C120 180 130 200 120 220C110 240 90 250 70 240C50 230 40 210 50 190C60 170 80 180 100 180Z" fill="#9999E0" opacity="0.4"/>
        </svg>
        <svg className="blob blob-6" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M80 100C100 80 130 90 140 110C150 130 130 150 110 150C90 150 70 130 80 110C80 100 80 100 80 100Z" fill="#B8A8D9" opacity="0.4"/>
        </svg>
        <svg className="blob blob-7" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M120 40C140 40 160 60 150 80C140 100 120 110 100 100C80 90 70 70 80 50C90 30 110 40 120 40Z" fill="#C8D9E8" opacity="0.4"/>
        </svg>
        <svg className="blob blob-8" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M60 200C40 200 30 180 40 160C50 140 70 130 90 140C110 150 120 170 110 190C100 210 80 200 60 200Z" fill="#A8C8D9" opacity="0.4"/>
        </svg>
        <svg className="blob blob-9" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M150 120C170 120 180 140 170 160C160 180 140 190 120 180C100 170 90 150 100 130C110 110 130 120 150 120Z" fill="#D9C8E8" opacity="0.35"/>
        </svg>
        <svg className="blob blob-10" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <path d="M100 20C130 20 160 30 170 50C180 70 170 90 160 110C150 130 130 150 110 160C90 170 70 160 60 140C50 120 50 100 60 80C70 60 80 40 100 20Z" fill="#C0B2E0" opacity="0.5"/>
        </svg>
      </div>
      
      <button className="back-button" onClick={() => window.location.href = '/'}>
        <ArrowLeft size={18} />
        <span>Trở về trang chủ</span>
      </button>
      <div className="upload-container">
        {/* Header */}
        <div className="upload-header">
          <div className="header-content">
            <Sparkles size={32} className="header-icon" />
            <div>
              <h1>Tải tài liệu lên</h1>
              <p className="header-subtitle">Chia sẻ tri thức của bạn với cộng đồng</p>
            </div>
          </div>
          <div className="header-highlights">
            <div className="highlight-pill">
              <Upload size={16} />
              <span>PDF, DOC, DOCX ≤ 100MB</span>
            </div>
            <div className="highlight-pill">
              <ShieldCheck size={16} />
              <span>Kiểm duyệt nội dung tự động</span>
            </div>
            <div className="highlight-pill">
              <CheckCircle2 size={16} />
              <span>100% an toàn & bảo mật</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="upload-content">
          <form className="upload-form" onSubmit={handleSubmit}>
            {/* Document Title */}
            <div className="form-section">
              <label className="form-label">
                Tên tài liệu <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Nhập tên tài liệu"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={isUploading}
              />
            </div>

            {/* School and Category */}
            <div className="form-row">
              <div className="form-section">
                <SearchableSelect
                  label="Trường học"
                  options={schools}
                  value={schoolId}
                  onChange={setSchoolId}
                  placeholder="Chọn trường học"
                  searchPlaceholder="Tìm kiếm trường học..."
                  disabled={isUploading}
                  required
                  onSearch={async (query) => {
                    if (query.trim()) {
                      try {
                        const results = await searchSchools(query, 20);
                        return results || [];
                      } catch (error) {
                        console.error('Error searching schools:', error);
                        return [];
                      }
                    }
                    return schools;
                  }}
                />
              </div>

              <div className="form-section">
                <SearchableSelect
                  label="Thể loại"
                  options={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="Chọn thể loại"
                  searchPlaceholder="Tìm kiếm thể loại..."
                  disabled={isUploading}
                  required
                />
              </div>
            </div>

            {/* File and Image Upload in Row */}
            <div className="form-row">
              {/* File Upload */}
              <div className="form-section">
                <label className="form-label">
                  Tệp tài liệu (PDF/Word) <span className="required">*</span>
                </label>
              <div
                className={`file-upload-area ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
                onDragEnter={(e) => handleDrag(e, 'file')}
                onDragLeave={(e) => handleDrag(e, 'file')}
                onDragOver={(e) => handleDrag(e, 'file')}
                onDrop={(e) => handleDrop(e, 'file')}
              >
                <input
                  type="file"
                  id="fileInput"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                  disabled={isUploading}
                  style={{ display: 'none' }}
                />
                
                {file ? (
                  <div className="file-preview">
                    <div className="file-icon">
                      <FileText size={32} />
                    </div>
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{formatFileSize(file.size)}</div>
                    </div>
                    <button
                      type="button"
                      className="remove-file"
                      onClick={() => {
                        setFile(null);
                        setFilePreview(null);
                      }}
                      disabled={isUploading}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <Upload size={48} className="upload-icon" />
                    <div className="upload-text">
                      <span className="upload-primary">Kéo thả file vào đây</span>
                      <span className="upload-secondary">hoặc</span>
                      <label htmlFor="fileInput" className="upload-button">
                        Chọn tệp
                      </label>
                    </div>
                    <p className="upload-hint">PDF, DOC, DOCX (tối đa 100MB)</p>
                  </div>
                )}
              </div>
              </div>

              {/* Image Upload */}
              <div className="form-section">
                <label className="form-label">
                  Ảnh minh hoạ <span className="optional">(tùy chọn)</span>
                </label>
              <div
                className={`image-upload-area ${dragImageActive ? 'drag-active' : ''} ${imagePreview ? 'has-image' : ''}`}
                onDragEnter={(e) => handleDrag(e, 'image')}
                onDragLeave={(e) => handleDrag(e, 'image')}
                onDragOver={(e) => handleDrag(e, 'image')}
                onDrop={(e) => handleDrop(e, 'image')}
              >
                <input
                  type="file"
                  id="imageInput"
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  onChange={(e) => handleImageSelect(e.target.files[0])}
                  disabled={isUploading}
                  style={{ display: 'none' }}
                />
                
                {imagePreview ? (
                  <div className="image-preview-container">
                    <img src={imagePreview} alt="Preview" className="image-preview" />
                    <button
                      type="button"
                      className="remove-image"
                      onClick={() => {
                        setImage(null);
                        setImagePreview('');
                      }}
                      disabled={isUploading}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="image-upload-placeholder">
                    <ImageIcon size={32} className="image-icon" />
                    <div className="image-upload-text">
                      <label htmlFor="imageInput" className="image-upload-button">
                        Chọn ảnh
                      </label>
                      <span>hoặc kéo thả vào đây</span>
                    </div>
                    <p className="image-upload-hint">PNG, JPG, WEBP</p>
                  </div>
                )}
              </div>
              </div>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="upload-progress-section">
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
                </div>
                <div className="progress-text">
                  <Loader2 size={16} className="spinner" />
                  <span>Đang tải lên... {uploadProgress}%</span>
                </div>
              </div>
            )}

            {/* Guidelines */}
            <div className="upload-guidelines">
              <div className="guideline-item">
                <CheckCircle2 size={20} />
                <div>
                  <p>Tài liệu rõ ràng, không mờ nhòe, không chứa thông tin nhạy cảm.</p>
                  <span className="guideline-hint">Định dạng PDF giúp hiển thị nhất quán trên mọi thiết bị.</span>
                </div>
              </div>
              <div className="guideline-item">
                <AlertCircle size={20} />
                <div>
                  <p>Vui lòng đổi tên file theo cú pháp dễ nhớ (ví dụ: <strong>lap-trinh-java-co-ban.pdf</strong>).</p>
                  <span className="guideline-hint">Tên rõ ràng giúp người khác tìm kiếm nhanh hơn.</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => window.location.href = '/'}
                disabled={isUploading}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isUploading || !file || !title || !schoolId || !categoryId}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Đang tải lên...
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    Tải lên
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    <Footer />
    </>
  );
}

