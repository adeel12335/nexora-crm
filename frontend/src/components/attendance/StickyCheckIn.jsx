import { Icon } from '../../icons/IconSprite.jsx';
import { formatElapsed, useAttendanceSession } from '../../hooks/useAttendanceSession.jsx';

const STATUS_LABEL = {
  out: 'Not checked in',
  in: 'Working',
  late: 'Working · late',
  paused: 'Checked out',
};

export default function StickyCheckIn() {
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
    locationGate,
    geofenceEnabled,
    checkInBlockedByLocation,
  } = useAttendanceSession();

  if (loading) {
    return <div className="sidebar-checkin is-loading">Loading…</div>;
  }

  const modalTitle =
    modalMode === 'open' ? 'Close open session' : modalMode === 'progress' ? 'Update progress' : 'Check out';
  const modalHint =
    modalMode === 'open'
      ? `Session date ${openSession?.workDate}. Checkout defaults to 6:00 PM PKT.`
      : modalMode === 'progress'
        ? 'Update total emails sent today (can fix mistakes).'
        : 'How many emails have you sent so far today?';

  const sessionCount = sessions?.length || 0;
  const metaBits = [];
  if (record?.checkInDisplay) metaBits.push(`In ${record.checkInDisplay}`);
  if (record?.emailsSent != null) metaBits.push(`${record.emailsSent} emails`);
  if (sessionCount > 1) metaBits.push(`${sessionCount} sessions`);

  return (
    <>
      <div className={`sidebar-checkin status-${status}`}>
        <div className={`sidebar-checkin-status status-${status === 'paused' ? 'done' : status}`}>
          <i className="sidebar-checkin-dot" aria-hidden />
          <span>{STATUS_LABEL[status]}</span>
        </div>

        {isWorking && liveElapsed != null && (
          <div className="sidebar-checkin-timer" aria-live="polite">
            {formatElapsed(liveElapsed)}
          </div>
        )}

        {metaBits.length > 0 && (
          <p className="sidebar-checkin-meta-line">{metaBits.join(' · ')}</p>
        )}

        {geofenceEnabled && canCheckIn && locationGate.message ? (
          <p className="sidebar-checkin-geo-msg" role="status">{locationGate.message}</p>
        ) : null}

        {openSession && (
          <button type="button" className="sidebar-checkin-cta warn" onClick={startOpenClose} disabled={busy}>
            Close open day
          </button>
        )}

        {canCheckIn && (
          <button
            type="button"
            className="sidebar-checkin-cta primary"
            onClick={handleCheckIn}
            disabled={busy || checkInBlockedByLocation}
          >
            <Icon id="i-check" />
            Check In
          </button>
        )}

        {isWorking && (
          <button type="button" className="sidebar-checkin-cta checkout" onClick={startCheckout} disabled={busy}>
            Check Out
          </button>
        )}

        {hasDayRecord && (
          <button type="button" className="sidebar-checkin-link" onClick={startProgress} disabled={busy}>
            Update progress
          </button>
        )}
      </div>

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
    </>
  );
}
