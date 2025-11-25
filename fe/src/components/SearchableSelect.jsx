import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import '../assets/styles/SearchableSelect.css';

export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Chọn...',
  searchPlaceholder = 'Tìm kiếm...',
  disabled = false,
  required = false,
  onSearch,
  label,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(options);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Get selected option
  const selectedOption = options.find(opt => (opt._id || opt.id) === value);

  // Filter options based on search query
  useEffect(() => {
    if (onSearch && searchQuery.trim()) {
      // Use API search if provided
      const timeoutId = setTimeout(() => {
        onSearch(searchQuery).then(results => {
          setFilteredOptions(results || []);
        }).catch(err => {
          console.error('Search error:', err);
          setFilteredOptions([]);
        });
      }, 300); // Debounce 300ms
      return () => clearTimeout(timeoutId);
    } else {
      // Client-side filtering
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const filtered = options.filter(opt => {
          const name = (opt.name || opt.title || '').toLowerCase();
          const shortName = (opt.shortName || '').toLowerCase();
          return name.includes(query) || shortName.includes(query);
        });
        setFilteredOptions(filtered);
      } else {
        setFilteredOptions(options);
      }
    }
  }, [searchQuery, options, onSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  const handleSelect = (option) => {
    const optionValue = option._id || option.id;
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex]);
        } else if (!isOpen) {
          setIsOpen(true);
          inputRef.current?.focus();
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev => 
            prev < filteredOptions.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
        break;
    }
  };

  const displayOptions = filteredOptions.length > 0 ? filteredOptions : options;

  return (
    <div className={`searchable-select ${className}`} ref={containerRef}>
      {label && (
        <label className="searchable-select-label">
          {label} {required && <span className="required">*</span>}
        </label>
      )}
      <div
        className={`searchable-select-trigger ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${!value ? 'placeholder' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="searchable-select-value">
          {selectedOption ? (
            <span>
              {selectedOption.name || selectedOption.title}
              {selectedOption.shortName && selectedOption.shortName !== selectedOption.name && (
                <span className="searchable-select-shortname"> ({selectedOption.shortName})</span>
              )}
            </span>
          ) : (
            <span className="searchable-select-placeholder">{placeholder}</span>
          )}
        </div>
        <div className="searchable-select-actions">
          {value && !disabled && (
            <button
              type="button"
              className="searchable-select-clear"
              onClick={handleClear}
              aria-label="Clear selection"
            >
              <X size={16} />
            </button>
          )}
          <ChevronDown 
            size={18} 
            className={`searchable-select-chevron ${isOpen ? 'open' : ''}`}
          />
        </div>
      </div>

      {isOpen && (
        <div className="searchable-select-dropdown" ref={dropdownRef}>
          <div className="searchable-select-search">
            <Search size={16} className="search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="searchable-select-input"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                  e.preventDefault();
                  handleKeyDown(e);
                }
              }}
              autoFocus
            />
          </div>
          <div className="searchable-select-options" role="listbox">
            {displayOptions.length === 0 ? (
              <div className="searchable-select-empty">
                {searchQuery ? 'Không tìm thấy kết quả' : 'Không có tùy chọn'}
              </div>
            ) : (
              displayOptions.map((option, index) => {
                const optionValue = option._id || option.id;
                const isSelected = optionValue === value;
                const isHighlighted = index === highlightedIndex;
                
                return (
                  <div
                    key={optionValue}
                    className={`searchable-select-option ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                    onClick={() => handleSelect(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span>
                      {option.name || option.title}
                      {option.shortName && option.shortName !== option.name && (
                        <span className="searchable-select-option-shortname"> ({option.shortName})</span>
                      )}
                    </span>
                    {isSelected && <span className="searchable-select-check">✓</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

