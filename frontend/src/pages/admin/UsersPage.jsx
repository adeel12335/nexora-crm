import { useCallback, useEffect, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import UserFormModal from '../../components/users/UserFormModal.jsx';
import MonthFilter, { toMonthKey } from '../../components/filters/MonthFilter.jsx';
import FancySelect from '../../components/filters/FancySelect.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../api/client.js';

const PAGE_SIZE = 10;

const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agents' },
  { value: 'manager', label: 'Managers' },
  { value: 'production', label: 'Production' },
  { value: 'admin', label: 'Admins' },
];

export default function UsersPage() {
  const { token, user: me } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [counts, setCounts] = useState({ total: 0, agent: 0, manager: 0, production: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState({ own: [], managerCut: [] });
  const [removeTarget, setRemoveTarget] = useState(null);

  const month = toMonthKey(monthDate);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        month,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter) params.set('role', roleFilter);

      const [{ users: rows, counts: nextCounts, pagination: pageInfo }, mgrPayload] = await Promise.all([
        api.listUsers(token, `?${params}`),
        api.listUsers(token, '?role=manager'),
      ]);

      setUsers(rows);
      setCounts({
        total: Number(nextCounts?.total ?? rows.length),
        agent: Number(nextCounts?.agent ?? 0),
        manager: Number(nextCounts?.manager ?? 0),
        production: Number(nextCounts?.production ?? 0),
        admin: Number(nextCounts?.admin ?? 0),
      });
      setPagination(pageInfo || { page: 1, pageSize: PAGE_SIZE, total: rows.length, totalPages: 1 });
      setManagers((mgrPayload.users || []).filter((u) => u.isActive));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, search, page, month, roleFilter]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => { setPage(1); }, [search, roleFilter, month]);

  async function openHistory(row) {
    setHistoryFor(row);
    try {
      const data = await api.getRateHistory(token, row.id);
      setHistory({ own: data.own || [], managerCut: data.managerCut || [] });
    } catch (err) {
      setError(err.message);
      setHistoryFor(null);
    }
  }

  async function handleDelete(row, hard) {
    setBusyId(row.id);
    setRemoveTarget(null);
    setError('');
    try {
      await api.deleteUser(token, row.id, hard);
      if (users.length === 1 && page > 1) setPage((p) => p - 1);
      else await load();
      showToast(hard ? `${row.name} deleted` : `${row.name} deactivated`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && users.length === 0) return <div className="page-loading">Loading users…</div>;

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(pagination.page * PAGE_SIZE, pagination.total);

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="purple" icon="i-users" label="Total Users" value={counts.total} delta="Active in portal" />
        <StatCard tone="green" icon="i-check" label="Agents" value={counts.agent} delta="Doing outreach" />
        <StatCard tone="orange" icon="i-users" label="Managers" value={counts.manager} delta="With teams" />
        <StatCard tone="blue" icon="i-production" label="Production" value={counts.production} delta="No commission" />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Users</h2>
            <p>Each person&apos;s own cut, plus what their manager earns on them specifically</p>
          </div>
          <div className="heading-tools table-toolbar">
            <input
              className="search-input"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <FancySelect
              value={roleFilter}
              onChange={setRoleFilter}
              options={ROLE_OPTIONS}
              placeholder="All roles"
              aria-label="Role"
              className="toolbar-fancy-select"
            />
            <MonthFilter value={monthDate} onChange={setMonthDate} label={null} placeholder="Rates month" />
            <div className="toolbar-actions">
              <button className="tool-btn primary-btn toolbar-control" onClick={() => setEditing('new')}>+ Add user</button>
            </div>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="panel commission-scroll">
          <table className="attendance-table users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Reports to</th>
                <th>Own cut</th>
                <th>Mgr&apos;s cut</th>
                <th>Mailboxes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                    No users match that search.
                  </td>
                </tr>
              )}
              {users.map((row) => {
                const busy = busyId === row.id;
                const canEarn = row.role === 'agent' || row.role === 'manager';
                const showMgrCut = Boolean(row.managerId);

                return (
                  <tr key={row.id}>
                    <td data-label="Name">
                      <div className="agent-cell">
                        <div>
                          <strong className="user-name-line">
                            {row.name}
                            {row.id === me.id && <span className="you-tag">you</span>}
                          </strong>
                          <span className="user-email">{row.email}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Role">
                      <span className={`role-badge role-${row.role}`}>{row.role}</span>
                    </td>
                    <td data-label="Reports to">{row.managerName ?? <span className="muted">—</span>}</td>
                    <td data-label="Own cut">
                      {canEarn ? (
                        <span className="pct-badge">{Number(row.commissionPercentage)}%</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td data-label="Manager cut">
                      {showMgrCut ? (
                        row.managerCutPercentage === null ? (
                          <span className="pct-badge pct-unset">not set</span>
                        ) : (
                          <span className="pct-badge pct-mgr">{Number(row.managerCutPercentage)}%</span>
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td data-label="Mailboxes">
                      {canEarn ? (
                        <span className="pct-badge pct-count">{row.mailboxCount ?? 0}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td data-label="Actions">
                      <div className="row-actions">
                        {canEarn && (
                          <button className="tool-btn" disabled={busy} onClick={() => openHistory(row)}>
                            History
                          </button>
                        )}
                        <button className="tool-btn" disabled={busy} onClick={() => setEditing(row)}>Edit</button>
                        <button
                          className="tool-btn danger-btn"
                          disabled={busy || row.id === me.id}
                          onClick={() => setRemoveTarget(row)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PaginationBar
          total={pagination.total}
          page={pagination.page}
          totalPages={pagination.totalPages}
          from={from}
          to={to}
          pageSize={PAGE_SIZE}
          emptyLabel="No users"
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      </section>

      {editing && (
        <UserFormModal
          user={editing === 'new' ? null : editing}
          managers={managers}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            showToast('User saved');
          }}
        />
      )}

      {removeTarget && (
        <div className="modal-scrim" onClick={() => setRemoveTarget(null)}>
          <div
            className="modal-card confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-user-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setRemoveTarget(null);
            }}
          >
            <h3 id="remove-user-title">Remove {removeTarget.name}?</h3>
            <p>Choose what should happen to this account. Cancel will leave the user unchanged.</p>
            <div className="confirm-options">
              <div>
                <strong>Deactivate</strong>
                <span>Blocks sign-in but keeps attendance, commissions and history.</span>
              </div>
              <div>
                <strong>Delete permanently</strong>
                <span>Removes the account and assigned mailboxes. This cannot be undone.</span>
              </div>
            </div>
            <div className="modal-actions destructive-actions">
              <button type="button" className="secondary-btn" onClick={() => setRemoveTarget(null)}>Cancel</button>
              <button type="button" className="tool-btn" onClick={() => handleDelete(removeTarget, false)}>Deactivate</button>
              <button type="button" className="tool-btn danger-solid" onClick={() => handleDelete(removeTarget, true)}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}

      {historyFor && (
        <div className="modal-scrim" onClick={() => setHistoryFor(null)}>
          <div className="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="rate-history-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="rate-history-title">{historyFor.name} — rate history</h3>
            <p>Month-wise rates so past reports never change</p>

            <h4 className="subhead" style={{ marginTop: 4 }}>Own cut</h4>
            {history.own.length === 0 ? (
              <p className="muted">No own rates recorded yet.</p>
            ) : (
              <table className="attendance-table">
                <thead>
                  <tr><th>Month</th><th className="num-cell">Rate</th><th>Set by</th></tr>
                </thead>
                <tbody>
                  {history.own.map((h) => (
                    <tr key={`own-${h.month}`}>
                      <td>{h.month}</td>
                      <td className="num-cell">{h.percentage}%</td>
                      <td>{h.setBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h4 className="subhead">Manager&apos;s cut on them</h4>
            {history.managerCut.length === 0 ? (
              <p className="muted">No manager cuts recorded yet.</p>
            ) : (
              <table className="attendance-table">
                <thead>
                  <tr><th>Month</th><th>Manager</th><th className="num-cell">Rate</th><th>Set by</th></tr>
                </thead>
                <tbody>
                  {history.managerCut.map((h) => (
                    <tr key={`mgr-${h.month}-${h.managerName}`}>
                      <td>{h.month}</td>
                      <td>{h.managerName}</td>
                      <td className="num-cell">{h.percentage}%</td>
                      <td>{h.setBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setHistoryFor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
