import { Icon } from '../../icons/IconSprite.jsx';
import { computeAttendanceStatus } from '../../utils/attendanceRules.js';

export default function AttendanceRulesCard({ lateCount, offsTaken }) {
  const status = computeAttendanceStatus({ lateCount, offsTaken });

  return (
    <div className="panel rules-card">
      <h3>Attendance rules — this month</h3>
      <p>Every 4th late check-in auto-converts into 1 counted day off. 2 offs are free; the 3rd triggers a payroll deduction.</p>

      <div className="rule-row">
        <div className="rule-icon"><Icon id="i-clock" /></div>
        <div className="rule-copy">
          <strong>Late check-ins</strong>
          <span>{status.lateUntilAutoOff} more late check-in{status.lateUntilAutoOff === 1 ? '' : 's'} auto-counts as a day off</span>
        </div>
        <div className={`rule-counter${status.lateCount % 4 === 3 ? ' warn' : ''}`}>
          <strong>{status.lateCount}</strong><span>lates</span>
        </div>
      </div>

      <div className="rule-row">
        <div className="rule-icon"><Icon id="i-calendar" /></div>
        <div className="rule-copy">
          <strong>Offs used</strong>
          <span>{status.autoOffsFromLate > 0 ? `Includes ${status.autoOffsFromLate} auto-converted from lates. ` : ''}{status.offsRemaining} free off{status.offsRemaining === 1 ? '' : 's'} remaining</span>
        </div>
        <div className={`rule-counter${status.effectiveOffs >= 2 ? ' warn' : ''}${status.deduction ? ' danger' : ''}`}>
          <strong>{status.effectiveOffs}/2</strong><span>offs</span>
        </div>
      </div>

      <div className="rule-row">
        <div className="rule-icon"><Icon id={status.deduction ? 'i-deduction' : 'i-shield'} /></div>
        <div className="rule-copy">
          <strong>Salary deduction</strong>
          <span>{status.deduction ? 'Deduction has been flagged for this pay cycle.' : 'No deduction — you are within the free-off limit.'}</span>
        </div>
        <div className={`rule-counter${status.deduction ? ' danger' : ''}`}>
          <strong>{status.deduction ? 'Yes' : 'No'}</strong><span>status</span>
        </div>
      </div>
    </div>
  );
}
