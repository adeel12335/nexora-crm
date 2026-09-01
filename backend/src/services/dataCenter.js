import { parseCsv } from '../utils/csvParse.js';
import {
  isValidEmail,
  normalizeEmail,
  resolveLeadPlace,
} from '../utils/leadUniversity.js';

const HEADER_ALIASES = {
  name: ['name', 'full name', 'full_name', 'lead', 'lead name', 'professor'],
  email: ['email', 'e-mail', 'e_mail', 'mail', 'email address'],
  university: ['university', 'uni', 'school', 'college', 'institution', 'campus'],
  country: ['country', 'nation', 'location'],
  status: ['status'],
  notes: ['notes', 'note', 'remarks', 'comment', 'comments'],
};

function headerIndex(headerRow) {
  const cells = (headerRow || []).map((h) => String(h || '').trim().toLowerCase());
  const idx = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    idx[field] = cells.findIndex((cell) => aliases.includes(cell));
  }
  return idx;
}

function cell(row, index) {
  if (index == null || index < 0) return '';
  return String(row[index] ?? '').trim();
}

function clip(value, max) {
  const s = String(value || '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function normalizeLeadInput(raw) {
  const email = normalizeEmail(raw.email);
  if (!isValidEmail(email)) return null;

  const place = resolveLeadPlace({
    email,
    university: raw.university,
    country: raw.country,
  });

  const local = email.split('@')[0] || 'Unknown';
  const name = clip(raw.name, 200) || local;

  return {
    name,
    email,
    university: place.university,
    country: place.country,
    emailDomain: place.emailDomain,
    status: clip(raw.status, 80),
    notes: clip(raw.notes, 255),
    source: clip(raw.source, 80) || 'import',
  };
}

/**
 * Dedup by email (first complete-enough row wins).
 * Returns { leads, skippedInvalid, skippedDuplicate }.
 */
export function uniqueLeads(rawRows) {
  const seen = new Set();
  const leads = [];
  let skippedInvalid = 0;
  let skippedDuplicate = 0;

  for (const raw of rawRows) {
    const lead = normalizeLeadInput(raw);
    if (!lead) {
      skippedInvalid += 1;
      continue;
    }
    if (seen.has(lead.email)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(lead.email);
    leads.push(lead);
  }

  return { leads, skippedInvalid, skippedDuplicate };
}

export function rowsFromCsvText(text) {
  const table = parseCsv(text);
  if (!table.length) return [];
  const idx = headerIndex(table[0]);
  const hasHeader = idx.email >= 0 || idx.name >= 0;
  const start = hasHeader ? 1 : 0;
  const emailI = hasHeader && idx.email >= 0 ? idx.email : 1;
  const nameI = hasHeader && idx.name >= 0 ? idx.name : 0;

  const rows = [];
  for (let i = start; i < table.length; i += 1) {
    const row = table[i];
    rows.push({
      name: cell(row, nameI),
      email: cell(row, emailI),
      university: cell(row, idx.university),
      country: cell(row, idx.country),
      status: cell(row, idx.status),
      notes: cell(row, idx.notes >= 0 ? idx.notes : 3),
    });
  }
  return rows;
}

export function rowsFromJsonBody(body) {
  if (Array.isArray(body?.rows)) return body.rows;
  if (Array.isArray(body?.leads)) return body.leads;
  if (typeof body?.csv === 'string') return rowsFromCsvText(body.csv);
  return [];
}

const INSERT_CHUNK = 400;

export async function insertUniqueLeads(pool, leads) {
  let inserted = 0;
  for (let i = 0; i < leads.length; i += INSERT_CHUNK) {
    const chunk = leads.slice(i, i + INSERT_CHUNK).map((lead) => [
      lead.name,
      lead.email,
      lead.university,
      lead.country,
      lead.emailDomain,
      lead.status,
      lead.notes,
      lead.source,
    ]);
    const [result] = await pool.query(
      `INSERT IGNORE INTO data_center_leads
         (name, email, university, country, email_domain, status, notes, source)
       VALUES ?`,
      [chunk],
    );
    inserted += Number(result.affectedRows || 0);
  }
  return inserted;
}
