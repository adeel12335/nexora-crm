export const PAYMENT_METHODS = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'card', label: 'Credit / Debit card' },
  { value: 'payoneer', label: 'Payoneer' },
  { value: 'wise', label: 'Wise' },
  { value: 'zelle', label: 'Zelle' },
];

export function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label || value || '—';
}
