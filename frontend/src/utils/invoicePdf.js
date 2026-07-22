import { jsPDF } from 'jspdf';
import { addWorkingDays } from './invoiceHelpers.js';

export { addWorkingDays, invoiceNumberFromPayment } from './invoiceHelpers.js';

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

const FONT_FILES = Object.freeze({
  light: 'Poppins-Light.ttf',
  normal: 'Poppins-Regular.ttf',
  semibold: 'Poppins-SemiBold.ttf',
  bold: 'Poppins-Bold.ttf',
  extrabold: 'Poppins-ExtraBold.ttf',
});

function registerInvoiceFonts(doc, fontData) {
  if (!fontData) return false;

  const dataByStyle = {
    light: fontData.light,
    normal: fontData.regular,
    semibold: fontData.semiBold,
    bold: fontData.bold,
    extrabold: fontData.extraBold,
  };

  Object.entries(FONT_FILES).forEach(([style, filename]) => {
    doc.addFileToVFS(filename, dataByStyle[style]);
    doc.addFont(filename, 'Poppins', style);
  });
  return true;
}

function moneyUsd(value) {
  const amount = Number(value || 0);
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
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

async function loadBinaryBase64(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load ${src}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function setPoppins(doc, style, size) {
  if (doc.__invoiceHasPoppins) {
    doc.setFont('Poppins', style);
  } else {
    const fallbackStyle = ['bold', 'semibold', 'extrabold'].includes(style) ? 'bold' : 'normal';
    doc.setFont('helvetica', fallbackStyle);
  }
  doc.setFontSize(size);
  // Canva's PDF export applies tracking equal to roughly 1/24 em.
  doc.setCharSpace(size / 24);
}

function fitFontSize(doc, text, maxWidth, preferredSize, minimumSize = 8) {
  let size = preferredSize;
  doc.setFontSize(size);
  while (size > minimumSize && doc.getTextWidth(text) > maxWidth) {
    size -= 0.25;
    doc.setFontSize(size);
  }
  return size;
}

function drawFittedText(doc, text, x, y, options = {}) {
  const {
    maxWidth,
    preferredSize,
    minimumSize = 8,
    align,
  } = options;
  fitFontSize(doc, text, maxWidth, preferredSize, minimumSize);
  doc.text(text, x, y, align ? { align } : undefined);
}

function drawUnderlinedLink(doc, label, url, x, y, maxWidth) {
  const width = Math.min(doc.getTextWidth(label), maxWidth);
  doc.textWithLink(label, x, y, { url });
  doc.setLineWidth(0.65);
  doc.line(x, y + 1.9, x + width, y + 1.9);
}

/**
 * Create a dynamic invoice that follows the approved Wiki Studio reference.
 * Images are injected so the same renderer works in-browser and in visual tests.
 */
export function createClientInvoicePdf(data, { logoData, globeData, fontData }) {
  const issued = data.issuedAt ? new Date(data.issuedAt) : new Date();
  const due = data.dueAt ? new Date(data.dueAt) : addWorkingDays(issued, 4);
  const quantity = Math.max(1, Number(data.quantity ?? 1));
  const rate = Number(data.rateAmount ?? data.dealAmount ?? 0);
  const total = Number(data.totalAmount ?? rate * quantity);
  const deposit = Number(data.depositAmount || 0);
  const remaining = Number(data.remainingAmount ?? Math.max(0, total - deposit));
  const invoiceNumber = String(data.invoiceNumber || 'WIKI-0000');
  const paymentLink = String(data.paymentLink || '').trim();
  const paymentMethodLabel = String(
    data.paymentMethodLabel || data.paymentMethod || 'Stripe'
  ).trim();
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
  doc.__invoiceHasPoppins = registerInvoiceFonts(doc, fontData);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const black = [0, 0, 0];
  const paperGrey = [244, 244, 244];

  // Reference background: white masthead, light-grey invoice body and centre notch.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setFillColor(...paperGrey);
  doc.rect(0, 281, pageWidth, pageHeight - 281, 'F');
  doc.triangle(274.8, 281, 297.7, 258.8, 320.6, 281, 'F');

  // The watermark overlaps both sections exactly like the supplied invoice.
  doc.addImage(globeData, 'PNG', 355.8, 84.7, 361.5, 346.9);

  // The square source image is deliberately oversized and cropped by the page.
  doc.addImage(logoData, 'PNG', 12.3, -88.5, 327.9, 327.9);

  doc.setTextColor(...black);

  // Contact details.
  setPoppins(doc, 'normal', 10.55);
  doc.text(brandPhone, 554.1, 69.4, { align: 'right' });
  doc.text(brandEmail, 554.1, 85.9, { align: 'right' });

  // Invoice metadata.
  setPoppins(doc, 'normal', 12.55);
  doc.text(`Invoice Number: ${invoiceNumber}`, 54.9, 189.3);
  doc.text(`Date Issued: ${formatInvoiceDate(issued)}`, 54.9, 208.8);
  doc.text(`Due Date: ${formatInvoiceDate(due)}`, 54.9, 228.3);

  // Bill-to block.
  setPoppins(doc, 'bold', 13.62);
  doc.setCharSpace(1.5);
  doc.text('BILL TO:', 353.9, 190.5);

  setPoppins(doc, 'bold', 11.55);
  const clientName = String(data.clientName || '-');
  drawFittedText(doc, clientName, 353.9, 209.4, {
    maxWidth: 200,
    preferredSize: 11.55,
    minimumSize: 8.5,
  });

  const clientEmail = String(data.clientEmail || '').trim();
  if (clientEmail) {
    setPoppins(doc, 'normal', 11.55);
    fitFontSize(doc, clientEmail, 200.5, 11.55, 8.25);
    drawUnderlinedLink(doc, clientEmail, `mailto:${clientEmail}`, 353.9, 227.4, 200.5);
  }

  // Body title and line-item headings.
  setPoppins(doc, 'extrabold', 50.4);
  doc.text('INVOICE', 95.8, 546.3, { angle: 90 });

  setPoppins(doc, 'bold', 12.64);
  doc.setCharSpace(2.42);
  doc.text('DESCRIPTION', 114.8, 347.7);
  doc.text('QUANTITY', 339.4, 347.7, { align: 'center' });
  doc.text('RATE', 431.7, 347.7, { align: 'center' });
  doc.text('TOTAL', 508.1, 347.7, { align: 'center' });
  doc.setDrawColor(...black);
  doc.setLineWidth(3);
  doc.line(114.6, 357.7, 536.8, 357.7);

  // Main service row.
  setPoppins(doc, 'bold', 11.61);
  doc.setCharSpace(1.27);
  drawFittedText(doc, serviceTitle.toUpperCase(), 116.9, 390.3, {
    maxWidth: 199,
    preferredSize: 11.61,
    minimumSize: 8.5,
  });

  setPoppins(doc, 'normal', 10.58);
  doc.text(String(quantity), 339.4, 389.1, { align: 'center' });
  doc.text(moneyUsd(rate), 445.6, 391.4, { align: 'right' });
  doc.text(moneyUsd(total), 522, 391.4, { align: 'right' });

  // The supplied design groups three continuation lines without a new bullet.
  const referenceMarkerIndexes = new Set([0, 1, 3, 5]);
  const markerIndexes = serviceBullets.length === 7
    ? referenceMarkerIndexes
    : new Set(serviceBullets.map((_, index) => index));
  setPoppins(doc, 'normal', 11.55);
  serviceBullets.slice(0, 7).forEach((line, index) => {
    const y = 409.4 + index * 18;
    if (markerIndexes.has(index)) {
      doc.setFillColor(...black);
      doc.circle(119.7, y - 3.5, 1.75, 'F');
    }
    drawFittedText(doc, line, 131.4, y, {
      maxWidth: 190,
      preferredSize: 11.55,
      minimumSize: 8.5,
    });
  });

  // Deposit, balance and total summary.
  doc.setDrawColor(...black);
  doc.setLineWidth(1.5);
  doc.line(124.3, 552.2, 546.3, 552.2);

  setPoppins(doc, 'bold', 11.61);
  doc.setCharSpace(1.25);
  doc.text(`DEPOSIT : ${moneyUsd(deposit)}`, 533.6, 571.3, { align: 'right' });
  doc.text(`REMAINING: ${moneyUsd(remaining)}`, 533.6, 584.1, { align: 'right' });

  doc.setLineWidth(1.5);
  doc.line(124.3, 594.4, 546.3, 594.4);
  setPoppins(doc, 'bold', 16.54);
  doc.setCharSpace(3.17);
  doc.text(`TOTAL: ${moneyUsd(total)}`, 536.8, 618.3, { align: 'right' });
  doc.line(124.3, 626.3, 546.3, 626.3);

  // Payment method and secure link.
  setPoppins(doc, 'bold', 13.62);
  doc.setCharSpace(1.5);
  doc.text('PAYMENT METHOD:', 137.9, 665);
  doc.text(`${paymentMethodLabel.toUpperCase()}:`, 137.9, 681);

  const paymentDetail = paymentLink
    ? paymentLink.toUpperCase()
    : `CONTACT ${brandEmail.toUpperCase()}`;
  setPoppins(doc, 'normal', 10.62);
  doc.setCharSpace(1.16);
  fitFontSize(doc, paymentDetail, 408, 10.62, 7.5);
  if (paymentLink) {
    drawUnderlinedLink(doc, paymentDetail, paymentLink, 137.9, 697.9, 408);
  } else {
    doc.text(paymentDetail, 137.9, 697.9);
  }

  doc.setLineWidth(1.5);
  doc.line(124.5, 740.9, 546.3, 740.9);

  // Bottom-right terms block.
  setPoppins(doc, 'semibold', 13.62);
  doc.setCharSpace(1.5);
  doc.text('TERM AND CONDITIONS:', 554.1, 796.7, { align: 'right' });

  setPoppins(doc, 'light', 10.58);
  if (terms[0]) {
    drawFittedText(doc, terms[0], 554.1, 810.9, {
      maxWidth: 260,
      preferredSize: 10.58,
      minimumSize: 8.5,
      align: 'right',
    });
  }
  if (terms[1]) {
    drawFittedText(doc, terms[1], 554.1, 824.5, {
      maxWidth: 320,
      preferredSize: 10.58,
      minimumSize: 8.5,
      align: 'right',
    });
  }

  return { doc, filename: `INV-${invoiceNumber}.pdf` };
}

export async function downloadClientInvoice(data) {
  const [logoData, globeData, light, regular, semiBold, bold, extraBold] = await Promise.all([
    loadImageDataUrl('/assets/invoice-logo.png'),
    loadImageDataUrl('/assets/invoice-globe-watermark.png'),
    loadBinaryBase64('/assets/fonts/Poppins-Light.ttf'),
    loadBinaryBase64('/assets/fonts/Poppins-Regular.ttf'),
    loadBinaryBase64('/assets/fonts/Poppins-SemiBold.ttf'),
    loadBinaryBase64('/assets/fonts/Poppins-Bold.ttf'),
    loadBinaryBase64('/assets/fonts/Poppins-ExtraBold.ttf'),
  ]);
  const fontData = { light, regular, semiBold, bold, extraBold };
  const { doc, filename } = createClientInvoicePdf(data, { logoData, globeData, fontData });
  doc.save(filename);
  return filename;
}
