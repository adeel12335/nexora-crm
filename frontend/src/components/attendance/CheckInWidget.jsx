import { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';

const LATE_AFTER_HOUR = 9;
const LATE_AFTER_MINUTE = 15;

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isLate(date) {
  return date.getHours() > LATE_AFTER_HOUR || (date.getHours() === LATE_AFTER_HOUR && date.getMinutes() > LATE_AFTER_MINUTE);
}

export default function CheckInWidget({ initialCheckIn = null, initialCheckOut = null }) {
  const { showToast } = useToast();
  const [now, setNow] = useState(() => new Date());
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [late, setLate] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  function handleCheckIn() {
    const time = new Date();
    setCheckIn(formatTime(time));
    setLate(isLate(time));
    showToast(isLate(time) ? 'Checked in — marked as late' : 'Checked in — have a great day!');
  }

  function handleCheckOut() {
    const time = new Date();
    setCheckOut(formatTime(time));
    showToast('Checked out — see you tomorrow!');
  }

  const status = !checkIn ? 'out' : checkOut ? 'done' : late ? 'late' : 'in';
  const statusLabel = { out: 'Not checked in', in: 'Checked in', late: 'Checked in (late)', done: 'Day complete' }[status];

  return (
    <div className="panel checkin-card">
      <div className="checkin-clock">{formatTime(now)}</div>
      <div className="checkin-date">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <span className={`checkin-status status-${status}`}>{statusLabel}</span>

      {!checkIn && (
        <button className="checkin-btn" onClick={handleCheckIn}>Check In</button>
      )}
      {checkIn && !checkOut && (
        <button className="checkin-btn checkout" onClick={handleCheckOut}>Check Out</button>
      )}
      {checkIn && checkOut && (
        <button className="checkin-btn" disabled>Done for today</button>
      )}

      <div className="checkin-times">
        <div><span>Check-in</span><strong>{checkIn || '—'}</strong></div>
        <div><span>Check-out</span><strong>{checkOut || '—'}</strong></div>
      </div>
    </div>
  );
}
