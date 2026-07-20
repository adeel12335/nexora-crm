import { Icon } from '../../icons/IconSprite.jsx';
import { computeAttendanceStatus } from '../../utils/attendanceRules.js';

const STATUS_ICON = { present: 'i-check', late: 'i-clock', absent: 'i-close', off: 'i-calendar' };

export default function TeamAttendanceTable({ agents }) {
  return (
    <div className="panel" style={{ overflowX: 'auto' }}>
      <table className="attendance-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Today</th>
            <th>Check-in</th>
            <th>Lates (mo.)</th>
            <th>Offs used</th>
            <th>Deduction</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => {
            const status = computeAttendanceStatus({ lateCount: agent.lateCount, offsTaken: agent.offsTaken });
            return (
              <tr key={agent.id}>
                <td>
                  <div className="agent-cell">
                    <img src={agent.avatar} alt={agent.name} />
                    <div><strong>{agent.name}</strong><span>Agent</span></div>
                  </div>
                </td>
                <td>
                  <span className={`status-chip ${agent.statusToday}`}>
                    <Icon id={STATUS_ICON[agent.statusToday]} />{agent.statusToday}
                  </span>
                </td>
                <td>{agent.checkIn || '—'}</td>
                <td>{status.lateCount}</td>
                <td>{status.effectiveOffs}/2{status.autoOffsFromLate > 0 ? ` (+${status.autoOffsFromLate} auto)` : ''}</td>
                <td>{status.deduction ? <span className="deduction-flag">Flagged</span> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
