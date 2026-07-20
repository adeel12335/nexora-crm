import { useEffect, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import BoardAlertModal from './BoardAlertModal.jsx';
import {
  PRIORITY_OPTIONS,
  fromDateInputValue,
  toDateInputValue,
  validateCardForm,
} from '../../utils/boardValidation.js';
import { computeDueDate } from '../../utils/deadlineUtils.js';

function blankForm(defaultStage, assignees) {
  const due = computeDueDate('draft', new Date());
  return {
    title: '',
    client: '',
    type: 'draft',
    stage: defaultStage,
    assigneeId: assignees[0]?.id ?? '',
    priority: 'none',
    description: '',
    dueDate: toDateInputValue(due.toISOString()),
  };
}

export default function NewCardModal({ open, stages, assignees = [], defaultStage, onClose, onCreate }) {
  const [form, setForm] = useState(() => blankForm(defaultStage, assignees));
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (open) setForm(blankForm(defaultStage, assignees));
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

  function handleSubmit(e) {
    e.preventDefault();
    if (!assignees.length) {
      setAlert({ title: 'No assignees', errors: ['Add users (agent/production) before creating cards.'], tone: 'error' });
      return;
    }
    const assignee = assignees.find((a) => a.id === Number(form.assigneeId)) || assignees[0];
    const payload = {
      ...form,
      assignee,
      dueDate: fromDateInputValue(form.dueDate),
    };
    const errors = validateCardForm(payload);
    if (errors.length) {
      setAlert({ title: 'Fix these fields', errors, tone: 'error' });
      return;
    }
    onCreate(payload);
    setForm(blankForm(defaultStage, assignees));
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
              Client
              <input
                value={form.client}
                onChange={(e) => update('client', e.target.value)}
                placeholder="e.g. Northstar Labs"
                maxLength={80}
              />
            </label>

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
                <select value={form.type} onChange={(e) => update('type', e.target.value)}>
                  <option value="draft">New Draft (4-day default)</option>
                  <option value="revision">Revision (2-day default)</option>
                </select>
              </label>
              <label>
                Stage
                <select value={form.stage} onChange={(e) => update('stage', e.target.value)}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-grid">
              <label>
                Assignee
                <select value={form.assigneeId} onChange={(e) => update('assigneeId', e.target.value)}>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select value={form.priority} onChange={(e) => update('priority', e.target.value)}>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
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

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary-btn">Create Card</button>
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
