import { Link } from 'react-router-dom';
import StatCard from '../../components/AppShell/StatCard.jsx';
import TeamAttendanceTable from '../../components/attendance/TeamAttendanceTable.jsx';
import { Icon } from '../../icons/IconSprite.jsx';
import { agents, productionCardsSeed } from '../../data/mockData.js';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';

export default function ManagerDashboard() {
  const presentToday = agents.filter((a) => a.statusToday === 'present' || a.statusToday === 'late').length;
  const lateToday = agents.filter((a) => a.statusToday === 'late').length;
  const nearDeadline = productionCardsSeed.filter((c) => c.stage !== 'done' && getDeadlineInfo(c.dueDate).tone !== 'ok').length;
  const inRevision = productionCardsSeed.filter((c) => c.stage === 'revision').length;

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="green" icon="i-check" label="Team Present" value={`${presentToday}/${agents.length}`} />
        <StatCard tone="orange" icon="i-clock" label="Late Today" value={lateToday} />
        <StatCard tone="purple" icon="i-revision" label="In Revision" value={inRevision} />
        <StatCard tone="red" icon="i-alert" label="Nearing Deadline" value={nearDeadline} delta="Auto-alerted" />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div><h2>Team Attendance</h2><p>Today's status across your team</p></div>
          <Link to="/manager/attendance" className="tool-btn">Full attendance</Link>
        </div>
        <TeamAttendanceTable agents={agents} />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div><h2>Production status</h2><p>Cards approaching their draft/revision deadline</p></div>
          <Link to="/manager/production" className="tool-btn">Open board</Link>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 8 }}>
          {productionCardsSeed.filter((c) => c.stage !== 'done').slice(0, 5).map((c) => {
            const info = getDeadlineInfo(c.dueDate);
            return (
              <div key={c.id} className="rule-row">
                <div className="rule-icon"><Icon id={c.type === 'revision' ? 'i-revision' : 'i-production'} /></div>
                <div className="rule-copy"><strong>{c.title}</strong><span>{c.client} · {c.assignee.name}</span></div>
                <div className="rule-counter"><span className={`deadline-pill ${info.tone}`}><Icon id="i-clock" />{info.label}</span></div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
