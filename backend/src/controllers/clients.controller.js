import { pool } from '../config/db.js';
import { money } from '../utils/commission.js';
import { getUserRate, getManagerRate } from '../utils/commissionRates.js';
import {
  getCycleBounds,
  rateMonthForPaymentDate,
  calcCommissionAmount,
} from '../utils/commissionCycle.js';
import { karachiWorkDate } from '../utils/karachiTime.js';

const PRODUCTION_STATUSES = new Set(['pending', 'in_production', 'done']);

export const PAYMENT_METHODS = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'card', label: 'Credit / Debit card' },
  { value: 'payoneer', label: 'Payoneer' },
  { value: 'wise', label: 'Wise' },
  { value: 'zelle', label: 'Zelle' },
];

const PAYMENT_METHOD_SET = new Set(PAYMENT_METHODS.map((m) => m.value));

function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label || null;
}

function toClient(row, { role = null } = {}) {
  // Production portal: client identity only — no agent, no money, no notes.
  if (role === 'production') {
    return {
      id: row.id,
      name: row.name,
      isActive: Boolean(row.is_active),
      productionStatus: row.production_status || 'pending',
    };
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    agentId: row.agent_id,
    agentName: row.agent_name ?? null,
    dealAmount: money(row.deal_amount),
    totalPaid: money(row.total_paid ?? 0),
    balance: money(Number(row.deal_amount) - Number(row.total_paid ?? 0)),
    notes: row.notes,
    isActive: Boolean(row.is_active),
    productionStatus: row.production_status || 'pending',
    createdAt: row.created_at,
  };
}

function toPayment(row, { includeSensitive = true } = {}) {
  const method = row.payment_method || null;
  const payment = {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name ?? null,
    amount: money(row.amount),
    paymentDate: row.payment_date,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
  if (includeSensitive) {
    payment.paymentMethod = method;
    payment.paymentMethodLabel = paymentMethodLabel(method);
    payment.notes = row.notes;
  }
  return payment;
}

const CLIENT_SELECT = `
  SELECT c.*,
    u.name AS agent_name,
    COALESCE((SELECT SUM(p.amount) FROM client_payments p WHERE p.client_id = c.id), 0) AS total_paid
  FROM clients c
  JOIN users u ON u.id = c.agent_id
`;

async function assertClientAccess(req, clientRow) {
  if (req.user.role === 'admin' || req.user.role === 'production') return;
  if (req.user.role === 'agent') {
    if (Number(clientRow.agent_id) !== Number(req.user.id)) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
    return;
  }
  if (req.user.role === 'manager') {
    if (Number(clientRow.agent_id) === Number(req.user.id)) return;
    const [[agent]] = await pool.query('SELECT manager_id FROM users WHERE id = ?', [
      clientRow.agent_id,
    ]);
    if (!agent || Number(agent.manager_id) !== Number(req.user.id)) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
    return;
  }
  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
}

function clientScopeSql(req) {
  if (req.user.role === 'admin' || req.user.role === 'production') {
    return { clause: '', params: [] };
  }
  if (req.user.role === 'agent') {
    return { clause: ' AND c.agent_id = ?', params: [req.user.id] };
  }
  if (req.user.role === 'manager') {
    return {
      clause: ' AND (c.agent_id = ? OR u.manager_id = ?)',
      params: [req.user.id, req.user.id],
    };
  }
  return { clause: ' AND 1=0', params: [] };
}

async function assertEarningAgent(agentId) {
  const [[user]] = await pool.query(
    `SELECT id, role, manager_id, is_active FROM users WHERE id = ?`,
    [agentId]
  );
  if (!user || !user.is_active) {
    const err = new Error('Agent not found or inactive');
    err.status = 400;
    throw err;
  }
  if (user.role !== 'agent' && user.role !== 'manager') {
    const err = new Error('Client must be assigned to an agent or manager (not production/admin)');
    err.status = 400;
    throw err;
  }
  return user;
}

async function createCommissionEntries(conn, { paymentId, clientId, agentId, managerId, amount, paymentDate }) {
  const month = rateMonthForPaymentDate(paymentDate);
  const { cycleStart, cycleEnd } = await getCycleBounds(paymentDate);
  const agentRate = await getUserRate(agentId, month);
  const entries = [];

  if (agentRate > 0) {
    const commissionAmount = calcCommissionAmount(amount, agentRate);
    await conn.query(
      `INSERT INTO commission_entries
        (payment_id, client_id, user_id, earner_role, rate_percentage, payment_amount, commission_amount, cycle_start, cycle_end)
       VALUES (?, ?, ?, 'agent', ?, ?, ?, ?, ?)`,
      [paymentId, clientId, agentId, agentRate, amount, commissionAmount, cycleStart, cycleEnd]
    );
    entries.push({ userId: agentId, role: 'agent', rate: agentRate, amount: commissionAmount });
  }

  if (managerId) {
    const managerRate = await getManagerRate(managerId, agentId, month);
    if (managerRate > 0) {
      const commissionAmount = calcCommissionAmount(amount, managerRate);
      await conn.query(
        `INSERT INTO commission_entries
          (payment_id, client_id, user_id, earner_role, rate_percentage, payment_amount, commission_amount, cycle_start, cycle_end)
         VALUES (?, ?, ?, 'manager', ?, ?, ?, ?, ?)`,
        [paymentId, clientId, managerId, managerRate, amount, commissionAmount, cycleStart, cycleEnd]
      );
      entries.push({ userId: managerId, role: 'manager', rate: managerRate, amount: commissionAmount });
    }
  }

  return { cycleStart, cycleEnd, entries };
}

/**
 * GET /api/clients?q=&agentId=&dateFrom=&dateTo=&productionStatus=&page=&pageSize=
 * dateFrom/dateTo filter on client created_at (YYYY-MM-DD).
 * Omit pageSize (or pass 0) to return every match.
 */
export async function listClients(req, res) {
  const { q, agentId, dateFrom, dateTo, productionStatus } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const rawSize = req.query.pageSize === undefined ? 0 : Number(req.query.pageSize);
  const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(500, Math.floor(rawSize)) : 0;

  let where = 'WHERE 1=1';
  const filterParams = [];
  const scope = clientScopeSql(req);
  where += scope.clause;
  filterParams.push(...scope.params);

  const includeInactive = String(req.query.includeInactive || '') === '1';
  if (!includeInactive) {
    where += ' AND c.is_active = 1';
  }
  if (q) {
    where += ` AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)`;
    const like = `%${q}%`;
    filterParams.push(like, like, like);
  }
  if (agentId && req.user.role === 'admin') {
    where += ` AND c.agent_id = ?`;
    filterParams.push(Number(agentId));
  }
  if (productionStatus && PRODUCTION_STATUSES.has(String(productionStatus))) {
    where += ` AND c.production_status = ?`;
    filterParams.push(String(productionStatus));
  }
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    where += ` AND DATE(c.created_at) >= ?`;
    filterParams.push(dateFrom);
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    where += ` AND DATE(c.created_at) <= ?`;
    filterParams.push(dateTo);
  }

  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(c.deal_amount), 0) AS total_deal,
       COALESCE(SUM((
         SELECT COALESCE(SUM(p.amount), 0) FROM client_payments p WHERE p.client_id = c.id
       )), 0) AS total_paid
     FROM clients c
     JOIN users u ON u.id = c.agent_id
     ${where}`,
    filterParams
  );

  const total = Number(totals.total || 0);
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = pageSize > 0 ? Math.min(page, totalPages) : 1;

  let sql = `${CLIENT_SELECT} ${where} ORDER BY c.created_at DESC, c.id DESC`;
  const params = [...filterParams];
  if (pageSize > 0) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, (safePage - 1) * pageSize);
  }

  const [rows] = await pool.query(sql, params);
  const role = req.user?.role || null;

  if (role === 'production') {
    return res.json({
      clients: rows.map((row) => toClient(row, { role })),
      summary: { total },
      pagination: {
        page: safePage,
        pageSize: pageSize || total,
        total,
        totalPages,
      },
    });
  }

  const totalDeal = money(totals.total_deal);
  const totalPaid = money(totals.total_paid);

  res.json({
    clients: rows.map((row) => toClient(row, { role })),
    summary: {
      total,
      totalDeal,
      totalPaid,
      outstanding: money(Number(totals.total_deal) - Number(totals.total_paid)),
    },
    pagination: {
      page: safePage,
      pageSize: pageSize || total,
      total,
      totalPages,
    },
  });
}

/** GET /api/clients/:id */
export async function getClient(req, res) {
  const [[row]] = await pool.query(`${CLIENT_SELECT} WHERE c.id = ?`, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Client not found' });
  await assertClientAccess(req, row);

  const role = req.user?.role || null;
  if (role === 'production') {
    return res.json({
      client: toClient(row, { role }),
      payments: [],
      commissions: [],
    });
  }

  const [payments] = await pool.query(
    `SELECT p.*, c.name AS client_name
     FROM client_payments p
     JOIN clients c ON c.id = p.client_id
     WHERE p.client_id = ?
     ORDER BY p.payment_date DESC, p.id DESC`,
    [req.params.id]
  );

  const [commissions] = await pool.query(
    `SELECT ce.*, u.name AS user_name
     FROM commission_entries ce
     JOIN users u ON u.id = ce.user_id
     WHERE ce.client_id = ?
     ORDER BY ce.created_at DESC`,
    [req.params.id]
  );

  const includeSensitive = role === 'admin';
  res.json({
    client: toClient(row, { role }),
    payments: payments.map((p) => toPayment(p, { includeSensitive })),
    commissions: commissions.map((ce) => ({
      id: ce.id,
      paymentId: ce.payment_id,
      userId: ce.user_id,
      userName: ce.user_name,
      earnerRole: ce.earner_role,
      ratePercentage: money(ce.rate_percentage),
      paymentAmount: money(ce.payment_amount),
      commissionAmount: money(ce.commission_amount),
      cycleStart: ce.cycle_start,
      cycleEnd: ce.cycle_end,
      createdAt: ce.created_at,
    })),
  });
}

/** POST /api/clients */
export async function createClient(req, res) {
  const { name, email, phone, agentId, dealAmount, notes } = req.body;
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return res.status(400).json({ error: 'Client name is required' });
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  await assertEarningAgent(agentId);
  const deal = money(dealAmount ?? 0);
  if (deal < 0) return res.status(400).json({ error: 'dealAmount cannot be negative' });

  const [result] = await pool.query(
    `INSERT INTO clients (name, email, phone, agent_id, deal_amount, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      trimmed,
      email ? String(email).trim().toLowerCase() : null,
      phone ? String(phone).trim() : null,
      agentId,
      deal,
      notes ? String(notes).trim() : null,
      req.user.id,
    ]
  );

  const [[row]] = await pool.query(`${CLIENT_SELECT} WHERE c.id = ?`, [result.insertId]);
  res.status(201).json({ client: toClient(row) });
}

/** PATCH /api/clients/:id */
export async function updateClient(req, res) {
  const [[existing]] = await pool.query('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  const name = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
  if (!name) return res.status(400).json({ error: 'Client name is required' });

  let agentId = existing.agent_id;
  if (req.body.agentId !== undefined) {
    await assertEarningAgent(req.body.agentId);
    agentId = req.body.agentId;
  }

  const dealAmount =
    req.body.dealAmount !== undefined ? money(req.body.dealAmount) : money(existing.deal_amount);
  if (dealAmount < 0) return res.status(400).json({ error: 'dealAmount cannot be negative' });

  let productionStatus = existing.production_status || 'pending';
  if (req.body.productionStatus !== undefined) {
    const nextStatus = String(req.body.productionStatus);
    if (!PRODUCTION_STATUSES.has(nextStatus)) {
      return res.status(400).json({ error: 'Invalid productionStatus' });
    }
    productionStatus = nextStatus;
  }

  await pool.query(
    `UPDATE clients SET
       name = ?, email = ?, phone = ?, agent_id = ?, deal_amount = ?, notes = ?,
       is_active = ?, production_status = ?
     WHERE id = ?`,
    [
      name,
      req.body.email !== undefined
        ? req.body.email
          ? String(req.body.email).trim().toLowerCase()
          : null
        : existing.email,
      req.body.phone !== undefined
        ? req.body.phone
          ? String(req.body.phone).trim()
          : null
        : existing.phone,
      agentId,
      dealAmount,
      req.body.notes !== undefined
        ? req.body.notes
          ? String(req.body.notes).trim()
          : null
        : existing.notes,
      req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : existing.is_active,
      productionStatus,
      req.params.id,
    ]
  );

  const [[row]] = await pool.query(`${CLIENT_SELECT} WHERE c.id = ?`, [req.params.id]);
  res.json({ client: toClient(row) });
}

/** POST /api/clients/:id/payments */
export async function addPayment(req, res) {
  const clientId = Number(req.params.id);
  const [[client]] = await pool.query(
    `SELECT c.*, u.manager_id, u.role AS agent_role
     FROM clients c
     JOIN users u ON u.id = c.agent_id
     WHERE c.id = ?`,
    [clientId]
  );
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const amount = money(req.body.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'amount must be greater than 0' });

  const [[paidRow]] = await pool.query(
    'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM client_payments WHERE client_id = ?',
    [clientId]
  );
  const alreadyPaid = money(paidRow?.total_paid ?? 0);
  const deal = money(client.deal_amount);
  if (alreadyPaid + amount > deal + 0.009) {
    return res.status(400).json({
      error: `Payment would exceed deal amount (paid ${alreadyPaid}, deal ${deal})`,
    });
  }

  const paymentDate = req.body.paymentDate
    ? String(req.body.paymentDate).slice(0, 10)
    : karachiWorkDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return res.status(400).json({ error: 'paymentDate must be YYYY-MM-DD' });
  }

  let notes = req.body.notes ? String(req.body.notes).trim() : null;
  const paymentLink = req.body.paymentLink ? String(req.body.paymentLink).trim() : '';
  if (paymentLink) {
    if (!/^https?:\/\/.+/i.test(paymentLink)) {
      return res.status(400).json({ error: 'paymentLink must be a valid http(s) URL' });
    }
    const linkLine = `Payment link: ${paymentLink}`;
    notes = notes ? `${notes}\n${linkLine}` : linkLine;
  }

  const paymentMethod = req.body.paymentMethod
    ? String(req.body.paymentMethod).trim().toLowerCase()
    : null;
  if (paymentMethod && !PAYMENT_METHOD_SET.has(paymentMethod)) {
    return res.status(400).json({ error: 'Invalid paymentMethod' });
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO client_payments (client_id, amount, payment_date, payment_method, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        amount,
        paymentDate,
        paymentMethod,
        notes,
        req.user.id,
      ]
    );

    // Commission is posted later via admin "Post commission" (batch select).
    await conn.commit();

    const [[row]] = await pool.query(`${CLIENT_SELECT} WHERE c.id = ?`, [clientId]);
    const [[payment]] = await pool.query('SELECT * FROM client_payments WHERE id = ?', [
      result.insertId,
    ]);

    res.status(201).json({
      payment: toPayment(payment),
      client: toClient(row),
      commission: null,
      message: 'Payment saved. Use Post commission to calculate earnings for selected payments.',
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** PATCH /api/clients/:id/payments/:paymentId */
export async function updatePayment(req, res) {
  const clientId = Number(req.params.id);
  const paymentId = Number(req.params.paymentId);

  const [[client]] = await pool.query(
    `SELECT c.*, u.manager_id
     FROM clients c
     JOIN users u ON u.id = c.agent_id
     WHERE c.id = ?`,
    [clientId]
  );
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const [[existing]] = await pool.query(
    `SELECT * FROM client_payments WHERE id = ? AND client_id = ?`,
    [paymentId, clientId]
  );
  if (!existing) return res.status(404).json({ error: 'Payment not found' });

  const amount =
    req.body.amount !== undefined ? money(req.body.amount) : money(existing.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'amount must be greater than 0' });

  const [[paidRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_paid
     FROM client_payments WHERE client_id = ? AND id <> ?`,
    [clientId, paymentId]
  );
  const otherPaid = money(paidRow?.total_paid ?? 0);
  const deal = money(client.deal_amount);
  if (otherPaid + amount > deal + 0.009) {
    return res.status(400).json({
      error: `Payment would exceed deal amount (other paid ${otherPaid}, deal ${deal})`,
    });
  }

  const paymentDate = req.body.paymentDate
    ? String(req.body.paymentDate).slice(0, 10)
    : String(existing.payment_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return res.status(400).json({ error: 'paymentDate must be YYYY-MM-DD' });
  }

  const notes =
    req.body.notes !== undefined
      ? req.body.notes
        ? String(req.body.notes).trim()
        : null
      : existing.notes;

  let paymentMethod = existing.payment_method || null;
  if (req.body.paymentMethod !== undefined) {
    const nextMethod = req.body.paymentMethod
      ? String(req.body.paymentMethod).trim().toLowerCase()
      : null;
    if (nextMethod && !PAYMENT_METHOD_SET.has(nextMethod)) {
      return res.status(400).json({ error: 'Invalid paymentMethod' });
    }
    if (!nextMethod) {
      return res.status(400).json({ error: 'paymentMethod is required' });
    }
    paymentMethod = nextMethod;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE client_payments
       SET amount = ?, payment_date = ?, payment_method = ?, notes = ?
       WHERE id = ? AND client_id = ?`,
      [amount, paymentDate, paymentMethod, notes, paymentId, clientId]
    );

    const [[hadCommission]] = await conn.query(
      `SELECT id FROM commission_entries WHERE payment_id = ? LIMIT 1`,
      [paymentId]
    );
    if (hadCommission) {
      await conn.query(`DELETE FROM commission_entries WHERE payment_id = ?`, [paymentId]);
      await createCommissionEntries(conn, {
        paymentId,
        clientId,
        agentId: client.agent_id,
        managerId: client.manager_id,
        amount,
        paymentDate,
      });
    }

    await conn.commit();

    const [[row]] = await pool.query(`${CLIENT_SELECT} WHERE c.id = ?`, [clientId]);
    const [[payment]] = await pool.query('SELECT * FROM client_payments WHERE id = ?', [paymentId]);

    res.json({
      payment: toPayment(payment),
      client: toClient(row),
      commissionRecalculated: Boolean(hadCommission),
      message: hadCommission
        ? 'Payment updated. Linked commission was recalculated.'
        : 'Payment updated.',
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** DELETE /api/clients/:id/payments/:paymentId */
export async function deletePayment(req, res) {
  const clientId = Number(req.params.id);
  const paymentId = Number(req.params.paymentId);

  const [[existing]] = await pool.query(
    `SELECT id FROM client_payments WHERE id = ? AND client_id = ?`,
    [paymentId, clientId]
  );
  if (!existing) return res.status(404).json({ error: 'Payment not found' });

  const [[hadCommission]] = await pool.query(
    `SELECT id FROM commission_entries WHERE payment_id = ? LIMIT 1`,
    [paymentId]
  );

  await pool.query(`DELETE FROM client_payments WHERE id = ? AND client_id = ?`, [
    paymentId,
    clientId,
  ]);

  const [[row]] = await pool.query(`${CLIENT_SELECT} WHERE c.id = ?`, [clientId]);
  res.json({
    ok: true,
    client: toClient(row),
    commissionRemoved: Boolean(hadCommission),
    message: hadCommission
      ? 'Payment deleted. Linked commission entries were removed.'
      : 'Payment deleted.',
  });
}

/**
 * Preview rates for a payment without writing (used by post UI).
 */
async function previewCommissionForPayment({ clientId, agentId, managerId, amount, paymentDate }) {
  const month = rateMonthForPaymentDate(paymentDate);
  const bounds = await getCycleBounds(paymentDate);
  const agentRate = await getUserRate(agentId, month);
  const preview = [];
  if (agentRate > 0) {
    preview.push({
      userId: agentId,
      role: 'agent',
      rate: agentRate,
      amount: calcCommissionAmount(amount, agentRate),
    });
  }
  if (managerId) {
    const managerRate = await getManagerRate(managerId, agentId, month);
    if (managerRate > 0) {
      preview.push({
        userId: managerId,
        role: 'manager',
        rate: managerRate,
        amount: calcCommissionAmount(amount, managerRate),
      });
    }
  }
  return { ...bounds, clientId, preview };
}

/**
 * GET /api/commissions/pending
 * Payments from cycle start → today with no commission_entries yet.
 */
export async function listPendingCommissions(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can post commissions' });
  }

  const today = karachiWorkDate();
  const bounds = await getCycleBounds(req.query.date || today);
  const from = req.query.from || bounds.cycleStart;
  const to = req.query.to || today;

  const [rows] = await pool.query(
    `SELECT p.id, p.client_id, p.amount, p.payment_date, p.notes,
            c.name AS client_name, c.agent_id, c.deal_amount,
            u.name AS agent_name, u.manager_id,
            m.name AS manager_name
     FROM client_payments p
     JOIN clients c ON c.id = p.client_id
     JOIN users u ON u.id = c.agent_id
     LEFT JOIN users m ON m.id = u.manager_id
     WHERE p.payment_date BETWEEN ? AND ?
       AND NOT EXISTS (
         SELECT 1 FROM commission_entries ce WHERE ce.payment_id = p.id
       )
     ORDER BY p.payment_date DESC, p.id DESC`,
    [from, to]
  );

  const payments = [];
  for (const r of rows) {
    const amount = money(r.amount);
    const preview = await previewCommissionForPayment({
      clientId: r.client_id,
      agentId: r.agent_id,
      managerId: r.manager_id,
      amount,
      paymentDate: String(r.payment_date).slice(0, 10),
    });
    payments.push({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      agentId: r.agent_id,
      agentName: r.agent_name,
      managerId: r.manager_id,
      managerName: r.manager_name,
      amount,
      paymentDate: String(r.payment_date).slice(0, 10),
      notes: r.notes,
      cycleStart: preview.cycleStart,
      cycleEnd: preview.cycleEnd,
      lines: preview.preview,
      commissionTotal: money(
        preview.preview.reduce((s, x) => s + Number(x.amount), 0)
      ),
    });
  }

  res.json({
    from,
    to,
    cycleStart: bounds.cycleStart,
    cycleEnd: bounds.cycleEnd,
    label: `${from} → ${to}`,
    payments,
  });
}

/**
 * POST /api/commissions/post
 * Body: { paymentIds: number[] }
 * Creates commission_entries for selected payments that are still pending.
 */
export async function postCommissions(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can post commissions' });
  }

  const ids = Array.isArray(req.body.paymentIds)
    ? [...new Set(req.body.paymentIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : [];
  if (!ids.length) {
    return res.status(400).json({ error: 'Select at least one payment' });
  }

  const conn = await pool.getConnection();
  const posted = [];
  try {
    await conn.beginTransaction();

    for (const paymentId of ids) {
      const [[p]] = await conn.query(
        `SELECT p.*, c.agent_id, u.manager_id
         FROM client_payments p
         JOIN clients c ON c.id = p.client_id
         JOIN users u ON u.id = c.agent_id
         WHERE p.id = ?
         FOR UPDATE`,
        [paymentId]
      );
      if (!p) continue;

      const [[existing]] = await conn.query(
        `SELECT id FROM commission_entries WHERE payment_id = ? LIMIT 1`,
        [paymentId]
      );
      if (existing) continue;

      const commission = await createCommissionEntries(conn, {
        paymentId,
        clientId: p.client_id,
        agentId: p.agent_id,
        managerId: p.manager_id,
        amount: money(p.amount),
        paymentDate: String(p.payment_date).slice(0, 10),
      });
      posted.push({
        paymentId,
        clientId: p.client_id,
        amount: money(p.amount),
        ...commission,
      });
    }

    await conn.commit();
    res.status(201).json({
      posted: posted.length,
      results: posted,
      totalCommission: money(
        posted.reduce(
          (s, r) => s + r.entries.reduce((a, e) => a + Number(e.amount), 0),
          0
        )
      ),
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * GET /api/commissions/earnings?year=&cycleStart=&cycleEnd=&userId=
 * - year: all entries whose cycle_start falls in that calendar year
 * - cycleStart: filter by stored cycle_start (optional cycleEnd for exact match)
 * - default: current resolved cycle
 * Agent: own. Manager: own + cuts. Admin: optional userId or all.
 */
export async function getEarnings(req, res) {
  if (req.user.role === 'production') {
    return res.status(403).json({ error: 'Production has no commission system' });
  }

  const yearRaw = req.query.year;
  const year = yearRaw !== undefined && yearRaw !== '' ? Number(yearRaw) : null;
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    return res.status(400).json({ error: 'year must be a valid calendar year' });
  }

  let mode = 'cycle';
  let cycleStart = req.query.cycleStart || null;
  let cycleEnd = req.query.cycleEnd || null;
  let label;

  if (year && !cycleStart) {
    mode = 'year';
    label = `Year ${year}`;
  } else if (cycleStart) {
    mode = 'cycle';
    if (!cycleEnd) {
      // Prefer stored end for this start if any entries exist; else resolve live bounds
      const [[stored]] = await pool.query(
        `SELECT cycle_end FROM commission_entries WHERE cycle_start = ? ORDER BY id DESC LIMIT 1`,
        [cycleStart]
      );
      if (stored) {
        cycleEnd = String(stored.cycle_end).slice(0, 10);
      } else {
        const bounds = await getCycleBounds(cycleStart);
        cycleEnd = bounds.cycleEnd;
      }
    }
    label = `${cycleStart} → ${cycleEnd}`;
  } else {
    const bounds = await getCycleBounds();
    cycleStart = bounds.cycleStart;
    cycleEnd = bounds.cycleEnd;
    label = bounds.label;
  }

  let userId = req.user.id;
  const adminAll = req.user.role === 'admin' && !req.query.userId;

  if (req.user.role === 'admin' && req.query.userId) {
    userId = Number(req.query.userId);
  }

  if ((req.user.role === 'agent' || req.user.role === 'manager') && req.query.userId) {
    if (Number(req.query.userId) !== req.user.id) {
      return res.status(403).json({ error: 'Cannot view another user earnings' });
    }
  }

  const where = [];
  const params = [];

  if (mode === 'year') {
    where.push('YEAR(ce.cycle_start) = ?');
    params.push(year);
  } else {
    // Match stored cycle_start only — end day may differ via override (15→18)
    where.push('ce.cycle_start = ?');
    params.push(cycleStart);
  }

  if (!adminAll) {
    where.push('ce.user_id = ?');
    params.push(userId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const selectCols = adminAll
    ? `ce.*, u.name AS user_name, c.name AS client_name, p.payment_date`
    : `ce.*, c.name AS client_name, p.payment_date`;

  const joins = adminAll
    ? `FROM commission_entries ce
       JOIN users u ON u.id = ce.user_id
       JOIN clients c ON c.id = ce.client_id
       JOIN client_payments p ON p.id = ce.payment_id`
    : `FROM commission_entries ce
       JOIN clients c ON c.id = ce.client_id
       JOIN client_payments p ON p.id = ce.payment_id`;

  const [rows] = await pool.query(
    `SELECT ${selectCols}
     ${joins}
     ${whereSql}
     ORDER BY p.payment_date DESC, ce.id DESC`,
    params
  );

  const total = money(rows.reduce((s, r) => s + Number(r.commission_amount), 0));

  let cycles = [];
  if (mode === 'year') {
    const [grouped] = await pool.query(
      adminAll
        ? `SELECT cycle_start, cycle_end,
                  SUM(commission_amount) AS total,
                  COUNT(*) AS entries
           FROM commission_entries
           WHERE YEAR(cycle_start) = ?
           GROUP BY cycle_start, cycle_end
           ORDER BY cycle_start DESC`
        : `SELECT cycle_start, cycle_end,
                  SUM(commission_amount) AS total,
                  COUNT(*) AS entries
           FROM commission_entries
           WHERE user_id = ? AND YEAR(cycle_start) = ?
           GROUP BY cycle_start, cycle_end
           ORDER BY cycle_start DESC`,
      adminAll ? [year] : [userId, year]
    );
    cycles = grouped.map((r) => ({
      cycleStart: String(r.cycle_start).slice(0, 10),
      cycleEnd: String(r.cycle_end).slice(0, 10),
      label: `${String(r.cycle_start).slice(0, 10)} → ${String(r.cycle_end).slice(0, 10)}`,
      total: money(r.total),
      entries: Number(r.entries),
    }));
  }

  res.json({
    mode,
    year: mode === 'year' ? year : null,
    cycleStart: mode === 'cycle' ? cycleStart : null,
    cycleEnd: mode === 'cycle' ? cycleEnd : null,
    label,
    total,
    cycles,
    entries: rows.map((r) => ({
      id: r.id,
      ...(adminAll ? { userId: r.user_id, userName: r.user_name } : {}),
      clientName: r.client_name,
      earnerRole: r.earner_role,
      ratePercentage: money(r.rate_percentage),
      paymentAmount: money(r.payment_amount),
      commissionAmount: money(r.commission_amount),
      paymentDate: r.payment_date,
      cycleStart: String(r.cycle_start).slice(0, 10),
      cycleEnd: String(r.cycle_end).slice(0, 10),
    })),
  });
}

/** GET /api/commissions/cycle?date=YYYY-MM-DD — resolve window for a date */
export async function getCycle(req, res) {
  const date = req.query.date || undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const bounds = await getCycleBounds(date);
  res.json(bounds);
}
