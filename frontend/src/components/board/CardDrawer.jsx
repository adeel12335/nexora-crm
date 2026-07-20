import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../icons/IconSprite.jsx';
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
  onUploadFiles,
  onRemoveFile,
  onSaveFeedback,
  stages,
  assignees = [],
  onMove,
}) {
  const fileInputRef = useRef(null);
  const commentInputRef = useRef(null);
  const [tab, setTab] = useState('details');
  const [comment, setComment] = useState('');
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [edit, setEdit] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!card) return;
    setTab('details');
    setComment('');
    setDirty(false);
    setEdit({
      title: card.title,
      client: card.client,
      description: card.description || '',
      assigneeId: card.assignee.id,
      priority: card.priority || 'none',
      dueDate: toDateInputValue(card.dueDate),
      type: card.type,
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

  function handleSaveDetails(e) {
    e?.preventDefault?.();
    const people = assignees.length ? assignees : (card.assignee ? [card.assignee] : []);
    const assignee = people.find((a) => a.id === Number(edit.assigneeId)) || card.assignee;
    const payload = {
      title: edit.title,
      client: edit.client,
      description: edit.description,
      type: edit.type,
      stage: card.stage,
      assignee,
      priority: edit.priority,
      dueDate: fromDateInputValue(edit.dueDate),
    };
    const errors = validateCardForm(payload, { allowPastDue: true });
    if (errors.length) {
      showErrors('Cannot save card', errors);
      return;
    }
    onUpdateCard(card.id, {
      title: payload.title.trim(),
      client: payload.client.trim(),
      description: String(payload.description || '').trim(),
      type: payload.type,
      assignee,
      priority: payload.priority,
      dueDate: payload.dueDate,
    });
    setDirty(false);
    showErrors('Saved', ['Card details updated.'], 'success');
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
    const { ok, errors } = validateFiles(picked, files.length);
    if (errors.length && !ok.length) {
      showErrors('Upload blocked', errors);
      e.target.value = '';
      return;
    }
    if (errors.length) showErrors('Some files skipped', errors, 'warn');
    if (ok.length) onUploadFiles(card.id, ok);
    e.target.value = '';
  }

  function handleFeedbackSave(e) {
    e.preventDefault();
    const errors = validateFeedback(feedbackForm);
    if (errors.length) {
      showErrors('Feedback incomplete', errors);
      return;
    }
    onSaveFeedback(card.id, {
      status: feedbackForm.status,
      note: String(feedbackForm.note || '').trim(),
      rating: feedbackForm.rating === '' ? null : Number(feedbackForm.rating),
      updatedAt: new Date().toISOString(),
      author: 'You',
    });
    showErrors('Feedback saved', ['Client feedback has been updated.'], 'success');
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
                Client
                <input
                  value={edit.client}
                  onChange={(e) => updateEdit('client', e.target.value)}
                  maxLength={80}
                />
              </label>
              <label>
                Description
                <textarea
                  value={edit.description}
                  onChange={(e) => updateEdit('description', e.target.value)}
                  maxLength={2000}
                  rows={4}
                />
              </label>
              <div className="form-grid">
                <label>
                  Type
                  <select value={edit.type} onChange={(e) => updateEdit('type', e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="revision">Revision</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select value={edit.priority} onChange={(e) => updateEdit('priority', e.target.value)}>
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Assignee
                <select value={edit.assigneeId} onChange={(e) => updateEdit('assigneeId', e.target.value)}>
                  {(assignees.length ? assignees : (card.assignee ? [card.assignee] : [])).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={edit.dueDate}
                    onChange={(e) => updateEdit('dueDate', e.target.value)}
                  />
                </label>
              </div>
              <label>
                Move to stage
                <select className="stage-select" value={card.stage} onChange={(e) => onMove(e.target.value)}>
                  {stages.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
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
                <span>Max 10 files · 10 MB each · images, docs, video, zip</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFilePick}
                accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp4,.mov,.webm"
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
                <select
                  value={feedbackForm.status}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {FEEDBACK_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Rating (optional)
                <select
                  value={feedbackForm.rating}
                  onChange={(e) => setFeedbackForm((f) => ({ ...f, rating: e.target.value }))}
                >
                  <option value="">No rating</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} / 5</option>
                  ))}
                </select>
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
            <button
              type="submit"
              form="card-edit-form"
              className="primary-btn detail-save-btn"
              disabled={!dirty}
            >
              {dirty ? 'Save changes' : 'No changes yet'}
            </button>
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
    </>
  );
}
