import { useEffect, useMemo, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import TeamAttendanceTable from '../../components/attendance/TeamAttendanceTable.jsx';
import PeriodFilter from '../../components/attendance/PeriodFilter.jsx';
import AttendanceDetailDrawer from '../../components/attendance/AttendanceDetailDrawer.jsx';
import FancySelect from '../../components/filters/FancySelect.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import { computeAttendanceStatus } from '../../utils/attendanceRules.js';
import { useTableQuery } from '../../hooks/useTableQuery.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

function shiftIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export default function TeamAttendancePage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [preset, setPreset] = useState('today');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  const today = payload?.today;

  const query = useMemo(() => {
    if (preset === 'range') {
      if (!rangeFrom || !rangeTo) return null;
      return { from: rangeFrom, to: rangeTo, month: rangeFrom.slice(0, 7) };
    }
    if (preset === 'yesterday') {
      if (!today) return null;
      const y = shiftIso(today, -1);
      return { date: y, month: y.slice(0, 7) };
    }
    // today (default) — empty query uses server today
    return today ? { date: today, month: today.slice(0, 7) } : {};
  }, [preset, rangeFrom, rangeTo, today]);

  useEffect(() => {
    if (!token || query === null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.attendanceTeam(token, query);
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load team attendance');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, showToast, query]);

  const members = payload?.members || [];
  const mode = payload?.mode || 'day';
  const stats = payload?.stats;

  const agentsForFilter = useMemo(
    () => members.map((m) => ({ id: m.id, name: m.name })),
    [members]
  );

  const table = useTableQuery(members, {
    searchFields: ['name', 'email', 'role'],
    getAgentId: (row) => row.id,
  });

  const personOptions = agentsForFilter.map((a) => ({
    value: String(a.id),
    label: a.name,
  }));

  const present = stats?.present ?? members.filter((a) => a.statusDay === 'present' || a.statusDay === 'late').length;
  const late = stats?.late ?? members.filter((a) => a.statusDay === 'late').length;
  const leave = stats?.leave ?? members.filter((a) => a.statusDay === 'leave' || a.statusToday === 'off').length;
  const absent = stats?.absent ?? members.filter((a) => a.statusDay === 'absent').length;
  const deductions = members.filter((a) => computeAttendanceStatus(a).deduction).length;

  const periodLabel =
    mode === 'range'
      ? `${payload?.from} → ${payload?.to}`
      : payload?.date || 'Today';

  return (
    <>
      <section className="page-section attendance-page">
        <div className="section-heading section-heading--filters" style={{ borderTop: 0, paddingTop: 0 }}>
          <div className="commission-page-title">
            <div>
              <h2>Team Attendance</h2>
            </div>
            <PeriodFilter
              preset={preset}
              onPreset={(p) => {
                setPreset(p);
                if (p === 'range' && today) {
                  setRangeFrom(shiftIso(today, -6));
                  setRangeTo(today);
                }
              }}
              from={rangeFrom}
              to={rangeTo}
              onFrom={setRangeFrom}
              onTo={setRangeTo}
            />
          </div>

          <div className="table-toolbar">
            <input
              className="search-input toolbar-control"
              type="search"
              placeholder="Search people…"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
            />
            <FancySelect
              value={table.agentId}
              onChange={table.setAgentId}
              options={personOptions}
              placeholder="All people"
              aria-label="Person"
              className="toolbar-fancy-select"
              isClearable
            />
          </div>
        </div>

        {mode === 'day' ? (
          <section className="stats-grid stats-grid--compact">
            <StatCard tone="green" icon="i-check" label="Present" value={loading ? '—' : present} />
            <StatCard tone="orange" icon="i-clock" label="Late" value={loading ? '—' : late} />
            <StatCard tone="blue" icon="i-calendar" label="Leave" value={loading ? '—' : leave} />
            <StatCard tone="purple" icon="i-close" label="Absent" value={loading ? '—' : absent} />
          </section>
        ) : (
          <section className="stats-grid stats-grid--compact">
            <StatCard tone="purple" icon="i-calendar" label="Period" value={loading ? '—' : periodLabel} />
            <StatCard tone="red" icon="i-deduction" label="Deductions" value={loading ? '—' : deductions} />
            <StatCard
              tone="green"
              icon="i-clock"
              label="Avg check-in"
              value={loading ? '—' : (payload?.teamAvgCheckIn || '—')}
            />
            <StatCard
              tone="blue"
              icon="i-clock"
              label="Avg check-out"
              value={loading ? '—' : (payload?.teamAvgCheckOut || '—')}
            />
          </section>
        )}

        {loading ? (
          <div className="panel empty-state">Loading…</div>
        ) : (
          <>
            <TeamAttendanceTable
              agents={table.pageItems}
              mode={mode}
              onOpenDetail={(agent) => setDetailId(agent.id)}
            />
            {table.totalPages > 1 ? (
              <PaginationBar
                total={table.total}
                page={table.page}
                totalPages={table.totalPages}
                from={table.from}
                to={table.to}
                pageSize={table.pageSize}
                emptyLabel="No people match filters"
                onPrev={() => table.setPage((p) => Math.max(1, p - 1))}
                onNext={() => table.setPage((p) => p + 1)}
              />
            ) : null}
          </>
        )}
      </section>

      {detailId ? (
        <AttendanceDetailDrawer memberId={detailId} onClose={() => setDetailId(null)} />
      ) : null}
    </>
  );
}
