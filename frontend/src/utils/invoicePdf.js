import { jsPDF } from 'jspdf';

export const DEFAULT_INVOICE_CONTENT = {
  phone: '+1 (218) 305-9586',
  email: 'ml.wikipediamanager@gmail.com',
  serviceTitle: 'WIKIPEDIA PAGE EXPANSION',
  serviceBullets: [
    'Notability & Source Evaluation',
    'Research & Information',
    'Verification',
    'Citation & Reference',
    'Formatting',
    'Article Submission & Review',
    'Handling',
  ],
  terms: [
    'Payment is due in 4 working days.',
    '100% refund policy if page is not published.',
  ],
};

function moneyUsd(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatInvoiceDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

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

async function loadImageDataUrl(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load ${src}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${src}`));
    reader.readAsDataURL(blob);
  });
}

/**
 * Create a dynamic Wiki Studio invoice using the approved one-page layout.
 * Assets are injected so the same renderer can be used in the browser and in
 * automated PDF verification.
 */
export function createClientInvoicePdf(data, { logoData, globeData }) {
  const issued = data.issuedAt ? new Date(data.issuedAt) : new Date();
  const due = data.dueAt ? new Date(data.dueAt) : addWorkingDays(issued, 4);
  const quantity = Math.max(1, Number(data.quantity ?? 1));
  const rate = Number(data.rateAmount ?? data.dealAmount ?? 0);
  const total = Number(data.totalAmount ?? rate * quantity);
  const deposit = Number(data.depositAmount || 0);
  const remaining = Number(data.remainingAmount ?? Math.max(0, total - deposit));
  const invoiceNumber = data.invoiceNumber || 'WIKI-0000';
  const paymentLink = String(data.paymentLink || '').trim();
  const paymentMethodLabel = String(data.paymentMethodLabel || data.paymentMethod || 'Stripe').trim();
  const serviceTitle = String(data.serviceTitle || DEFAULT_INVOICE_CONTENT.serviceTitle);
  const serviceBullets = Array.isArray(data.serviceBullets) && data.serviceBullets.length
    ? data.serviceBullets.map(String)
    : DEFAULT_INVOICE_CONTENT.serviceBullets;
  const terms = Array.isArray(data.terms) && data.terms.length
    ? data.terms.map(String)
    : DEFAULT_INVOICE_CONTENT.terms;
  const brandPhone = String(data.brandPhone || DEFAULT_INVOICE_CONTENT.phone);
  const brandEmail = String(data.brandEmail || DEFAULT_INVOICE_CONTENT.email);

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const colors = {
    ink: [21, 21, 21],
    text: [43, 43, 43],
    muted: [105, 105, 105],
    border: [216, 216, 216],
    surface: [247, 247, 247],
    railMuted: [168, 168, 168],
    white: [255, 255, 255],
  };
  const railWidth = 126;
  const mainLeft = 154;
  const mainRight = pageWidth - 38;
  const mainWidth = mainRight - mainLeft;
  const isPaid = remaining <= 0;

  doc.setFillColor(...colors.white);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // A full-height editorial rail makes this composition clearly distinct
  // from the previous card-based invoice while keeping it print friendly.
  doc.setFillColor(...colors.ink);
  doc.rect(0, 0, railWidth, pageHeight, 'F');
  doc.setTextColor(...colors.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('THE WIKI STUDIO', 22, 38);
  doc.setDrawColor(74, 74, 74);
  doc.setLineWidth(0.8);
  doc.line(22, 53, 104, 53);

  doc.setFontSize(34);
  doc.text('INVOICE', 78, 302, { angle: 90 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.railMuted);
  doc.text('PROFESSIONAL SERVICES', 24, 323);

  doc.setFillColor(...colors.white);
  doc.roundedRect(22, 344, 82, 26, 6, 6, 'F');
  doc.setTextColor(...colors.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(isPaid ? 'PAID' : 'BALANCE DUE', 63, 361, { align: 'center' });

  const railMeta = [
    ['INVOICE NO.', invoiceNumber],
    ['DATE ISSUED', formatInvoiceDate(issued)],
    ['DUE DATE', formatInvoiceDate(due)],
  ];
  railMeta.forEach(([label, value], index) => {
    const y = 418 + index * 64;
    doc.setTextColor(...colors.railMuted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(label, 22, y);
    doc.setTextColor(...colors.white);
    doc.setFontSize(10.5);
    doc.text(value, 22, y + 18);
  });

  doc.setDrawColor(74, 74, 74);
  doc.line(22, 714, 104, 714);
  doc.setTextColor(...colors.railMuted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('CONTACT', 22, 736);
  doc.setTextColor(...colors.white);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text(brandPhone, 22, 756);
  const railEmail = doc.splitTextToSize(brandEmail, 82).slice(0, 2);
  doc.text(railEmail, 22, 776);

  // Main masthead.
  doc.addImage(logoData, 'PNG', 137, -59, 218, 218);
  doc.setTextColor(...colors.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PROFESSIONAL SERVICES', mainRight, 38, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('USD / ONE-PAGE STATEMENT', mainRight, 54, { align: 'right' });
  doc.setDrawColor(...colors.ink);
  doc.setLineWidth(1.1);
  doc.line(mainLeft, 96, mainRight, 96);

  // Recipient and due amount share the first visual row.
  doc.setTextColor(...colors.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('BILL TO', mainLeft, 124);
  doc.text(isPaid ? 'PAYMENT STATUS' : 'AMOUNT DUE', mainRight, 124, { align: 'right' });
  doc.setTextColor(...colors.ink);
  doc.setFontSize(19);
  const clientLines = doc.splitTextToSize(String(data.clientName || '-'), 218).slice(0, 2);
  doc.text(clientLines, mainLeft, 152);
  doc.setFontSize(21);
  doc.text(isPaid ? 'PAID' : moneyUsd(remaining), mainRight, 153, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...colors.muted);
  // A wrapped 2-line client name pushes everything below it down by one
  // text line so it never collides with the email / balance-paid caption.
  const nameShift = clientLines.length > 1 ? 22 : 0;
  const emailY = 176 + nameShift;
  if (data.clientEmail) doc.text(String(data.clientEmail), mainLeft, emailY);
  doc.setFontSize(8.5);
  doc.text(isPaid ? 'No balance outstanding' : `Paid to date: ${moneyUsd(deposit)}`, mainRight, emailY, { align: 'right' });

  const dividerY1 = 201 + nameShift;
  doc.setDrawColor(...colors.border);
  doc.setLineWidth(0.8);
  doc.line(mainLeft, dividerY1, mainRight, dividerY1);

  // Compact service facts replace the former pair of rounded metadata cards.
  const facts = [
    ['SERVICE', serviceTitle],
    ['QUANTITY', String(quantity)],
    ['CURRENCY', 'USD'],
  ];
  const factX = [mainLeft, 421, 501];
  const factWidths = [245, 62, 56];
  const factLabelY = dividerY1 + 23;
  const factValueY = dividerY1 + 43;
  facts.forEach(([label, value], index) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...colors.muted);
    doc.text(label, factX[index], factLabelY);
    doc.setFontSize(index === 0 ? 10.5 : 11);
    doc.setTextColor(...colors.ink);
    const lines = doc.splitTextToSize(String(value).toUpperCase(), factWidths[index]).slice(0, 1);
    doc.text(lines, factX[index], factValueY);
  });
  const dividerY2 = dividerY1 + 62;
  doc.line(mainLeft, dividerY2, mainRight, dividerY2);

  // Minimal editorial line-item table. Its height follows the actual bullet
  // count instead of a fixed number, so a short service list never leaves a
  // large empty gap (and a long one never gets clipped without growing).
  const headerTop = dividerY2 + 17;
  const headerLabelY = headerTop + 21;
  doc.setFillColor(...colors.surface);
  doc.rect(mainLeft, headerTop, mainWidth, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...colors.text);
  doc.text('DESCRIPTION', mainLeft + 12, headerLabelY);
  doc.text('QTY', 407, headerLabelY, { align: 'center' });
  doc.text('RATE', 478, headerLabelY, { align: 'right' });
  doc.text('TOTAL', mainRight, headerLabelY, { align: 'right' });

  const itemBoxTop = headerTop + 34;
  const rowContentY = itemBoxTop + 28;
  const bulletsStartY = itemBoxTop + 54;
  const bulletLineHeight = 15;
  const bulletsToShow = serviceBullets.slice(0, 7);
  const bulletsBlockBottom = bulletsToShow.length
    ? bulletsStartY + (bulletsToShow.length - 1) * bulletLineHeight + 18
    : rowContentY + 26;
  const itemBoxBottom = Math.max(itemBoxTop + 68, bulletsBlockBottom);

  doc.setDrawColor(...colors.border);
  doc.rect(mainLeft, itemBoxTop, mainWidth, itemBoxBottom - itemBoxTop, 'S');
  doc.line(391, itemBoxTop, 391, itemBoxBottom);
  doc.setTextColor(...colors.ink);
  doc.setFontSize(12);
  doc.text(doc.splitTextToSize(serviceTitle.toUpperCase(), 218).slice(0, 2), mainLeft + 12, rowContentY);
  doc.setFontSize(10.5);
  doc.text(String(quantity), 407, rowContentY, { align: 'center' });
  doc.text(moneyUsd(rate), 478, rowContentY, { align: 'right' });
  doc.text(moneyUsd(total), mainRight, rowContentY, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);
  doc.setTextColor(...colors.muted);
  let bulletY = bulletsStartY;
  for (const line of bulletsToShow) {
    doc.setFillColor(...colors.ink);
    doc.rect(mainLeft + 14, bulletY - 5, 3, 3, 'F');
    doc.text(doc.splitTextToSize(line, 208).slice(0, 1), mainLeft + 25, bulletY);
    bulletY += bulletLineHeight;
  }

  // Everything below the item table shifts by however much its dynamic
  // height differs from the original fixed 166pt, keeping consistent gaps
  // whether the table grew or shrank.
  const belowShift = itemBoxBottom - 480;

  // Payment instructions and totals form one open, asymmetrical composition.
  doc.setFillColor(...colors.surface);
  doc.rect(mainLeft, 503 + belowShift, 244, 128, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.muted);
  doc.text('PAYMENT METHOD', mainLeft + 16, 527 + belowShift);
  doc.setTextColor(...colors.ink);
  doc.setFontSize(14);
  doc.text(paymentMethodLabel, mainLeft + 16, 552 + belowShift);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(...colors.muted);
  if (paymentLink) {
    const linkLines = doc.splitTextToSize(paymentLink, 210).slice(0, 2);
    doc.textWithLink(linkLines[0], mainLeft + 16, 576 + belowShift, { url: paymentLink });
    if (linkLines[1]) doc.textWithLink(linkLines[1], mainLeft + 16, 590 + belowShift, { url: paymentLink });
    doc.setFontSize(8.2);
    doc.text('Secure checkout link', mainLeft + 16, 612 + belowShift);
  } else {
    doc.text(`Paid via ${paymentMethodLabel}.`, mainLeft + 16, 576 + belowShift);
    doc.setFontSize(8.2);
    doc.text(brandEmail, mainLeft + 16, 603 + belowShift);
  }

  const totalsLeft = 420;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.muted);
  doc.text('PAYMENT SUMMARY', totalsLeft, 519 + belowShift);
  const summaryRows = [
    ['Invoice total', moneyUsd(total)],
    ['Paid to date', `- ${moneyUsd(deposit)}`],
  ];
  summaryRows.forEach(([label, value], index) => {
    const y = 548 + belowShift + index * 25;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(...colors.muted);
    doc.text(label, totalsLeft, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.text);
    doc.text(value, mainRight, y, { align: 'right' });
  });
  doc.setDrawColor(...colors.ink);
  doc.setLineWidth(1.2);
  doc.line(totalsLeft, 589 + belowShift, mainRight, 589 + belowShift);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.ink);
  doc.text(isPaid ? 'STATUS' : 'BALANCE', totalsLeft, 610 + belowShift);
  doc.setFontSize(18);
  doc.text(isPaid ? 'PAID' : moneyUsd(remaining), mainRight, 628 + belowShift, { align: 'right' });

  // Terms and closing note.
  doc.setDrawColor(...colors.border);
  doc.setLineWidth(0.8);
  doc.line(mainLeft, 671 + belowShift, mainRight, 671 + belowShift);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.ink);
  doc.text('TERMS & CONDITIONS', mainLeft, 696 + belowShift);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);
  doc.setTextColor(...colors.muted);
  let termY = 719 + belowShift;
  for (const term of terms.slice(0, 3)) {
    doc.setFillColor(...colors.ink);
    doc.circle(mainLeft + 2, termY - 3, 1.4, 'F');
    doc.text(doc.splitTextToSize(term, 360).slice(0, 1), mainLeft + 12, termY);
    termY += 18;
  }

  doc.line(mainLeft, 790 + belowShift, mainRight, 790 + belowShift);
  doc.setFontSize(8.2);
  doc.setTextColor(...colors.muted);
  doc.text('Thank you for choosing The Wiki Studio.', mainLeft, 813 + belowShift);
  doc.text(`INV-${invoiceNumber}`, mainRight, 813 + belowShift, { align: 'right' });

  // Full-page Wiki background remains visible everywhere at print-safe opacity.
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.013 }));
  doc.addImage(globeData, 'PNG', -118, -22, 836, pageHeight + 44);
  doc.restoreGraphicsState();

  return { doc, filename: `INV-${invoiceNumber}.pdf` };
}

export async function downloadClientInvoice(data) {
  const [logoData, globeData] = await Promise.all([
    loadImageDataUrl('/assets/invoice-logo.png'),
    loadImageDataUrl('/assets/invoice-globe.png'),
  ]);
  const { doc, filename } = createClientInvoicePdf(data, { logoData, globeData });
  doc.save(filename);
  return filename;
}
