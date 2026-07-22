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

export const CLIENT_PAYMENT_STATUS_SET = new Set(CLIENT_PAYMENT_STATUSES.map((s) => s.value));
export const CLIENT_ORDER_STATUS_SET = new Set(CLIENT_ORDER_STATUSES.map((s) => s.value));

export function clientPaymentStatusLabel(value) {
  return CLIENT_PAYMENT_STATUSES.find((s) => s.value === value)?.label || null;
}

export function clientOrderStatusLabel(value) {
  return CLIENT_ORDER_STATUSES.find((s) => s.value === value)?.label || null;
}
