import StatCard from '../../components/AppShell/StatCard.jsx';
import TeamAttendanceTable from '../../components/attendance/TeamAttendanceTable.jsx';
import { agents } from '../../data/mockData.js';
import { computeAttendanceStatus } from '../../utils/attendanceRules.js';

export default function TeamAttendancePage() {
  const presentToday = agents.filter((a) => a.statusToday === 'present').length;
  const lateToday = agents.filter((a) => a.statusToday === 'late').length;
  const offToday = agents.filter((a) => a.statusToday === 'off' || a.statusToday === 'absent').length;
  const deductions = agents.filter((a) => computeAttendanceStatus(a).deduction).length;

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="green" icon="i-check" label="Present Today" value={presentToday} />
        <StatCard tone="orange" icon="i-clock" label="Late Today" value={lateToday} />
        <StatCard tone="blue" icon="i-calendar" label="Off / Absent" value={offToday} />
        <StatCard tone="red" icon="i-deduction" label="Deductions Flagged" value={deductions} />
      </section>
      <section className="page-section">
        <div className="section-heading">
          <div><h2>Team Attendance</h2><p>3 lates auto-convert the 4th into a day off · 2 free offs, 3rd triggers a deduction</p></div>
        </div>
        <TeamAttendanceTable agents={agents} />
      </section>
    </>
  );
}
