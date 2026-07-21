import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../api/client.js';
import TableToolbar from '../../components/filters/TableToolbar.jsx';
import PaginationBar from '../../components/filters/PaginationBar.jsx';
import FancySelect from '../../components/filters/FancySelect.jsx';
import { useTableQuery } from '../../hooks/useTableQuery.js';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The sending addresses a person works out of.
 * Agents/managers manage their own; admins (and managers for their team)
 * can also assign a mailbox to someone.
 */
export default function MailboxesPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [mailboxes, setMailboxes] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ emailAddress: '', label: '', userId: '' });
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [reassignId, setReassignId] = useState(null);

  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';
  const canAssign = isAdmin || isManager;
  const canAdd = user.role === 'agent' || canAssign;

  const load = useCallback(async () => {
    try {
      const [{ mailboxes: rows }, usersPayload] = await Promise.all([
        api.listMailboxes(token),
        canAssign
          ? api.listUsers(token, `?month=${currentMonth()}`)
          : Promise.resolve({ users: [] }),
      ]);
      setMailboxes(rows);
      if (canAssign) {
        const list = (usersPayload.users || []).filter((u) =>
          u.role === 'agent' || u.role === 'manager'
        );
        setAssignees(list);
        setForm((f) => ({
          ...f,
          userId: f.userId || String(isAdmin ? (list[0]?.id ?? '') : user.id),
        }));
      }
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, canAssign, isAdmin, user.id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    const email = form.emailAddress.trim();
    const targetId = canAssign ? Number(form.userId) : user.id;

    if (!email) return setError('Enter the mailbox address');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setError('Enter a valid email address');
    if (canAssign && !targetId) return setError('Pick who this mailbox belongs to');
    if (mailboxes.some((m) => m.userId === targetId && m.emailAddress === email.toLowerCase())) {
      return setError('That person already has this mailbox');
    }

    setAdding(true);
    setError('');
    try {
      const body = {
        emailAddress: email,
        label: form.label.trim() || undefined,
      };
      if (canAssign) body.userId = targetId;
      await api.createMailbox(token, body);
      setForm((f) => ({ ...f, emailAddress: '', label: '' }));
      await load();
      showToast('Mailbox assigned');
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(box) {
    if (!window.confirm(`Remove ${box.emailAddress}?`)) return;
    setBusyId(box.id);
    setError('');
    try {
      await api.deleteMailbox(token, box.id);
      await load();
      showToast('Mailbox removed');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(box) {
    setBusyId(box.id);
    try {
      await api.updateMailbox(token, box.id, { isActive: !box.isActive });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReassign(box, nextUserId) {
    if (!nextUserId || Number(nextUserId) === box.userId) {
      setReassignId(null);
      return;
    }
    setBusyId(box.id);
    setError('');
    try {
      await api.updateMailbox(token, box.id, { userId: Number(nextUserId) });
      setReassignId(null);
      await load();
      showToast('Mailbox reassigned');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="page-loading">Loading mailboxes…</div>;

  const mine = mailboxes.filter((m) => m.userId === user.id);
  const others = mailboxes.filter((m) => m.userId !== user.id);

  // Managers assigning to their team only see agents who report to them (+ self).
  const assignOptions = isAdmin
    ? assignees
    : assignees.filter((u) => u.id === user.id || u.managerId === user.id);

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Mailboxes</h2>
          <p>
            {canAssign
              ? 'Assign sending addresses to agents and managers'
              : 'The sending addresses you work out of — add as many as you use'}
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {canAdd && (
        <form className="panel inline-form" onSubmit={handleAdd}>
          {canAssign && (
            <label>
              Assign to
              <FancySelect
                fullWidth
                value={form.userId}
                onChange={(userId) => { setForm((f) => ({ ...f, userId })); setError(''); }}
                placeholder="Search person…"
                options={assignOptions.map((u) => ({
                  value: String(u.id),
                  label: `${u.name} (${u.role})`,
                }))}
              />
            </label>
          )}
          <label>
            Mailbox address
            <input
              type="email"
              value={form.emailAddress}
              onChange={(e) => { setForm((f) => ({ ...f, emailAddress: e.target.value })); setError(''); }}
              placeholder="name.wikieditor@gmail.com"
            />
          </label>
          <label>
            Label <span className="field-hint">(optional)</span>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Display name used in this inbox"
            />
          </label>
          <button type="submit" className="tool-btn primary-btn" disabled={adding}>
            {adding ? 'Saving…' : canAssign ? '+ Assign mailbox' : '+ Add mailbox'}
          </button>
        </form>
      )}

      {(canAdd || mine.length > 0) && (
        <MailboxSection
          title={`My mailboxes (${mine.length})`}
          rows={mine}
          busyId={busyId}
          showOwner={false}
          canReassign={false}
          onToggle={toggleActive}
          onRemove={handleRemove}
          emptyText="You have not been assigned a mailbox yet."
          searchFields={['emailAddress', 'label']}
        />
      )}

      {canAssign && (
        <MailboxSection
          title={isAdmin ? `All mailboxes (${others.length})` : `Team mailboxes (${others.length})`}
          rows={others}
          busyId={busyId}
          showOwner
          canReassign
          assignees={assignOptions}
          agents={assignOptions}
          reassignId={reassignId}
          onStartReassign={setReassignId}
          onReassign={handleReassign}
          onToggle={toggleActive}
          onRemove={handleRemove}
          emptyText="No mailboxes assigned yet."
          searchFields={['emailAddress', 'label', 'ownerName']}
          filterByOwner
        />
      )}
    </section>
  );
}

function MailboxSection({
  title,
  rows,
  agents,
  filterByOwner,
  searchFields,
  emptyText,
  ...tableProps
}) {
  const table = useTableQuery(rows, {
    searchFields,
    getAgentId: filterByOwner ? (row) => row.userId : undefined,
  });

  return (
    <>
      <div className="section-heading" style={{ borderTop: 0 }}>
        <h3 className="subhead" style={{ margin: 0 }}>{title}</h3>
        <TableToolbar
          search={table.search}
          onSearch={table.setSearch}
          searchPlaceholder="Search mailboxes…"
          agents={filterByOwner ? agents : undefined}
          agentId={table.agentId}
          onAgentId={filterByOwner ? table.setAgentId : undefined}
          agentLabel="Person"
        />
      </div>
      <MailboxTable
        rows={table.pageItems}
        emptyText={table.total === 0 && (table.search || table.agentId) ? 'No mailboxes match filters' : emptyText}
        {...tableProps}
      />
      <PaginationBar
        total={table.total}
        page={table.page}
        totalPages={table.totalPages}
        from={table.from}
        to={table.to}
        pageSize={table.pageSize}
        emptyLabel="No mailboxes"
        compact
        onPrev={() => table.setPage((p) => Math.max(1, p - 1))}
        onNext={() => table.setPage((p) => p + 1)}
      />
    </>
  );
}

function MailboxTable({
  rows, busyId, showOwner, canReassign, assignees = [],
  reassignId, onStartReassign, onReassign, onToggle, onRemove, emptyText,
}) {
  return (
    <div className="panel commission-scroll" style={{ marginBottom: 14 }}>
      <table className="attendance-table">
        <thead>
          <tr>
            {showOwner && <th>Assigned to</th>}
            <th>Mailbox</th>
            <th>Label</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={showOwner ? 5 : 4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((box) => (
            <tr key={box.id} className={box.isActive ? '' : 'row-inactive'}>
              {showOwner && (
                <td>
                  {reassignId === box.id ? (
                    <FancySelect
                      fullWidth
                      minWidth={140}
                      autoFocus
                      value={String(box.userId)}
                      isDisabled={busyId === box.id}
                      onChange={(v) => {
                        if (v && String(v) !== String(box.userId)) onReassign(box, v);
                        else onStartReassign(null);
                      }}
                      onMenuClose={() => {
                        // slight delay so click-selection can finish first
                        setTimeout(() => onStartReassign(null), 150);
                      }}
                      options={assignees.map((u) => ({
                        value: String(u.id),
                        label: u.name,
                      }))}
                      placeholder="Reassign…"
                      aria-label="Reassign mailbox"
                    />
                  ) : (
                    <strong>{box.ownerName}</strong>
                  )}
                </td>
              )}
              <td>{box.emailAddress}</td>
              <td>{box.label || '—'}</td>
              <td>
                <span className={`deal-status ${box.isActive ? 'paid' : 'pending'}`}>
                  {box.isActive ? 'active' : 'paused'}
                </span>
              </td>
              <td>
                <div className="row-actions">
                  {canReassign && (
                    <button className="tool-btn" disabled={busyId === box.id}
                      onClick={() => onStartReassign(box.id)}>
                      Reassign
                    </button>
                  )}
                  <button className="tool-btn" disabled={busyId === box.id} onClick={() => onToggle(box)}>
                    {box.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button className="tool-btn danger-btn" disabled={busyId === box.id} onClick={() => onRemove(box)}>
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
