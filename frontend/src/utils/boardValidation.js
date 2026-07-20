const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_CARD = 10;
const MAX_TITLE = 120;
const MAX_CLIENT = 80;
const MAX_DESCRIPTION = 2000;
const MAX_COMMENT = 1000;
const MAX_FEEDBACK = 1000;

const ALLOWED_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'zip', 'rar', 'mp4', 'mov', 'webm',
]);

export const PRIORITY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const FEEDBACK_STATUS = [
  { value: 'none', label: 'No feedback yet' },
  { value: 'pending', label: 'Awaiting feedback' },
  { value: 'approved', label: 'Approved' },
  { value: 'changes_requested', label: 'Changes requested' },
];

export function isHighPriority(priority) {
  return priority === true || priority === 'high';
}

export function priorityLabel(priority) {
  if (priority === true || priority === 'high') return 'High';
  if (priority === 'medium') return 'Medium';
  if (priority === 'low') return 'Low';
  return 'None';
}

function extOf(name) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export function validateCardForm(form, { allowPastDue = false } = {}) {
  const errors = [];
  const title = String(form.title || '').trim();
  const client = String(form.client || '').trim();
  const description = String(form.description || '').trim();
  const dueDate = form.dueDate;

  if (!title) errors.push('Card title is required');
  else if (title.length < 3) errors.push('Title must be at least 3 characters');
  else if (title.length > MAX_TITLE) errors.push(`Title cannot exceed ${MAX_TITLE} characters`);

  if (!client) errors.push('Client name is required');
  else if (client.length < 2) errors.push('Client name must be at least 2 characters');
  else if (client.length > MAX_CLIENT) errors.push(`Client cannot exceed ${MAX_CLIENT} characters`);

  if (!form.type || !['draft', 'revision'].includes(form.type)) {
    errors.push('Pick a valid card type');
  }
  if (!form.stage) errors.push('Pick a stage');
  if (!form.assignee && !form.assigneeId) errors.push('Pick an assignee');

  if (description.length > MAX_DESCRIPTION) {
    errors.push(`Description cannot exceed ${MAX_DESCRIPTION} characters`);
  }

  if (!dueDate) {
    errors.push('Due date is required');
  } else {
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) errors.push('Due date is invalid');
    else if (!allowPastDue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (due < today) errors.push('Due date cannot be in the past');
    }
  }

  const priority = form.priority;
  if (priority != null && !['none', 'low', 'medium', 'high', true, false].includes(priority)) {
    errors.push('Pick a valid priority');
  }

  return errors;
}

export function validateComment(text) {
  const value = String(text || '').trim();
  if (!value) return 'Comment cannot be empty';
  if (value.length < 2) return 'Comment must be at least 2 characters';
  if (value.length > MAX_COMMENT) return `Comment cannot exceed ${MAX_COMMENT} characters`;
  return '';
}

export function validateFeedback({ status, note, rating }) {
  const errors = [];
  if (!FEEDBACK_STATUS.some((s) => s.value === status)) {
    errors.push('Pick a valid feedback status');
  }
  if (status === 'approved' || status === 'changes_requested') {
    const cleaned = String(note || '').trim();
    if (!cleaned) errors.push('Add a feedback note when approving or requesting changes');
    else if (cleaned.length > MAX_FEEDBACK) errors.push(`Feedback cannot exceed ${MAX_FEEDBACK} characters`);
  } else if (String(note || '').trim().length > MAX_FEEDBACK) {
    errors.push(`Feedback cannot exceed ${MAX_FEEDBACK} characters`);
  }
  if (rating != null && rating !== '') {
    const n = Number(rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) errors.push('Rating must be between 1 and 5');
  }
  return errors;
}

export function validateFiles(fileList, existingCount = 0) {
  const files = Array.from(fileList || []);
  if (!files.length) return { ok: [], errors: ['Choose at least one file'] };

  const errors = [];
  if (existingCount + files.length > MAX_FILES_PER_CARD) {
    errors.push(`A card can have at most ${MAX_FILES_PER_CARD} attachments`);
  }

  const ok = [];
  for (const file of files) {
    const ext = extOf(file.name);
    if (!ALLOWED_EXT.has(ext)) {
      errors.push(`"${file.name}" type is not allowed`);
      continue;
    }
    if (file.size <= 0) {
      errors.push(`"${file.name}" is empty`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`"${file.name}" exceeds 10 MB`);
      continue;
    }
    ok.push(file);
  }

  return { ok, errors };
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function fromDateInputValue(value) {
  if (!value) return null;
  const d = new Date(`${value}T17:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
