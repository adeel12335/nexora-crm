import { Icon } from '../../icons/IconSprite.jsx';

const STATUS_ICON = {
  present: 'i-check',
  late: 'i-clock',
  absent: 'i-close',
  leave: 'i-calendar',
  off: 'i-calendar',
};

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function statusOf(agent) {
  const raw = agent.statusDay || agent.statusToday || 'absent';
  return raw === 'off' ? 'leave' : raw;
}

export default function TeamAttendanceTable({
  agents = [],
  mode = 'day',
  onOpenDetail,
}) {
  if (!agents.length) {
    return <div className="panel empty-state">No team members found</div>;
  }

  const isRange = mode === 'range';

  return (
    <div className="panel" style={{ overflowX: 'auto' }}>
      <table className="attendance-table responsive-table">
        <thead>
          <tr>
            <th>Person</th>
            {isRange ? (
              <>
                <th>Present</th>
                <th>Late</th>
                <th>Leave</th>
                <th>Absent</th>
              </>
            ) : (
              <>
                <th>Status</th>
                <th>Check-in</th>
                <th>Check-out</th>
              </>
            )}
            <th>Avg in</th>
            <th>Avg out</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => {
            const dayStatus = statusOf(agent);
            return (
              <tr key={agent.id}>
                <td data-label="Person">
                  <div className="agent-cell">
                    {agent.avatar ? (
                      <img src={agent.avatar} alt={agent.name} />
                    ) : (
                      <span className="agent-avatar-fallback">{initials(agent.name)}</span>
                    )}
                    <div>
                      <strong>{agent.name}</strong>
                      <span>{agent.role === 'manager' ? 'Manager' : 'Agent'}</span>
                    </div>
                  </div>
                </td>
                {isRange ? (
                  <>
                    <td data-label="Present">{agent.range?.present ?? 0}</td>
                    <td data-label="Late">{agent.range?.late ?? 0}</td>
                    <td data-label="Leave">{agent.range?.leave ?? 0}</td>
                    <td data-label="Absent">{agent.range?.absent ?? 0}</td>
                  </>
                ) : (
                  <>
                    <td data-label="Status">
                      <span className={`status-chip ${dayStatus}`}>
                        <Icon id={STATUS_ICON[dayStatus] || 'i-close'} />
                        {dayStatus}
                      </span>
                    </td>
                    <td data-label="Check-in">
                      {dayStatus === 'leave' ? '—' : (agent.checkIn || '—')}
                    </td>
                    <td data-label="Check-out">
                      {dayStatus === 'leave' ? '—' : (agent.checkOut || '—')}
                    </td>
                  </>
                )}
                <td data-label="Avg in">{agent.avgCheckIn || '—'}</td>
                <td data-label="Avg out">{agent.avgCheckOut || '—'}</td>
                <td data-label="">
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={() => onOpenDetail?.(agent)}
                  >
                    Detail
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
