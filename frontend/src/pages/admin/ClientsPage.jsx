import { useCallback, useEffect, useMemo, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import TableToolbar from '../../components/filters/TableToolbar.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { slicePage, pageMeta, DEFAULT_PAGE_SIZE } from '../../hooks/useTableQuery.js';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const DETAIL_PAGE_SIZE = 5;

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function detailMeta(total, page, size) {
  return pageMeta(total, page, size);
}

export default function ClientsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [clients, setClients] = useState([]);
  const [summary, setSummary] = useState({ total: 0, totalDeal: 0, totalPaid: 0, outstanding: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [payPage, setPayPage] = useState(1);
  const [commPage, setCommPage] = useState(1);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    agentId: '',
    dealAmount: '',
    notes: '',
  });
  const [payForm, setPayForm] = useState({ amount: '', paymentDate: '', notes: '' });

  const loadClients = useCallback(async () => {
    const data = await api.listClients(token, {
      q: search.trim() || undefined,
      agentId: agentFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    setClients(data.clients || []);
    setSummary(data.summary || {
      total: data.clients?.length || 0,
      totalDeal: 0,
      totalPaid: 0,
      outstanding: 0,
    });
    setPagination(data.pagination || {
      page: 1,
      pageSize: PAGE_SIZE,
      total: data.clients?.length || 0,
      totalPages: 1,
    });
  }, [token, search, agentFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const listUsersPromise = isAdmin
          ? api.listUsers(token, '?pageSize=100')
          : Promise.resolve({ users: [] });
        const [c, usersRes] = await Promise.all([
          api.listClients(token, {
            q: search.trim() || undefined,
            agentId: isAdmin && agentFilter ? agentFilter : undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page,
            pageSize: PAGE_SIZE,
          }),
          listUsersPromise,
        ]);
        if (cancelled) return;
        setClients(c.clients || []);
        setSummary(c.summary || { total: 0, totalDeal: 0, totalPaid: 0, outstanding: 0 });
        setPagination(c.pagination || { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
        const list = usersRes.users || [];
        setAgents(
          list.filter((u) => u.isActive !== false && (u.role === 'agent' || u.role === 'manager'))
        );
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load clients');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, showToast, search, agentFilter, dateFrom, dateTo, page, isAdmin]);

  useEffect(() => {
    setPage(1);
  }, [search, agentFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!token || !selectedId) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getClient(token, selectedId);
        if (!cancelled) {
          setDetail(data);
          setPayPage(1);
          setCommPage(1);
        }
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load client');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, selectedId, showToast]);

  async function submitClient(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        name: clientForm.name.trim(),
        email: clientForm.email.trim() || undefined,
        phone: clientForm.phone.trim() || undefined,
        agentId: Number(clientForm.agentId),
        dealAmount: Number(clientForm.dealAmount || 0),
        notes: clientForm.notes.trim() || undefined,
      };
      const data = await api.createClient(token, body);
      showToast('Client added');
      setShowClientForm(false);
      setClientForm({ name: '', email: '', phone: '', agentId: '', dealAmount: '', notes: '' });
      setPage(1);
      await loadClients();
      setSelectedId(data.client.id);
    } catch (err) {
      showToast(err.message || 'Failed to add client');
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(e) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    try {
      const body = {
        amount: Number(payForm.amount),
        paymentDate: payForm.paymentDate || undefined,
        notes: payForm.notes.trim() || undefined,
      };
      const data = await api.addClientPayment(token, selectedId, body);
      showToast(
        data.message ||
          'Payment saved — post commission from Commissions when ready'
      );
      setShowPayForm(false);
      setPayForm({ amount: '', paymentDate: '', notes: '' });
      await loadClients();
      const refreshed = await api.getClient(token, selectedId);
      setDetail(refreshed);
      setPayPage(1);
      setCommPage(1);
    } catch (err) {
      showToast(err.message || 'Failed to add payment');
    } finally {
      setBusy(false);
    }
  }

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(pagination.page * PAGE_SIZE, pagination.total);

  const payments = detail?.payments || [];
  const commissions = detail?.commissions || [];
  const payMeta = useMemo(
    () => detailMeta(payments.length, payPage, DETAIL_PAGE_SIZE),
    [payments.length, payPage]
  );
  const commMeta = useMemo(
    () => detailMeta(commissions.length, commPage, DETAIL_PAGE_SIZE),
    [commissions.length, commPage]
  );
  const pagedPayments = slicePage(payments, payMeta.page || payPage, DETAIL_PAGE_SIZE);
  const pagedCommissions = slicePage(commissions, commMeta.page || commPage, DETAIL_PAGE_SIZE);

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="purple" icon="i-users" label="Clients" value={loading ? '—' : summary.total} />
        <StatCard tone="green" icon="i-deduction" label="Total deal value" value={loading ? '—' : money(summary.totalDeal)} />
        <StatCard tone="blue" icon="i-check" label="Total paid" value={loading ? '—' : money(summary.totalPaid)} />
        <StatCard tone="orange" icon="i-clock" label="Outstanding" value={loading ? '—' : money(summary.outstanding)} />
      </section>

      <section className="page-section">
        <div className="section-heading section-heading--filters">
          <div>
            <h2>{isAdmin ? 'Clients' : 'My Clients'}</h2>
            <p>
              {isAdmin
                ? 'Record partial payments here — then Post commission on the Commissions page'
                : 'Your clients and partial payments (read-only). Commission shows after admin posts it.'}
            </p>
          </div>
          <TableToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search clients…"
            agents={isAdmin ? agents : undefined}
            agentId={agentFilter}
            onAgentId={isAdmin ? setAgentFilter : undefined}
            showDateRange
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFrom={setDateFrom}
            onDateTo={setDateTo}
          >
            {isAdmin ? (
              <button type="button" className="tool-btn primary toolbar-control" onClick={() => setShowClientForm(true)}>
                Add client
              </button>
            ) : null}
          </TableToolbar>
        </div>

        {loading && clients.length === 0 ? (
          <div className="panel empty-state">Loading…</div>
        ) : (
          <div className="clients-layout">
            <div>
              <div className="panel" style={{ overflowX: 'auto' }}>
                <table className="attendance-table responsive-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Agent</th>
                      <th>Deal</th>
                      <th>Paid</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr
                        key={c.id}
                        className={selectedId === c.id ? 'is-selected' : ''}
                        onClick={() => setSelectedId(c.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td data-label="Client"><strong>{c.name}</strong></td>
                        <td data-label="Agent">{c.agentName || '—'}</td>
                        <td data-label="Deal">{money(c.dealAmount)}</td>
                        <td data-label="Paid">{money(c.totalPaid)}</td>
                        <td data-label="Balance">{money(c.balance)}</td>
                      </tr>
                    ))}
                    {!clients.length && (
                      <tr>
                        <td colSpan={5}><div className="empty-state">No clients yet</div></td>
                      </tr>
                    )}
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
                emptyLabel="No clients"
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            </div>

            <div className="panel client-detail">
              {!selectedId || !detail ? (
                <div className="empty-state">Select a client to view payments</div>
              ) : (
                <>
                  <div className="section-heading" style={{ borderTop: 0, paddingTop: 0 }}>
                    <div>
                      <h2>{detail.client.name}</h2>
                      <p>
                        Agent {detail.client.agentName} · Paid {money(detail.client.totalPaid)} of{' '}
                        {money(detail.client.dealAmount)}
                      </p>
                    </div>
                    {isAdmin ? (
                      <button type="button" className="tool-btn primary" onClick={() => setShowPayForm(true)}>
                        Add payment
                      </button>
                    ) : null}
                  </div>

                  <h3 className="client-detail-title">Payments</h3>
                  <table className="attendance-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPayments.map((p) => (
                        <tr key={p.id}>
                          <td>{p.paymentDate}</td>
                          <td>{money(p.amount)}</td>
                          <td>{p.notes || '—'}</td>
                        </tr>
                      ))}
                      {!payments.length && (
                        <tr><td colSpan={3}><div className="empty-state">No payments yet</div></td></tr>
                      )}
                    </tbody>
                  </table>
                  {payments.length > 0 && (
                    <div className="pagination-bar pagination-bar--compact">
                      <span className="pagination-meta">
                        {payMeta.from}–{payMeta.to} of {payments.length}
                      </span>
                      <div className="pagination-controls">
                        <button
                          type="button"
                          className="tool-btn"
                          disabled={(payMeta.page || payPage) <= 1}
                          onClick={() => setPayPage((p) => Math.max(1, p - 1))}
                        >
                          Prev
                        </button>
                        <span className="pagination-page">
                          {payMeta.page || payPage}/{payMeta.totalPages}
                        </span>
                        <button
                          type="button"
                          className="tool-btn"
                          disabled={(payMeta.page || payPage) >= payMeta.totalPages}
                          onClick={() => setPayPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  <h3 className="client-detail-title">Commission generated</h3>
                  <table className="attendance-table">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Role</th>
                        <th>Rate</th>
                        <th>Commission</th>
                        <th>Cycle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedCommissions.map((ce) => (
                        <tr key={ce.id}>
                          <td>{ce.userName}</td>
                          <td>{ce.earnerRole}</td>
                          <td>{ce.ratePercentage}%</td>
                          <td>{money(ce.commissionAmount)}</td>
                          <td>{ce.cycleStart} → {ce.cycleEnd}</td>
                        </tr>
                      ))}
                      {!commissions.length && (
                        <tr><td colSpan={5}><div className="empty-state">No commission yet</div></td></tr>
                      )}
                    </tbody>
                  </table>
                  {commissions.length > 0 && (
                    <div className="pagination-bar pagination-bar--compact">
                      <span className="pagination-meta">
                        {commMeta.from}–{commMeta.to} of {commissions.length}
                      </span>
                      <div className="pagination-controls">
                        <button
                          type="button"
                          className="tool-btn"
                          disabled={(commMeta.page || commPage) <= 1}
                          onClick={() => setCommPage((p) => Math.max(1, p - 1))}
                        >
                          Prev
                        </button>
                        <span className="pagination-page">
                          {commMeta.page || commPage}/{commMeta.totalPages}
                        </span>
                        <button
                          type="button"
                          className="tool-btn"
                          disabled={(commMeta.page || commPage) >= commMeta.totalPages}
                          onClick={() => setCommPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {isAdmin && showClientForm && (
        <div className="checkin-modal-backdrop" role="presentation" onClick={() => !busy && setShowClientForm(false)}>
          <form className="checkin-modal panel" onClick={(e) => e.stopPropagation()} onSubmit={submitClient}>
            <h3>Add client</h3>
            <label className="checkin-emails-label">
              Name
              <input required value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} />
            </label>
            <label className="checkin-emails-label">
              Assign to (agent / manager)
              <select
                required
                value={clientForm.agentId}
                onChange={(e) => setClientForm({ ...clientForm, agentId: e.target.value })}
              >
                <option value="">Select…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                ))}
              </select>
            </label>
            <label className="checkin-emails-label">
              Deal amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={clientForm.dealAmount}
                onChange={(e) => setClientForm({ ...clientForm, dealAmount: e.target.value })}
              />
            </label>
            <label className="checkin-emails-label">
              Email
              <input type="email" value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} />
            </label>
            <label className="checkin-emails-label">
              Phone
              <input value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} />
            </label>
            <label className="checkin-emails-label">
              Notes
              <input value={clientForm.notes} onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })} />
            </label>
            <div className="checkin-modal-actions">
              <button type="button" className="tool-btn" onClick={() => setShowClientForm(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="tool-btn primary" disabled={busy}>Save</button>
            </div>
          </form>
        </div>
      )}

      {isAdmin && showPayForm && (
        <div className="checkin-modal-backdrop" role="presentation" onClick={() => !busy && setShowPayForm(false)}>
          <form className="checkin-modal panel" onClick={(e) => e.stopPropagation()} onSubmit={submitPayment}>
            <h3>Add payment</h3>
            <p>Partial payments only record money received. Commission is posted later by admin (select payments → calculate).</p>
            <label className="checkin-emails-label">
              Amount
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                autoFocus
              />
            </label>
            <label className="checkin-emails-label">
              Payment date
              <input
                type="date"
                value={payForm.paymentDate}
                onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
              />
            </label>
            <label className="checkin-emails-label">
              Notes
              <input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
            </label>
            <div className="checkin-modal-actions">
              <button type="button" className="tool-btn" onClick={() => setShowPayForm(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="tool-btn primary" disabled={busy}>Record payment</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
