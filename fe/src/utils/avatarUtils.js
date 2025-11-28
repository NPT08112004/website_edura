/**
 * Lấy 2 chữ cái đầu tiên từ tên người dùng
 * @param {string} fullName - Tên đầy đủ
 * @param {string} username - Tên người dùng (fallback)
 * @returns {string} - 2 chữ cái đầu tiên (viết hoa)
 */
export function getInitials(fullName, username) {
  const name = fullName || username || 'Người dùng';
  const words = name.trim().split(/\s+/);
  
  if (words.length >= 2) {
    // Nếu có 2 từ trở lên, lấy chữ cái đầu của 2 từ đầu tiên
    return (words[0][0] + words[1][0]).toUpperCase();
  } else {
    // Nếu chỉ có 1 từ, lấy 2 chữ cái đầu
    return name.slice(0, 2).toUpperCase();
  }
}

/**
 * Kiểm tra xem có avatar URL hợp lệ không
 * @param {string} avatarUrl - URL của avatar
 * @returns {boolean}
 */
export function hasValidAvatar(avatarUrl) {
  const defaultAvatarPath = '/images/png-clipart-user-computer-icons-avatar-miscellaneous-heroes.png';
  return avatarUrl && avatarUrl.trim() !== '' && avatarUrl !== defaultAvatarPath && avatarUrl !== '/images/default-avatar.png';
}

/**
 * Lấy avatar URL, nếu không có thì trả về avatar mặc định
 * @param {string} avatarUrl - URL của avatar
 * @returns {string}
 */
export function getAvatarUrl(avatarUrl) {
  const defaultAvatarPath = '/images/png-clipart-user-computer-icons-avatar-miscellaneous-heroes.png';
  return avatarUrl && avatarUrl.trim() !== '' && avatarUrl !== '/images/default-avatar.png' 
    ? avatarUrl 
    : defaultAvatarPath;
}

