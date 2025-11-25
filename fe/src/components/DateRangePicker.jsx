import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronRight as ArrowRight } from 'lucide-react';
import '../assets/styles/DateRangePicker.css';

const months = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

export default function DateRangePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState('today'); // 'today', 'yesterday', 'last7days', 'last30days', 'byDay', 'byWeek', 'byMonth', 'byYear'
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [displayText, setDisplayText] = useState('Ngày tải xuống');
  const pickerRef = useRef(null);

  useEffect(() => {
    // Cập nhật display text dựa trên value
    if (value) {
      updateDisplayText(value);
      // Cập nhật selectedMode dựa trên value
      if (value === 'today') {
        setSelectedMode('today');
      } else if (value === 'yesterday') {
        setSelectedMode('yesterday');
      } else if (value === 'last7days') {
        setSelectedMode('last7days');
      } else if (value === 'last30days') {
        setSelectedMode('last30days');
      } else if (value.startsWith('month:')) {
        setSelectedMode('byMonth');
        const parts = value.split(':');
        if (parts.length >= 3) {
          setSelectedYear(parseInt(parts[1]));
          setSelectedMonth(parseInt(parts[2]));
        }
      } else if (value.startsWith('year:')) {
        setSelectedMode('byYear');
        const parts = value.split(':');
        if (parts.length >= 2) {
          setSelectedYear(parseInt(parts[1]));
        }
      } else if (value.startsWith('day:')) {
        setSelectedMode('byDay');
        const parts = value.split(':');
        if (parts.length >= 4) {
          setSelectedYear(parseInt(parts[1]));
          setSelectedMonth(parseInt(parts[2]));
          setSelectedDay(parseInt(parts[3]));
        }
      } else if (value.startsWith('week:')) {
        setSelectedMode('byWeek');
        const parts = value.split(':');
        if (parts.length >= 3) {
          setSelectedYear(parseInt(parts[1]));
          setSelectedWeek(parseInt(parts[2]));
        }
      }
    } else {
      setDisplayText('Ngày tải xuống');
      setSelectedMode('today');
    }
  }, [value]);

  useEffect(() => {
    // Đóng picker khi click bên ngoài
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const updateDisplayText = (filterValue) => {
    if (!filterValue) {
      setDisplayText('Ngày tải xuống');
      return;
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (filterValue === 'today') {
      setDisplayText(`Hôm nay Tới ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} hôm nay (GMT+07)`);
    } else if (filterValue === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      setDisplayText(`Hôm qua (${yesterday.toLocaleDateString('vi-VN')})`);
    } else if (filterValue === 'last7days') {
      setDisplayText('Trong 7 ngày qua');
    } else if (filterValue === 'last30days') {
      setDisplayText('Trong 30 ngày qua');
    } else if (filterValue && filterValue.startsWith('month:')) {
      const parts = filterValue.split(':');
      if (parts.length >= 3) {
        const year = parts[1];
        const month = parseInt(parts[2]);
        setDisplayText(`${months[month - 1]} ${year}`);
      }
    } else if (filterValue && filterValue.startsWith('year:')) {
      const parts = filterValue.split(':');
      if (parts.length >= 2) {
        const year = parts[1];
        setDisplayText(`Năm ${year}`);
      }
    } else if (filterValue && filterValue.startsWith('day:')) {
      const parts = filterValue.split(':');
      if (parts.length >= 4) {
        const year = parts[1];
        const month = parts[2];
        const day = parts[3];
        setDisplayText(`${day}/${month}/${year}`);
      }
    } else if (filterValue && filterValue.startsWith('week:')) {
      const parts = filterValue.split(':');
      if (parts.length >= 3) {
        const year = parts[1];
        const week = parts[2];
        setDisplayText(`Tuần ${week}, ${year}`);
      }
    } else {
      setDisplayText('Ngày tải xuống');
    }
  };

  // Tính số tuần trong năm (ISO week) - tuần bắt đầu từ Thứ 2
  const getWeekNumber = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Tìm Thứ 2 của tuần chứa ngày 4/1 (ISO week standard)
    const jan4 = new Date(d.getFullYear(), 0, 4);
    jan4.setHours(0, 0, 0, 0);
    const jan4Day = jan4.getDay() || 7; // 0 = CN -> 7, 1 = T2 -> 1
    const jan4Monday = new Date(jan4);
    jan4Monday.setDate(jan4.getDate() - (jan4Day - 1));
    
    // Tính số tuần
    const diffTime = d - jan4Monday;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNum = Math.floor(diffDays / 7) + 1;
    
    return weekNum;
  };

  // Lấy danh sách tuần trong năm
  const getWeeksInYear = (year) => {
    const weeks = [];
    // Kiểm tra tuần cuối cùng của năm
    const dec31 = new Date(year, 11, 31);
    const lastWeek = getWeekNumber(dec31);
    
    // Năm thường có 52 tuần, một số năm có 53 tuần
    const totalWeeks = lastWeek > 52 ? 53 : 52;
    for (let i = 1; i <= totalWeeks; i++) {
      weeks.push(i);
    }
    return weeks;
  };

  // Lấy ngày đầu tuần (Thứ 2) dựa trên ISO week
  const getWeekStartDate = (year, week) => {
    // Tìm Thứ 2 của tuần chứa ngày 4/1
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7; // 0 = CN -> 7
    const jan4Monday = new Date(jan4);
    jan4Monday.setDate(jan4.getDate() - (jan4Day - 1));
    jan4Monday.setHours(0, 0, 0, 0);
    
    // Tính ngày đầu tuần thứ 'week'
    const weekStart = new Date(jan4Monday);
    weekStart.setDate(jan4Monday.getDate() + (week - 1) * 7);
    
    return weekStart;
  };

  // Lấy số ngày trong tháng
  const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
  };

  // Lấy ngày đầu tiên của tháng là thứ mấy (0 = Chủ nhật, 1 = Thứ 2, ...)
  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month - 1, 1).getDay();
  };

  const handlePresetClick = (preset) => {
    // Nếu click vào preset đã chọn, clear filter
    if (selectedMode === preset && ['today', 'yesterday', 'last7days', 'last30days'].includes(preset)) {
      onChange('');
      setIsOpen(false);
      return;
    }
    
    setSelectedMode(preset);
    if (preset === 'today') {
      onChange('today');
      setIsOpen(false);
    } else if (preset === 'yesterday') {
      onChange('yesterday');
      setIsOpen(false);
    } else if (preset === 'last7days') {
      onChange('last7days');
      setIsOpen(false);
    } else if (preset === 'last30days') {
      onChange('last30days');
      setIsOpen(false);
    } else {
      // Các mode chi tiết (byDay, byWeek, byMonth, byYear) sẽ hiển thị panel phải
      const now = new Date();
      if (preset === 'byMonth') {
        setSelectedYear(now.getFullYear());
        setSelectedMonth(now.getMonth() + 1);
      } else if (preset === 'byYear') {
        setSelectedYear(now.getFullYear());
      } else if (preset === 'byDay') {
        setSelectedYear(now.getFullYear());
        setSelectedMonth(now.getMonth() + 1);
        setSelectedDay(now.getDate());
      } else if (preset === 'byWeek') {
        setSelectedYear(now.getFullYear());
        setSelectedWeek(getWeekNumber(now));
      }
    }
  };

  const handleMonthClick = (month) => {
    const newValue = `month:${selectedYear}:${month}`;
    setSelectedMonth(month);
    onChange(newValue);
    setIsOpen(false);
  };

  const handleYearChange = (direction) => {
    setSelectedYear(prev => prev + direction);
  };

  const handleYearClick = () => {
    const newValue = `year:${selectedYear}`;
    onChange(newValue);
    setIsOpen(false);
  };

  const handleDayClick = (day) => {
    const newValue = `day:${selectedYear}:${String(selectedMonth).padStart(2, '0')}:${String(day).padStart(2, '0')}`;
    setSelectedDay(day);
    onChange(newValue);
    setIsOpen(false);
  };

  const handleWeekClick = (week) => {
    const newValue = `week:${selectedYear}:${week}`;
    setSelectedWeek(week);
    onChange(newValue);
    setIsOpen(false);
  };

  const handleMonthChange = (direction) => {
    if (direction === 1) {
      if (selectedMonth === 12) {
        setSelectedMonth(1);
        setSelectedYear(prev => prev + 1);
      } else {
        setSelectedMonth(prev => prev + 1);
      }
    } else {
      if (selectedMonth === 1) {
        setSelectedMonth(12);
        setSelectedYear(prev => prev - 1);
      } else {
        setSelectedMonth(prev => prev - 1);
      }
    }
  };

  const formatDateRange = () => {
    if (selectedMode === 'byMonth') {
      return `${months[selectedMonth - 1]} ${selectedYear}`;
    } else if (selectedMode === 'byYear') {
      return `Năm ${selectedYear}`;
    } else if (selectedMode === 'byDay') {
      return `${String(selectedDay).padStart(2, '0')}/${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
    } else if (selectedMode === 'byWeek') {
      return `Tuần ${selectedWeek}, ${selectedYear}`;
    }
    return displayText;
  };

  return (
    <div className="date-range-picker-wrapper" ref={pickerRef}>
      <button
        className="date-range-picker-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Calendar size={18} />
        <span className="date-range-display">{displayText}</span>
      </button>

      {isOpen && (
        <div className="date-range-picker-dropdown">
          {/* Header */}
          <div className="date-range-header">
            <span className="date-range-title">Khung Thời Gian</span>
            <div className="date-range-selected">
              {formatDateRange()}
            </div>
            <button
              className="date-range-close"
              onClick={() => setIsOpen(false)}
            >
              <Calendar size={16} />
            </button>
          </div>

          <div className="date-range-content">
            {/* Left Panel - Preset Options */}
            <div className="date-range-left-panel">
              <div className="date-range-presets">
                <button
                  className={`date-range-preset ${selectedMode === 'today' ? 'active' : ''}`}
                  onClick={() => handlePresetClick('today')}
                >
                  Hôm nay
                </button>
                <button
                  className={`date-range-preset ${selectedMode === 'yesterday' ? 'active' : ''}`}
                  onClick={() => handlePresetClick('yesterday')}
                >
                  Hôm qua
                </button>
                <button
                  className={`date-range-preset ${selectedMode === 'last7days' ? 'active' : ''}`}
                  onClick={() => handlePresetClick('last7days')}
                >
                  Trong 7 ngày qua
                </button>
                <button
                  className={`date-range-preset ${selectedMode === 'last30days' ? 'active' : ''}`}
                  onClick={() => handlePresetClick('last30days')}
                >
                  Trong 30 ngày qua
                </button>
              </div>

              <div className="date-range-divider"></div>

              <div className="date-range-granular">
                <button
                  className={`date-range-granular-item ${selectedMode === 'byDay' ? 'active' : ''}`}
                  onClick={() => handlePresetClick('byDay')}
                >
                  Theo ngày
                  <ArrowRight size={16} />
                </button>
                <button
                  className={`date-range-granular-item ${selectedMode === 'byWeek' ? 'active' : ''}`}
                  onClick={() => handlePresetClick('byWeek')}
                >
                  Theo tuần
                  <ArrowRight size={16} />
                </button>
                <button
                  className={`date-range-granular-item ${selectedMode === 'byMonth' ? 'active' : ''}`}
                  onClick={() => handlePresetClick('byMonth')}
                >
                  Theo tháng
                  <ArrowRight size={16} />
                </button>
                <button
                  className={`date-range-granular-item ${selectedMode === 'byYear' ? 'active' : ''}`}
                  onClick={() => handlePresetClick('byYear')}
                >
                  Theo năm
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Right Panel - Calendar/Selection */}
            <div className="date-range-right-panel">
              {/* Day Picker */}
              {selectedMode === 'byDay' && (
                <>
                  <div className="date-range-month-nav">
                    <button
                      className="date-range-nav-btn"
                      onClick={() => handleMonthChange(-1)}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <span className="date-range-month-year">
                      {months[selectedMonth - 1]} {selectedYear}
                    </span>
                    <button
                      className="date-range-nav-btn"
                      onClick={() => handleMonthChange(1)}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                  <div className="date-range-calendar">
                    <div className="date-range-weekdays">
                      {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((day, index) => (
                        <div key={index} className="date-range-weekday">{day}</div>
                      ))}
                    </div>
                    <div className="date-range-days-grid">
                      {(() => {
                        const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
                        const firstDay = getFirstDayOfMonth(selectedYear, selectedMonth);
                        const days = [];
                        const now = new Date();
                        const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
                        
                        // Thêm các ngày trống ở đầu
                        for (let i = 0; i < firstDay; i++) {
                          days.push(<div key={`empty-${i}`} className="date-range-day empty"></div>);
                        }
                        
                        // Thêm các ngày trong tháng
                        for (let day = 1; day <= daysInMonth; day++) {
                          const isToday = isCurrentMonth && day === now.getDate();
                          const isSelected = day === selectedDay;
                          const isFuture = selectedYear > now.getFullYear() || 
                                          (selectedYear === now.getFullYear() && selectedMonth > now.getMonth() + 1) ||
                                          (isCurrentMonth && day > now.getDate());
                          
                          days.push(
                            <button
                              key={day}
                              className={`date-range-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'disabled' : ''}`}
                              onClick={() => !isFuture && handleDayClick(day)}
                              disabled={isFuture}
                            >
                              {day}
                            </button>
                          );
                        }
                        
                        return days;
                      })()}
                    </div>
                  </div>
                </>
              )}

              {/* Week Picker */}
              {selectedMode === 'byWeek' && (
                <>
                  <div className="date-range-year-nav">
                    <button
                      className="date-range-nav-btn"
                      onClick={() => handleYearChange(-1)}
                    >
                      <ChevronLeft size={20} />
                      <ChevronLeft size={20} style={{ marginLeft: '-8px' }} />
                    </button>
                    <span className="date-range-year">{selectedYear}</span>
                    <button
                      className="date-range-nav-btn"
                      onClick={() => handleYearChange(1)}
                    >
                      <ChevronRight size={20} />
                      <ChevronRight size={20} style={{ marginLeft: '-8px' }} />
                    </button>
                  </div>
                  <div className="date-range-weeks-grid">
                    {getWeeksInYear(selectedYear).map((week) => {
                      const weekStart = getWeekStartDate(selectedYear, week);
                      const weekEnd = new Date(weekStart);
                      weekEnd.setDate(weekStart.getDate() + 6);
                      const now = new Date();
                      const isCurrentWeek = getWeekNumber(now) === week && selectedYear === now.getFullYear();
                      const isSelected = week === selectedWeek;
                      const isFuture = weekStart > now;
                      
                      return (
                        <button
                          key={week}
                          className={`date-range-week-item ${isSelected ? 'selected' : ''} ${isCurrentWeek ? 'current' : ''} ${isFuture ? 'disabled' : ''}`}
                          onClick={() => !isFuture && handleWeekClick(week)}
                          disabled={isFuture}
                        >
                          <div className="date-range-week-number">Tuần {week}</div>
                          <div className="date-range-week-dates">
                            {weekStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} - {weekEnd.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Month Picker */}
              {selectedMode === 'byMonth' && (
                <>
                  <div className="date-range-year-nav">
                    <button
                      className="date-range-nav-btn"
                      onClick={() => handleYearChange(-1)}
                    >
                      <ChevronLeft size={20} />
                      <ChevronLeft size={20} style={{ marginLeft: '-8px' }} />
                    </button>
                    <span className="date-range-year">{selectedYear}</span>
                    <button
                      className="date-range-nav-btn"
                      onClick={() => handleYearChange(1)}
                    >
                      <ChevronRight size={20} />
                      <ChevronRight size={20} style={{ marginLeft: '-8px' }} />
                    </button>
                  </div>
                  <div className="date-range-months-grid">
                    {months.map((month, index) => {
                      const monthNum = index + 1;
                      const currentDate = new Date();
                      const isCurrentMonth = monthNum === currentDate.getMonth() + 1 && selectedYear === currentDate.getFullYear();
                      const isSelected = monthNum === selectedMonth && selectedYear === selectedYear;
                      const isFuture = selectedYear > currentDate.getFullYear() || 
                                      (selectedYear === currentDate.getFullYear() && monthNum > currentDate.getMonth() + 1);
                      
                      return (
                        <button
                          key={monthNum}
                          className={`date-range-month-item ${isSelected ? 'selected' : ''} ${isCurrentMonth ? 'current' : ''} ${isFuture ? 'disabled' : ''}`}
                          onClick={() => !isFuture && handleMonthClick(monthNum)}
                          disabled={isFuture}
                        >
                          {month}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Year Picker */}
              {selectedMode === 'byYear' && (
                <>
                  <div className="date-range-year-nav">
                    <button
                      className="date-range-nav-btn"
                      onClick={() => handleYearChange(-1)}
                    >
                      <ChevronLeft size={20} />
                      <ChevronLeft size={20} style={{ marginLeft: '-8px' }} />
                    </button>
                    <span className="date-range-year">{selectedYear}</span>
                    <button
                      className="date-range-nav-btn"
                      onClick={() => handleYearChange(1)}
                    >
                      <ChevronRight size={20} />
                      <ChevronRight size={20} style={{ marginLeft: '-8px' }} />
                    </button>
                  </div>
                  <div className="date-range-year-select">
                    <button
                      className="date-range-year-item selected"
                      onClick={handleYearClick}
                    >
                      {selectedYear}
                    </button>
                  </div>
                </>
              )}

              {!['byDay', 'byWeek', 'byMonth', 'byYear'].includes(selectedMode) && (
                <div className="date-range-placeholder">
                  <p>Chọn một tùy chọn từ bên trái</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

