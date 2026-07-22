// Ported 1:1 from frontend/src/utils/deadlineUtils.js so both sides agree.
export const DEADLINE_DAYS = { draft: 4, revision: 2 };
const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;

export function computeDueDate(type, createdAt) {
  const days = DEADLINE_DAYS[type] ?? DEADLINE_DAYS.draft;
  const due = new Date(createdAt);
  due.setDate(due.getDate() + days);
  return due;
}

export function getHoursRemaining(dueDate, now = new Date()) {
  return (new Date(dueDate) - now) / MS_PER_HOUR;
}

/** Cron windows: due_1d (12h–24h left), due_12h (0h–12h left). */
export function classifyDeadlineAlertKind(dueDate, now = new Date()) {
  const hoursLeft = getHoursRemaining(dueDate, now);
  if (hoursLeft > 12 && hoursLeft <= 24) return 'due_1d';
  if (hoursLeft > 0 && hoursLeft <= 12) return 'due_12h';
  return null;
}

export function getDeadlineInfo(dueDate, now = new Date()) {
  const daysRemaining = Math.ceil((new Date(dueDate) - now) / MS_PER_DAY);
  let tone = 'ok';
  if (daysRemaining < 0) tone = 'overdue';
  else if (daysRemaining <= 1) tone = 'warn';

  let label;
  if (daysRemaining < 0) label = `${Math.abs(daysRemaining)}d overdue`;
  else if (daysRemaining === 0) label = 'Due today';
  else label = `${daysRemaining}d left`;

  return { daysRemaining, tone, label };
}

export function needsDeadlineAlert(card, now = new Date()) {
  if (card.stage === 'done' || card.stage === 'live' || card.stage === 'page_live' || card.stage === 'stopped_process' || card.stage === 'pages_to_relive') return false;
  return getDeadlineInfo(card.due_date ?? card.dueDate, now).tone !== 'ok';
}
