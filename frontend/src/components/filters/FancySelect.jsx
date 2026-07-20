import Select from 'react-select';

const portalSelectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    minWidth: 160,
    borderRadius: 9,
    borderColor: state.isFocused ? 'var(--accent)' : 'var(--border)',
    background: 'var(--surface)',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(198,90,121,.18)' : 'var(--shadow-sm)',
    '&:hover': { borderColor: 'var(--accent)' },
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
  }),
  valueContainer: (base) => ({ ...base, padding: '0 10px' }),
  singleValue: (base) => ({ ...base, color: 'var(--text)', fontWeight: 600 }),
  placeholder: (base) => ({ ...base, color: 'var(--muted)' }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? 'var(--accent)' : 'var(--muted)',
    padding: '0 10px',
  }),
  clearIndicator: (base) => ({ ...base, color: 'var(--muted)', padding: '0 4px' }),
  menu: (base) => ({
    ...base,
    borderRadius: 12,
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-md)',
    overflow: 'hidden',
    zIndex: 90,
    fontFamily: 'inherit',
  }),
  menuPortal: (base) => ({ ...base, zIndex: 90 }),
  option: (base, state) => ({
    ...base,
    fontSize: 13,
    fontWeight: state.isSelected ? 700 : 500,
    background: state.isSelected
      ? 'var(--accent)'
      : state.isFocused
        ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
        : 'transparent',
    color: state.isSelected ? '#fff' : 'var(--text)',
    cursor: 'pointer',
  }),
  menuList: (base) => ({ ...base, padding: 6 }),
};

/**
 * Styled react-select for toolbars / filters.
 * @param {{ value: string, onChange: (value: string) => void, options: {value:string,label:string}[], placeholder?: string, isClearable?: boolean, className?: string, label?: string }} props
 */
export default function FancySelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  isClearable = true,
  className = '',
  label,
  'aria-label': ariaLabel,
}) {
  const selected = options.find((o) => String(o.value) === String(value ?? '')) ?? null;

  return (
    <div className={`fancy-select ${className}`.trim()}>
      {label ? <span className="fancy-select-label">{label}</span> : null}
      <Select
        classNamePrefix="portal-select"
        options={options}
        value={selected}
        onChange={(opt) => onChange(opt ? String(opt.value) : '')}
        placeholder={placeholder}
        isClearable={isClearable}
        isSearchable
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
        styles={portalSelectStyles}
        aria-label={ariaLabel || label || placeholder}
      />
    </div>
  );
}
