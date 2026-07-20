import StatCard from '../../components/AppShell/StatCard.jsx';
import CheckInWidget from '../../components/attendance/CheckInWidget.jsx';
import AttendanceRulesCard from '../../components/attendance/AttendanceRulesCard.jsx';
import { productionCardsSeed, findAgentForUser } from '../../data/mockData.js';
import { computeAttendanceStatus } from '../../utils/attendanceRules.js';
import { useRoleContext } from '../../layouts/RoleLayout.jsx';

export default function AgentDashboard() {
  const { user } = useRoleContext();
  const me = findAgentForUser(user);
  const status = computeAttendanceStatus(me);
  const myCards = productionCardsSeed.filter((c) => c.assignee.id === me.id && c.stage !== 'done');

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="green" icon="i-check" label="Days Present" value={me.presentCount} />
        <StatCard tone="orange" icon="i-clock" label="Lates This Month" value={status.lateCount} />
        <StatCard tone="blue" icon="i-calendar" label="Offs Used" value={`${status.effectiveOffs}/2`} />
        <StatCard tone="purple" icon="i-kanban" label="My Open Cards" value={myCards.length} />
      </section>

      <section className="page-section attendance-grid">
        <CheckInWidget initialCheckIn={me.checkIn} initialCheckOut={me.checkOut} />
        <AttendanceRulesCard lateCount={me.lateCount} offsTaken={me.offsTaken} />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div><h2>My production cards</h2><p>Drafts and revisions assigned to you</p></div>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 8 }}>
          {myCards.length ? myCards.map((c) => (
            <div key={c.id} className="rule-row">
              <div className="rule-copy"><strong>{c.title}</strong><span>{c.client} · {c.type === 'draft' ? 'New draft' : 'Revision'}</span></div>
            </div>
          )) : <div className="empty-state">Nothing assigned right now</div>}
        </div>
      </section>
    </>
  );
}
