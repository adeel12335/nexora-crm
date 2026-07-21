import Select from 'react-select';

const BASE_Z = 140;

function buildStyles({ fullWidth, minWidth }) {
  return {
    control: (base, state) => ({
      ...base,
      minHeight: 44,
      minWidth: fullWidth ? '100%' : (minWidth || 160),
      width: fullWidth ? '100%' : undefined,
      borderRadius: 10,
      borderColor: state.isFocused ? 'var(--accent)' : 'var(--border)',
      background: '#fff',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(198,90,121,.18)' : 'none',
      '&:hover': { borderColor: 'var(--accent)' },
      fontSize: 14,
      fontFamily: 'inherit',
      cursor: 'pointer',
      transition: 'border-color .15s, box-shadow .15s',
    }),
    valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
    singleValue: (base) => ({ ...base, color: 'var(--text)', fontWeight: 600 }),
    placeholder: (base) => ({ ...base, color: 'var(--muted)', fontWeight: 500 }),
    input: (base) => ({ ...base, color: 'var(--text)', margin: 0, padding: 0 }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: state.isFocused ? 'var(--accent)' : 'var(--muted)',
      padding: '0 10px',
    }),
    clearIndicator: (base) => ({
      ...base,
      color: 'var(--muted)',
      padding: '0 6px',
      cursor: 'pointer',
      '&:hover': { color: 'var(--red)' },
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 12,
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-md)',
      overflow: 'hidden',
      zIndex: BASE_Z,
      fontFamily: 'inherit',
      background: '#fff',
    }),
    menuPortal: (base) => ({ ...base, zIndex: BASE_Z }),
    option: (base, state) => ({
      ...base,
      fontSize: 13,
      fontWeight: state.isSelected ? 700 : 500,
      borderRadius: 8,
      background: state.isSelected
        ? 'var(--accent)'
        : state.isFocused
          ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
          : 'transparent',
      color: state.isSelected ? '#fff' : 'var(--text)',
      cursor: 'pointer',
      padding: '10px 12px',
    }),
    menuList: (base) => ({ ...base, padding: 6, maxHeight: 280 }),
    noOptionsMessage: (base) => ({ ...base, color: 'var(--muted)', fontSize: 13 }),
  };
}

/**
 * Searchable react-select used across filters, forms, and modals.
 * Pass isMulti for multi-select — value is string[], onChange receives string[].
 */
export default function FancySelect({
  value,
  onChange,
  options = [],
  placeholder = 'Search…',
  isClearable = false,
  isDisabled = false,
  isMulti = false,
  className = '',
  label,
  'aria-label': ariaLabel,
  fullWidth = false,
  minWidth,
  autoFocus = false,
  required = false,
  ...rest
}) {
  const styles = buildStyles({ fullWidth, minWidth });
  const selected = isMulti
    ? options.filter((o) => (Array.isArray(value) ? value : []).map(String).includes(String(o.value)))
    : (options.find((o) => String(o.value) === String(value ?? '')) ?? null);

  return (
    <div className={`fancy-select${fullWidth ? ' fancy-select--full' : ''} ${className}`.trim()}>
      {label ? <span className="fancy-select-label">{label}</span> : null}
      <Select
        classNamePrefix="portal-select"
        options={options}
        value={selected}
        onChange={(opt) => {
          if (isMulti) {
            onChange(Array.isArray(opt) ? opt.map((o) => String(o.value)) : []);
            return;
          }
          onChange(opt ? String(opt.value) : '');
        }}
        placeholder={placeholder}
        isClearable={isClearable}
        isMulti={isMulti}
        closeMenuOnSelect={!isMulti}
        isSearchable
        isDisabled={isDisabled}
        autoFocus={autoFocus}
        required={required}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
        menuShouldScrollIntoView={false}
        styles={{
          ...styles,
          multiValue: (base) => ({
            ...base,
            background: 'var(--accent-soft)',
            borderRadius: 8,
          }),
          multiValueLabel: (base) => ({
            ...base,
            color: 'var(--accent)',
            fontWeight: 700,
            fontSize: 12,
          }),
          multiValueRemove: (base) => ({
            ...base,
            color: 'var(--accent)',
            ':hover': { background: 'var(--accent)', color: '#fff' },
          }),
        }}
        aria-label={ariaLabel || label || placeholder}
        noOptionsMessage={() => 'No matches'}
        filterOption={(option, raw) => {
          const q = String(raw || '').trim().toLowerCase();
          if (!q) return true;
          const labelText = String(option.label || '').toLowerCase();
          const valueText = String(option.value || '').toLowerCase();
          return labelText.includes(q) || valueText.includes(q);
        }}
        {...rest}
      />
    </div>
  );
}
