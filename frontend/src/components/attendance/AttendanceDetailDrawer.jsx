import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import MonthFilter, { toMonthKey } from '../filters/MonthFilter.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

const STATUS_ICON = {
  present: 'i-check',
  late: 'i-clock',
  absent: 'i-close',
  leave: 'i-calendar',
  future: 'i-calendar',
};

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export default function AttendanceDetailDrawer({ memberId, onClose }) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [month, setMonth] = useState(() => new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('calendar'); // calendar | list

  const monthKey = toMonthKey(month);

  useEffect(() => {
    if (!token || !memberId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.attendanceMember(token, memberId, { month: monthKey });
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load attendance');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, memberId, monthKey, showToast]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const d of data?.days || []) map.set(d.date, d);
    return map;
  }, [data]);

  const calendarDays = useMemo(() => {
    if (!data?.from) return [];
    const [y, m] = monthKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = first.getDay(); // 0 Sun
    const lastDay = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(byDate.get(date) || { date, status: 'absent' });
    }
    return cells;
  }, [data, monthKey, byDate]);

  if (!memberId) return null;

  const person = data?.person;
  const summary = data?.summary;

  return (
    <div className="checkin-modal-backdrop att-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="att-drawer panel"
        role="dialog"
        aria-labelledby="att-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="att-drawer-head">
          <div className="agent-cell">
            <span className="agent-avatar-fallback">{initials(person?.name || '?')}</span>
            <div>
              <h3 id="att-drawer-title">{person?.name || '…'}</h3>
              <p>{person?.role === 'manager' ? 'Manager' : 'Agent'} · {person?.email || ''}</p>
            </div>
          </div>
          <button type="button" className="tool-btn" onClick={onClose}>Close</button>
        </header>

        <div className="att-drawer-toolbar">
          <MonthFilter value={month} onChange={setMonth} label={null} placeholder="Month" />
          <div className="period-pills">
            <button
              type="button"
              className={`period-pill${view === 'calendar' ? ' is-active' : ''}`}
              onClick={() => setView('calendar')}
            >
              Month
            </button>
            <button
              type="button"
              className={`period-pill${view === 'list' ? ' is-active' : ''}`}
              onClick={() => setView('list')}
            >
              Day list
            </button>
          </div>
        </div>

        {summary ? (
          <div className="att-drawer-stats">
            <div><span>Present</span><strong>{summary.presentCount ?? 0}</strong></div>
            <div><span>Late</span><strong>{summary.lateCount ?? 0}</strong></div>
            <div><span>Leave</span><strong>{summary.offsTaken ?? 0}</strong></div>
            <div><span>Deduction</span><strong>{summary.deduction ? 'Yes' : 'No'}</strong></div>
          </div>
        ) : null}

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : view === 'calendar' ? (
          <div className="att-calendar">
            <div className="att-cal-weekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="att-cal-grid">
              {calendarDays.map((cell, i) => {
                if (!cell) return <div key={`e-${i}`} className="att-cal-cell is-empty" />;
                const st = cell.status || 'absent';
                return (
                  <div key={cell.date} className={`att-cal-cell status-${st}`} title={cell.date}>
                    <strong>{Number(cell.date.slice(8))}</strong>
                    <em>{st}</em>
                    {cell.checkIn ? <small>{cell.checkIn}</small> : null}
                  </div>
                );
              })}
            </div>
            <div className="att-cal-legend">
              <span className="status-chip present">present</span>
              <span className="status-chip late">late</span>
              <span className="status-chip leave">leave</span>
              <span className="status-chip absent">absent</span>
            </div>
          </div>
        ) : (
          <div className="att-day-list">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>In</th>
                  <th>Out</th>
                </tr>
              </thead>
              <tbody>
                {(data?.days || [])
                  .slice()
                  .reverse()
                  .filter((d) => d.status !== 'future')
                  .map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>
                        <span className={`status-chip ${d.status}`}>
                          <Icon id={STATUS_ICON[d.status] || 'i-close'} />
                          {d.status}
                        </span>
                      </td>
                      <td>{d.checkIn || '—'}</td>
                      <td>{d.checkOut || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>
    </div>
  );
}
