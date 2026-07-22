import { useState } from 'react';
import { Icon } from '../icons/IconSprite.jsx';

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  name,
  id,
  disabled,
  className,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`password-field${className ? ` ${className}` : ''}`}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        name={name}
        id={id}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        <Icon id={visible ? 'i-eye-off' : 'i-eye'} />
      </button>
    </div>
  );
}
