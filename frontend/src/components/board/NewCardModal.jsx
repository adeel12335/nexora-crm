import { useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import { agents } from '../../data/mockData.js';

export default function NewCardModal({ open, stages, defaultStage, onClose, onCreate }) {
  const [form, setForm] = useState({ title: '', client: '', type: 'draft', stage: defaultStage, assigneeId: agents[0].id, priority: false });

  if (!open) return null;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.client.trim()) return;
    const assignee = agents.find((a) => a.id === Number(form.assigneeId)) || agents[0];
    onCreate({ ...form, assignee });
    setForm({ title: '', client: '', type: 'draft', stage: defaultStage, assigneeId: agents[0].id, priority: false });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-head">
            <div><span>Create a new production card</span><h2>New Card</h2></div>
            <button type="button" className="plain-icon" aria-label="Close" onClick={onClose}><Icon id="i-close" /></button>
          </div>
          <label>Card title
            <input value={form.title} onChange={(e) => update('title', e.target.value)} required placeholder="e.g. Homepage redesign draft" />
          </label>
          <label>Client
            <input value={form.client} onChange={(e) => update('client', e.target.value)} required placeholder="e.g. Northstar Labs" />
          </label>
          <div className="form-grid">
            <label>Type
              <select value={form.type} onChange={(e) => update('type', e.target.value)}>
                <option value="draft">New Draft (4-day limit)</option>
                <option value="revision">Revision (2-day limit)</option>
              </select>
            </label>
            <label>Stage
              <select value={form.stage} onChange={(e) => update('stage', e.target.value)}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
          </div>
          <label>Assignee
            <select value={form.assigneeId} onChange={(e) => update('assigneeId', e.target.value)}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.priority} onChange={(e) => update('priority', e.target.checked)} /> Mark as high priority
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-btn">Create Card</button>
          </div>
        </form>
      </div>
    </div>
  );
}
