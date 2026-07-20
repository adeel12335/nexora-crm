import { buildMonthStatuses } from '../../utils/attendanceRules.js';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function AttendanceCalendar({ lateCount, offsTaken }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const statuses = buildMonthStatuses({ lateCount, offsTaken, upToDay: today, totalDays });
  const monthLabel = now.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const cells = [
    ...Array.from({ length: firstWeekday }, (_, i) => ({ key: `blank-${i}`, empty: true })),
    ...statuses.map((status, i) => ({ key: `day-${i + 1}`, day: i + 1, status })),
  ];

  return (
    <div className="panel calendar-card">
      <h3>{monthLabel}</h3>
      <div className="calendar-legend">
        <span><i className="legend-dot present" />Present</span>
        <span><i className="legend-dot late" />Late</span>
        <span><i className="legend-dot off" />Off</span>
        <span><i className="legend-dot absent" />Absent</span>
        <span><i className="legend-dot future" />Upcoming</span>
      </div>
      <div className="calendar-weekdays">
        {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="calendar-grid">
        {cells.map((cell) => (
          <div
            key={cell.key}
            className={`calendar-day${cell.empty ? ' empty' : ` ${cell.status}`}${cell.day === today ? ' today' : ''}`}
          >
            {cell.empty ? '' : cell.day}
          </div>
        ))}
      </div>
    </div>
  );
}
