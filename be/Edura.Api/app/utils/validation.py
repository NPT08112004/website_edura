# app/utils/validation.py
"""
Utilities for input validation and sanitization
"""
import re
from bson import ObjectId
from bson.errors import InvalidId


def validate_username(username: str) -> str:
    """
    Validate username format and length
    - Must be 3-50 characters
    - Only alphanumeric, dots, underscores, hyphens
    - Should be email format (optional check)
    """
    if not username:
        raise ValueError("Username không được để trống")
    
    username = username.strip()
    
    if len(username) < 3:
        raise ValueError("Username phải có ít nhất 3 ký tự")
    
    if len(username) > 50:
        raise ValueError("Username không được vượt quá 50 ký tự")
    
    # Allow email format or simple username
    if not re.match(r'^[a-zA-Z0-9._-]+@?[a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$|^[a-zA-Z0-9._-]+$', username):
        raise ValueError("Username không hợp lệ. Chỉ chứa chữ, số, ., _, -, @")
    
    return username


def validate_password(password: str) -> str:
    """
    Validate password strength
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one number
    - Optional: special characters
    """
    if not password:
        raise ValueError("Mật khẩu không được để trống")
    
    password = password.strip()
    
    if len(password) < 8:
        raise ValueError("Mật khẩu phải có ít nhất 8 ký tự")
    
    if len(password) > 128:
        raise ValueError("Mật khẩu không được vượt quá 128 ký tự")
    
    if not re.search(r'[A-Z]', password):
        raise ValueError("Mật khẩu phải có ít nhất 1 chữ hoa")
    
    if not re.search(r'[a-z]', password):
        raise ValueError("Mật khẩu phải có ít nhất 1 chữ thường")
    
    if not re.search(r'[0-9]', password):
        raise ValueError("Mật khẩu phải có ít nhất 1 số")
    
    return password


def validate_full_name(full_name: str) -> str:
    """
    Validate full name
    - Must be 2-100 characters
    - Allow Vietnamese characters
    """
    if not full_name:
        raise ValueError("Họ tên không được để trống")
    
    full_name = full_name.strip()
    
    if len(full_name) < 2:
        raise ValueError("Họ tên phải có ít nhất 2 ký tự")
    
    if len(full_name) > 100:
        raise ValueError("Họ tên không được vượt quá 100 ký tự")
    
    # Allow Vietnamese characters, spaces, and common punctuation
    # Simplified pattern: allow letters (including Vietnamese), spaces, hyphens, apostrophes
    if not re.match(r'^[a-zA-ZÀ-ỹ\s\'-]+$', full_name):
        raise ValueError("Họ tên chứa ký tự không hợp lệ")
    
    return full_name


def validate_title(title: str) -> str:
    """
    Validate document title
    - Must be 1-200 characters
    """
    if not title:
        raise ValueError("Tiêu đề không được để trống")
    
    title = title.strip()
    
    if len(title) < 1:
        raise ValueError("Tiêu đề không được để trống")
    
    if len(title) > 200:
        raise ValueError("Tiêu đề không được vượt quá 200 ký tự")
    
    return title


def validate_object_id(id_str: str, field_name: str = "ID") -> ObjectId:
    """
    Validate MongoDB ObjectId format
    """
    if not id_str:
        raise ValueError(f"{field_name} không được để trống")
    
    try:
        return ObjectId(str(id_str))
    except (InvalidId, TypeError, ValueError):
        raise ValueError(f"{field_name} không hợp lệ")


def sanitize_string(text: str, max_length: int = 1000) -> str:
    """
    Sanitize string input - remove potentially dangerous characters
    """
    if not text:
        return ""
    
    # Remove null bytes
    text = text.replace('\x00', '')
    
    # Truncate if too long
    if len(text) > max_length:
        text = text[:max_length]
    
    return text.strip()


def validate_email(email: str) -> str:
    """
    Validate email format
    """
    if not email:
        raise ValueError("Email không được để trống")
    
    email = email.strip().lower()
    
    # Basic email regex
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    
    if not re.match(email_pattern, email):
        raise ValueError("Email không hợp lệ")
    
    if len(email) > 254:  # RFC 5321 limit
        raise ValueError("Email quá dài")
    
    return email


def validate_amount(amount: int, min_amount: int = 20000, max_amount: int = 10000000) -> int:
    """
    Validate payment amount
    """
    if not isinstance(amount, int):
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            raise ValueError("Số tiền phải là số nguyên")
    
    if amount < min_amount:
        raise ValueError(f"Số tiền tối thiểu là {min_amount:,} VNĐ")
    
    if amount > max_amount:
        raise ValueError(f"Số tiền tối đa là {max_amount:,} VNĐ")
    
    return amount

