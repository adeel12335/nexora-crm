import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import FancySelect from '../../components/filters/FancySelect.jsx';
import { DayFilter } from '../../components/filters/MonthFilter.jsx';

const TABS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'i-whatsapp' },
  { id: 'attendance', label: 'Attendance rules', icon: 'i-clock' },
  { id: 'cycle', label: 'Commission cycle', icon: 'i-coins' },
];

const BROADCAST_ROLES = [
  { value: 'production', label: 'Production' },
  { value: 'agent', label: 'Agents' },
  { value: 'manager', label: 'Managers' },
  { value: 'admin', label: 'Admins' },
];

export default function AdminSettings() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState('whatsapp');

  const [settings, setSettings] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [waForm, setWaForm] = useState({
    groupJid: '',
    notifyLateIndividuals: true,
    notifyLateGroup: true,
    notifyDeadlinesGroup: false,
    notifyCardUpdatesGroup: true,
  });
  const [testForm, setTestForm] = useState({ to: '', text: '', useGroup: false });
  const [composeForm, setComposeForm] = useState({
    title: '',
    text: '',
    target: 'group',
    userIds: [],
    roles: ['production'],
  });

  const [policyData, setPolicyData] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [policyForm, setPolicyForm] = useState({ anchorDay: '15', endDay: '14', notes: '' });
  const [overrideForm, setOverrideForm] = useState({ cycleStart: '', cycleEnd: '', reason: '' });

  const loadAll = useCallback(async () => {
    const [portal, pol, ov, usersRes] = await Promise.all([
      api.getPortalSettings(token),
      api.getCyclePolicy(token),
      api.listCycleOverrides(token),
      api.listUsers(token, '?includeInactive=0&pageSize=200'),
    ]);
    setSettings(portal);
    setWaForm({
      groupJid: portal.whatsapp?.groupJid || '',
      notifyLateIndividuals: portal.whatsapp?.notifyLateIndividuals !== false,
      notifyLateGroup: portal.whatsapp?.notifyLateGroup !== false,
      notifyDeadlinesGroup: Boolean(portal.whatsapp?.notifyDeadlinesGroup),
      notifyCardUpdatesGroup: portal.whatsapp?.notifyCardUpdatesGroup !== false,
    });
    setUsers((usersRes.users || []).filter((u) => u.isActive !== false));
    setPolicyData(pol);
    setOverrides(ov.overrides || []);
    if (pol.current) {
      setPolicyForm({
        anchorDay: String(pol.current.anchorDay),
        endDay: String(pol.current.endDay),
        notes: '',
      });
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadAll();
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, loadAll, showToast]);

  async function saveWhatsApp(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateWhatsAppSettings(token, waForm);
      showToast('WhatsApp settings saved');
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(e) {
    e.preventDefault();
    if (!testForm.useGroup && !testForm.to.trim()) {
      showToast('Enter a number or send to the saved group');
      return;
    }
    setBusy(true);
    try {
      const result = await api.testWhatsAppSettings(token, {
        to: testForm.to.trim() || undefined,
        text: testForm.text.trim() || undefined,
        useGroup: testForm.useGroup,
      });
      showToast(`Sent to ${result.to}${result.isGroup ? ' (group)' : ''}`);
    } catch (err) {
      showToast(err.message || 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  async function sendCompose(e) {
    e.preventDefault();
    if (!composeForm.text.trim()) {
      showToast('Write a message first');
      return;
    }
    if (composeForm.target === 'users' && !composeForm.userIds.length) {
      showToast('Select at least one user');
      return;
    }
    if (composeForm.target === 'roles' && !composeForm.roles.length) {
      showToast('Select at least one role');
      return;
    }
    setBusy(true);
    try {
      const result = await api.sendWhatsAppBroadcast(token, {
        title: composeForm.title.trim() || undefined,
        text: composeForm.text.trim(),
        target: composeForm.target,
        userIds: composeForm.target === 'users'
          ? composeForm.userIds.map((id) => Number(id))
          : undefined,
        roles: composeForm.target === 'roles' ? composeForm.roles : undefined,
      });
      showToast(
        `Broadcast done — sent ${result.sent || 0}, skipped ${result.skipped || 0}, failed ${result.failed || 0}`
      );
      if (result.sent) {
        setComposeForm((f) => ({ ...f, text: '', title: '' }));
      }
    } catch (err) {
      showToast(err.message || 'Broadcast failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitPolicy(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createCyclePolicy(token, {
        anchorDay: Number(policyForm.anchorDay),
        endDay: Number(policyForm.endDay),
        notes: policyForm.notes.trim() || undefined,
      });
      showToast('Cycle rule scheduled for the next cycle start');
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to update cycle rule');
    } finally {
      setBusy(false);
    }
  }

  async function submitOverride(e) {
    e.preventDefault();
    if (!overrideForm.cycleStart || !overrideForm.cycleEnd) {
      showToast('Cycle start and end dates are required');
      return;
    }
    setBusy(true);
    try {
      await api.createCycleOverride(token, {
        cycleStart: overrideForm.cycleStart,
        cycleEnd: overrideForm.cycleEnd,
        reason: overrideForm.reason.trim() || undefined,
      });
      showToast('Cycle exception saved');
      setOverrideForm({ cycleStart: '', cycleEnd: '', reason: '' });
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to save override');
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride(id) {
    if (!window.confirm('Remove this cycle exception?')) return;
    setBusy(true);
    try {
      await api.deleteCycleOverride(token, id);
      showToast('Override removed');
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to delete');
    } finally {
      setBusy(false);
    }
  }

  const wa = settings?.whatsapp;
  const attendance = settings?.attendance;
  const current = policyData?.current;
  const currentCycle = policyData?.currentCycle;
  const groups = wa?.groups || [];

  return (
    <>
      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Settings</h2>
            <p>WhatsApp automation, attendance rules, and commission cycle — live data only</p>
          </div>
        </div>

        <div className="settings-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={tab === t.id ? 'active' : ''}
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <Icon id={t.icon} />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <section className="page-section">
          <div className="panel empty-state">Loading settings…</div>
        </section>
      ) : null}

      {!loading && tab === 'whatsapp' && (
        <section className="page-section">
          <div className="panel settings-cycle-panel">
            <div className="settings-cycle-summary">
              <div>
                <span className="muted">API key</span>
                <strong>{wa?.configured ? 'Configured' : 'Missing'}</strong>
              </div>
              <div>
                <span className="muted">Session</span>
                <strong>{wa?.sessionId || '—'}</strong>
              </div>
              <div>
                <span className="muted">Sending</span>
                <strong>{wa?.enabled === false ? 'Disabled' : 'Enabled'}</strong>
              </div>
            </div>

            {wa?.hint && <p className="commission-note">{wa.hint}</p>}
            {wa?.error && (
              <p className="commission-note" style={{ color: 'var(--red)' }}>{wa.error}</p>
            )}

            {wa?.manageUrl && (
              <p className="commission-note">
                <a href={wa.manageUrl} target="_blank" rel="noreferrer">Open Wasender session</a>
                {' '}to copy API key / confirm WhatsApp is linked.
              </p>
            )}

            <form className="settings-stack" onSubmit={saveWhatsApp}>
              <h3 className="client-detail-title">Group automation</h3>
              <label>
                WhatsApp Group ID
                <input
                  value={waForm.groupJid}
                  onChange={(e) => setWaForm({ ...waForm, groupJid: e.target.value })}
                  placeholder="1203630xxxxxxxxxx@g.us"
                />
              </label>
              {groups.length > 0 && (
                <label>
                  Or pick a synced group
                  <FancySelect
                    fullWidth
                    isClearable
                    value=""
                    onChange={(id) => {
                      if (id) setWaForm({ ...waForm, groupJid: id });
                    }}
                    placeholder="Search WhatsApp group…"
                    options={groups.map((g) => ({
                      value: g.id,
                      label: `${g.name} — ${g.id}`,
                    }))}
                  />
                </label>
              )}

              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={waForm.notifyLateIndividuals}
                  onChange={(e) => setWaForm({ ...waForm, notifyLateIndividuals: e.target.checked })}
                />
                Late check-in → agent + manager + admins (DM)
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={waForm.notifyLateGroup}
                  onChange={(e) => setWaForm({ ...waForm, notifyLateGroup: e.target.checked })}
                />
                Late check-in → WhatsApp group
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={waForm.notifyDeadlinesGroup}
                  onChange={(e) => setWaForm({ ...waForm, notifyDeadlinesGroup: e.target.checked })}
                />
                Production deadlines → WhatsApp group
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={waForm.notifyCardUpdatesGroup}
                  onChange={(e) => setWaForm({ ...waForm, notifyCardUpdatesGroup: e.target.checked })}
                />
                Stage / priority changes → WhatsApp group
              </label>
              <p className="commission-note">
                Deadline cron runs every 15 minutes (Asia/Karachi): alerts at 1 day left and 12 hours before due.
                Stage/priority changes notify the assignee immediately; group post if the toggle above is on.
              </p>

              <button type="submit" className="tool-btn primary" disabled={busy}>
                Save WhatsApp settings
              </button>
            </form>

            <form className="settings-stack" onSubmit={sendCompose} style={{ marginTop: 20 }}>
              <h3 className="client-detail-title">Compose &amp; send</h3>
              <p className="commission-note">
                Send a custom WhatsApp message to the saved group, selected users, or everyone in a role.
              </p>
              <label>
                Title (optional)
                <input
                  value={composeForm.title}
                  onChange={(e) => setComposeForm({ ...composeForm, title: e.target.value })}
                  placeholder="Production update"
                  maxLength={200}
                />
              </label>
              <label>
                Message
                <textarea
                  value={composeForm.text}
                  onChange={(e) => setComposeForm({ ...composeForm, text: e.target.value })}
                  placeholder="Type your WhatsApp message…"
                  rows={4}
                  maxLength={4096}
                  required
                />
              </label>
              <label>
                Send to
                <FancySelect
                  fullWidth
                  value={composeForm.target}
                  onChange={(target) => setComposeForm({ ...composeForm, target })}
                  options={[
                    { value: 'group', label: 'Saved WhatsApp group' },
                    { value: 'users', label: 'Selected users (DM)' },
                    { value: 'roles', label: 'Everyone in role(s)' },
                  ]}
                />
              </label>
              {composeForm.target === 'users' && (
                <label>
                  Users with WhatsApp
                  <FancySelect
                    fullWidth
                    isMulti
                    value={composeForm.userIds}
                    onChange={(userIds) => setComposeForm({ ...composeForm, userIds: userIds || [] })}
                    placeholder="Search users…"
                    options={users
                      .filter((u) => u.whatsappNumber)
                      .map((u) => ({
                        value: String(u.id),
                        label: `${u.name} · ${u.role}`,
                      }))}
                  />
                </label>
              )}
              {composeForm.target === 'roles' && (
                <label>
                  Roles
                  <FancySelect
                    fullWidth
                    isMulti
                    value={composeForm.roles}
                    onChange={(roles) => setComposeForm({ ...composeForm, roles: roles || [] })}
                    placeholder="Select roles…"
                    options={BROADCAST_ROLES}
                  />
                </label>
              )}
              <button type="submit" className="tool-btn primary" disabled={busy || !wa?.configured}>
                {busy ? 'Sending…' : 'Send WhatsApp message'}
              </button>
            </form>

            <form className="settings-stack" onSubmit={sendTest} style={{ marginTop: 20 }}>
              <h3 className="client-detail-title">Send test</h3>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={testForm.useGroup}
                  onChange={(e) => setTestForm({ ...testForm, useGroup: e.target.checked })}
                />
                Send to saved group
              </label>
              {!testForm.useGroup && (
                <label>
                  Phone number
                  <input
                    value={testForm.to}
                    onChange={(e) => setTestForm({ ...testForm, to: e.target.value })}
                    placeholder="03001234567"
                  />
                </label>
              )}
              <label>
                Message
                <input
                  value={testForm.text}
                  onChange={(e) => setTestForm({ ...testForm, text: e.target.value })}
                  placeholder="Optional custom text"
                />
              </label>
              <button type="submit" className="tool-btn primary" disabled={busy || !wa?.configured}>
                {busy ? 'Sending…' : 'Send test message'}
              </button>
            </form>
          </div>
        </section>
      )}

      {!loading && tab === 'attendance' && (
        <section className="page-section">
          <div className="panel" style={{ display: 'grid', gap: 2 }}>
            <div className="rule-row">
              <div className="rule-icon"><Icon id="i-clock" /></div>
              <div className="rule-copy">
                <strong>Late check-in cutoff</strong>
                <span>Check-ins after this Karachi time are marked late.</span>
              </div>
              <div className="rule-counter"><strong>{attendance?.lateCutoff || '09:15'}</strong></div>
            </div>
            <div className="rule-row">
              <div className="rule-icon"><Icon id="i-revision" /></div>
              <div className="rule-copy">
                <strong>Late → auto off</strong>
                <span>Every Nth late in a cycle counts as 1 day off.</span>
              </div>
              <div className="rule-counter"><strong>Every {attendance?.lateCountForAutoOff ?? 4}th</strong></div>
            </div>
            <div className="rule-row">
              <div className="rule-icon"><Icon id="i-calendar" /></div>
              <div className="rule-copy">
                <strong>Free offs / month</strong>
                <span>Extra offs beyond this flag a payroll deduction.</span>
              </div>
              <div className="rule-counter"><strong>{attendance?.freeOffsPerMonth ?? 2}</strong></div>
            </div>
            <div className="rule-row">
              <div className="rule-icon"><Icon id="i-production" /></div>
              <div className="rule-copy">
                <strong>New draft deadline</strong>
                <span>Default due date for draft production cards.</span>
              </div>
              <div className="rule-counter"><strong>{attendance?.draftDeadlineDays ?? 4} days</strong></div>
            </div>
            <div className="rule-row">
              <div className="rule-icon"><Icon id="i-revision" /></div>
              <div className="rule-copy">
                <strong>Revision deadline</strong>
                <span>Default due date for revision cards.</span>
              </div>
              <div className="rule-counter"><strong>{attendance?.revisionDeadlineDays ?? 2} days</strong></div>
            </div>
          </div>
          <p className="commission-note" style={{ marginTop: 12 }}>
            These values come from the live server rules — not demo placeholders.
          </p>
        </section>
      )}

      {!loading && tab === 'cycle' && (
        <>
          <section className="page-section">
            <div className="section-heading">
              <div>
                <h2>Commission cycle rule</h2>
                <p>Changes apply from the next cycle start — history is never rewritten.</p>
              </div>
            </div>
            <div className="panel settings-cycle-panel">
              <div className="settings-cycle-summary">
                <div>
                  <span className="muted">Active rule</span>
                  <strong>
                    {current
                      ? `Day ${current.anchorDay} → day ${current.endDay}`
                      : '15 → 14 (fallback)'}
                  </strong>
                </div>
                <div>
                  <span className="muted">Current cycle</span>
                  <strong>{currentCycle?.label || '—'}</strong>
                </div>
                <div>
                  <span className="muted">In force from</span>
                  <strong>{current?.effectiveFrom || '—'}</strong>
                </div>
              </div>

              <form className="inline-form" onSubmit={submitPolicy}>
                <label>
                  Anchor day
                  <input type="number" min="1" max="28" required value={policyForm.anchorDay}
                    onChange={(e) => setPolicyForm({ ...policyForm, anchorDay: e.target.value })} />
                </label>
                <label>
                  End day
                  <input type="number" min="1" max="28" required value={policyForm.endDay}
                    onChange={(e) => setPolicyForm({ ...policyForm, endDay: e.target.value })} />
                </label>
                <label>
                  Notes
                  <input value={policyForm.notes}
                    onChange={(e) => setPolicyForm({ ...policyForm, notes: e.target.value })}
                    placeholder="Optional" />
                </label>
                <button type="submit" className="tool-btn primary" disabled={busy}>Schedule rule</button>
              </form>
            </div>
          </section>

          <section className="page-section">
            <div className="section-heading">
              <div>
                <h2>One-off cycle exception</h2>
                <p>Extend a single window without changing the default rule.</p>
              </div>
            </div>
            <div className="panel settings-cycle-panel">
              <form className="inline-form" onSubmit={submitOverride}>
                <label>
                  Cycle start
                  <DayFilter
                    value={overrideForm.cycleStart}
                    onChange={(cycleStart) => setOverrideForm({ ...overrideForm, cycleStart })}
                    placeholder="Start date"
                    allowFuture
                    clearable={false}
                    className="month-filter--form"
                  />
                </label>
                <label>
                  Cycle end
                  <DayFilter
                    value={overrideForm.cycleEnd}
                    onChange={(cycleEnd) => setOverrideForm({ ...overrideForm, cycleEnd })}
                    placeholder="End date"
                    allowFuture
                    clearable={false}
                    minDate={overrideForm.cycleStart ? new Date(`${overrideForm.cycleStart}T12:00:00`) : undefined}
                    className="month-filter--form"
                  />
                </label>
                <label>
                  Reason
                  <input value={overrideForm.reason}
                    onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                    placeholder="Payroll delay" />
                </label>
                <button type="submit" className="tool-btn primary" disabled={busy}>Add exception</button>
              </form>

              <h3 className="client-detail-title">Active exceptions</h3>
              <table className="attendance-table">
                <thead>
                  <tr><th>Start</th><th>End</th><th>Reason</th><th /></tr>
                </thead>
                <tbody>
                  {overrides.map((o) => (
                    <tr key={o.id}>
                      <td>{o.cycleStart}</td>
                      <td>{o.cycleEnd}</td>
                      <td>{o.reason || '—'}</td>
                      <td>
                        <button type="button" className="tool-btn" disabled={busy}
                          onClick={() => removeOverride(o.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                  {!overrides.length && (
                    <tr><td colSpan={4}><div className="empty-state">No exceptions</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
