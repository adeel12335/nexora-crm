import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../../components/AppShell/StatCard.jsx';
import AttendanceRulesCard from '../../components/attendance/AttendanceRulesCard.jsx';
import TeamAttendanceTable from '../../components/attendance/TeamAttendanceTable.jsx';
import TableToolbar from '../../components/filters/TableToolbar.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import { computeAttendanceStatus } from '../../utils/attendanceRules.js';
import { useTableQuery } from '../../hooks/useTableQuery.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

export default function ManagerDashboard() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState([]);
  const [teamAvg, setTeamAvg] = useState({ checkIn: null, checkOut: null });
  const [myMonth, setMyMonth] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [team, today] = await Promise.all([
          api.attendanceTeam(token),
          api.attendanceToday(token),
        ]);
        if (cancelled) return;
        setMembers(team.members || []);
        setTeamAvg({ checkIn: team.teamAvgCheckIn, checkOut: team.teamAvgCheckOut });
        setMyMonth(today.month);
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load attendance');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, showToast]);

  const teamOnly = useMemo(() => members.filter((m) => m.role === 'agent'), [members]);
  const agentsForFilter = useMemo(
    () => teamOnly.map((m) => ({ id: m.id, name: m.name })),
    [teamOnly]
  );
  const table = useTableQuery(teamOnly, {
    searchFields: ['name', 'email'],
    getAgentId: (row) => row.id,
    pageSize: 8,
  });

  const presentToday = teamOnly.filter((a) => a.statusToday === 'present' || a.statusToday === 'late').length;
  const lateToday = teamOnly.filter((a) => a.statusToday === 'late').length;
  const offToday = teamOnly.filter((a) => a.statusToday === 'off' || a.statusToday === 'absent').length;
  const deductions = teamOnly.filter((a) => computeAttendanceStatus(a).deduction).length;

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="green" icon="i-check" label="Team Present" value={`${presentToday}/${teamOnly.length || 0}`} />
        <StatCard tone="orange" icon="i-clock" label="Late Today" value={lateToday} />
        <StatCard tone="blue" icon="i-calendar" label="Off / Absent" value={offToday} />
        <StatCard tone="red" icon="i-deduction" label="Deductions Flagged" value={deductions} />
      </section>

      <section className="stats-grid">
        <StatCard tone="purple" icon="i-clock" label="Avg Check-in" value={teamAvg.checkIn || '—'} delta="This month" />
        <StatCard tone="purple" icon="i-clock" label="Avg Check-out" value={teamAvg.checkOut || '—'} delta="This month" />
      </section>

      <section className="page-section">
        <AttendanceRulesCard lateCount={myMonth?.lateCount ?? 0} offsTaken={myMonth?.offsTaken ?? 0} />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Team Attendance</h2>
            <p>
              Today&apos;s status · month avg in {teamAvg.checkIn || '—'} · avg out {teamAvg.checkOut || '—'}
            </p>
          </div>
          <TableToolbar
            search={table.search}
            onSearch={table.setSearch}
            searchPlaceholder="Search agents…"
            agents={agentsForFilter}
            agentId={table.agentId}
            onAgentId={table.setAgentId}
          >
            <Link to="/manager/attendance" className="tool-btn">Full attendance</Link>
          </TableToolbar>
        </div>
        <TeamAttendanceTable agents={table.pageItems} />
        <PaginationBar
          total={table.total}
          page={table.page}
          totalPages={table.totalPages}
          from={table.from}
          to={table.to}
          pageSize={table.pageSize}
          emptyLabel="No agents"
          compact
          onPrev={() => table.setPage((p) => Math.max(1, p - 1))}
          onNext={() => table.setPage((p) => p + 1)}
        />
      </section>
    </>
  );
}
