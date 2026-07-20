import { useEffect, useMemo, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import MonthFilter, { toMonthKey } from '../../components/filters/MonthFilter.jsx';
import TableToolbar from '../../components/filters/TableToolbar.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import { useTableQuery } from '../../hooks/useTableQuery.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';

/** Read-only view of team rates — own cut + this manager's cut on each agent. */
export default function TeamCommission() {
  const { token } = useAuth();
  const [month, setMonth] = useState(() => new Date());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const monthKey = toMonthKey(month);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const team = await api.getTeam(token, null, monthKey);
        if (!cancelled) setData(team);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, monthKey]);

  const team = data?.team || [];
  const agentsForFilter = useMemo(
    () => team.map((m) => ({ id: m.id, name: m.name })),
    [team]
  );

  const table = useTableQuery(team, {
    searchFields: ['name', 'email', 'whatsappNumber'],
    getAgentId: (row) => row.id,
  });

  if (error) return <p className="form-error">{error}</p>;

  const withCut = team.filter((m) => m.managerCutPercentage !== null);
  const avgCut = withCut.length
    ? (withCut.reduce((sum, m) => sum + m.managerCutPercentage, 0) / withCut.length).toFixed(2)
    : '0';

  return (
    <>
      <section className="page-section" style={{ paddingBottom: 0 }}>
        <div className="section-heading" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>My Team</h2>
            <p>What each agent earns, and your cut on them — rates for the selected month</p>
          </div>
          <TableToolbar
            search={table.search}
            onSearch={table.setSearch}
            searchPlaceholder="Search agents…"
            agents={agentsForFilter}
            agentId={table.agentId}
            onAgentId={table.setAgentId}
          >
            <MonthFilter
              value={month}
              onChange={setMonth}
              label="Rate month"
              hint={`Rates for ${monthKey}`}
            />
          </TableToolbar>
        </div>
      </section>

      {loading || !data ? (
        <div className="page-loading">Loading team…</div>
      ) : (
        <>
          <section className="stats-grid">
            <StatCard tone="purple" icon="i-users" label="Team Size" value={data.team.length} delta="Agents reporting to you" />
            <StatCard tone="green" icon="i-deduction" label="My Own Cut" value={`${data.manager.ownCommissionPercentage}%`} delta="On work I do myself" />
            <StatCard tone="orange" icon="i-check" label="Cuts Configured" value={`${withCut.length}/${data.team.length}`} delta="Agents with my rate set" />
            <StatCard tone="blue" icon="i-kanban" label="Average Cut" value={`${avgCut}%`} delta="Across my team" />
          </section>

          <section className="page-section">
            <p className="commission-note">
              Your cut is <strong>different per agent</strong> (e.g. 5% on one, 7% on another).
              Your own rate of <strong>{data.manager.ownCommissionPercentage}%</strong> applies to work you
              do yourself. Pick a month to see historical rates — past months never rewrite.
            </p>

            <div className="panel commission-scroll">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>WhatsApp</th>
                    <th className="num-cell">Their cut</th>
                    <th className="num-cell">My cut on them</th>
                  </tr>
                </thead>
                <tbody>
                  {table.pageItems.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                        No agents match filters.
                      </td>
                    </tr>
                  )}
                  {table.pageItems.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <div className="agent-cell">
                          <div><strong>{member.name}</strong><span>{member.email}</span></div>
                        </div>
                      </td>
                      <td>{member.whatsappNumber ?? '—'}</td>
                      <td className="num-cell">{member.commissionPercentage}%</td>
                      <td className="num-cell strong">
                        {member.managerCutPercentage === null
                          ? <span className="muted">not set</span>
                          : `${member.managerCutPercentage}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              total={table.total}
              page={table.page}
              totalPages={table.totalPages}
              from={table.from}
              to={table.to}
              pageSize={table.pageSize}
              emptyLabel="No agents"
              onPrev={() => table.setPage((p) => Math.max(1, p - 1))}
              onNext={() => table.setPage((p) => p + 1)}
            />
          </section>
        </>
      )}
    </>
  );
}
