import { useCallback, useEffect, useState } from 'react';
import StatCard from '../../components/AppShell/StatCard.jsx';
import { Icon } from '../../icons/IconSprite.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../api/client.js';

const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const EMPTY_FORM = { clientName: '', note: '', priority: 'medium' };

export default function FollowUpsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { followUps } = await api.listFollowUps(token);
      setItems(followUps);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (isAdmin) return;
    if (!form.clientName.trim()) return setError('Client name is required');
    setAdding(true);
    setError('');
    try {
      await api.createFollowUp(token, {
        clientName: form.clientName.trim(),
        note: form.note.trim() || undefined,
        priority: form.priority,
      });
      setForm(EMPTY_FORM);
      await load();
      showToast('Follow-up added');
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function act(id, fn, message) {
    if (isAdmin) return;
    setBusyId(id);
    setError('');
    try {
      await fn();
      await load();
      if (message) showToast(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const pending = items.filter((i) => i.status === 'pending');
  const done = items.filter((i) => i.status === 'done');
  const highPending = pending.filter((i) => i.priority === 'high').length;
  const colSpan = isAdmin ? 6 : 5;

  if (loading) return <div className="page-loading">Loading follow-ups…</div>;

  return (
    <>
      <section className="stats-grid">
        <StatCard tone="orange" icon="i-message" label="To Reply" value={pending.length} delta={isAdmin ? 'Across all agents & managers' : 'Clients awaiting a reply'} />
        <StatCard tone="red" icon="i-alert" label="High Priority" value={highPending} delta="Urgent replies pending" />
        <StatCard tone="green" icon="i-check" label="Done" value={done.length} delta="Replied & cleared" />
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Follow-ups</h2>
            <p>
              {isAdmin
                ? 'Team outreach queue — view only (agents and managers own their lists)'
                : 'Remind yourself which clients still need a reply — private to you'}
            </p>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        {!isAdmin && (
          <form className="followup-form" onSubmit={handleAdd}>
            <label className="field field--client">
              Client name
              <input
                type="text"
                value={form.clientName}
                maxLength={160}
                placeholder="e.g. Julian Perez"
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              />
            </label>
            <label className="field field--note">
              What to reply <span style={{ fontWeight: 400 }}>(optional)</span>
              <input
                type="text"
                value={form.note}
                maxLength={500}
                placeholder="e.g. asked for cost — send the quote"
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
            <label className="field field--priority">
              Priority
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <button type="submit" className="tool-btn primary-btn followup-add" disabled={adding}>
              <Icon id="i-plus" /> {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}

        <div className="panel commission-scroll">
          <table className="attendance-table">
            <thead>
              <tr>
                {isAdmin && <th>Owner</th>}
                <th>Client</th>
                <th>Reply</th>
                <th>Priority</th>
                <th>Added</th>
                {!isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && (
                <tr>
                  <td colSpan={colSpan} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                    {isAdmin ? 'No pending follow-ups across the team.' : "Nothing pending — you're all caught up."}
                  </td>
                </tr>
              )}
              {pending.map((item) => (
                <tr key={item.id}>
                  {isAdmin && (
                    <td>
                      <strong>{item.ownerName || '—'}</strong>
                      {item.ownerRole ? (
                        <div style={{ color: 'var(--muted)', fontSize: 12, textTransform: 'capitalize' }}>
                          {item.ownerRole}
                        </div>
                      ) : null}
                    </td>
                  )}
                  <td><strong className="followup-client">{item.clientName}</strong></td>
                  <td className={`followup-note-cell ${item.note ? '' : 'empty'}`}>{item.note || '—'}</td>
                  <td><span className={`priority-chip ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span></td>
                  <td>{formatDate(item.createdAt)}</td>
                  {!isAdmin && (
                    <td>
                      <div className="row-actions">
                        <button
                          className="tool-btn"
                          disabled={busyId === item.id}
                          onClick={() => act(item.id, () => api.updateFollowUp(token, item.id, { status: 'done' }), 'Marked as replied')}
                        >
                          <Icon id="i-check" /> Done
                        </button>
                        <button
                          className="tool-btn danger-btn"
                          disabled={busyId === item.id}
                          onClick={() => act(item.id, () => api.deleteFollowUp(token, item.id), 'Follow-up removed')}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {done.length > 0 && (
          <>
            <p className="followup-section-label">Replied ({done.length})</p>
            <div className="panel commission-scroll">
              <table className="attendance-table">
                <tbody>
                  {done.map((item) => (
                    <tr key={item.id} className="followup-done">
                      {isAdmin && (
                        <td>
                          <strong>{item.ownerName || '—'}</strong>
                        </td>
                      )}
                      <td><strong className="followup-client">{item.clientName}</strong></td>
                      <td className={`followup-note-cell ${item.note ? '' : 'empty'}`}>{item.note || '—'}</td>
                      <td><span className={`priority-chip ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span></td>
                      <td>Replied {formatDate(item.doneAt)}</td>
                      {!isAdmin && (
                        <td>
                          <div className="row-actions">
                            <button
                              className="tool-btn"
                              disabled={busyId === item.id}
                              onClick={() => act(item.id, () => api.updateFollowUp(token, item.id, { status: 'pending' }), 'Reopened')}
                            >
                              Reopen
                            </button>
                            <button
                              className="tool-btn danger-btn"
                              disabled={busyId === item.id}
                              onClick={() => act(item.id, () => api.deleteFollowUp(token, item.id), 'Follow-up removed')}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
