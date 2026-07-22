/** Admin-only client statuses (aligned with the Wikipedia tracking sheet). */

export const CLIENT_PAYMENT_STATUSES = [
  { value: 'paid', label: 'Paid' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'upfront', label: 'Upfront' },
  { value: 'payment_after_draft', label: 'Payment After Draft' },
  { value: 'declined', label: 'Declined' },
];

export const CLIENT_ORDER_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'draft_in_progress', label: 'Draft in progress' },
  { value: 'draft_in_revision', label: 'Draft in Revision' },
  { value: 'live_in_progress', label: 'Live in Progress' },
  { value: 'page_live', label: 'Page Live' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function clientPaymentStatusLabel(value) {
  return CLIENT_PAYMENT_STATUSES.find((s) => s.value === value)?.label || value || '—';
}

export function clientOrderStatusLabel(value) {
  return CLIENT_ORDER_STATUSES.find((s) => s.value === value)?.label || value || '—';
}

export function clientStatusTone(kind, value) {
  if (!value) return 'none';
  if (kind === 'payment') {
    if (value === 'paid') return 'success';
    if (value === 'partially_paid') return 'warn';
    if (value === 'upfront') return 'info';
    if (value === 'payment_after_draft') return 'slate';
    if (value === 'declined') return 'danger';
  }
  if (kind === 'order') {
    if (value === 'new') return 'info';
    if (value === 'draft_in_progress') return 'warn';
    if (value === 'draft_in_revision') return 'orange';
    if (value === 'live_in_progress') return 'teal';
    if (value === 'page_live') return 'success';
    if (value === 'cancelled') return 'danger';
  }
  if (kind === 'production') {
    if (value === 'done') return 'success';
    if (value === 'in_production') return 'teal';
    if (value === 'pending') return 'none';
  }
  return 'none';
}
