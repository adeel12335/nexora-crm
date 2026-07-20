import { Link } from 'react-router-dom';
import StatCard from '../../components/AppShell/StatCard.jsx';
import TeamAttendanceTable from '../../components/attendance/TeamAttendanceTable.jsx';
import AlertItem from '../../components/notifications/AlertItem.jsx';
import { agents, productionCardsSeed, getAllAlerts } from '../../data/mockData.js';
import { computeAttendanceStatus } from '../../utils/attendanceRules.js';

export default function AdminDashboard() {
  const presentToday = agents.filter((a) => a.statusToday === 'present' || a.statusToday === 'late').length;
  const attendancePct = Math.round((presentToday / agents.length) * 100);
  const lateToday = agents.filter((a) => a.statusToday === 'late').length;
  const activeCards = productionCardsSeed.filter((c) => c.stage !== 'done').length;
  const deductions = agents.filter((a) => computeAttendanceStatus(a).deduction).length;
  const alerts = getAllAlerts().slice(0, 4);

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="purple" icon="i-users" label="Total Headcount" value={agents.length + 4} delta="Org-wide" />
        <StatCard tone="green" icon="i-check" label="Attendance Today" value={`${attendancePct}%`} delta={`${presentToday}/${agents.length} present`} />
        <StatCard tone="orange" icon="i-clock" label="Late Today" value={lateToday} delta="Auto off after 4th" />
        <StatCard tone="blue" icon="i-kanban" label="Active Production Cards" value={activeCards} delta={`${productionCardsSeed.length} total`} />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div><h2>Deductions this month</h2><p>Agents who exceeded the 2 free-off limit</p></div>
          <strong style={{ fontSize: 20 }}>{deductions} agent{deductions === 1 ? '' : 's'}</strong>
        </div>
        <TeamAttendanceTable agents={agents} />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div><h2>Recent alerts</h2><p>Latest production and attendance notifications</p></div>
          <Link to="/admin/notifications" className="tool-btn">View all</Link>
        </div>
        <div className="alert-list">
          {alerts.map((a) => <AlertItem key={a.id} alert={a} />)}
        </div>
      </section>
    </>
  );
}
