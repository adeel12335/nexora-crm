import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';
import { Icon } from '../../icons/IconSprite.jsx';
import FancySelect from '../filters/FancySelect.jsx';

const ROLES = ['admin', 'manager', 'agent', 'production'];
const EARNING_ROLES = ['agent', 'manager'];
const MIN_PASSWORD_LENGTH = 8;

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function checkPhone(raw, label) {
  if (!raw || !String(raw).trim()) return '';
  const cleaned = String(raw).replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) return `${label}: digits, spaces and dashes only`;
  if (cleaned.startsWith('+')) {
    return /^[1-9]\d{7,14}$/.test(cleaned.slice(1))
      ? ''
      : `${label}: international numbers look like +14155552671`;
  }
  if (/^0\d{10}$/.test(cleaned) || /^3\d{9}$/.test(cleaned) || /^92\d{10}$/.test(cleaned)) return '';
  return `${label}: Pakistani mobiles are 11 digits (03001234567), or use +country code`;
}

function initialForm(user) {
  return {
    name: user?.name ?? '',
    email: user?.email ?? '',
    password: '',
    role: user?.role ?? 'agent',
    phone: user?.phone ?? '',
    whatsappNumber: user?.whatsappNumber ?? '',
    managerId: user?.managerId != null ? String(user.managerId) : '',
    commissionPercentage:
      user?.commissionPercentage !== undefined && user?.commissionPercentage !== null
        ? String(user.commissionPercentage)
        : '0',
    managerCutPercentage:
      user?.managerCutPercentage !== undefined && user?.managerCutPercentage !== null
        ? String(user.managerCutPercentage)
        : '',
    isActive: user?.isActive ?? true,
  };
}

/**
 * Add / edit a user.
 * Managers get a second tab — Agent commissions — where each team member's
 * manager-cut is set separately (Haseeb: 5% on Amir, 7% on Hamza, …).
 */
export default function UserFormModal({ user, managers, onClose, onSaved }) {
  const { token } = useAuth();
  const isEdit = Boolean(user);

  const [form, setForm] = useState(() => initialForm(user));
  const [tab, setTab] = useState('profile'); // 'profile' | 'agents'
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Per-agent manager cuts when editing a manager: { [agentId]: "5" }
  const [agentCuts, setAgentCuts] = useState({});
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);

  const set = (key) => (eOrValue) => {
    const value = eOrValue?.target
      ? (eOrValue.target.type === 'checkbox' ? eOrValue.target.checked : eOrValue.target.value)
      : eOrValue;
    setForm((f) => ({ ...f, [key]: value }));
    setError('');
  };

  const canEarn = EARNING_ROLES.includes(form.role);
  const isManagerRole = form.role === 'manager';
  const hasManager = Boolean(form.managerId);
  const showAgentTab = isManagerRole && isEdit;

  const loadTeam = useCallback(async () => {
    if (!isEdit || !user?.id || form.role !== 'manager') {
      setTeam([]);
      setAgentCuts({});
      return;
    }
    setTeamLoading(true);
    try {
      const data = await api.getTeam(token, user.id);
      // Belt-and-suspenders: only this manager's agents (API already filters by manager_id).
      const members = (data.team || []).filter(
        (m) => Number(m.managerId) === Number(user.id) && m.role === 'agent'
      );
      setTeam(members);
      const cuts = {};
      for (const m of members) {
        cuts[m.id] = m.managerCutPercentage === null || m.managerCutPercentage === undefined
          ? ''
          : String(m.managerCutPercentage);
      }
      setAgentCuts(cuts);
    } catch (err) {
      setError(err.message);
    } finally {
      setTeamLoading(false);
    }
  }, [token, isEdit, user?.id, form.role]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  // Switching away from manager role drops the agents tab.
  useEffect(() => {
    if (!isManagerRole && tab === 'agents') setTab('profile');
  }, [isManagerRole, tab]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  function validateProfile() {
    const errors = [];

    if (!form.name.trim()) errors.push('Name is required');
    else if (form.name.trim().length < 2) errors.push('Name must be at least 2 characters');

    if (!form.email.trim()) errors.push('Email is required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      errors.push('Enter a valid email address');
    }

    if (!isEdit || form.password) {
      if (!form.password) errors.push('Password is required');
      else if (form.password.length < MIN_PASSWORD_LENGTH) {
        errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      } else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
        errors.push('Password needs at least one letter and one number');
      }
    }

    for (const [field, label] of [['phone', 'Phone'], ['whatsappNumber', 'WhatsApp']]) {
      const msg = checkPhone(form[field], label);
      if (msg) errors.push(msg);
    }

    if (canEarn) {
      const pct = Number(form.commissionPercentage);
      if (form.commissionPercentage === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
        errors.push('Own commission must be between 0 and 100');
      }
      // Agent editing themselves under a manager — single cut field on profile.
      if (!isManagerRole && hasManager && form.managerCutPercentage !== '') {
        const cut = Number(form.managerCutPercentage);
        if (!Number.isFinite(cut) || cut < 0 || cut > 100) {
          errors.push("Manager's cut must be between 0 and 100");
        } else if (pct + cut > 100) {
          errors.push(`Own cut + manager's cut is ${pct + cut}% — that exceeds 100%`);
        }
      }
    }

    return errors;
  }

  function validateAgentCuts() {
    const errors = [];
    for (const member of team) {
      const raw = agentCuts[member.id];
      if (raw === '' || raw === undefined) continue;
      const cut = Number(raw);
      if (!Number.isFinite(cut) || cut < 0 || cut > 100) {
        errors.push(`${member.name}: manager cut must be 0–100`);
        continue;
      }
      const combined = Number(member.commissionPercentage || 0) + cut;
      if (combined > 100) {
        errors.push(`${member.name}: own ${member.commissionPercentage}% + your cut ${cut}% exceeds 100%`);
      }
    }
    return errors;
  }

  async function saveAgentCuts(managerId) {
    const month = currentMonth();
    for (const member of team) {
      const raw = agentCuts[member.id];
      if (raw === '' || raw === undefined) continue;
      const next = Number(raw);
      const prev = member.managerCutPercentage === null || member.managerCutPercentage === undefined
        ? null
        : Number(member.managerCutPercentage);
      if (prev !== null && next === prev) continue;
      await api.setManagerCut(token, {
        managerId,
        agentId: member.id,
        commissionPercentage: next,
        month,
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (tab === 'agents') {
      const cutErrors = validateAgentCuts();
      if (cutErrors.length) return setError(cutErrors.join(' · '));
      setSaving(true);
      setError('');
      try {
        await saveAgentCuts(user.id);
        onSaved(user);
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    const errors = validateProfile();
    if (errors.length) return setError(errors.join(' · '));

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      phone: form.phone || null,
      whatsappNumber: form.whatsappNumber || null,
      managerId: canEarn && form.managerId ? Number(form.managerId) : null,
      isActive: form.isActive,
    };
    if (form.password) payload.password = form.password;
    if (canEarn) {
      payload.commissionPercentage = Number(form.commissionPercentage);
      payload.commissionMonth = currentMonth();
      if (!isManagerRole && hasManager && form.managerCutPercentage !== '') {
        payload.managerCutPercentage = Number(form.managerCutPercentage);
      }
    }

    setSaving(true);
    setError('');
    try {
      const saved = isEdit
        ? await api.updateUser(token, user.id, payload)
        : await api.createUser(token, payload);

      // If we just created a manager, nothing to cut yet. If editing manager and
      // agent cuts were also changed while on profile, they're saved via the agents tab.
      onSaved(saved.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={`modal-card ${showAgentTab ? 'modal-xl' : 'modal-wide'}`} role="dialog" aria-modal="true" aria-labelledby="user-form-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <h3 id="user-form-title">{isEdit ? `Edit ${user.name}` : 'Add user'}</h3>
          <button type="button" className="plain-icon" aria-label="Close user form" onClick={onClose} disabled={saving}>
            <Icon id="i-close" />
          </button>
        </div>
        <p>
          {tab === 'agents'
            ? 'Set your cut on each agent separately — saved month-wise so past reports stay intact'
            : isEdit
              ? 'Leave the password blank to keep the current one'
              : 'They will sign in with this email and password'}
        </p>

        {showAgentTab && (
          <div className="modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`modal-tab ${tab === 'profile' ? 'active' : ''}`}
              aria-selected={tab === 'profile'}
              onClick={() => { setTab('profile'); setError(''); }}
            >
              Profile
            </button>
            <button
              type="button"
              role="tab"
              className={`modal-tab ${tab === 'agents' ? 'active' : ''}`}
              aria-selected={tab === 'agents'}
              onClick={() => { setTab('agents'); setError(''); }}
            >
              Agent commissions
              {team.length > 0 && <span className="modal-tab-count">{team.length}</span>}
            </button>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <form className="modal-form" autoComplete="off" onSubmit={handleSubmit}>
          {tab === 'profile' && (
            <>
              <div className="field-row">
                <label>
                  Full name
                  <input name="portal-user-name" value={form.name} onChange={set('name')} autoComplete="off" autoFocus placeholder="Ali Raza" />
                </label>
                <label>
                  Role
                  <FancySelect
                    fullWidth
                    value={form.role}
                    onChange={set('role')}
                    options={ROLES.map((r) => ({ value: r, label: r }))}
                    placeholder="Select role…"
                    aria-label="Role"
                  />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Login email
                  <input name="portal-user-email" type="email" value={form.email} onChange={set('email')} autoComplete="off" placeholder="ali@company.com" />
                </label>
                <label>
                  Password {isEdit && <span className="field-hint">(optional)</span>}
                  <input
                    type="password"
                    name="portal-new-password"
                    value={form.password}
                    onChange={set('password')}
                    autoComplete="new-password"
                    placeholder={isEdit ? 'Unchanged' : 'Min 8 chars, letter + number'}
                  />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Phone
                  <input value={form.phone} onChange={set('phone')} placeholder="03001234567" />
                </label>
                <label>
                  WhatsApp <span className="field-hint">(alerts go here)</span>
                  <input value={form.whatsappNumber} onChange={set('whatsappNumber')} placeholder="03001234567" />
                </label>
              </div>

              {canEarn ? (
                <>
                  <div className="field-row">
                    {!isManagerRole && (
                      <label>
                        Reports to
                        <FancySelect
                          fullWidth
                          isClearable
                          value={form.managerId}
                          onChange={set('managerId')}
                          placeholder="No manager"
                          aria-label="Reports to"
                          options={managers
                            .filter((m) => m.id !== user?.id)
                            .map((m) => ({ value: String(m.id), label: m.name }))}
                        />
                      </label>
                    )}
                    <label>
                      Own commission %
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.commissionPercentage}
                        onChange={set('commissionPercentage')}
                        placeholder="0"
                      />
                      <span className="field-hint">
                        {isManagerRole
                          ? 'What this manager earns on deals they book themselves'
                          : 'What this person earns on their own work'}
                      </span>
                    </label>
                  </div>

                  {/* Agent under a manager: single cut on profile. Managers use the Agents tab. */}
                  {!isManagerRole && hasManager && (
                    <label>
                      Manager&apos;s cut on this person %
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.managerCutPercentage}
                        onChange={set('managerCutPercentage')}
                        placeholder="e.g. 5"
                      />
                      <span className="field-hint">
                        What their manager earns specifically on them
                      </span>
                    </label>
                  )}

                  {isManagerRole && !isEdit && (
                    <p className="field-note">
                      After you save this manager, open <strong>Edit</strong> again and use the
                      <strong> Agent commissions</strong> tab to set a different cut on each agent.
                    </p>
                  )}
                </>
              ) : (
                <p className="field-note">
                  <strong>{form.role}</strong> users do not earn commission and are not assigned to a manager.
                </p>
              )}

              {isEdit && (
                <label className="checkbox-row">
                  <input type="checkbox" checked={form.isActive} onChange={set('isActive')} />
                  <span>Active — inactive users cannot sign in</span>
                </label>
              )}
            </>
          )}

          {tab === 'agents' && (
            <div className="agent-cut-panel">
              {teamLoading ? (
                <p className="muted">Loading team…</p>
              ) : team.length === 0 ? (
                <p className="field-note">
                  No agents are assigned to {user?.name || 'this manager'} yet.
                  Open an agent&apos;s <strong>Edit</strong> and set <strong>Reports to</strong> → {user?.name || 'this manager'}.
                </p>
              ) : (
                <>
                  <p className="field-hint" style={{ marginBottom: 8 }}>
                    Showing only agents whose <strong>Reports to</strong> is {user?.name} ({team.length}).
                    Your cut on each can differ — e.g. 5% on one, 7% on another.
                  </p>
                  <div className="commission-scroll">
                    <table className="attendance-table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          <th className="num-cell">Their own cut</th>
                          <th className="num-cell">Your cut on them</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.map((member) => (
                          <tr key={member.id}>
                            <td>
                              <div className="agent-cell">
                                <div>
                                  <strong>{member.name}</strong>
                                  <span>{member.email}</span>
                                </div>
                              </div>
                            </td>
                            <td className="num-cell">{Number(member.commissionPercentage)}%</td>
                            <td className="num-cell">
                              <input
                                className="rate-input"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={agentCuts[member.id] ?? ''}
                                placeholder="0"
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setAgentCuts((prev) => ({ ...prev, [member.id]: value }));
                                  setError('');
                                }}
                              />
                              <span className="rate-suffix">%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="tool-btn primary-btn" disabled={saving}>
              {saving
                ? 'Saving…'
                : tab === 'agents'
                  ? 'Save agent commissions'
                  : isEdit
                    ? 'Save changes'
                    : 'Add user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
