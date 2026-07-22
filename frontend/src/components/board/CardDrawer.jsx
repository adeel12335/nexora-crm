import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
import FancySelect from '../filters/FancySelect.jsx';
import { DayFilter } from '../filters/MonthFilter.jsx';
import { getDeadlineInfo } from '../../utils/deadlineUtils.js';
import BoardAlertModal from './BoardAlertModal.jsx';
import {
  FEEDBACK_STATUS,
  PRIORITY_OPTIONS,
  formatFileSize,
  fromDateInputValue,
  isHighPriority,
  priorityLabel,
  toDateInputValue,
  validateCardForm,
  validateComment,
  validateFeedback,
  validateFiles,
} from '../../utils/boardValidation.js';

const TABS = [
  { id: 'details', label: 'Edit', icon: 'i-settings' },
  { id: 'files', label: 'Files', icon: 'i-paperclip' },
  { id: 'comments', label: 'Comments', icon: 'i-message' },
  { id: 'feedback', label: 'Feedback', icon: 'i-star' },
];

export default function CardDrawer({
  card,
  stage,
  open,
  onClose,
  activity,
  comments,
  onAddComment,
  onUpdateCard,
  onDeleteCard,
  onUploadFiles,
  onRemoveFile,
  onSaveFeedback,
  stages,
  assignees = [],
  crmClients = [],
  onMove,
}) {
  const fileInputRef = useRef(null);
  const commentInputRef = useRef(null);
  const [tab, setTab] = useState('details');
  const [comment, setComment] = useState('');
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteCard, setConfirmDeleteCard] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [edit, setEdit] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!card) return;
    setTab('details');
    setComment('');
    setDirty(false);
    setConfirmDeleteCard(false);
    setDeleting(false);
    setEdit({
      title: card.title,
      client: card.client,
      clientId: card.clientId ? String(card.clientId) : '',
      description: card.description || '',
      assigneeId: card.assignee.id,
      priority: card.priority || 'none',
      dueDate: toDateInputValue(card.dueDate),
      type: card.type,
      liveUrl: card.liveUrl || '',
    });
    setFeedbackForm({
      status: card.feedback?.status || 'none',
      note: card.feedback?.note || '',
      rating: card.feedback?.rating ?? '',
    });
  }, [card?.id, open]);

  useEffect(() => {
    if (tab === 'comments' && open) {
      const t = setTimeout(() => commentInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [tab, open]);

  if (!card || !open || !edit) return null;

  const deadline = getDeadlineInfo(card.dueDate);
  const files = card.fileList || [];
  const commentList = comments || [];
  const feedback = card.feedback || { status: 'none' };

  function showErrors(title, errors, tone = 'error') {
    setAlert({ title, errors, tone });
  }

  function updateEdit(field, value) {
    setEdit((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  function goTab(next) {
    setTab(next);
  }

  async function handleSaveDetails(e) {
    e?.preventDefault?.();
    const people = assignees.length ? assignees : (card.assignee ? [card.assignee] : []);
    const assignee = people.find((a) => a.id === Number(edit.assigneeId)) || card.assignee;
    const selectedClient = crmClients.find((c) => String(c.id) === String(edit.clientId));
    const payload = {
      title: edit.title,
      client: selectedClient?.name || edit.client,
      clientId: edit.clientId || null,
      description: edit.description,
      type: edit.type,
      stage: card.stage,
      assignee,
      priority: edit.priority,
      dueDate: fromDateInputValue(edit.dueDate),
      liveUrl: edit.liveUrl,
    };
    const errors = validateCardForm(payload, {
      allowPastDue: true,
      requireCrmClient: crmClients.length > 0,
    });
    if (errors.length) {
      showErrors('Cannot save card', errors);
      return;
    }
    const ok = await onUpdateCard(card.id, {
      title: payload.title.trim(),
      client: payload.client.trim(),
      clientId: payload.clientId ? Number(payload.clientId) : null,
      description: String(payload.description || '').trim(),
      type: payload.type,
      assignee,
      priority: payload.priority,
      dueDate: payload.dueDate,
      liveUrl: String(payload.liveUrl || '').trim(),
    });
    if (ok) {
      setDirty(false);
      showErrors('Saved', ['Card details updated.'], 'success');
    }
  }

  function handleCommentSubmit(e) {
    e.preventDefault();
    const err = validateComment(comment);
    if (err) {
      showErrors('Comment not added', [err]);
      return;
    }
    onAddComment(comment.trim());
    setComment('');
  }

  function handleFilePick(e) {
    const picked = e.target.files;
    const existingBytes = files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    const { ok, errors } = validateFiles(picked, files.length, existingBytes);
    if (!ok.length) {
      showErrors('Upload blocked', errors);
      e.target.value = '';
      return;
    }
    if (errors.length) showErrors('Some files skipped', errors, 'warn');
    if (ok.length) onUploadFiles(card.id, ok);
    e.target.value = '';
  }

  async function handleFeedbackSave(e) {
    e.preventDefault();
    const errors = validateFeedback(feedbackForm);
    if (errors.length) {
      showErrors('Feedback incomplete', errors);
      return;
    }
    const ok = await onSaveFeedback(card.id, {
      status: feedbackForm.status,
      note: String(feedbackForm.note || '').trim(),
      rating: feedbackForm.rating === '' ? null : Number(feedbackForm.rating),
      updatedAt: new Date().toISOString(),
      author: 'You',
    });
    if (ok) showErrors('Feedback saved', ['Client feedback has been updated.'], 'success');
  }

  return (
    <>
      <aside className="detail-panel open" aria-label="Card details">
        <header className="detail-header">
          <div className="detail-top">
            <div className="tag-row">
              <span className="tag tag-blue">{stage?.title}</span>
              <span className={`tag ${card.type === 'revision' ? 'tag-orange' : 'tag-blue'}`}>
                {card.type === 'draft' ? 'Draft' : 'Revision'}
              </span>
              {edit.priority !== 'none' && (
                <span className={`tag ${isHighPriority(edit.priority) ? 'tag-red' : 'tag-orange'}`}>
                  {priorityLabel(edit.priority)}
                </span>
              )}
              {card.stage === 'live' && <span className="tag tag-live">Live</span>}
            </div>
            <button type="button" className="plain-icon" aria-label="Close details" onClick={onClose}>
              <Icon id="i-close" />
            </button>
          </div>

          <h2>{card.title}</h2>
          <span className="detail-sub">{card.client}</span>
          {card.clientAgentName ? (
            <span className="detail-owner">Client of {card.clientAgentName}</span>
          ) : null}
          {card.stage === 'live' && card.liveUrl ? (
            <a className="live-link-chip" href={card.liveUrl} target="_blank" rel="noreferrer">
              <Icon id="i-link" /> Open live site
            </a>
          ) : null}

          <div className="detail-facts">
            <button type="button" className="detail-fact" onClick={() => goTab('details')}>
              <Icon id="i-users" />
              <div><span>Assignee</span><strong>{card.assignee.name}</strong></div>
            </button>
            <button type="button" className="detail-fact" onClick={() => goTab('details')}>
              <Icon id="i-calendar" />
              <div><span>Due</span><strong>{deadline.label}</strong></div>
            </button>
            <button type="button" className="detail-fact" onClick={() => goTab('files')}>
              <Icon id="i-paperclip" />
              <div><span>Files</span><strong>{files.length} · open</strong></div>
            </button>
            <button type="button" className="detail-fact" onClick={() => goTab('comments')}>
              <Icon id="i-message" />
              <div><span>Comments</span><strong>{commentList.length} · open</strong></div>
            </button>
          </div>

          <nav className="detail-tabs" role="tablist" aria-label="Card sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'active' : ''}
                onClick={() => goTab(item.id)}
              >
                <Icon id={item.icon} />
                <span>
                  {item.label}
                  {item.id === 'files' && files.length ? ` (${files.length})` : ''}
                  {item.id === 'comments' && commentList.length ? ` (${commentList.length})` : ''}
                </span>
              </button>
            ))}
          </nav>
        </header>

        <div className="detail-body">
          {tab === 'details' && (
            <form className="detail-form" id="card-edit-form" onSubmit={handleSaveDetails} noValidate>
              <p className="detail-hint">Edit fields below, then press <strong>Save changes</strong>.</p>
              <label>
                Title
                <input
                  value={edit.title}
                  onChange={(e) => updateEdit('title', e.target.value)}
                  maxLength={120}
                />
              </label>
              <label>
                Client {crmClients.length ? <span className="field-hint">(required)</span> : null}
                {crmClients.length ? (
                  <FancySelect
                    fullWidth
                    isClearable
                    value={edit.clientId}
                    onChange={(clientId) => {
                      const selected = crmClients.find((c) => String(c.id) === String(clientId));
                      setEdit((f) => ({
                        ...f,
                        clientId: clientId || '',
                        client: selected?.name || '',
                      }));
                      setDirty(true);
                    }}
                    placeholder="Search and select a CRM client…"
                    options={crmClients.map((c) => ({
                      value: String(c.id),
                      label: c.agentName ? `${c.name} · ${c.agentName}` : c.name,
                    }))}
                  />
                ) : (
                  <input
                    value={edit.client}
                    onChange={(e) => updateEdit('client', e.target.value)}
                    maxLength={80}
                  />
                )}
              </label>
              {crmClients.length && !edit.clientId ? (
                <p className="muted-hint">Select a client from the CRM list to save.</p>
              ) : null}
              <label>
                Description
                <textarea
                  value={edit.description}
                  onChange={(e) => updateEdit('description', e.target.value)}
                  maxLength={2000}
                  rows={4}
                />
              </label>
              <label>
                Live link {card.stage === 'live' ? <span className="field-hint">(required)</span> : <span className="field-hint">(for Live / portfolio)</span>}
                <input
                  type="url"
                  value={edit.liveUrl}
                  onChange={(e) => updateEdit('liveUrl', e.target.value)}
                  placeholder="https://client-site.com"
                />
              </label>
              <div className="form-grid">
                <label>
                  Type
                  <FancySelect
                    fullWidth
                    value={edit.type}
                    onChange={(v) => updateEdit('type', v)}
                    options={[
                      { value: 'draft', label: 'Draft' },
                      { value: 'revision', label: 'Revision' },
                    ]}
                  />
                </label>
                <label>
                  Priority
                  <FancySelect
                    fullWidth
                    value={edit.priority}
                    onChange={(v) => updateEdit('priority', v)}
                    options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Assignee
                  <FancySelect
                    fullWidth
                    value={edit.assigneeId}
                    onChange={(v) => updateEdit('assigneeId', v)}
                    placeholder="Search production user…"
                    options={(() => {
                      const people = assignees.length ? [...assignees] : [];
                      if (card.assignee && !people.some((a) => Number(a.id) === Number(card.assignee.id))) {
                        people.unshift(card.assignee);
                      }
                      return people.map((a) => ({
                        value: String(a.id),
                        label: a.name,
                      }));
                    })()}
                  />
                </label>
                <label>
                  Due date
                  <DayFilter
                    value={edit.dueDate}
                    onChange={(dueDate) => updateEdit('dueDate', dueDate)}
                    placeholder="Select due date"
                    allowFuture
                    clearable={false}
                    className="month-filter--form"
                  />
                </label>
              </div>
              <label>
                Move to stage
                <FancySelect
                  fullWidth
                  value={card.stage}
                  onChange={onMove}
                  options={stages.map((item) => ({ value: item.id, label: item.title }))}
                />
              </label>
            </form>
          )}

          {tab === 'files' && (
            <section className="detail-section">
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
              {files.length ? (
                <ul className="file-list">
                  {files.map((file) => (
                    <li key={file.id} className="file-row">
                      <div className="file-icon"><Icon id="i-paperclip" /></div>
                      <div className="file-meta">
                        <strong>{file.name}</strong>
                        <span>{formatFileSize(file.size || 0)}</span>
                      </div>
                      <div className="file-actions">
                        {file.url ? (
                          <a className="tool-btn" href={file.url} download={file.name} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="plain-icon"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => setConfirmDelete(file)}
                        >
                          <Icon id="i-close" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state">No files yet</div>
              )}
            </section>
          )}

          {tab === 'comments' && (
            <section className="detail-section activity-section">
              <p className="detail-hint">Type below and press send to add a comment.</p>
              {commentList.length || activity.length ? (
                <div className="comment-feed">
                  {commentList.map((entry) => (
                    <div className="activity is-comment" key={entry.id}>
                      <img src={entry.avatar} alt="" />
                      <div>
                        <p><strong>{entry.author}</strong></p>
                        <p className="comment-text">{entry.text}</p>
                      </div>
                      <time>{entry.time}</time>
                    </div>
                  ))}
                  {activity.map((entry) => (
                    <div className="activity" key={entry.id}>
                      <img src={entry.avatar} alt="" />
                      <p><strong>{entry.author}</strong> {entry.text}</p>
                      <time>{entry.time}</time>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">No comments yet — be the first</div>
              )}
            </section>
          )}

          {tab === 'feedback' && feedbackForm && (
            <form className="detail-form" id="card-feedback-form" onSubmit={handleFeedbackSave} noValidate>
              <p className="detail-hint">Set client review status, then save feedback.</p>
              <label>
                Status
                <FancySelect
                  fullWidth
                  value={feedbackForm.status}
                  onChange={(status) => setFeedbackForm((f) => ({ ...f, status }))}
                  options={FEEDBACK_STATUS.map((s) => ({ value: s.value, label: s.label }))}
                />
              </label>
              <label>
                Rating (optional)
                <FancySelect
                  fullWidth
                  isClearable
                  value={feedbackForm.rating}
                  onChange={(rating) => setFeedbackForm((f) => ({ ...f, rating }))}
                  placeholder="No rating"
                  options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} / 5` }))}
                />
              </label>
              <label>
                Feedback note
                <textarea
                  value={feedbackForm.note}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="What did the client say?"
                  maxLength={1000}
                  rows={4}
                />
              </label>
              {feedback.updatedAt && (
                <p className="muted-hint">
                  Last updated by {feedback.author || '—'} · {new Date(feedback.updatedAt).toLocaleString()}
                </p>
              )}
            </form>
          )}
        </div>

        <footer className="detail-footer">
          {tab === 'details' && (
            <div className="detail-footer-actions">
              <button
                type="button"
                className="secondary-btn detail-delete-btn"
                onClick={() => setConfirmDeleteCard(true)}
                disabled={deleting}
              >
                Delete card
              </button>
              <button
                type="submit"
                form="card-edit-form"
                className="primary-btn detail-save-btn"
                disabled={!dirty || deleting}
              >
                {dirty ? 'Save changes' : 'No changes yet'}
              </button>
            </div>
          )}
          {tab === 'comments' && (
            <form className="comment-box" onSubmit={handleCommentSubmit} noValidate>
              <input
                ref={commentInputRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment…"
                aria-label="Add a comment"
                maxLength={1000}
              />
              <button type="submit" className="primary-btn comment-send" disabled={!comment.trim()}>
                Send
              </button>
            </form>
          )}
          {tab === 'files' && (
            <button type="button" className="primary-btn detail-save-btn" onClick={() => fileInputRef.current?.click()}>
              Upload file
            </button>
          )}
          {tab === 'feedback' && (
            <button type="submit" form="card-feedback-form" className="primary-btn detail-save-btn">
              Save feedback
            </button>
          )}
        </footer>
      </aside>

      <BoardAlertModal
        open={Boolean(alert)}
        title={alert?.title}
        errors={alert?.errors || []}
        tone={alert?.tone || 'error'}
        confirmLabel="OK"
        onConfirm={() => setAlert(null)}
        onCancel={() => setAlert(null)}
      />

      <BoardAlertModal
        open={Boolean(confirmDelete)}
        title="Remove attachment?"
        message={confirmDelete ? `"${confirmDelete.name}" will be removed from this card.` : ''}
        tone="warn"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (confirmDelete) onRemoveFile(card.id, confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      <BoardAlertModal
        open={confirmDeleteCard}
        title="Delete this card?"
        message={`"${card.title}" will be permanently removed from the production board.`}
        tone="warn"
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (!onDeleteCard || deleting) return;
          setDeleting(true);
          try {
            const ok = await onDeleteCard(card.id);
            if (ok) setConfirmDeleteCard(false);
          } finally {
            setDeleting(false);
          }
        }}
        onCancel={() => {
          if (!deleting) setConfirmDeleteCard(false);
        }}
      />
    </>
  );
}
