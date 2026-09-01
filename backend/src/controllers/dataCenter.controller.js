import { pool } from '../config/db.js';
import { toCsv } from '../utils/csvParse.js';
import {
  insertUniqueLeads,
  normalizeLeadInput,
  rowsFromCsvText,
  rowsFromJsonBody,
  uniqueLeads,
} from '../services/dataCenter.js';

const UNKNOWN = '__unknown__';
const MAX_PAGE = 100;
const DEFAULT_PAGE = 25;
const EXPORT_CAP = 100000;
const MAX_SEARCH = 80;

function likeContains(raw) {
  const q = String(raw || '').trim().slice(0, MAX_SEARCH);
  if (!q) return null;
  return `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
}

function toLead(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    university: row.university || null,
    country: row.country || null,
    emailDomain: row.email_domain || null,
    status: row.status || null,
    notes: row.notes || null,
    source: row.source || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildWhere(query) {
  const where = [];
  const params = [];
  const like = likeContains(query.q || query.search);
  if (like) {
    where.push(
      `(name LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!' OR university LIKE ? ESCAPE '!' OR country LIKE ? ESCAPE '!')`,
    );
    params.push(like, like, like, like);
  }

  const university = String(query.university || '').trim();
  if (university === UNKNOWN) {
    where.push("(university IS NULL OR university = '')");
  } else if (university) {
    where.push('university = ?');
    params.push(university);
  }

  const country = String(query.country || '').trim();
  if (country === UNKNOWN) {
    where.push("(country IS NULL OR country = '')");
  } else if (country) {
    where.push('country = ?');
    params.push(country);
  }

  return {
    clause: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

async function insertLeads(leads) {
  return insertUniqueLeads(pool, leads);
}

/**
 * GET /api/data-center
 */
export async function listLeads(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const rawSize = Number(req.query.pageSize);
  const pageSize = Number.isFinite(rawSize) && rawSize > 0
    ? Math.min(MAX_PAGE, Math.floor(rawSize))
    : DEFAULT_PAGE;

  const { clause, params } = buildWhere(req.query);

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS total FROM data_center_leads ${clause}`,
    params,
  );
  const total = Number(totals.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);

  const [rows] = await pool.query(
    `SELECT * FROM data_center_leads ${clause}
     ORDER BY name ASC, id ASC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (safePage - 1) * pageSize],
  );

  res.json({
    leads: rows.map(toLead),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
  });
}

/**
 * GET /api/data-center/meta
 */
export async function listMeta(req, res) {
  const [[summary]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT NULLIF(university, '')) AS universities,
       COUNT(DISTINCT NULLIF(country, '')) AS countries
     FROM data_center_leads`,
  );

  const [uniRows] = await pool.query(
    `SELECT university AS value, COUNT(*) AS count
     FROM data_center_leads
     WHERE university IS NOT NULL AND university <> ''
     GROUP BY university
     ORDER BY university ASC`,
  );
  const [countryRows] = await pool.query(
    `SELECT country AS value, COUNT(*) AS count
     FROM data_center_leads
     WHERE country IS NOT NULL AND country <> ''
     GROUP BY country
     ORDER BY country ASC`,
  );
  const [[unknownUni]] = await pool.query(
    `SELECT COUNT(*) AS count FROM data_center_leads
     WHERE university IS NULL OR university = ''`,
  );
  const [[unknownCountry]] = await pool.query(
    `SELECT COUNT(*) AS count FROM data_center_leads
     WHERE country IS NULL OR country = ''`,
  );

  res.json({
    summary: {
      total: Number(summary.total || 0),
      universities: Number(summary.universities || 0),
      countries: Number(summary.countries || 0),
    },
    universities: uniRows.map((r) => ({ value: r.value, count: Number(r.count) })),
    countries: countryRows.map((r) => ({ value: r.value, count: Number(r.count) })),
    unknownUniversity: Number(unknownUni.count || 0),
    unknownCountry: Number(unknownCountry.count || 0),
  });
}

/**
 * GET /api/data-center/export
 */
export async function exportLeads(req, res) {
  const { clause, params } = buildWhere(req.query);
  const [rows] = await pool.query(
    `SELECT name, email, university, country, status, notes
     FROM data_center_leads ${clause}
     ORDER BY name ASC, id ASC
     LIMIT ?`,
    [...params, EXPORT_CAP],
  );

  const csv = toCsv(
    ['Name', 'Email', 'University', 'Country', 'Status', 'Notes'],
    rows.map((row) => ({
      Name: row.name,
      Email: row.email,
      University: row.university || '',
      Country: row.country || '',
      Status: row.status || '',
      Notes: row.notes || '',
    })),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="data-center-${stamp}.csv"`);
  res.send(`\uFEFF${csv}`);
}

async function importFromRawRows(rawRows, source) {
  const tagged = rawRows.map((row) => ({ ...row, source: row.source || source }));
  const { leads, skippedInvalid, skippedDuplicate } = uniqueLeads(tagged);
  const inserted = await insertLeads(leads);
  return {
    received: rawRows.length,
    unique: leads.length,
    inserted,
    skippedExisting: Math.max(0, leads.length - inserted),
    skippedInvalid,
    skippedDuplicate,
  };
}

/**
 * POST /api/data-center/import
 * CSV file (field: file) or JSON { rows } / { csv }.
 */
export async function importLeads(req, res) {
  let rawRows = [];
  const file = req.file;
  if (file?.buffer) {
    const text = file.buffer.toString('utf8');
    rawRows = rowsFromCsvText(text);
  } else {
    rawRows = rowsFromJsonBody(req.body || {});
  }

  if (!rawRows.length) {
    return res.status(400).json({ error: 'No rows to import. Upload a CSV or send { rows: [...] }.' });
  }
  if (rawRows.length > 60000) {
    return res.status(400).json({ error: 'Import is limited to 60,000 rows at a time' });
  }

  const result = await importFromRawRows(rawRows, file ? 'csv-upload' : 'json-import');
  res.status(201).json(result);
}

/**
 * POST /api/data-center
 */
export async function createLead(req, res) {
  const lead = normalizeLeadInput(req.body || {});
  if (!lead) return res.status(400).json({ error: 'A valid email is required' });
  lead.source = lead.source || 'manual';

  try {
    const [result] = await pool.query(
      `INSERT INTO data_center_leads
         (name, email, university, country, email_domain, status, notes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lead.name,
        lead.email,
        lead.university,
        lead.country,
        lead.emailDomain,
        lead.status,
        lead.notes,
        lead.source,
      ],
    );
    const [[row]] = await pool.query('SELECT * FROM data_center_leads WHERE id = ?', [result.insertId]);
    return res.status(201).json({ lead: toLead(row) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This email is already in Data Center' });
    }
    throw err;
  }
}

/**
 * PATCH /api/data-center/:id
 */
export async function updateLead(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });

  const [[existing]] = await pool.query('SELECT * FROM data_center_leads WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Lead not found' });

  const merged = normalizeLeadInput({
    name: req.body.name !== undefined ? req.body.name : existing.name,
    email: req.body.email !== undefined ? req.body.email : existing.email,
    university: req.body.university !== undefined ? req.body.university : existing.university,
    country: req.body.country !== undefined ? req.body.country : existing.country,
    status: req.body.status !== undefined ? req.body.status : existing.status,
    notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
    source: existing.source,
  });
  if (!merged) return res.status(400).json({ error: 'A valid email is required' });

  try {
    await pool.query(
      `UPDATE data_center_leads
       SET name = ?, email = ?, university = ?, country = ?, email_domain = ?, status = ?, notes = ?
       WHERE id = ?`,
      [
        merged.name,
        merged.email,
        merged.university,
        merged.country,
        merged.emailDomain,
        merged.status,
        merged.notes,
        id,
      ],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This email is already in Data Center' });
    }
    throw err;
  }

  const [[row]] = await pool.query('SELECT * FROM data_center_leads WHERE id = ?', [id]);
  res.json({ lead: toLead(row) });
}

/**
 * DELETE /api/data-center/:id
 */
export async function deleteLead(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
  const [result] = await pool.query('DELETE FROM data_center_leads WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Lead not found' });
  res.status(204).end();
}
