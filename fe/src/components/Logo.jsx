import React from 'react';

export default function Logo({ 
  onClick, 
  showText = false, 
  size = 'default',
  className = '',
  src
}) {
  const logoPath = src || '/images/logodetail-removebg-preview%20(1).png';
  
  const sizeClasses = {
    small: 'logo-small',
    default: 'logo-default',
    large: 'logo-large'
  };

  return (
    <div 
      className={`logo-section ${className}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : {}}
    >
      <img 
        src={logoPath} 
        alt="Edura Logo" 
        className={`logo-image ${sizeClasses[size]}`}
        onError={(e) => {
          // Fallback nếu ảnh không load được
          e.target.style.display = 'none';
          const fallback = e.target.parentElement.querySelector('.logo-badge-fallback');
          if (fallback) {
            fallback.style.display = 'flex';
          }
        }}
      />
      <div className="logo-badge-fallback" style={{ display: 'none' }}>
        <span className="logo-number">87</span>
      </div>
      {showText && <span className="brand-text">Edura</span>}
    </div>
  );
}

