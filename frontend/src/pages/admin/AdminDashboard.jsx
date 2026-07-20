import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../../components/AppShell/StatCard.jsx';
import TeamAttendanceTable from '../../components/attendance/TeamAttendanceTable.jsx';
import TableToolbar from '../../components/filters/TableToolbar.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import AlertItem from '../../components/notifications/AlertItem.jsx';
import { computeAttendanceStatus } from '../../utils/attendanceRules.js';
import { useTableQuery } from '../../hooks/useTableQuery.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

export default function AdminDashboard() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [team, notes] = await Promise.all([
          api.attendanceTeam(token),
          api.listNotifications(token, { limit: 4 }),
        ]);
        if (cancelled) return;
        setMembers(team.members || []);
        setAlerts(notes.notifications || []);
        setUnread(Number(notes.unread || 0));
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, showToast]);

  const agentsForFilter = useMemo(
    () => members.map((m) => ({ id: m.id, name: m.name })),
    [members]
  );
  const table = useTableQuery(members, {
    searchFields: ['name', 'role'],
    getAgentId: (row) => row.id,
    pageSize: 8,
  });

  const presentToday = members.filter((a) => a.statusToday === 'present' || a.statusToday === 'late').length;
  const attendancePct = members.length ? Math.round((presentToday / members.length) * 100) : 0;
  const lateToday = members.filter((a) => a.statusToday === 'late').length;
  const deductions = members.filter((a) => computeAttendanceStatus(a).deduction).length;

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="purple" icon="i-users" label="Attendance roster" value={members.length} delta="Agents + managers" />
        <StatCard tone="green" icon="i-check" label="Attendance Today" value={`${attendancePct}%`} delta={`${presentToday}/${members.length || 0} present`} />
        <StatCard tone="orange" icon="i-clock" label="Late Today" value={lateToday} delta="Auto off after 4th" />
        <StatCard tone="blue" icon="i-bell" label="Unread alerts" value={unread} delta={`${alerts.length} recent`} />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Team attendance</h2>
            <p>Search or filter people · {deductions} deduction(s) flagged this month</p>
          </div>
          <TableToolbar
            search={table.search}
            onSearch={table.setSearch}
            searchPlaceholder="Search…"
            agents={agentsForFilter}
            agentId={table.agentId}
            onAgentId={table.setAgentId}
            agentLabel="Person"
          >
            <Link to="/admin/attendance" className="tool-btn">Full page</Link>
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
          emptyLabel="No people"
          compact
          onPrev={() => table.setPage((p) => Math.max(1, p - 1))}
          onNext={() => table.setPage((p) => p + 1)}
        />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Recent alerts</h2>
            <p>Your latest attendance and WhatsApp notifications</p>
          </div>
          <Link to="/admin/notifications" className="tool-btn">View all</Link>
        </div>
        <div className="alert-list">
          {alerts.length
            ? alerts.map((a) => <AlertItem key={a.id} alert={a} unread={a.unread} />)
            : <div className="empty-state">No notifications yet</div>}
        </div>
      </section>
    </>
  );
}
