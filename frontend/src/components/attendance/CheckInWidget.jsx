import { useEffect, useState } from 'react';
import { formatElapsed, useAttendanceSession } from '../../hooks/useAttendanceSession.jsx';

const TZ = 'Asia/Karachi';

function formatClock(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export default function CheckInWidget() {
  const [now, setNow] = useState(() => new Date());
  const {
    loading,
    busy,
    record,
    sessions,
    openSession,
    canCheckIn,
    liveElapsed,
    status,
    isWorking,
    hasDayRecord,
    emailsInput,
    setEmailsInput,
    modalMode,
    handleCheckIn,
    startCheckout,
    startOpenClose,
    startProgress,
    confirmModal,
    cancelModal,
  } = useAttendanceSession();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const statusLabel = {
    out: 'Not checked in',
    in: 'Checked in',
    late: 'Checked in (late)',
    paused: 'Checked out — can check in again',
  }[status];

  if (loading) {
    return (
      <div className="panel checkin-card">
        <div className="checkin-date">Loading attendance…</div>
      </div>
    );
  }

  const modalTitle =
    modalMode === 'open' ? 'Close open session' : modalMode === 'progress' ? 'Update progress' : 'Check out';
  const modalHint =
    modalMode === 'open'
      ? `Session date ${openSession?.workDate}. Checkout time defaults to 6:00 PM PKT.`
      : modalMode === 'progress'
        ? 'Update total emails sent today.'
        : 'How many emails have you sent so far today?';

  return (
    <div className="panel checkin-card">
      <div className="checkin-clock">{formatClock(now)}</div>
      <div className="checkin-date">{formatDate(now)} · Asia/Karachi</div>
      <span className={`checkin-status status-${status === 'paused' ? 'done' : status}`}>{statusLabel}</span>

      {liveElapsed != null && (
        <div className="checkin-timer" aria-live="polite">{formatElapsed(liveElapsed)}</div>
      )}

      {openSession && (
        <div className="checkin-open-banner">
          Open session from {openSession.workDate}
          <button type="button" className="tool-btn" onClick={startOpenClose} disabled={busy}>
            Close it
          </button>
        </div>
      )}

      {canCheckIn && (
        <button className="checkin-btn" onClick={handleCheckIn} disabled={busy}>
          Check In
        </button>
      )}
      {isWorking && (
        <button className="checkin-btn checkout" onClick={startCheckout} disabled={busy}>
          Check Out
        </button>
      )}

      <div className="checkin-widget-actions">
        {hasDayRecord && (
          <button type="button" className="tool-btn" onClick={startProgress} disabled={busy}>
            Update progress
          </button>
        )}
      </div>

      <div className="checkin-times">
        <div><span>First in</span><strong>{record?.checkInDisplay || '—'}</strong></div>
        <div><span>Emails</span><strong>{record?.emailsSent ?? '—'}</strong></div>
      </div>

      {sessions.length > 0 && (
        <div className="checkin-sessions">
          {sessions.map((s, i) => (
            <div key={s.id} className="checkin-session-row">
              <span>Session {i + 1}</span>
              <strong>
                {s.checkInDisplay || '—'}
                {s.checkOutDisplay ? ` → ${s.checkOutDisplay}` : ' · open'}
              </strong>
            </div>
          ))}
        </div>
      )}

      {modalMode && (
        <div className="checkin-modal-backdrop" role="presentation" onClick={cancelModal}>
          <div className="checkin-modal panel" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{modalTitle}</h3>
            <p>{modalHint}</p>
            <label className="checkin-emails-label">
              Emails sent
              <input
                type="number"
                min="0"
                step="1"
                value={emailsInput}
                onChange={(e) => setEmailsInput(e.target.value)}
                autoFocus
              />
            </label>
            <div className="checkin-modal-actions">
              <button type="button" className="tool-btn" onClick={cancelModal} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="tool-btn primary" onClick={confirmModal} disabled={busy}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
