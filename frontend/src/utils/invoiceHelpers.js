/** Add N weekdays (Monday-Friday) to a date. */
export function addWorkingDays(from, days = 4) {
  const date = new Date(from);
  let left = days;
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return date;
}

export function invoiceNumberFromPayment(paymentId) {
  const number = Number(paymentId) || 0;
  return `WIKI-${String(number).padStart(4, '0')}`;
}
