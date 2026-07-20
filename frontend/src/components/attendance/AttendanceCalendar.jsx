export default function AttendanceCalendar({ days = [], monthLabel }) {
  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const today = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(today);

  const firstDate = days[0]?.date;
  const firstWeekday = firstDate
    ? new Date(`${firstDate}T12:00:00+05:00`).getDay()
    : 0;

  const label =
    monthLabel ||
    (firstDate
      ? new Date(`${firstDate}T12:00:00+05:00`).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Karachi',
        })
      : '');

  const cells = [
    ...Array.from({ length: firstWeekday }, (_, i) => ({ key: `blank-${i}`, empty: true })),
    ...days.map((d) => ({
      key: d.date,
      day: d.day,
      status: d.status,
      isToday: d.date === todayStr,
    })),
  ];

  return (
    <div className="panel calendar-card">
      <h3>{label}</h3>
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
            className={`calendar-day${cell.empty ? ' empty' : ` ${cell.status}`}${cell.isToday ? ' today' : ''}`}
          >
            {cell.empty ? '' : cell.day}
          </div>
        ))}
      </div>
    </div>
  );
}
