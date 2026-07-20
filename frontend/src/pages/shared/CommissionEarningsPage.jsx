import { useEffect, useMemo, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import MonthFilter, {
  YearFilter,
  DayFilter,
  cycleStartFromMonth,
  defaultCycleMonth,
} from '../../components/filters/MonthFilter.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import FancySelect from '../../components/filters/FancySelect.jsx';
import PostCommissionModal from '../../components/commission/PostCommissionModal.jsx';
import { useTableQuery } from '../../hooks/useTableQuery.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CommissionEarningsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [yearDate, setYearDate] = useState(() => new Date());
  const [month, setMonth] = useState(() => defaultCycleMonth());
  const [personId, setPersonId] = useState('');
  const [people, setPeople] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPost, setShowPost] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const year = yearDate.getFullYear();
  const cycleStart = useMemo(
    () => (month ? cycleStartFromMonth(month) : null),
    [month]
  );

  useEffect(() => {
    if (month && month.getFullYear() !== year) {
      setMonth(new Date(year, month.getMonth(), 1));
    }
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listUsers(token, '?pageSize=100');
        if (cancelled) return;
        setPeople(
          (res.users || []).filter(
            (u) => u.isActive !== false && (u.role === 'agent' || u.role === 'manager')
          )
        );
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const query = cycleStart ? { cycleStart } : { year };
        if (isAdmin && personId) query.userId = personId;
        const earnings = await api.commissionEarnings(token, query);
        if (!cancelled) setData(earnings);
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load commission');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, showToast, year, cycleStart, isAdmin, personId, reloadKey]);

  const entries = data?.entries || [];
  const table = useTableQuery(entries, {
    searchFields: ['clientName', 'userName', 'earnerRole'],
    getDate: (row) => row.paymentDate,
  });

  if (user?.role === 'production') {
    return (
      <section className="page-section">
        <div className="panel empty-state">Production has no commission system.</div>
      </section>
    );
  }

  const isYearMode = data?.mode === 'year' || (!cycleStart && !loading);
  const hasLocalFilter = Boolean(table.search || table.dateFrom || table.dateTo);
  const displayTotal = hasLocalFilter
    ? table.filtered.reduce((s, e) => s + Number(e.commissionAmount || 0), 0)
    : Number(data?.total || 0);

  const personOptions = people.map((p) => ({ value: String(p.id), label: p.name }));

  return (
    <>
      <section className="page-section commission-page">
        <div className="section-heading section-heading--filters" style={{ borderTop: 0, paddingTop: 0 }}>
          <div className="commission-page-title">
            <h2>Commission earnings</h2>
            {isAdmin ? (
              <button type="button" className="tool-btn primary toolbar-control" onClick={() => setShowPost(true)}>
                Post commission
              </button>
            ) : null}
          </div>

          <div className="table-toolbar commission-toolbar">
            <YearFilter
              value={yearDate}
              onChange={(d) => {
                setYearDate(d);
                setMonth(null);
              }}
              label={null}
              placeholder="Year"
            />
            <MonthFilter
              value={month}
              onChange={setMonth}
              label={null}
              clearable
              placeholder="Cycle month"
              minDate={new Date(year, 0, 1)}
              maxDate={year === new Date().getFullYear() ? new Date() : new Date(year, 11, 31)}
            />
            <input
              className="search-input toolbar-control"
              type="search"
              placeholder="Search…"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
            />
            {isAdmin ? (
              <FancySelect
                value={personId}
                onChange={setPersonId}
                options={personOptions}
                placeholder="All people"
                aria-label="Person"
                className="toolbar-fancy-select"
              />
            ) : null}
            <div className="toolbar-dates" role="group" aria-label="Payment date range">
              <DayFilter
                value={table.dateFrom}
                onChange={table.setDateFrom}
                placeholder="From date"
              />
              <span className="toolbar-date-sep" aria-hidden="true">→</span>
              <DayFilter
                value={table.dateTo}
                onChange={table.setDateTo}
                placeholder="To date"
                minDate={table.dateFrom ? new Date(`${table.dateFrom}T12:00:00`) : undefined}
              />
            </div>
          </div>
        </div>

        <section className="stats-grid stats-grid--compact">
          <StatCard
            tone="green"
            icon="i-deduction"
            label={isYearMode ? 'Year total' : 'Cycle total'}
            value={loading ? '—' : money(displayTotal)}
          />
          <StatCard
            tone="blue"
            icon="i-check"
            label="Entries"
            value={loading ? '—' : table.total}
          />
          {isYearMode ? (
            <StatCard
              tone="purple"
              icon="i-calendar"
              label="Cycles"
              value={loading ? '—' : (data?.cycles?.length ?? 0)}
            />
          ) : null}
        </section>

        {isYearMode && data?.cycles?.length > 0 ? (
          <div className="panel commission-cycle-list" style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table className="attendance-table responsive-table">
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Entries</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.cycles.map((c) => (
                  <tr key={`${c.cycleStart}-${c.cycleEnd}`}>
                    <td data-label="Cycle">{c.label}</td>
                    <td data-label="Entries">{c.entries}</td>
                    <td data-label="Total"><strong>{money(c.total)}</strong></td>
                    <td>
                      <button
                        type="button"
                        className="tool-btn"
                        onClick={() => {
                          const [y, m] = c.cycleStart.split('-').map(Number);
                          setYearDate(new Date(y, 0, 1));
                          setMonth(new Date(y, m - 1, 1));
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {loading ? (
          <div className="panel empty-state">Loading…</div>
        ) : (
          <>
            <div className="panel" style={{ overflowX: 'auto' }}>
              <table className="attendance-table responsive-table">
                <thead>
                  <tr>
                    {isAdmin && !personId ? <th>Person</th> : null}
                    <th>Client</th>
                    <th>Payment date</th>
                    <th>Payment</th>
                    <th>Role</th>
                    <th>Rate</th>
                    <th>Commission</th>
                    {isYearMode ? <th>Cycle</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {table.pageItems.map((e) => (
                    <tr key={e.id}>
                      {isAdmin && !personId ? <td data-label="Person">{e.userName}</td> : null}
                      <td data-label="Client">{e.clientName}</td>
                      <td data-label="Payment date">{e.paymentDate}</td>
                      <td data-label="Payment">{money(e.paymentAmount)}</td>
                      <td data-label="Role">{e.earnerRole}</td>
                      <td data-label="Rate">{e.ratePercentage}%</td>
                      <td data-label="Commission"><strong>{money(e.commissionAmount)}</strong></td>
                      {isYearMode ? (
                        <td data-label="Cycle">{e.cycleStart} → {e.cycleEnd}</td>
                      ) : null}
                    </tr>
                  ))}
                  {!table.pageItems.length ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="empty-state">No commission for this filter</div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {table.totalPages > 1 ? (
              <PaginationBar
                total={table.total}
                page={table.page}
                totalPages={table.totalPages}
                from={table.from}
                to={table.to}
                pageSize={table.pageSize}
                emptyLabel="No entries"
                onPrev={() => table.setPage((p) => Math.max(1, p - 1))}
                onNext={() => table.setPage((p) => p + 1)}
              />
            ) : null}
          </>
        )}
      </section>

      {isAdmin ? (
        <PostCommissionModal
          open={showPost}
          onClose={() => setShowPost(false)}
          onPosted={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </>
  );
}
