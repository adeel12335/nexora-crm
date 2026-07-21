import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import FancySelect from '../filters/FancySelect.jsx';
import BoardAlertModal from './BoardAlertModal.jsx';
import {
  PRIORITY_OPTIONS,
  formatFileSize,
  fromDateInputValue,
  toDateInputValue,
  validateCardForm,
  validateFiles,
} from '../../utils/boardValidation.js';
import { computeDueDate } from '../../utils/deadlineUtils.js';

function blankForm(defaultStage, assignees) {
  const due = computeDueDate('draft', new Date());
  return {
    title: '',
    client: '',
    clientId: '',
    type: 'draft',
    stage: defaultStage,
    assigneeId: assignees[0]?.id ?? '',
    priority: 'none',
    description: '',
    liveUrl: '',
    dueDate: toDateInputValue(due.toISOString()),
  };
}

export default function NewCardModal({ open, stages, assignees = [], crmClients = [], defaultStage, onClose, onCreate }) {
  const fileInputRef = useRef(null);
  const [form, setForm] = useState(() => blankForm(defaultStage, assignees));
  const [pendingFiles, setPendingFiles] = useState([]);
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(blankForm(defaultStage, assignees));
      setPendingFiles([]);
      setSubmitting(false);
    }
  }, [open, defaultStage, assignees]);

  if (!open) return null;

  function update(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'type') {
        const due = computeDueDate(value, new Date());
        next.dueDate = toDateInputValue(due.toISOString());
      }
      return next;
    });
  }

  function handleFilePick(e) {
    const picked = e.target.files;
    const existingBytes = pendingFiles.reduce((sum, item) => sum + Number(item.file.size || 0), 0);
    const { ok, errors } = validateFiles(picked, pendingFiles.length, existingBytes);
    if (!ok.length) {
      setAlert({ title: 'Upload blocked', errors, tone: 'error' });
      e.target.value = '';
      return;
    }
    if (errors.length) {
      setAlert({ title: 'Some files skipped', errors, tone: 'warn' });
    }
    if (ok.length) {
      setPendingFiles((prev) => [
        ...prev,
        ...ok.map((file) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
        })),
      ]);
    }
    e.target.value = '';
  }

  function removePendingFile(key) {
    setPendingFiles((prev) => prev.filter((item) => item.key !== key));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (!assignees.length) {
      setAlert({ title: 'No assignees', errors: ['Add users (agent/production) before creating cards.'], tone: 'error' });
      return;
    }
    const assignee = assignees.find((a) => a.id === Number(form.assigneeId)) || assignees[0];
    const selectedClient = crmClients.find((c) => String(c.id) === String(form.clientId));
    const payload = {
      ...form,
      client: selectedClient?.name || form.client,
      clientId: form.clientId || null,
      assignee,
      dueDate: fromDateInputValue(form.dueDate),
    };
    const errors = validateCardForm(payload, { requireCrmClient: crmClients.length > 0 });
    if (errors.length) {
      setAlert({ title: 'Fix these fields', errors, tone: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        ...payload,
        files: pendingFiles.map((item) => item.file),
      });
      setForm(blankForm(defaultStage, assignees));
      setPendingFiles([]);
    } catch {
      // Keep form data — parent already toasted the error
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal modal-wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-card-title"
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleSubmit} noValidate>
            <div className="modal-head">
              <div>
                <span>Create a new production card</span>
                <h2 id="new-card-title">New Card</h2>
              </div>
              <button type="button" className="plain-icon" aria-label="Close" onClick={onClose}>
                <Icon id="i-close" />
              </button>
            </div>

            <label>
              Card title
              <input
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="e.g. Homepage redesign draft"
                maxLength={120}
                autoFocus
              />
            </label>

            <label>
              Client {crmClients.length ? <span className="field-hint">(required)</span> : null}
              {crmClients.length ? (
                <FancySelect
                  fullWidth
                  isClearable
                  value={form.clientId}
                  onChange={(clientId) => {
                    const selected = crmClients.find((c) => String(c.id) === String(clientId));
                    setForm((f) => ({
                      ...f,
                      clientId: clientId || '',
                      client: selected?.name || '',
                    }));
                  }}
                  placeholder="Search and select a CRM client…"
                  options={crmClients.map((c) => ({
                    value: String(c.id),
                    label: c.agentName ? `${c.name} · ${c.agentName}` : c.name,
                  }))}
                />
              ) : (
                <input
                  value={form.client}
                  onChange={(e) => update('client', e.target.value)}
                  placeholder="e.g. Northstar Labs"
                  maxLength={80}
                  required
                />
              )}
            </label>
            {crmClients.length && !form.clientId ? (
              <p className="muted-hint">Pick a client from Clients — cards must link to a CRM client.</p>
            ) : null}

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Brief scope, links, or delivery notes…"
                maxLength={2000}
              />
            </label>

            <div className="form-grid">
              <label>
                Type
                <FancySelect
                  fullWidth
                  value={form.type}
                  onChange={(v) => update('type', v)}
                  options={[
                    { value: 'draft', label: 'New Draft (4-day default)' },
                    { value: 'revision', label: 'Revision (2-day default)' },
                  ]}
                />
              </label>
              <label>
                Stage
                <FancySelect
                  fullWidth
                  value={form.stage}
                  onChange={(v) => update('stage', v)}
                  options={stages.map((s) => ({ value: s.id, label: s.title }))}
                />
              </label>
            </div>

            <label>
              Live link {form.stage === 'live' ? <span className="field-hint">(required for Live)</span> : <span className="field-hint">(optional)</span>}
              <input
                type="url"
                value={form.liveUrl}
                onChange={(e) => update('liveUrl', e.target.value)}
                placeholder="https://client-site.com"
              />
            </label>

            <div className="form-grid">
              <label>
                Assignee
                <FancySelect
                  fullWidth
                  value={form.assigneeId}
                  onChange={(v) => update('assigneeId', v)}
                  placeholder="Search assignee…"
                  options={assignees.map((a) => ({ value: String(a.id), label: a.name }))}
                />
              </label>
              <label>
                Priority
                <FancySelect
                  fullWidth
                  value={form.priority}
                  onChange={(v) => update('priority', v)}
                  options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                />
              </label>
            </div>

            <label>
              Due date
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => update('dueDate', e.target.value)}
              />
            </label>

            <div className="new-card-files">
              <span className="new-card-files-label">Attachments</span>
              <div
                className="upload-dropzone"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                role="button"
                tabIndex={0}
              >
                <Icon id="i-paperclip" />
                <strong>Click to upload files</strong>
                <span>Max 10 files · 5 MB each · 8 MB total · images, docs, video, zip</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFilePick}
                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp4,.mov,.webm"
              />
              {pendingFiles.length ? (
                <ul className="file-list">
                  {pendingFiles.map((item) => (
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
                          onClick={() => removePendingFile(item.key)}
                        >
                          <Icon id="i-close" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-hint">Optional — you can also add files after creating the card.</p>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={onClose} disabled={submitting}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Card'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <BoardAlertModal
        open={Boolean(alert)}
        title={alert?.title}
        errors={alert?.errors || []}
        tone={alert?.tone || 'error'}
        confirmLabel="Got it"
        onConfirm={() => setAlert(null)}
        onCancel={() => setAlert(null)}
      />
    </>
  );
}
