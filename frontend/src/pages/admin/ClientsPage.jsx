import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import TableToolbar from '../../components/filters/TableToolbar.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { slicePage, pageMeta, DEFAULT_PAGE_SIZE } from '../../hooks/useTableQuery.js';
import FancySelect from '../../components/filters/FancySelect.jsx';
import { DayFilter } from '../../components/filters/MonthFilter.jsx';
import { Icon } from '../../icons/IconSprite.jsx';
import { productionStages } from '../../data/mockData.js';
import { requiresLiveLink } from '../../data/productionStages.js';
import {
  PRIORITY_OPTIONS,
  formatFileSize,
  validateCardForm,
  validateFiles,
} from '../../utils/boardValidation.js';
import { computeDueDate } from '../../utils/deadlineUtils.js';
import {
  addWorkingDays,
  invoiceNumberFromPayment,
} from '../../utils/invoiceHelpers.js';
import { PAYMENT_METHODS, paymentMethodLabel } from '../../utils/paymentMethods.js';
import {
  CLIENT_PAYMENT_STATUSES,
  CLIENT_ORDER_STATUSES,
} from '../../utils/clientAdminStatuses.js';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const DETAIL_PAGE_SIZE = 5;

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isPushedToProduction(client) {
  const status = client?.productionStatus || 'pending';
  return status === 'in_production' || status === 'done';
}

function productionStatusLabel(status) {
  if (status === 'done') return 'Done';
  if (status === 'in_production') return 'In production';
  return 'Pending';
}

const PRODUCTION_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_production', label: 'In production' },
  { value: 'done', label: 'Done' },
];

function toDateInputValue(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function blankPushForm(client, assignees) {
  const productionUser = assignees.find((u) => u.role === 'production');
  const due = computeDueDate('draft', new Date());
  return {
    title: client ? `${client.name} — New draft` : '',
    description: '',
    type: 'draft',
    stage: productionStages[0]?.id || 'new_project_create_draft',
    assigneeId: productionUser
      ? String(productionUser.id)
      : (assignees[0] ? String(assignees[0].id) : ''),
    priority: 'none',
    liveUrl: '',
    dueDate: toDateInputValue(due.toISOString()),
  };
}

function detailMeta(total, page, size) {
  return pageMeta(total, page, size);
}

function paidThroughPayment(payment, paymentList) {
  const targetDate = String(payment?.paymentDate || '').slice(0, 10);
  const targetId = Number(payment?.id || 0);
  const eligible = paymentList.filter((item) => {
    const itemDate = String(item.paymentDate || '').slice(0, 10);
    if (itemDate < targetDate) return true;
    if (itemDate > targetDate) return false;
    return Number(item.id || 0) <= targetId;
  });
  return eligible.reduce((sum, item) => sum + Number(item.amount || 0), 0);
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
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [productionStatusFilter, setProductionStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [agents, setAgents] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [payPage, setPayPage] = useState(1);
  const [commPage, setCommPage] = useState(1);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [pushTarget, setPushTarget] = useState(null);
  const [pushForm, setPushForm] = useState(() => blankPushForm(null, []));
  const [pushFiles, setPushFiles] = useState([]);
  const pushFileInputRef = useRef(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [removePayment, setRemovePayment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    agentId: '',
    managerId: '',
    mailboxIds: [],
    dealAmount: '',
    notes: '',
  });
  const [allMailboxes, setAllMailboxes] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentDate: '',
    notes: '',
    paymentLink: '',
    paymentMethod: 'stripe',
  });
  const [invoiceReady, setInvoiceReady] = useState(null);

  async function refreshDetail() {
    if (!selectedId) return;
    const refreshed = await api.getClient(token, selectedId);
    setDetail(refreshed);
  }

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
            paymentStatus: isAdmin && paymentStatusFilter ? paymentStatusFilter : undefined,
            orderStatus: isAdmin && orderStatusFilter ? orderStatusFilter : undefined,
            productionStatus: productionStatusFilter || undefined,
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
        setAllUsers(list.filter((u) => u.isActive !== false));
        setAgents(
          list.filter((u) => u.isActive !== false && (u.role === 'agent' || u.role === 'manager'))
        );
        setAssignees(
          list.filter((u) => u.isActive !== false && u.role === 'production')
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
  }, [token, showToast, search, agentFilter, paymentStatusFilter, orderStatusFilter, productionStatusFilter, dateFrom, dateTo, page, isAdmin]);

  useEffect(() => {
    setPage(1);
  }, [search, agentFilter, paymentStatusFilter, orderStatusFilter, productionStatusFilter, dateFrom, dateTo]);

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

  async function updateAdminStatuses(clientId, patch) {
    if (!isAdmin || !clientId) return;
    setBusy(true);
    try {
      const data = await api.updateClient(token, clientId, patch);
      const nextClient = data.client;
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, ...nextClient } : c)));
      setDetail((prev) => (
        prev?.client?.id === clientId
          ? { ...prev, client: { ...prev.client, ...nextClient } }
          : prev
      ));
      showToast('Status updated');
    } catch (err) {
      showToast(err.message || 'Could not update status');
    } finally {
      setBusy(false);
    }
  }

  async function submitClient(e) {
    e.preventDefault();
    if (!clientForm.mailboxIds?.length) {
      showToast('Select at least one mailbox');
      return;
    }
    if (!clientForm.agentId) {
      showToast('Agent could not be assigned from the selected mailbox');
      return;
    }
    setBusy(true);
    try {
      const agentId = Number(clientForm.agentId);
      const body = {
        name: clientForm.name.trim(),
        email: clientForm.email.trim() || undefined,
        phone: clientForm.phone.trim() || undefined,
        agentId,
        dealAmount: Number(clientForm.dealAmount || 0),
        notes: clientForm.notes.trim() || undefined,
      };
      const data = await api.createClient(token, body);
      showToast('Client added · agent assigned from mailbox');
      setShowClientForm(false);
      setClientForm({
        name: '',
        email: '',
        phone: '',
        agentId: '',
        managerId: '',
        mailboxIds: [],
        dealAmount: '',
        notes: '',
      });
      setPage(1);
      await loadClients();
      setSelectedId(data.client.id);
    } catch (err) {
      showToast(err.message || 'Failed to add client');
    } finally {
      setBusy(false);
    }
  }

  async function openAddClient() {
    setClientForm({
      name: '',
      email: '',
      phone: '',
      agentId: '',
      managerId: '',
      mailboxIds: [],
      dealAmount: '',
      notes: '',
    });
    setShowClientForm(true);
    try {
      const data = await api.listMailboxes(token);
      setAllMailboxes(data.mailboxes || []);
    } catch (err) {
      setAllMailboxes([]);
      showToast(err.message || 'Could not load mailboxes');
    }
  }

  function resolveOwnerAndManager(mailboxIds) {
    const ids = Array.isArray(mailboxIds) ? mailboxIds.map(String) : [];
    if (!ids.length) return { agentId: '', managerId: '', warning: '' };

    // Respect selection order (not allMailboxes list order)
    const selected = ids
      .map((id) => allMailboxes.find((m) => String(m.id) === id))
      .filter(Boolean);

    const ownerIds = [];
    for (const box of selected) {
      const uid = Number(box.userId);
      if (uid && !ownerIds.includes(uid)) ownerIds.push(uid);
    }
    if (!ownerIds.length) return { agentId: '', managerId: '', warning: '' };

    const primaryOwnerId = ownerIds[0];
    const owner = allUsers.find((u) => Number(u.id) === primaryOwnerId)
      || agents.find((u) => Number(u.id) === primaryOwnerId);

    const agentId = String(primaryOwnerId);
    let managerId = '';

    if (owner?.role === 'manager') {
      managerId = String(owner.id);
    } else if (owner?.managerId) {
      managerId = String(owner.managerId);
    }
    // Do NOT invent a random manager — leave blank if agent has none

    let warning = '';
    if (ownerIds.length > 1) {
      warning = 'Selected mailboxes belong to different people — using the first selected mailbox owner as agent.';
    }

    return { agentId, managerId, warning };
  }

  function handleClientMailboxesChange(mailboxIds) {
    const { agentId, managerId, warning } = resolveOwnerAndManager(mailboxIds);
    setClientForm((f) => ({
      ...f,
      mailboxIds,
      agentId,
      managerId,
    }));
    if (warning) showToast(warning);
  }

  function buildInvoicePayload(client, payment, extras = {}) {
    const deal = Number(client.dealAmount || 0);
    const historicalPaid = paidThroughPayment(payment, detail?.payments || []);
    const totalPaidRaw = Number(
      extras.totalPaid ?? (historicalPaid > 0 ? historicalPaid : client.totalPaid ?? 0)
    );
    const totalPaid = Math.min(Math.max(0, totalPaidRaw), deal || totalPaidRaw);
    const balance = Math.max(0, Number(extras.balance ?? (deal - totalPaid)));
    const issued = payment.paymentDate
      ? new Date(`${String(payment.paymentDate).slice(0, 10)}T12:00:00`)
      : new Date();
    const linkFromNotes = String(payment.notes || '').match(/https?:\/\/\S+/i)?.[0] || '';
    return {
      invoiceNumber: invoiceNumberFromPayment(payment.id),
      issuedAt: issued,
      dueAt: addWorkingDays(issued, 4),
      clientName: client.name,
      clientEmail: client.email || '',
      dealAmount: deal,
      depositAmount: totalPaid,
      remainingAmount: balance,
      paymentLink: extras.paymentLink || linkFromNotes || '',
      paymentMethod: extras.paymentMethod || payment.paymentMethod || '',
      paymentMethodLabel:
        extras.paymentMethodLabel
        || payment.paymentMethodLabel
        || paymentMethodLabel(extras.paymentMethod || payment.paymentMethod),
      quantity: 1,
      serviceTitle: extras.serviceTitle,
      serviceBullets: extras.serviceBullets,
    };
  }

  async function handleDownloadInvoice(client, payment, extras = {}) {
    try {
      const payload = buildInvoicePayload(client, payment, extras);
      const { downloadClientInvoice } = await import('../../utils/invoicePdf.js');
      await downloadClientInvoice(payload);
      showToast('Invoice downloaded');
    } catch (err) {
      showToast(err.message || 'Could not download invoice');
    }
  }

  async function submitPayment(e) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    try {
      const link = payForm.paymentLink.trim();
      const method = payForm.paymentMethod;
      if (!method) {
        showToast('Select a payment method');
        setBusy(false);
        return;
      }
      const body = {
        amount: Number(payForm.amount),
        paymentDate: payForm.paymentDate || undefined,
        notes: payForm.notes.trim() || undefined,
        paymentLink: link || undefined,
        paymentMethod: method,
      };
      let payment;
      let clientSnapshot;
      const wasEditing = Boolean(editingPayment);
      if (editingPayment) {
        const data = await api.updateClientPayment(token, selectedId, editingPayment.id, body);
        showToast(data.message || 'Payment updated');
        payment = data.payment || { ...editingPayment, ...body, id: editingPayment.id };
        clientSnapshot = data.client;
      } else {
        const data = await api.addClientPayment(token, selectedId, body);
        showToast(
          data.message ||
            'Payment saved — post commission from Commissions when ready'
        );
        payment = data.payment;
        clientSnapshot = data.client;
      }
      setShowPayForm(false);
      setEditingPayment(null);
      setPayForm({ amount: '', paymentDate: '', notes: '', paymentLink: '', paymentMethod: 'stripe' });
      await loadClients();
      await refreshDetail();
      setPayPage(1);
      setCommPage(1);

      const clientForInvoice = clientSnapshot || detail?.client;
      if (payment && clientForInvoice && !wasEditing) {
        setInvoiceReady({
          client: clientForInvoice,
          payment,
          paymentLink: link,
          paymentMethod: method,
          paymentMethodLabel: paymentMethodLabel(method),
        });
      }
    } catch (err) {
      showToast(err.message || (editingPayment ? 'Failed to update payment' : 'Failed to add payment'));
    } finally {
      setBusy(false);
    }
  }

  function openAddPayment() {
    setEditingPayment(null);
    setPayForm({ amount: '', paymentDate: '', notes: '', paymentLink: '', paymentMethod: 'stripe' });
    setShowPayForm(true);
  }

  function openEditPayment(p) {
    setEditingPayment(p);
    setPayForm({
      amount: String(p.amount ?? ''),
      paymentDate: p.paymentDate ? String(p.paymentDate).slice(0, 10) : '',
      notes: p.notes || '',
      paymentLink: '',
      paymentMethod: p.paymentMethod || 'stripe',
    });
    setShowPayForm(true);
  }

  function openPushToProduction(client, e) {
    e?.stopPropagation();
    setPushTarget(client);
    setPushForm(blankPushForm(client, assignees));
    setPushFiles([]);
  }

  function updatePushForm(field, value) {
    setPushForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'type') {
        const due = computeDueDate(value, new Date());
        next.dueDate = toDateInputValue(due.toISOString());
      }
      return next;
    });
  }

  function handlePushFilePick(e) {
    const picked = e.target.files;
    const existingBytes = pushFiles.reduce((sum, item) => sum + Number(item.file.size || 0), 0);
    const { ok, errors } = validateFiles(picked, pushFiles.length, existingBytes);
    if (!ok.length) {
      showToast(errors[0] || 'Upload blocked');
      e.target.value = '';
      return;
    }
    if (errors.length) showToast(errors[0]);
    if (ok.length) {
      setPushFiles((prev) => [
        ...prev,
        ...ok.map((file) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
        })),
      ]);
    }
    e.target.value = '';
  }

  async function submitPushToProduction(e) {
    e.preventDefault();
    if (!pushTarget || busy) return;

    const payload = {
      title: pushForm.title,
      client: pushTarget.name,
      clientId: pushTarget.id,
      type: pushForm.type,
      stage: pushForm.stage,
      assigneeId: pushForm.assigneeId,
      assignee: assignees.find((a) => String(a.id) === String(pushForm.assigneeId)),
      priority: pushForm.priority || 'none',
      description: pushForm.description,
      liveUrl: pushForm.liveUrl,
      dueDate: pushForm.dueDate ? new Date(`${pushForm.dueDate}T17:00:00`).toISOString() : null,
    };
    const errors = validateCardForm(payload, { requireCrmClient: true });
    if (errors.length) {
      showToast(errors[0]);
      return;
    }

    setBusy(true);
    try {
      let fileList = [];
      if (pushFiles.length) {
        const raw = pushFiles.map((item) => item.file);
        const existingBytes = 0;
        const { ok, errors: fileErrors } = validateFiles(raw, 0, existingBytes);
        if (!ok.length) {
          showToast(fileErrors[0] || 'Upload blocked');
          return;
        }
        fileList = await Promise.all(ok.map(async (file) => ({
          id: Date.now() + Math.random(),
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          url: await readFileAsDataUrl(file),
          uploadedAt: new Date().toISOString(),
        })));
      }

      const paymentNote = 'Pushed from CRM Clients';
      const description = String(pushForm.description || '').trim()
        ? `${String(pushForm.description).trim()}\n\n${paymentNote}`
        : paymentNote;

      await api.createProductionCard(token, {
        title: payload.title.trim(),
        client: pushTarget.name,
        clientId: pushTarget.id,
        type: pushForm.type,
        stage: pushForm.stage,
        assigneeId: Number(pushForm.assigneeId),
        priority: pushForm.priority || 'none',
        description,
        liveUrl: String(pushForm.liveUrl || '').trim(),
        dueDate: payload.dueDate,
        fileList,
        commentList: [],
      });
      // Status sync happens on the server via createCard
      showToast(`“${pushTarget.name}” pushed to Production Board`);
      setPushTarget(null);
      setPushFiles([]);
      await loadClients();
      if (selectedId === pushTarget.id) await refreshDetail();
    } catch (err) {
      showToast(err.message || 'Failed to push to production');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeletePayment() {
    if (!selectedId || !removePayment) return;
    setBusy(true);
    try {
      const data = await api.deleteClientPayment(token, selectedId, removePayment.id);
      showToast(data.message || 'Payment deleted');
      setRemovePayment(null);
      await loadClients();
      await refreshDetail();
      setPayPage(1);
      setCommPage(1);
    } catch (err) {
      showToast(err.message || 'Failed to delete payment');
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
                : 'Your clients and partial payments (read-only). Commission is estimated from each payment date’s rates until admin posts it.'}
            </p>
          </div>
          <TableToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search clients…"
            agents={isAdmin ? agents : undefined}
            agentId={agentFilter}
            onAgentId={isAdmin ? setAgentFilter : undefined}
            statusOptions={isAdmin ? CLIENT_PAYMENT_STATUSES : undefined}
            status={paymentStatusFilter}
            onStatus={isAdmin ? setPaymentStatusFilter : undefined}
            statusPlaceholder="Payment status"
            secondaryStatusOptions={isAdmin ? CLIENT_ORDER_STATUSES : undefined}
            secondaryStatus={orderStatusFilter}
            onSecondaryStatus={isAdmin ? setOrderStatusFilter : undefined}
            secondaryStatusPlaceholder="Order status"
            tertiaryStatusOptions={PRODUCTION_STATUS_OPTIONS}
            tertiaryStatus={productionStatusFilter}
            onTertiaryStatus={setProductionStatusFilter}
            tertiaryStatusPlaceholder="Production status"
            showDateRange
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFrom={setDateFrom}
            onDateTo={setDateTo}
          >
            {isAdmin ? (
              <button type="button" className="tool-btn primary toolbar-control" onClick={openAddClient}>
                Add client
              </button>
            ) : null}
          </TableToolbar>
        </div>

        {loading && clients.length === 0 ? (
          <div className="panel empty-state">Loading…</div>
        ) : (
          <div className="clients-full-list">
            <div className="panel" style={{ overflowX: 'auto' }}>
              <table className="attendance-table responsive-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Agent</th>
                    <th>Deal</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    {isAdmin ? <th>Payment</th> : null}
                    {isAdmin ? <th>Order</th> : null}
                    <th>Production</th>
                    {isAdmin ? <th>Actions</th> : null}
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
                      {isAdmin ? (
                        <td data-label="Payment" onClick={(e) => e.stopPropagation()}>
                          <FancySelect
                            value={c.paymentStatus || ''}
                            onChange={(paymentStatus) => updateAdminStatuses(c.id, {
                              paymentStatus: paymentStatus || null,
                            })}
                            options={CLIENT_PAYMENT_STATUSES}
                            placeholder="Set status"
                            aria-label="Payment status"
                            isClearable
                            className="clients-status-select"
                          />
                        </td>
                      ) : null}
                      {isAdmin ? (
                        <td data-label="Order" onClick={(e) => e.stopPropagation()}>
                          <FancySelect
                            value={c.orderStatus || ''}
                            onChange={(orderStatus) => updateAdminStatuses(c.id, {
                              orderStatus: orderStatus || null,
                            })}
                            options={CLIENT_ORDER_STATUSES}
                            placeholder="Set status"
                            aria-label="Order status"
                            isClearable
                            className="clients-status-select"
                          />
                        </td>
                      ) : null}
                      <td data-label="Production">
                        <span
                          className={`clients-push-status${c.productionStatus === 'done' ? ' is-done' : ''}${c.productionStatus === 'pending' || !c.productionStatus ? ' is-pending' : ''}`}
                        >
                          {productionStatusLabel(c.productionStatus)}
                        </span>
                      </td>
                      {isAdmin ? (
                        <td data-label="Actions" onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions clients-row-actions">
                            {isPushedToProduction(c) ? (
                              <button
                                type="button"
                                className="tool-btn clients-push-btn"
                                disabled={busy}
                                title="Push again to Production Board"
                                onClick={(e) => openPushToProduction(c, e)}
                              >
                                Push again
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="tool-btn clients-push-btn"
                                disabled={busy}
                                title="Push to Production Board"
                                onClick={(e) => openPushToProduction(c, e)}
                              >
                                Push
                              </button>
                            )}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {!clients.length && (
                    <tr>
                      <td colSpan={isAdmin ? 9 : 6}>
                        <div className="empty-state">No clients yet</div>
                      </td>
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
        )}
      </section>

      <aside
        className={`client-drawer${selectedId ? ' open' : ''}`}
        aria-label="Client details"
        aria-hidden={!selectedId}
      >
        <header className="client-drawer-header">
          <div>
            <p className="client-drawer-kicker">Client detail</p>
            <h2>{detail?.client?.name || (selectedId ? 'Loading…' : 'Client')}</h2>
            {detail?.client ? (
              <p>
                Agent {detail.client.agentName} · Paid {money(detail.client.totalPaid)} of{' '}
                {money(detail.client.dealAmount)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="plain-icon"
            aria-label="Close client detail"
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
            }}
          >
            <Icon id="i-close" />
          </button>
        </header>

        <div className="client-drawer-body">
          {!selectedId || !detail ? (
            <div className="empty-state">Loading client…</div>
          ) : (
            <>
              {isAdmin ? (
                <div className="client-admin-statuses">
                  <label>
                    Payment status
                    <FancySelect
                      value={detail.client.paymentStatus || ''}
                      onChange={(paymentStatus) => updateAdminStatuses(detail.client.id, {
                        paymentStatus: paymentStatus || null,
                      })}
                      options={CLIENT_PAYMENT_STATUSES}
                      placeholder="Set payment status"
                      aria-label="Payment status"
                      isClearable
                      fullWidth
                    />
                  </label>
                  <label>
                    Order status
                    <FancySelect
                      value={detail.client.orderStatus || ''}
                      onChange={(orderStatus) => updateAdminStatuses(detail.client.id, {
                        orderStatus: orderStatus || null,
                      })}
                      options={CLIENT_ORDER_STATUSES}
                      placeholder="Set order status"
                      aria-label="Order status"
                      isClearable
                      fullWidth
                    />
                  </label>
                  <label>
                    Production status
                    <span className={`clients-push-status${detail.client.productionStatus === 'done' ? ' is-done' : ''}${detail.client.productionStatus === 'pending' || !detail.client.productionStatus ? ' is-pending' : ''}`}>
                      {productionStatusLabel(detail.client.productionStatus)}
                    </span>
                  </label>
                </div>
              ) : (
                <div className="client-admin-statuses">
                  <label>
                    Production status
                    <span className={`clients-push-status${detail.client.productionStatus === 'done' ? ' is-done' : ''}${detail.client.productionStatus === 'pending' || !detail.client.productionStatus ? ' is-pending' : ''}`}>
                      {productionStatusLabel(detail.client.productionStatus)}
                    </span>
                  </label>
                </div>
              )}

              {isAdmin ? (
                <div className="row-actions client-drawer-actions">
                  {isPushedToProduction(detail.client) ? (
                    <button
                      type="button"
                      className="tool-btn"
                      disabled={busy}
                      onClick={() => openPushToProduction(detail.client)}
                    >
                      Push again
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tool-btn"
                      disabled={busy}
                      onClick={() => openPushToProduction(detail.client)}
                    >
                      Push to Production
                    </button>
                  )}
                  <button type="button" className="tool-btn primary" onClick={openAddPayment}>
                    Add payment
                  </button>
                </div>
              ) : null}

              <h3 className="client-detail-title">Payments</h3>
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    {isAdmin ? (
                      <>
                        <th>Method</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {pagedPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.paymentDate}</td>
                      <td>{money(p.amount)}</td>
                      {isAdmin ? (
                        <>
                          <td>{p.paymentMethodLabel || paymentMethodLabel(p.paymentMethod)}</td>
                          <td>{p.notes || '—'}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="tool-btn"
                                disabled={busy}
                                onClick={() => handleDownloadInvoice(detail.client, p)}
                              >
                                Invoice
                              </button>
                              <button
                                type="button"
                                className="tool-btn"
                                disabled={busy}
                                onClick={() => openEditPayment(p)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="tool-btn danger-btn"
                                disabled={busy}
                                onClick={() => setRemovePayment(p)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                  {!payments.length && (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 2}>
                        <div className="empty-state">No payments yet</div>
                      </td>
                    </tr>
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
                    <th>Status</th>
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
                      <td>{ce.status === 'estimated' ? 'Estimated' : 'Posted'}</td>
                    </tr>
                  ))}
                  {!commissions.length && (
                    <tr><td colSpan={6}><div className="empty-state">No commission yet</div></td></tr>
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
      </aside>

      <div
        className={`client-drawer-scrim${selectedId ? ' visible' : ''}`}
        onClick={() => {
          setSelectedId(null);
          setDetail(null);
        }}
        aria-hidden={!selectedId}
      />

      {isAdmin && pushTarget && (
        <div
          className="checkin-modal-backdrop"
          role="presentation"
          onClick={() => !busy && setPushTarget(null)}
        >
          <form
            className="checkin-modal panel push-production-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitPushToProduction}
          >
            <h3>Push to Production</h3>
            <p>
              Create a production board card for <strong>{pushTarget.name}</strong>.
            </p>

            <div className="push-payment-summary" aria-label="Client payment summary">
              <div>
                <span>Deal</span>
                <strong>{money(pushTarget.dealAmount)}</strong>
              </div>
              <div>
                <span>Received</span>
                <strong>{money(pushTarget.totalPaid)}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{money(pushTarget.balance)}</strong>
              </div>
            </div>

            <label className="checkin-emails-label">
              Card title
              <input
                required
                minLength={3}
                maxLength={120}
                value={pushForm.title}
                onChange={(e) => updatePushForm('title', e.target.value)}
                autoFocus
              />
            </label>

            <label className="checkin-emails-label">
              Client
              <input value={pushTarget.name} readOnly disabled />
            </label>

            <label className="checkin-emails-label">
              Description
              <textarea
                rows={3}
                maxLength={2000}
                value={pushForm.description}
                onChange={(e) => updatePushForm('description', e.target.value)}
                placeholder="Brief scope, links, or delivery notes…"
              />
            </label>

            <div className="push-form-grid">
              <label className="checkin-emails-label">
                Type
                <FancySelect
                  fullWidth
                  value={pushForm.type}
                  onChange={(type) => updatePushForm('type', type)}
                  options={[
                    { value: 'draft', label: 'New Draft (4-day default)' },
                    { value: 'revision', label: 'Revision (2-day default)' },
                  ]}
                />
              </label>
              <label className="checkin-emails-label">
                Stage
                <FancySelect
                  fullWidth
                  value={pushForm.stage}
                  onChange={(stage) => updatePushForm('stage', stage)}
                  options={productionStages.map((s) => ({ value: s.id, label: s.title }))}
                />
              </label>
            </div>

            <label className="checkin-emails-label">
              Live link {requiresLiveLink(pushForm.stage) ? '(required for Live)' : '(optional)'}
              <input
                type="url"
                value={pushForm.liveUrl}
                onChange={(e) => updatePushForm('liveUrl', e.target.value)}
                placeholder="https://client-site.com"
              />
            </label>

            <div className="push-form-grid">
              <label className="checkin-emails-label">
                Assignee
                <FancySelect
                  fullWidth
                  value={pushForm.assigneeId}
                  onChange={(assigneeId) => updatePushForm('assigneeId', assigneeId)}
                  placeholder="Select production user…"
                  options={assignees.map((a) => ({
                    value: String(a.id),
                    label: a.name,
                  }))}
                />
              </label>
              <label className="checkin-emails-label">
                Priority
                <FancySelect
                  fullWidth
                  value={pushForm.priority}
                  onChange={(priority) => updatePushForm('priority', priority)}
                  options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                />
              </label>
            </div>

            <label className="checkin-emails-label">
              Due date
              <DayFilter
                value={pushForm.dueDate}
                onChange={(dueDate) => updatePushForm('dueDate', dueDate)}
                placeholder="Select due date"
                allowFuture
                clearable={false}
                className="month-filter--form"
              />
            </label>

            <div className="new-card-files">
              <span className="new-card-files-label">Attachments</span>
              <div
                className="upload-dropzone"
                onClick={() => pushFileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') pushFileInputRef.current?.click();
                }}
                role="button"
                tabIndex={0}
              >
                <Icon id="i-paperclip" />
                <strong>Click to upload files</strong>
                <span>Max 10 files · 5 MB each · 8 MB total · images, docs, video, zip</span>
              </div>
              <input
                ref={pushFileInputRef}
                type="file"
                multiple
                hidden
                onChange={handlePushFilePick}
                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp4,.mov,.webm"
              />
              {pushFiles.length ? (
                <ul className="file-list">
                  {pushFiles.map((item) => (
                    <li key={item.key} className="file-row">
                      <div className="file-icon"><Icon id="i-paperclip" /></div>
                      <div className="file-meta">
                        <strong>{item.file.name}</strong>
                        <span>{formatFileSize(item.file.size || 0)}</span>
                      </div>
                      <div className="file-actions">
                        <button
                          type="button"
                          className="plain-icon"
                          aria-label={`Remove ${item.file.name}`}
                          onClick={() => setPushFiles((prev) => prev.filter((f) => f.key !== item.key))}
                        >
                          <Icon id="i-close" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-hint">Optional — attach briefs or references now.</p>
              )}
            </div>

            <div className="checkin-modal-actions">
              <button type="button" className="tool-btn" onClick={() => setPushTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="tool-btn primary" disabled={busy || !assignees.length}>
                {busy ? 'Pushing…' : 'Create production card'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isAdmin && showClientForm && (
        <div className="checkin-modal-backdrop" role="presentation" onClick={() => !busy && setShowClientForm(false)}>
          <form className="checkin-modal panel add-client-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitClient}>
            <h3>Add client</h3>
            <label className="checkin-emails-label">
              Name
              <input required value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} />
            </label>
            <label className="checkin-emails-label">
              Mailboxes
              <FancySelect
                fullWidth
                isMulti
                isClearable
                value={clientForm.mailboxIds}
                onChange={handleClientMailboxesChange}
                placeholder="Select mailbox(es)…"
                options={allMailboxes
                  .filter((m) => m.isActive !== false)
                  .map((m) => ({
                    value: String(m.id),
                    label: m.ownerName
                      ? `${m.emailAddress}${m.label ? ` (${m.label})` : ''} · ${m.ownerName}`
                      : `${m.emailAddress}${m.label ? ` (${m.label})` : ''}`,
                  }))}
              />
            </label>
            <p className="muted-hint">
              Pick mailboxes first — agent and manager fill in automatically from the mailbox owner.
            </p>
            <label className="checkin-emails-label">
              Agent (auto)
              <FancySelect
                fullWidth
                isDisabled
                value={clientForm.agentId}
                onChange={() => {}}
                placeholder="Select a mailbox first…"
                options={agents.map((a) => ({
                  value: String(a.id),
                  label: `${a.name} (${a.role})`,
                }))}
              />
            </label>
            <label className="checkin-emails-label">
              Manager (auto)
              <FancySelect
                fullWidth
                isDisabled
                value={clientForm.managerId}
                onChange={() => {}}
                placeholder={clientForm.agentId ? (clientForm.managerId ? 'Auto from agent…' : 'No manager on this agent') : 'Select a mailbox first…'}
                options={allUsers
                  .filter((u) => u.role === 'manager')
                  .map((m) => ({
                    value: String(m.id),
                    label: m.name,
                  }))}
              />
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
        <div
          className="checkin-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (busy) return;
            setShowPayForm(false);
            setEditingPayment(null);
          }}
        >
          <form className="checkin-modal panel" onClick={(e) => e.stopPropagation()} onSubmit={submitPayment}>
            <h3>{editingPayment ? 'Edit payment' : 'Add payment'}</h3>
            <p>
              {editingPayment
                ? 'If commission was already posted for this payment, it will be recalculated from the new amount and date.'
                : 'Partial payments only record money received. Commission is posted later by admin (select payments → calculate).'}
            </p>
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
              <DayFilter
                value={payForm.paymentDate}
                onChange={(paymentDate) => setPayForm({ ...payForm, paymentDate })}
                placeholder="Select payment date"
                clearable={false}
                className="month-filter--form"
              />
            </label>
            <label className="checkin-emails-label">
              Payment method
              <FancySelect
                fullWidth
                value={payForm.paymentMethod}
                onChange={(paymentMethod) => setPayForm({ ...payForm, paymentMethod })}
                placeholder="Select method…"
                options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
              />
            </label>
            <label className="checkin-emails-label">
              Notes
              <input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
            </label>
            {(payForm.paymentMethod === 'stripe' || payForm.paymentMethod === 'paypal') ? (
              <label className="checkin-emails-label">
                Payment link (for invoice)
                <input
                  type="url"
                  placeholder={
                    payForm.paymentMethod === 'paypal'
                      ? 'https://paypal.me/…'
                      : 'https://buy.stripe.com/…'
                  }
                  value={payForm.paymentLink}
                  onChange={(e) => setPayForm({ ...payForm, paymentLink: e.target.value })}
                />
              </label>
            ) : null}
            <div className="checkin-modal-actions">
              <button
                type="button"
                className="tool-btn"
                onClick={() => {
                  setShowPayForm(false);
                  setEditingPayment(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="tool-btn primary" disabled={busy}>
                {editingPayment ? 'Save changes' : 'Record payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isAdmin && invoiceReady && (
        <div
          className="checkin-modal-backdrop"
          role="presentation"
          onClick={() => setInvoiceReady(null)}
        >
          <div className="checkin-modal panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>Payment recorded</h3>
            <p>
              Download the Wiki Studio invoice for{' '}
              <strong>{invoiceReady.client.name}</strong> ({money(invoiceReady.payment.amount)}).
            </p>
            <div className="checkin-modal-actions">
              <button type="button" className="tool-btn" onClick={() => setInvoiceReady(null)}>
                Close
              </button>
              <button
                type="button"
                className="tool-btn primary"
                onClick={async () => {
                  await handleDownloadInvoice(invoiceReady.client, invoiceReady.payment, {
                    paymentLink: invoiceReady.paymentLink,
                    paymentMethod: invoiceReady.paymentMethod,
                    paymentMethodLabel: invoiceReady.paymentMethodLabel,
                    totalPaid: invoiceReady.client.totalPaid,
                    balance: invoiceReady.client.balance,
                  });
                  setInvoiceReady(null);
                }}
              >
                Download invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && removePayment && (
        <div
          className="checkin-modal-backdrop"
          role="presentation"
          onClick={() => !busy && setRemovePayment(null)}
        >
          <div className="checkin-modal panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>Delete payment?</h3>
            <p>
              Remove {money(removePayment.amount)} on {removePayment.paymentDate}
              {removePayment.notes ? ` (${removePayment.notes})` : ''}. Any commission posted for this
              payment will also be removed.
            </p>
            <div className="checkin-modal-actions">
              <button type="button" className="tool-btn" onClick={() => setRemovePayment(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="tool-btn danger-solid" onClick={confirmDeletePayment} disabled={busy}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
