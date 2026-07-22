import { useEffect, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';

/**
 * Validation / confirm popup used across the production board.
 * tone: 'error' | 'warn' | 'info' | 'success'
 */
export default function BoardAlertModal({
  open,
  title,
  message,
  errors = [],
  tone = 'error',
  confirmLabel = 'OK',
  cancelLabel,
  onConfirm,
  onCancel,
}) {
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setPresent(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  if (!present) return null;

  const list = errors.filter(Boolean);
  const toneClass = `board-alert-${tone}`;

  return (
    <div
      className={`modal-backdrop board-alert-backdrop${visible ? ' is-open' : ''}`}
      onClick={onCancel || onConfirm}
      role="presentation"
    >
      <div
        className={`modal board-alert ${toneClass}${visible ? ' is-open' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="board-alert-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="board-alert-icon" aria-hidden="true">
          <Icon id={tone === 'success' ? 'i-check' : tone === 'info' ? 'i-bell' : 'i-alert'} />
        </div>
        <div className="board-alert-body">
          <h2 id="board-alert-title">{title}</h2>
          {message ? <p>{message}</p> : null}
          {list.length > 0 && (
            <ul className="board-alert-errors">
              {list.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="modal-actions board-alert-actions">
          {cancelLabel ? (
            <button type="button" className="secondary-btn" onClick={onCancel}>
              {cancelLabel}
            </button>
          ) : null}
          <button type="button" className="primary-btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
