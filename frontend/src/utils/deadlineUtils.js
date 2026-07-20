export const DEADLINE_DAYS = { draft: 4, revision: 2 };
const MS_PER_DAY = 86400000;

export function computeDueDate(type, createdAt) {
  const days = DEADLINE_DAYS[type] ?? DEADLINE_DAYS.draft;
  const due = new Date(createdAt);
  due.setDate(due.getDate() + days);
  return due;
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
  if (card.stage === 'done') return false;
  return getDeadlineInfo(card.dueDate, now).tone !== 'ok';
}
