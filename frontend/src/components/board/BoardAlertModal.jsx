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
  if (!open) return null;

  const list = errors.filter(Boolean);
  const toneClass = `board-alert-${tone}`;

  return (
    <div className="modal-backdrop board-alert-backdrop" onClick={onCancel || onConfirm} role="presentation">
      <div
        className={`modal board-alert ${toneClass}`}
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
          <button type="button" className="primary-btn" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
