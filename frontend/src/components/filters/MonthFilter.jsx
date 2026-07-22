import { forwardRef } from 'react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns/format';
import 'react-datepicker/dist/react-datepicker.css';

const MonthInput = forwardRef(function MonthInput({ value, onClick, placeholder }, ref) {
  return (
    <button type="button" className="month-filter-trigger" onClick={onClick} ref={ref}>
      <svg className="month-filter-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <span className={value ? '' : 'is-placeholder'}>{value || placeholder}</span>
      <svg className="month-filter-caret" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
});

/**
 * Month/year picker (react-datepicker).
 */
export default function MonthFilter({
  value,
  onChange,
  label = 'Month',
  hint,
  minDate,
  maxDate,
  clearable = false,
  placeholder = 'Select month',
}) {
  return (
    <div className="month-filter">
      {label ? <span className="month-filter-label">{label}</span> : null}
      <DatePicker
        selected={value}
        onChange={(date) => onChange(date)}
        dateFormat="MMM yyyy"
        showMonthYearPicker
        showFullMonthYearPicker
        minDate={minDate}
        maxDate={maxDate ?? new Date()}
        isClearable={clearable}
        customInput={<MonthInput placeholder={placeholder} />}
        calendarClassName="month-filter-calendar"
        popperClassName="month-filter-popper"
        placeholderText={placeholder}
        showPopperArrow={false}
      />
      {hint ? <p className="month-filter-hint">{hint}</p> : null}
    </div>
  );
}

/** Year-only picker */
export function YearFilter({ value, onChange, label = 'Year', hint }) {
  return (
    <div className="month-filter">
      {label ? <span className="month-filter-label">{label}</span> : null}
      <DatePicker
        selected={value}
        onChange={(date) => date && onChange(date)}
        dateFormat="yyyy"
        showYearPicker
        maxDate={new Date()}
        customInput={<MonthInput placeholder="Select year" />}
        calendarClassName="month-filter-calendar"
        popperClassName="month-filter-popper"
        showPopperArrow={false}
      />
      {hint ? <p className="month-filter-hint">{hint}</p> : null}
    </div>
  );
}

/** Single-day picker (filters + forms). Defaults max to today unless allowFuture. */
export function DayFilter({
  value,
  onChange,
  label,
  placeholder = 'Pick date',
  maxDate,
  minDate,
  allowFuture = false,
  clearable = true,
  className = '',
}) {
  const selected = value ? new Date(`${value}T12:00:00`) : null;
  const resolvedMax = allowFuture ? maxDate : (maxDate ?? new Date());
  return (
    <div className={`month-filter month-filter--day${className ? ` ${className}` : ''}`}>
      {label ? <span className="month-filter-label">{label}</span> : null}
      <DatePicker
        selected={selected}
        onChange={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : '')}
        dateFormat="dd MMM yyyy"
        minDate={minDate}
        maxDate={resolvedMax}
        isClearable={clearable}
        customInput={<MonthInput placeholder={placeholder} />}
        calendarClassName="month-filter-calendar"
        popperClassName="month-filter-popper"
        showPopperArrow={false}
        placeholderText={placeholder}
      />
    </div>
  );
}

/** Format Date → YYYY-MM for rates API */
export function toMonthKey(date) {
  return format(date, 'yyyy-MM');
}

/**
 * Cycle start date for a selected calendar month (anchor day 15 default).
 */
export function cycleStartFromMonth(date, anchorDay = 15) {
  const y = date.getFullYear();
  const m = date.getMonth();
  return format(new Date(y, m, anchorDay), 'yyyy-MM-dd');
}

/** @deprecated use cycleStartFromMonth + API */
export function cycleBoundsFromMonth(date) {
  const cycleStart = cycleStartFromMonth(date);
  const y = date.getFullYear();
  const m = date.getMonth();
  const cycleEnd = format(new Date(y, m + 1, 14), 'yyyy-MM-dd');
  return {
    cycleStart,
    cycleEnd,
    label: `${cycleStart} → ${cycleEnd}`,
  };
}

/** Pick the month whose anchor starts the cycle containing `date`. */
export function defaultCycleMonth(date = new Date(), anchorDay = 15) {
  const d = date.getDate();
  if (d >= anchorDay) return new Date(date.getFullYear(), date.getMonth(), 1);
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}
