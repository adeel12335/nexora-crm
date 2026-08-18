import { useEffect, useMemo, useRef, useState } from 'react';
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
  toDateInputValue,
  validateCardForm,
  validateComment,
  validateDelivery,
  validateDeliveryFeedback,
  validateFeedback,
  validateFiles,
  MAX_DELIVERIES_PER_CARD,
  MAX_FILES_PER_DELIVERY,
  MAX_FILES_PER_COMMENT,
} from '../../utils/boardValidation.js';
import { requiresLiveLink, isLiveLikeStage } from '../../data/productionStages.js';
import { resolveMediaUrl } from '../../api/client.js';

const AVATAR_COLORS = ['#E07A3D', '#C45C26', '#7B5EA7', '#3D8B8B', '#C65A79', '#4E9A6A', '#2F6FED', '#B45309'];
const DESC_COLLAPSE_AT = 280;
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

function isImageFile(file) {
  if (String(file?.type || '').startsWith('image/')) return true;
  return IMAGE_EXT.has(String(file?.name || '').split('.').pop()?.toLowerCase() || '');
}

/** Comments may only be edited / deleted by their author; admins may do both. */
function ownsComment(entry, user) {
  if (!entry || !user) return false;
  if (user.role === 'admin') return true;
  const ownerId = Number(entry.authorId);
  if (Number.isInteger(ownerId) && ownerId > 0) return ownerId === Number(user.id);
  // Legacy comments predate authorId — fall back to the stored display name.
  const author = String(entry.author || '').trim().toLowerCase();
  return Boolean(author) && author === String(user.name || '').trim().toLowerCase();
}

function deliveryFeedbackLabel(status) {
  return FEEDBACK_STATUS.find((s) => s.value === status)?.label || 'No feedback yet';
}

function deliveryFeedbackPillClass(status) {
  if (status === 'approved') return 'is-approved';
  if (status === 'changes_requested') return 'is-changes';
  if (status === 'pending') return 'is-pending';
  return '';
}

function deliveryAttachmentList(item) {
  if (Array.isArray(item?.files) && item.files.length) return item.files;
  if (item?.fileUrl || item?.name) {
    return [{
      id: item.id,
      name: item.name,
      size: item.size,
      type: item.type,
      fileUrl: item.fileUrl,
    }];
  }
  return [];
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function colorFor(name) {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatStamp(value, fallback = '') {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fileKind(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  const map = {
    pdf: { label: 'PDF', tone: 'red' },
    doc: { label: 'DOC', tone: 'blue' },
    docx: { label: 'DOCX', tone: 'blue' },
    xls: { label: 'XLS', tone: 'green' },
    xlsx: { label: 'XLSX', tone: 'green' },
    ppt: { label: 'PPT', tone: 'orange' },
    pptx: { label: 'PPTX', tone: 'orange' },
    png: { label: 'PNG', tone: 'purple' },
    jpg: { label: 'JPG', tone: 'purple' },
    jpeg: { label: 'JPEG', tone: 'purple' },
    gif: { label: 'GIF', tone: 'purple' },
    webp: { label: 'WEBP', tone: 'purple' },
    zip: { label: 'ZIP', tone: 'orange' },
    rar: { label: 'RAR', tone: 'orange' },
    mp4: { label: 'MP4', tone: 'purple' },
    mov: { label: 'MOV', tone: 'purple' },
    webm: { label: 'WEBM', tone: 'purple' },
    txt: { label: 'TXT', tone: 'gray' },
    csv: { label: 'CSV', tone: 'green' },
  };
  return map[ext] || { label: (ext || 'FILE').toUpperCase().slice(0, 4), tone: 'gray' };
}

function InitialsAvatar({ name }) {
  return (
    <span className="card-avatar" style={{ background: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function ActionBtn({ icon, label, open, onClick, children, ariaLabel }) {
  return (
    <div className="card-action-wrap">
      <button
        type="button"
        className={`card-action-btn${open ? ' is-open' : ''}${label ? '' : ' is-icon'}`}
        onClick={onClick}
        aria-label={ariaLabel || label}
      >
        {icon ? <Icon id={icon} /> : null}
        {label || null}
      </button>
      {children}
    </div>
  );
}

function Popover({ title, onClose, children }) {
  return (
    <div className="card-pop" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
      <header className="card-pop-head">
        <strong>{title}</strong>
        <button type="button" className="plain-icon" aria-label="Close" onClick={onClose}>
          <Icon id="i-close" />
        </button>
      </header>
      <div className="card-pop-body">{children}</div>
    </div>
  );
}

export default function CardDrawer({
  card,
  stage,
  open,
  onClose,
  activity,
  comments,
  onAddComment,
  currentUser = null,
  onUpdateCard,
  onDeleteCard,
  canEditMeta = true,
  onUploadFiles,
  onRemoveFile,
  onAddDelivery,
  onSaveDeliveryFeedback,
  onRemoveDelivery,
  canReviewDelivery = false,
  onSaveFeedback,
  stages,
  assignees = [],
  crmClients = [],
  onMove,
  hydrating = false,
}) {
  const fileInputRef = useRef(null);
  const deliveryFileInputRef = useRef(null);
  const commentInputRef = useRef(null);
  const commentFileInputRef = useRef(null);
  const deliverySectionRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [comment, setComment] = useState('');
  const [commentFiles, setCommentFiles] = useState([]);
  const [deliveryDescription, setDeliveryDescription] = useState('');
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [deliveryFiles, setDeliveryFiles] = useState([]);
  const [deliveryFeedbackDrafts, setDeliveryFeedbackDrafts] = useState({});
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [deliveryFeedbackBusy, setDeliveryFeedbackBusy] = useState(null);
  const [alert, setAlert] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteDelivery, setConfirmDeleteDelivery] = useState(null);
  const [confirmDeleteCard, setConfirmDeleteCard] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [edit, setEdit] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);
  const [showActivityDetails, setShowActivityDetails] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [confirmDeleteComment, setConfirmDeleteComment] = useState(null);

  useEffect(() => {
    if (!card) return;
    setMenu(null);
    setComment('');
    setCommentFiles([]);
    setDeliveryDescription('');
    setDeliveryUrl('');
    setDeliveryFiles([]);
    setDeliveryBusy(false);
    setCommentBusy(false);
    setUploadBusy(false);
    setFeedbackBusy(false);
    setDeliveryFeedbackBusy(null);
    setConfirmDeleteCard(false);
    setConfirmDeleteDelivery(null);
    setDeleting(false);
    setEditingDesc(false);
    setDescExpanded(false);
    setShowActivityDetails(true);
    setEditingCommentId(null);
    setCommentDraft('');
    setConfirmDeleteComment(null);
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
    setDescDraft(card.description || '');
    setFeedbackForm({
      status: card.feedback?.status || 'none',
      note: card.feedback?.note || '',
      rating: card.feedback?.rating ?? '',
    });
  }, [card?.id, open]);

  useEffect(() => {
    if (!card) return;
    const drafts = {};
    for (const item of card.deliveryList || []) {
      drafts[item.id] = {
        status: item.feedback?.status || 'none',
        note: item.feedback?.note || '',
      };
    }
    setDeliveryFeedbackDrafts(drafts);
  }, [card?.id, open, card?.deliveryList]);

  useEffect(() => {
    if (!menu) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setMenu(null);
    }
    function onDown(e) {
      if (e.target.closest('.card-pop, .card-action-btn, .card-file-more, .portal-select__menu, .month-filter-popper, .react-datepicker')) {
        return;
      }
      setMenu(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [menu]);

  const files = card?.fileList || [];
  const deliveries = card?.deliveryList || [];
  const commentList = comments || [];
  const feedback = card?.feedback || { status: 'none' };

  const feed = useMemo(() => {
    const items = commentList.map((entry) => ({ ...entry, _kind: 'comment' }));

    // Also show card Attachments in this feed (Trello-style), unless already
    // linked on a real comment.
    const linkedIds = new Set();
    for (const entry of commentList) {
      for (const f of entry.files || []) {
        if (f?.id != null) linkedIds.add(String(f.id));
        if (f?.url) linkedIds.add(String(f.url));
        if (f?.name) linkedIds.add(`name:${f.name}`);
      }
    }
    for (const file of files) {
      const already = (
        (file?.id != null && linkedIds.has(String(file.id)))
        || (file?.url && linkedIds.has(String(file.url)))
        || (file?.name && linkedIds.has(`name:${file.name}`))
      );
      if (already) continue;
      items.push({
        id: `attachment-${file.id || file.url || file.name}`,
        kind: 'attachment',
        _kind: 'attachment',
        author: 'Attachment',
        avatar: null,
        text: 'Attached a file',
        files: [file],
        time: file.uploadedAt ? undefined : 'now',
        createdAt: file.uploadedAt || null,
      });
    }

    if (showActivityDetails) {
      for (const entry of activity || []) {
        const text = String(entry.text || '').trim();
        if (text === 'added a comment' || text === 'added a comment with files') continue;
        if (/^uploaded \d+ file/.test(text)) continue;
        items.push({ ...entry, _kind: 'activity' });
      }
    }
    items.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : (a.time === 'now' ? Date.now() : 0);
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : (b.time === 'now' ? Date.now() : 0);
      return tb - ta;
    });
    return items;
  }, [commentList, activity, showActivityDetails, files]);

  if (!card || !edit) return null;

  const deadline = getDeadlineInfo(card.dueDate);
  const needsLiveLink = requiresLiveLink(card.stage);
  const showLiveChip = isLiveLikeStage(card.stage) && card.liveUrl;
  const description = edit.description || '';
  const descLong = description.length > DESC_COLLAPSE_AT;
  const people = assignees.length ? [...assignees] : [];
  if (card.assignee && !people.some((a) => Number(a.id) === Number(card.assignee.id))) {
    people.unshift(card.assignee);
  }

  function showErrors(title, errors, tone = 'error') {
    setAlert({ title, errors, tone });
  }

  function updateEdit(field, value) {
    setEdit((f) => ({ ...f, [field]: value }));
  }

  function toggleMenu(id) {
    setMenu((current) => (current === id ? null : id));
  }

  async function persistDetails(nextEdit = edit) {
    const assignee = people.find((a) => a.id === Number(nextEdit.assigneeId)) || card.assignee;
    const selectedClient = crmClients.find((c) => String(c.id) === String(nextEdit.clientId));
    const payload = {
      title: nextEdit.title,
      client: selectedClient?.name || nextEdit.client,
      clientId: nextEdit.clientId || null,
      description: nextEdit.description,
      type: nextEdit.type,
      stage: card.stage,
      assignee,
      priority: nextEdit.priority,
      dueDate: fromDateInputValue(nextEdit.dueDate),
      liveUrl: nextEdit.liveUrl,
    };
    const errors = validateCardForm(payload, {
      allowPastDue: true,
      requireCrmClient: crmClients.length > 0,
    });
    if (errors.length) {
      showErrors('Cannot save card', errors);
      return false;
    }
    setSavingMeta(true);
    try {
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
      return ok;
    } finally {
      setSavingMeta(false);
    }
  }

  async function patchAndSave(patch) {
    const next = { ...edit, ...patch };
    setEdit(next);
    return persistDetails(next);
  }

  async function handleTitleBlur() {
    if (!canEditMeta || savingMeta) return;
    if (String(edit.title || '').trim() === String(card.title || '').trim()) return;
    await persistDetails();
  }

  function startEditDescription() {
    setDescDraft(edit.description || '');
    setEditingDesc(true);
    setMenu(null);
  }

  async function saveDescription() {
    const next = { ...edit, description: descDraft };
    setEdit(next);
    const ok = await persistDetails(next);
    if (ok) setEditingDesc(false);
  }

  async function handleCommentSubmit(e) {
    e.preventDefault();
    if (commentBusy) return;
    const err = validateComment(comment, commentFiles);
    if (err) {
      showErrors('Comment not added', [err]);
      return;
    }
    const text = comment.trim();
    const files = commentFiles.slice();
    setCommentBusy(true);
    try {
      const ok = await onAddComment?.(text, files);
      if (ok !== false) {
        setComment('');
        setCommentFiles([]);
        if (commentFileInputRef.current) commentFileInputRef.current.value = '';
      }
    } finally {
      setCommentBusy(false);
    }
  }

  function handleCommentFilePick(e) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setCommentFiles((prev) => {
      const merged = [...prev];
      for (const file of picked) {
        if (merged.length >= MAX_FILES_PER_COMMENT) break;
        const duplicate = merged.some((f) => f.name === file.name && f.size === file.size);
        if (!duplicate) merged.push(file);
      }
      return merged.slice(0, MAX_FILES_PER_COMMENT);
    });
    e.target.value = '';
  }

  function removeCommentFile(index) {
    setCommentFiles((prev) => prev.filter((_, i) => i !== index));
    if (commentFileInputRef.current) commentFileInputRef.current.value = '';
  }

  function handleReply(entry) {
    const mention = `@${entry.author} `;
    setComment((current) => (current.startsWith(mention) ? current : mention + current));
    commentInputRef.current?.focus();
  }

  function startEditComment(entry) {
    setEditingCommentId(entry.id);
    setCommentDraft(entry.text || '');
  }

  async function saveEditComment(entry) {
    const nextText = commentDraft.trim();
    const err = validateComment(nextText);
    if (err) {
      showErrors('Comment not saved', [err]);
      return;
    }
    const nextList = commentList.map((item) => (
      String(item.id) === String(entry.id) ? { ...item, text: nextText } : item
    ));
    const ok = await onUpdateCard(card.id, { commentList: nextList });
    if (ok) setEditingCommentId(null);
  }

  async function removeComment(entry) {
    const nextList = commentList.filter((item) => String(item.id) !== String(entry.id));
    await onUpdateCard(card.id, { commentList: nextList });
    setConfirmDeleteComment(null);
  }

  async function handleFilePick(e) {
    const picked = e.target.files;
    const existingBytes = files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    const { ok, errors } = validateFiles(picked, files.length, existingBytes);
    if (!ok.length) {
      showErrors('Upload blocked', errors);
      e.target.value = '';
      return;
    }
    if (errors.length) showErrors('Some files skipped', errors, 'warn');
    setMenu(null);
    if (ok.length) {
      setUploadBusy(true);
      try {
        await onUploadFiles?.(card.id, ok);
      } finally {
        setUploadBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleDeliverySubmit(e) {
    e.preventDefault();
    if (deliveryBusy) return;
    const result = validateDelivery(
      { description: deliveryDescription, url: deliveryUrl, files: deliveryFiles },
      deliveries,
    );
    if (!result.ok) {
      showErrors('Cannot add delivery', result.errors);
      return;
    }
    const payload = {
      description: result.description,
      url: result.url,
      files: result.files,
    };
    setDeliveryDescription('');
    setDeliveryUrl('');
    setDeliveryFiles([]);
    if (deliveryFileInputRef.current) deliveryFileInputRef.current.value = '';

    setDeliveryBusy(true);
    try {
      const ok = await onAddDelivery?.(card.id, payload);
      if (!ok) {
        setDeliveryDescription(payload.description || '');
        setDeliveryUrl(payload.url || '');
        setDeliveryFiles(payload.files || []);
      }
    } finally {
      setDeliveryBusy(false);
    }
  }

  function handleDeliveryFilePick(e) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setDeliveryFiles((prev) => {
      const merged = [...prev];
      for (const file of picked) {
        if (merged.length >= MAX_FILES_PER_DELIVERY) break;
        const duplicate = merged.some((f) => f.name === file.name && f.size === file.size);
        if (!duplicate) merged.push(file);
      }
      return merged.slice(0, MAX_FILES_PER_DELIVERY);
    });
    e.target.value = '';
  }

  function removeDeliveryFile(index) {
    setDeliveryFiles((prev) => prev.filter((_, i) => i !== index));
    if (deliveryFileInputRef.current) deliveryFileInputRef.current.value = '';
  }

  async function handleDeliveryFeedbackSave(deliveryId) {
    if (deliveryFeedbackBusy) return;
    const draft = deliveryFeedbackDrafts[deliveryId] || { status: 'none', note: '' };
    const errors = validateDeliveryFeedback(draft);
    if (errors.length) {
      showErrors('Feedback incomplete', errors);
      return;
    }
    setDeliveryFeedbackBusy(deliveryId);
    try {
      const ok = await onSaveDeliveryFeedback?.(card.id, deliveryId, {
        status: draft.status,
        note: String(draft.note || '').trim(),
        updatedAt: new Date().toISOString(),
        author: 'You',
      });
      if (ok) showErrors('Saved', ['Delivery feedback updated.'], 'success');
    } finally {
      setDeliveryFeedbackBusy(null);
    }
  }

  async function handleFeedbackSave(e) {
    e.preventDefault();
    if (feedbackBusy) return;
    const errors = validateFeedback(feedbackForm);
    if (errors.length) {
      showErrors('Feedback incomplete', errors);
      return;
    }
    setFeedbackBusy(true);
    try {
      const ok = await onSaveFeedback(card.id, {
        status: feedbackForm.status,
        note: String(feedbackForm.note || '').trim(),
        rating: feedbackForm.rating === '' ? null : Number(feedbackForm.rating),
        updatedAt: new Date().toISOString(),
        author: 'You',
      });
      if (ok) showErrors('Feedback saved', ['Client feedback has been updated.'], 'success');
    } finally {
      setFeedbackBusy(false);
    }
  }

  function scrollToDelivery() {
    setMenu(null);
    requestAnimationFrame(() => {
      deliverySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <>
      <aside
        className={`detail-panel card-modal${open ? ' open' : ''}`}
        aria-label="Card details"
        aria-hidden={!open}
        role="dialog"
        aria-modal={open}
      >
        <button type="button" className="card-modal-close" aria-label="Close details" onClick={onClose}>
          <Icon id="i-close" />
        </button>
        {hydrating ? (
          <div className="card-modal-hydrating">
            <span className="btn-spinner btn-spinner--dark" aria-hidden="true" />
            Loading latest details…
          </div>
        ) : null}

        <div className="card-modal-grid">
          <div className="card-modal-main">
            <header className="card-modal-title">
              <span className="card-type-icon" aria-hidden="true">
                <Icon id={card.type === 'revision' ? 'i-revision' : 'i-kanban'} />
              </span>
              <div className="card-title-block">
                {canEditMeta ? (
                  <input
                    className="card-title-input"
                    value={edit.title}
                    onChange={(e) => updateEdit('title', e.target.value)}
                    onBlur={handleTitleBlur}
                    maxLength={120}
                    aria-label="Card title"
                  />
                ) : (
                  <h2>{card.title}</h2>
                )}
                <button
                  type="button"
                  className="card-client-link"
                  onClick={() => toggleMenu('client')}
                >
                  in {stage?.title || edit.client || 'board'}
                  {edit.client ? ` · ${edit.client}` : ''}
                </button>
                {showLiveChip ? (
                  <a className="live-link-chip" href={card.liveUrl} target="_blank" rel="noreferrer">
                    <Icon id="i-link" /> Open live site
                  </a>
                ) : null}
                {menu === 'client' ? (
                  <Popover title="Client & live link" onClose={() => setMenu(null)}>
                    <label>
                      Client {crmClients.length ? <span className="field-hint">(required)</span> : null}
                      {crmClients.length ? (
                        <FancySelect
                          fullWidth
                          isClearable
                          value={edit.clientId}
                          onChange={(clientId) => {
                            const selected = crmClients.find((c) => String(c.id) === String(clientId));
                            patchAndSave({
                              clientId: clientId || '',
                              client: selected?.name || '',
                            });
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
                          onBlur={() => persistDetails()}
                          maxLength={80}
                          disabled={!canEditMeta}
                        />
                      )}
                    </label>
                    <label>
                      Live link {needsLiveLink ? <span className="field-hint">(required)</span> : <span className="field-hint">(optional)</span>}
                      <input
                        type="url"
                        value={edit.liveUrl}
                        onChange={(e) => updateEdit('liveUrl', e.target.value)}
                        onBlur={() => persistDetails()}
                        placeholder="https://client-site.com"
                      />
                    </label>
                  </Popover>
                ) : null}
              </div>
            </header>

            <div className="card-action-row">
              <ActionBtn icon="i-plus" label="Add" open={menu === 'add'} onClick={() => toggleMenu('add')}>
                {menu === 'add' ? (
                  <Popover title="Add to card" onClose={() => setMenu(null)}>
                    <button type="button" className="card-pop-item" onClick={() => fileInputRef.current?.click()}>
                      <Icon id="i-paperclip" /> Attachment
                    </button>
                    <button type="button" className="card-pop-item" onClick={scrollToDelivery}>
                      <Icon id="i-check" /> Checklist
                    </button>
                    <button type="button" className="card-pop-item" onClick={() => setMenu('labels')}>
                      <Icon id="i-tag" /> Labels
                    </button>
                    <button type="button" className="card-pop-item" onClick={() => setMenu('dates')}>
                      <Icon id="i-clock" /> Dates
                    </button>
                    <button type="button" className="card-pop-item" onClick={() => setMenu('members')}>
                      <Icon id="i-users" /> Members
                    </button>
                  </Popover>
                ) : null}
              </ActionBtn>

              <ActionBtn icon="i-tag" label="Labels" open={menu === 'labels'} onClick={() => toggleMenu('labels')}>
                {menu === 'labels' ? (
                  <Popover title="Labels" onClose={() => setMenu(null)}>
                    {canEditMeta ? (
                      <label>
                        Type
                        <FancySelect
                          fullWidth
                          value={edit.type}
                          onChange={(v) => patchAndSave({ type: v })}
                          options={[
                            { value: 'draft', label: 'Draft' },
                            { value: 'revision', label: 'Revision' },
                          ]}
                        />
                      </label>
                    ) : null}
                    <label>
                      Priority
                      <FancySelect
                        fullWidth
                        value={edit.priority}
                        onChange={(v) => patchAndSave({ priority: v })}
                        options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                      />
                    </label>
                    <label>
                      Move to stage
                      <FancySelect
                        fullWidth
                        value={card.stage}
                        onChange={(stageId) => {
                          onMove(stageId);
                          setMenu(null);
                        }}
                        options={stages.map((item) => ({ value: item.id, label: item.title }))}
                      />
                    </label>
                  </Popover>
                ) : null}
              </ActionBtn>

              <ActionBtn icon="i-clock" label="Dates" open={menu === 'dates'} onClick={() => toggleMenu('dates')}>
                {menu === 'dates' ? (
                  <Popover title="Dates" onClose={() => setMenu(null)}>
                    {canEditMeta ? (
                      <label>
                        Due date
                        <DayFilter
                          value={edit.dueDate}
                          onChange={(dueDate) => patchAndSave({ dueDate })}
                          placeholder="Select due date"
                          allowFuture
                          clearable={false}
                          className="month-filter--form"
                        />
                      </label>
                    ) : (
                      <p className="muted-hint">{deadline.label}</p>
                    )}
                  </Popover>
                ) : null}
              </ActionBtn>

              <ActionBtn icon="i-check" label="Checklist" open={false} onClick={scrollToDelivery} />

              <ActionBtn icon="i-users" label="Members" open={menu === 'members'} onClick={() => toggleMenu('members')}>
                {menu === 'members' ? (
                  <Popover title="Members" onClose={() => setMenu(null)}>
                    {canEditMeta ? (
                      <label>
                        Assignee
                        <FancySelect
                          fullWidth
                          value={edit.assigneeId}
                          onChange={(v) => patchAndSave({ assigneeId: v })}
                          placeholder="Search production user…"
                          options={people.map((a) => ({ value: String(a.id), label: a.name }))}
                        />
                      </label>
                    ) : (
                      <p className="muted-hint">{card.assignee?.name || '—'}</p>
                    )}
                  </Popover>
                ) : null}
              </ActionBtn>

              {onDeleteCard ? (
                <ActionBtn icon="i-more" label="" ariaLabel="More actions" open={menu === 'more'} onClick={() => toggleMenu('more')}>
                  {menu === 'more' ? (
                    <Popover title="Actions" onClose={() => setMenu(null)}>
                      <button
                        type="button"
                        className="card-pop-item is-danger"
                        onClick={() => {
                          setMenu(null);
                          setConfirmDeleteCard(true);
                        }}
                      >
                        Delete card
                      </button>
                    </Popover>
                  ) : null}
                </ActionBtn>
              ) : null}
            </div>

            <section className="card-section">
              <div className="card-section-head">
                <h3>
                  <Icon id="i-menu" /> Description
                </h3>
                {canEditMeta && !editingDesc ? (
                  <button type="button" className="card-ghost-btn" onClick={startEditDescription}>
                    Edit
                  </button>
                ) : null}
              </div>
              {editingDesc ? (
                <div className="card-desc-edit">
                  <textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    maxLength={2000}
                    rows={6}
                    placeholder="Add a more detailed description…"
                    autoFocus
                  />
                  <div className="card-desc-actions">
                    <button type="button" className={`primary-btn${savingMeta ? ' is-busy' : ''}`} onClick={saveDescription} disabled={savingMeta}>
                      {savingMeta ? (
                        <>
                          <span className="btn-spinner" aria-hidden="true" />
                          Saving…
                        </>
                      ) : (
                        'Save'
                      )}
                    </button>
                    <button
                      type="button"
                      className="card-ghost-btn"
                      onClick={() => {
                        setEditingDesc(false);
                        setDescDraft(edit.description || '');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : description ? (
                <>
                  <p className={`card-desc-body${descLong && !descExpanded ? ' is-collapsed' : ''}`}>
                    {description}
                  </p>
                  {descLong ? (
                    <button type="button" className={`card-show-more${descExpanded ? ' is-open' : ''}`} onClick={() => setDescExpanded((v) => !v)}>
                      {descExpanded ? 'Show less' : 'Show more'}
                      <Icon id="i-chevron-down" />
                    </button>
                  ) : null}
                </>
              ) : (
                <button type="button" className="card-desc-empty" onClick={canEditMeta ? startEditDescription : undefined}>
                  {canEditMeta ? 'Add a more detailed description…' : 'No description'}
                </button>
              )}
            </section>

            <section className="card-section">
              <div className="card-section-head">
                <h3>
                  <Icon id="i-paperclip" /> Attachments
                </h3>
                <button type="button" className="card-ghost-btn" disabled={uploadBusy} onClick={() => fileInputRef.current?.click()}>
                  {uploadBusy ? 'Uploading…' : 'Add'}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFilePick}
                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp4,.mov,.webm"
                disabled={uploadBusy}
              />
              {files.length ? (
                <ul className="card-attach-list">
                  {files.map((file) => {
                    const kind = fileKind(file.name);
                    const fileMenu = menu === `file:${file.id}`;
                    return (
                      <li key={file.id} className={`card-attach-row${file._pending || uploadBusy ? ' is-pending' : ''}`}>
                        <span className={`card-file-badge tone-${kind.tone}`}>{kind.label}</span>
                        <div className="card-attach-meta">
                          <strong>{file.name}</strong>
                          <span>
                            {file.uploadedAt
                              ? `Added ${formatStamp(file.uploadedAt)} · ${formatFileSize(file.size || 0)}`
                              : formatFileSize(file.size || 0)}
                          </span>
                        </div>
                        <div className="card-attach-actions">
                          {file.url ? (
                            <a
                              className="plain-icon"
                              href={resolveMediaUrl(file.url)}
                              download={file.name}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${file.name}`}
                            >
                              <Icon id="i-external" />
                            </a>
                          ) : null}
                          <div className="card-action-wrap">
                            <button
                              type="button"
                              className="plain-icon card-file-more"
                              aria-label={`More actions for ${file.name}`}
                              onClick={() => toggleMenu(`file:${file.id}`)}
                            >
                              <Icon id="i-more" />
                            </button>
                            {fileMenu ? (
                              <Popover title="Attachment" onClose={() => setMenu(null)}>
                                <button
                                  type="button"
                                  className="card-pop-item is-danger"
                                  onClick={() => {
                                    setMenu(null);
                                    setConfirmDelete(file);
                                  }}
                                >
                                  Remove
                                </button>
                              </Popover>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="card-empty-line">No attachments yet</p>
              )}
            </section>

            <section className="card-section" ref={deliverySectionRef}>
              <div className="card-section-head">
                <h3>
                  <Icon id="i-check" /> Delivery
                </h3>
              </div>
              <form className="detail-form delivery-compose" onSubmit={handleDeliverySubmit} noValidate>
                <div className="delivery-compose-head">
                  <p>Optional description, link, or files — max {MAX_DELIVERIES_PER_CARD} deliveries, {MAX_FILES_PER_DELIVERY} files each.</p>
                </div>
                <label>
                  Description <span className="field-hint">(optional)</span>
                  <textarea
                    value={deliveryDescription}
                    onChange={(e) => setDeliveryDescription(e.target.value)}
                    placeholder="What was delivered?"
                    maxLength={1000}
                    rows={3}
                    disabled={deliveryBusy}
                  />
                </label>
                <label>
                  Link <span className="field-hint">(optional)</span>
                  <input
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    value={deliveryUrl}
                    onChange={(e) => setDeliveryUrl(e.target.value)}
                    placeholder="https://drive.google.com/…"
                    maxLength={500}
                    disabled={deliveryBusy}
                  />
                </label>
                <div className="delivery-file-field">
                  <span className="delivery-file-label">
                    Files <span className="field-hint">(optional, up to {MAX_FILES_PER_DELIVERY})</span>
                  </span>
                  <button
                    type="button"
                    className="delivery-file-btn"
                    onClick={() => deliveryFileInputRef.current?.click()}
                    disabled={deliveryBusy || deliveryFiles.length >= MAX_FILES_PER_DELIVERY}
                  >
                    <Icon id="i-paperclip" />
                    <span>
                      {deliveryFiles.length
                        ? `${deliveryFiles.length} file${deliveryFiles.length > 1 ? 's' : ''} selected`
                        : 'Choose files'}
                    </span>
                  </button>
                  <input
                    ref={deliveryFileInputRef}
                    type="file"
                    hidden
                    multiple
                    onChange={handleDeliveryFilePick}
                    accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp4,.mov,.webm"
                    disabled={deliveryBusy}
                  />
                  {deliveryFiles.length ? (
                    <ul className="delivery-selected-files">
                      {deliveryFiles.map((file, index) => (
                        <li key={`${file.name}-${file.size}-${index}`}>
                          <span className="file-icon"><Icon id="i-paperclip" /></span>
                          <span>{file.name} · {formatFileSize(file.size || 0)}</span>
                          <button
                            type="button"
                            className="plain-icon"
                            disabled={deliveryBusy}
                            aria-label={`Remove ${file.name}`}
                            onClick={() => removeDeliveryFile(index)}
                          >
                            <Icon id="i-close" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <button
                  type="submit"
                  className={`primary-btn delivery-submit${deliveryBusy ? ' is-busy' : ''}`}
                  disabled={
                    deliveryBusy
                    || deliveries.length >= MAX_DELIVERIES_PER_CARD
                    || (!deliveryDescription.trim() && !deliveryUrl.trim() && !deliveryFiles.length)
                  }
                >
                  {deliveryBusy ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Adding…
                    </>
                  ) : (
                    'Add delivery'
                  )}
                </button>
              </form>

              {deliveries.length ? (
                <ul className="delivery-list">
                  {deliveries.map((item) => {
                    const fb = item.feedback || { status: 'none', note: '' };
                    const draft = deliveryFeedbackDrafts[item.id] || {
                      status: fb.status || 'none',
                      note: fb.note || '',
                    };
                    const linkHref = item.url || null;
                    const attachments = deliveryAttachmentList(item);
                    return (
                      <li key={item.id} className={`delivery-card${item._pending ? ' is-pending' : ''}`}>
                        <div className="delivery-card-top">
                          <p>{item.description || attachments[0]?.name || item.url || 'Delivery'}</p>
                          <div className="delivery-card-actions">
                            {item._pending ? (
                              <span className="delivery-pending-pill">
                                <span className="btn-spinner btn-spinner--dark" aria-hidden="true" />
                                Saving…
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="plain-icon"
                              aria-label="Remove delivery"
                              disabled={Boolean(item._pending) || deliveryBusy}
                              onClick={() => setConfirmDeleteDelivery(item)}
                            >
                              <Icon id="i-close" />
                            </button>
                          </div>
                        </div>
                        <div className="delivery-assets">
                          {linkHref ? (
                            <a className="tool-btn" href={linkHref} target="_blank" rel="noreferrer">
                              <Icon id="i-link" /> Open link
                            </a>
                          ) : null}
                          {attachments.map((file) => (
                            file.fileUrl ? (
                              <a
                                key={file.id || file.name}
                                className="tool-btn"
                                href={resolveMediaUrl(file.fileUrl)}
                                download={file.name || undefined}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Icon id="i-paperclip" /> {file.name || 'Open file'}
                              </a>
                            ) : file.name ? (
                              <span key={file.id || file.name} className="delivery-kind-pill">{file.name}</span>
                            ) : null
                          ))}
                          {!linkHref && !attachments.length ? (
                            <span className="delivery-kind-pill">Note only</span>
                          ) : null}
                        </div>
                        {canReviewDelivery ? (
                          <div className="delivery-feedback detail-form">
                            <label>
                              Admin feedback
                              <FancySelect
                                fullWidth
                                value={draft.status}
                                onChange={(status) => setDeliveryFeedbackDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, status },
                                }))}
                                options={FEEDBACK_STATUS.map((s) => ({ value: s.value, label: s.label }))}
                              />
                            </label>
                            <label>
                              Note
                              <textarea
                                value={draft.note}
                                onChange={(e) => setDeliveryFeedbackDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: { ...draft, note: e.target.value },
                                }))}
                                placeholder="Feedback for this delivery…"
                                maxLength={1000}
                                rows={2}
                              />
                            </label>
                            <button
                              type="button"
                              className={`primary-btn${deliveryFeedbackBusy === item.id ? ' is-busy' : ''}`}
                              disabled={Boolean(item._pending) || deliveryFeedbackBusy === item.id}
                              onClick={() => handleDeliveryFeedbackSave(item.id)}
                            >
                              {deliveryFeedbackBusy === item.id ? (
                                <>
                                  <span className="btn-spinner" aria-hidden="true" />
                                  Saving…
                                </>
                              ) : (
                                'Save feedback'
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="delivery-feedback-readonly">
                            <span className={`delivery-kind-pill ${deliveryFeedbackPillClass(fb.status)}`}>
                              {deliveryFeedbackLabel(fb.status)}
                            </span>
                            {fb.note ? <strong>{fb.note}</strong> : null}
                            {fb.updatedAt ? (
                              <span className="muted-hint">
                                {fb.author || 'Admin'} · {formatStamp(fb.updatedAt)}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="card-empty-line">No deliveries yet</p>
              )}
            </section>

            {feedbackForm ? (
              <section className="card-section">
                <div className="card-section-head">
                  <h3>
                    <Icon id="i-star" /> Feedback
                  </h3>
                </div>
                <form className="detail-form" onSubmit={handleFeedbackSave} noValidate>
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
                      rows={3}
                    />
                  </label>
                  {feedback.updatedAt && (
                    <p className="muted-hint">
                      Last updated by {feedback.author || '—'} · {formatStamp(feedback.updatedAt)}
                    </p>
                  )}
                  <button type="submit" className={`primary-btn${feedbackBusy ? ' is-busy' : ''}`} disabled={feedbackBusy}>
                    {feedbackBusy ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        Saving…
                      </>
                    ) : (
                      'Save feedback'
                    )}
                  </button>
                </form>
              </section>
            ) : null}
          </div>

          <aside className="card-modal-side">
            <div className="card-section-head card-activity-head">
              <h3>
                <Icon id="i-message" /> Comments and activity
              </h3>
              <button
                type="button"
                className="card-ghost-btn"
                onClick={() => setShowActivityDetails((v) => !v)}
              >
                {showActivityDetails ? 'Hide details' : 'Show details'}
              </button>
            </div>

            <form className="card-comment-compose" onSubmit={handleCommentSubmit} noValidate>
              <input
                ref={commentInputRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment..."
                aria-label="Add a comment"
                maxLength={1000}
                disabled={commentBusy}
              />
              <input
                ref={commentFileInputRef}
                type="file"
                hidden
                multiple
                onChange={handleCommentFilePick}
                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp4,.mov,.webm"
                disabled={commentBusy}
              />
              {commentFiles.length ? (
                <ul className="card-comment-picked">
                  {commentFiles.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${index}`}>
                      <span className="file-icon"><Icon id="i-paperclip" /></span>
                      <span>{file.name}</span>
                      <button
                        type="button"
                        className="plain-icon"
                        disabled={commentBusy}
                        aria-label={`Remove ${file.name}`}
                        onClick={() => removeCommentFile(index)}
                      >
                        <Icon id="i-close" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="card-comment-compose-actions">
                <button
                  type="button"
                  className="card-ghost-btn"
                  disabled={commentBusy || commentFiles.length >= MAX_FILES_PER_COMMENT}
                  onClick={() => commentFileInputRef.current?.click()}
                >
                  <Icon id="i-paperclip" /> Attach file
                </button>
                <button
                  type="submit"
                  className={`primary-btn comment-send${commentBusy ? ' is-busy' : ''}`}
                  disabled={commentBusy || (!comment.trim() && !commentFiles.length)}
                >
                  {commentBusy ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Sending…
                    </>
                  ) : (
                    'Send'
                  )}
                </button>
              </div>
            </form>

            {feed.length ? (
              <div className="card-activity-feed">
                {feed.map((entry) => (
                  <article
                    key={entry.id}
                    className={`card-activity-item${entry._kind === 'comment' || entry._kind === 'attachment' ? ' is-comment' : ' is-system'}${entry._pending ? ' is-pending' : ''}`}
                  >
                    <InitialsAvatar name={entry.author} />
                    <div className="card-activity-body">
                      <p className="card-activity-meta">
                        <strong>{entry.author}</strong>
                        <time className="card-time-link">{formatStamp(entry.createdAt, entry.time)}</time>
                        {entry._pending ? (
                          <span className="delivery-pending-pill">
                            <span className="btn-spinner btn-spinner--dark" aria-hidden="true" />
                            Saving…
                          </span>
                        ) : null}
                      </p>
                      {entry._kind === 'comment' && String(editingCommentId) === String(entry.id) ? (
                        <div className="card-desc-edit">
                          <textarea
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            rows={3}
                            maxLength={1000}
                          />
                          <div className="card-desc-actions">
                            <button type="button" className="primary-btn" onClick={() => saveEditComment(entry)}>
                              Save
                            </button>
                            <button type="button" className="card-ghost-btn" onClick={() => setEditingCommentId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={`card-comment-bubble${entry._kind === 'comment' || entry._kind === 'attachment' ? '' : ' is-system'}`}>
                            {entry.text ? <p>{entry.text}</p> : null}
                            {(entry._kind === 'comment' || entry._kind === 'attachment') && Array.isArray(entry.files) && entry.files.length ? (
                              <ul className="card-comment-files">
                                {entry.files.map((file) => {
                                  const kind = fileKind(file.name);
                                  const href = resolveMediaUrl(file.url || file.fileUrl || null);
                                  const image = Boolean(href) && isImageFile(file);
                                  return (
                                    <li key={file.id || file.name} className={image ? 'is-image' : ''}>
                                      {image ? (
                                        <a className="card-comment-thumb" href={href} target="_blank" rel="noreferrer">
                                          <img src={href} alt={file.name || 'Attachment'} loading="lazy" />
                                        </a>
                                      ) : (
                                        <span className={`card-file-badge tone-${kind.tone}`}>{kind.label}</span>
                                      )}
                                      <span className="card-comment-file-meta">
                                        {href ? (
                                          <a href={href} target="_blank" rel="noreferrer">
                                            {file.name || 'Open file'}
                                          </a>
                                        ) : (
                                          <span className="card-comment-file-name">{file.name || 'File'}</span>
                                        )}
                                        <span className="card-comment-file-size">
                                          {Number(file.size) > 0 ? formatFileSize(Number(file.size)) : (href ? 'Open' : 'Unavailable')}
                                        </span>
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </div>
                          {entry._kind === 'comment' ? (
                            <div className="card-comment-links">
                              <button type="button" onClick={() => handleReply(entry)}>Reply</button>
                              {ownsComment(entry, currentUser) ? (
                                <>
                                  <button type="button" onClick={() => startEditComment(entry)}>Edit</button>
                                  <button type="button" onClick={() => setConfirmDeleteComment(entry)}>Delete</button>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </article>                ))}
              </div>
            ) : (
              <p className="card-empty-line">No comments yet — be the first</p>
            )}
          </aside>
        </div>
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
        open={Boolean(confirmDeleteDelivery)}
        title="Remove delivery?"
        message={
          confirmDeleteDelivery
            ? `"${String(confirmDeleteDelivery.description || 'Delivery').slice(0, 80)}" will be removed.`
            : ''
        }
        tone="warn"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (confirmDeleteDelivery) onRemoveDelivery?.(card.id, confirmDeleteDelivery.id);
          setConfirmDeleteDelivery(null);
        }}
        onCancel={() => setConfirmDeleteDelivery(null)}
      />

      <BoardAlertModal
        open={Boolean(confirmDeleteComment)}
        title="Delete comment?"
        message="This comment will be removed from the card."
        tone="warn"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (confirmDeleteComment) removeComment(confirmDeleteComment);
        }}
        onCancel={() => setConfirmDeleteComment(null)}
      />

      <BoardAlertModal
        open={confirmDeleteCard && Boolean(onDeleteCard)}
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
