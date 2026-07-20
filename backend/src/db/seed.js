import bcrypt from 'bcrypt';
import 'dotenv/config';
import { pool } from '../config/db.js';
import { computeDueDate } from '../utils/deadlineUtils.js';
import { normalisePhone } from '../utils/phone.js';
import { setUserRate, setManagerRate, toMonthStart } from '../utils/commissionRates.js';

const DEMO_PASSWORD = 'password123';

// Real people from the legacy `u290518193_lead` dump. Role mapping:
//   employee  -> agent
//   scrapper  -> dropped
//   admin / manager / production stay as-is
const MANAGER_EMAIL = 'haseeb@gmail.com';

const USERS = [
  { name: 'Admin', email: 'admin@lead.com', role: 'admin' },
  {
    name: 'Haseeb Ali', email: MANAGER_EMAIL, role: 'manager', phone: '1232432424',
    commission: 20,
    mailboxes: [{ email: 'test@gmail.com', label: 'test' }],
  },
  {
    name: 'Abdul Nafay', email: 'nafay@gmail.com', role: 'agent', managerEmail: MANAGER_EMAIL,
    commission: 7, managerCut: 7, lateCount: 2, offsTaken: 1,
    mailboxes: [
      { email: 'test2@gmail.com', label: 'test2' },
      { email: 'tyler.reed.wikiwork@gmail.com', label: 'Blake Donovan' },
      { email: 'benjamin.wikieditor@gmail.com', label: 'Benjamin' },
    ],
  },
  {
    name: 'Amir Chandio', email: 'amir@gmail.com', role: 'agent', managerEmail: MANAGER_EMAIL,
    commission: 15, managerCut: 5, lateCount: 1, offsTaken: 0,
    mailboxes: [
      { email: 'ryan.wikieditor@gmail.com', label: 'Ryan Kensington' },
      { email: 'nathan.wikieditor@gmail.com', label: 'Nathan Brooks' },
      { email: 'ethan.wiki.editor@gmail.com', label: 'Ethan Brooks' },
      { email: 'ethan@lead.local', label: 'Ethan' },
    ],
  },
  {
    name: 'Zain', email: 'zain@gmail.com', role: 'agent', managerEmail: MANAGER_EMAIL,
    commission: 7, managerCut: 7, lateCount: 1, offsTaken: 1,
    mailboxes: [
      { email: 'dylan.wikieditor@gmail.com', label: 'Dylan' },
      { email: 'ml.wikipediamanager@gmail.com', label: 'Mathew' },
    ],
  },
  {
    name: 'Hamza', email: 'hamza@gmail.com', role: 'agent', phone: '03102631970',
    managerEmail: MANAGER_EMAIL, commission: 7, managerCut: 7, lateCount: 3, offsTaken: 1,
    mailboxes: [
      { email: 'brandon.wiki.writer@gmail.com', label: 'Brandon Cole' },
      { email: 'austin.wikieditor@gmail.com', label: 'Austin Fitzgerald' },
      { email: 'andrewwikipediamanager@gmail.com', label: 'Andrew Depaz' },
    ],
  },
  {
    name: 'Nasr', email: 'nasr@gmail.com', role: 'agent', managerEmail: MANAGER_EMAIL,
    commission: 7, managerCut: 7, lateCount: 2, offsTaken: 0,
    mailboxes: [
      { email: 'olivia.wikieditor@gmail.com', label: 'Olivia Grant' },
      { email: 'madison.wiki.editor@gmail.com', label: 'Madison Cole' },
    ],
  },
  {
    name: 'Dilawar', email: 'dilawar@lead.local', role: 'agent', managerEmail: MANAGER_EMAIL,
    commission: 10, managerCut: 0, lateCount: 0, offsTaken: 0,
    mailboxes: [{ email: 'dilawar@lead.local', label: 'Dilawar' }],
  },
  {
    name: 'Dilawar Alee', email: 'dilawaralee99@gmail.com', role: 'agent',
    commission: 10, lateCount: 1, offsTaken: 0,
    mailboxes: [
      { email: 'henryjordan.wikieditor@gmail.com', label: 'Henry Jordan' },
      { email: 'emmajohnson.wikieditor@gmail.com', label: 'Emma Johnson' },
      { email: 'charlesjohn.wikieditor@gmail.com', label: 'Charles Johnson' },
    ],
  },
  { name: 'Ilsa Waseem', email: 'ilsawaseem10@gmail.com', role: 'agent', commission: 0 },
  { name: 'Atiya', email: 'atiya@gmail.com', role: 'agent', commission: 0 },
  {
    name: 'Neha', email: 'neha@gmail.com', role: 'production',
  },
  {
    name: 'Shafay', email: 'memonshafay24@gmail.com', role: 'agent', phone: '03372384226',
    managerEmail: MANAGER_EMAIL, commission: 7, managerCut: 7, lateCount: 0, offsTaken: 0,
  },
];

const CARDS = [
  { stage: 'new_draft', type: 'draft', title: 'Landing Page Draft', client: 'Acme Corp', assigneeEmail: 'amir@gmail.com', createdAgo: 1, description: 'First homepage draft for the Q3 redesign.' },
  { stage: 'new_draft', type: 'draft', title: 'Product Explainer Video', client: 'Globex Inc', assigneeEmail: 'nafay@gmail.com', createdAgo: 3, priority: true, description: '60-second explainer covering the new onboarding flow.' },
  { stage: 'in_progress', type: 'draft', title: 'Brand Style Guide', client: 'Soylent Corp', assigneeEmail: 'hamza@gmail.com', createdAgo: 2, comments_count: 2, description: 'Full brand guide draft: typography, color system and logo usage.' },
  { stage: 'revision', type: 'revision', title: 'Homepage Revision Round 2', client: 'Initech', assigneeEmail: 'nasr@gmail.com', createdAgo: 1, priority: true, comments_count: 3, description: 'Client requested tighter hero copy and a new CTA color.' },
  { stage: 'revision', type: 'revision', title: 'Logo Revision', client: 'Umbrella Corp', assigneeEmail: 'zain@gmail.com', createdAgo: 3, comments_count: 1, description: 'Second revision pass on the primary logo mark.' },
  { stage: 'review', type: 'draft', title: 'Social Campaign Assets', client: 'Hooli', assigneeEmail: 'dilawaralee99@gmail.com', createdAgo: 4, attachments_count: 4, description: 'Ready for internal review before client delivery.' },
  { stage: 'live', type: 'draft', title: 'Wiki Studio Launch Page', client: 'The Wiki Studio', assigneeEmail: 'nafay@gmail.com', createdAgo: 2, priority: true, comments_count: 2, attachments_count: 2, description: 'Public launch page currently live — monitor feedback and hotfix if needed.' },
  { stage: 'done', type: 'draft', title: 'Email Template Set', client: 'Stark Industries', assigneeEmail: 'amir@gmail.com', createdAgo: 6, attachments_count: 2, description: 'Approved and delivered transactional email templates.' },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

function toMysqlDatetime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toMysqlDate(date) {
  return date.toISOString().slice(0, 10);
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const ids = {};
  for (const u of USERS) {
    const phone = u.phone ? normalisePhone(u.phone).value : null;
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone, whatsapp_number)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role),
         phone = VALUES(phone), whatsapp_number = VALUES(whatsapp_number)`,
      [u.name, u.email, passwordHash, u.role, phone, phone]
    );
    const [[row]] = await pool.query('SELECT id FROM users WHERE email = ?', [u.email]);
    ids[u.email] = row.id;
  }
  console.log(`Seeded ${USERS.length} users (demo password: "${DEMO_PASSWORD}").`);
  return ids;
}

async function seedAttendance(ids) {
  const agents = USERS.filter((u) => u.role === 'agent' && (u.lateCount || u.offsTaken));
  const totalDays = new Date().getDate();
  const todayStr = toMysqlDate(new Date());

  for (const agent of agents) {
    const userId = ids[agent.email];
    let lateLeft = agent.lateCount || 0;
    let offLeft = agent.offsTaken || 0;

    for (let day = totalDays; day >= 1; day -= 3) {
      if (lateLeft <= 0 && offLeft <= 0) break;
      const workDate = new Date();
      workDate.setDate(day);

      let status = 'present';
      if (offLeft > 0) { status = 'off'; offLeft--; }
      else if (lateLeft > 0) { status = 'late'; lateLeft--; }

      let checkIn = null;
      let checkOut = null;
      if (status !== 'off') {
        checkIn = new Date(workDate);
        checkIn.setHours(status === 'late' ? 9 : 8, status === 'late' ? 40 : 45, 0, 0);
        const dateStr = toMysqlDate(workDate);
        if (dateStr < todayStr) {
          checkOut = new Date(workDate);
          checkOut.setHours(18, 0, 0, 0);
        }
      }

      await pool.query(
        `INSERT IGNORE INTO attendance_records (user_id, work_date, check_in_time, check_out_time, status, emails_sent, worked_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          toMysqlDate(workDate),
          checkIn ? toMysqlDatetime(checkIn) : null,
          checkOut ? toMysqlDatetime(checkOut) : null,
          status,
          checkOut ? 10 : null,
          checkOut ? 540 : null,
        ]
      );
    }

    for (let day = 1; day <= totalDays; day++) {
      const workDate = new Date();
      workDate.setDate(day);
      const dateStr = toMysqlDate(workDate);
      const checkIn = new Date(workDate);
      checkIn.setHours(8, 45, 0, 0);
      const checkOut = dateStr < todayStr ? new Date(workDate) : null;
      if (checkOut) checkOut.setHours(18, 0, 0, 0);
      await pool.query(
        `INSERT IGNORE INTO attendance_records (user_id, work_date, check_in_time, check_out_time, status, emails_sent, worked_minutes)
         VALUES (?, ?, ?, ?, 'present', ?, ?)`,
        [
          userId,
          dateStr,
          toMysqlDatetime(checkIn),
          checkOut ? toMysqlDatetime(checkOut) : null,
          checkOut ? 8 : null,
          checkOut ? 555 : null,
        ]
      );
    }
  }
  console.log(`Seeded attendance records for ${agents.length} agents (month to date).`);
}

async function seedProduction(ids) {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM production_cards');
  if (count > 0) {
    console.log('Production cards already present, skipping.');
    return;
  }
  for (const c of CARDS) {
    const assigneeId = ids[c.assigneeEmail];
    if (!assigneeId) continue;
    const createdAt = daysAgo(c.createdAgo);
    const dueDate = computeDueDate(c.type, createdAt);
    await pool.query(
      `INSERT INTO production_cards
        (title, client, type, stage, assignee_id, priority, comments_count, attachments_count, description, created_at, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.title, c.client, c.type, c.stage, assigneeId,
        c.priority ? 1 : 0, c.comments_count || 0, c.attachments_count || 0,
        c.description, toMysqlDatetime(createdAt), toMysqlDatetime(dueDate),
      ]
    );
  }
  console.log(`Seeded ${CARDS.length} production cards.`);
}

/** Reporting lines + own rates + each manager→agent cut for the current month. */
async function seedCommissionRates(ids) {
  const month = toMonthStart(null);
  let rates = 0;
  let cuts = 0;

  for (const u of USERS) {
    await pool.query('UPDATE users SET manager_id = ? WHERE id = ?', [
      u.managerEmail ? ids[u.managerEmail] : null,
      ids[u.email],
    ]);

    if (u.commission !== undefined && u.commission > 0) {
      await setUserRate({
        userId: ids[u.email],
        month,
        percentage: u.commission,
        actorId: null,
      });
      rates++;
    }

    if (u.managerEmail && u.managerCut !== undefined) {
      await setManagerRate({
        managerId: ids[u.managerEmail],
        agentId: ids[u.email],
        month,
        percentage: u.managerCut,
        actorId: null,
      });
      cuts++;
    }
  }

  console.log(`Seeded ${rates} own rates and ${cuts} manager↔agent cuts (month-wise).`);
}

/** Mailboxes assigned to the people who work out of them. */
async function seedMailboxes(ids) {
  let count = 0;
  for (const u of USERS) {
    for (const box of u.mailboxes ?? []) {
      const email = box.email.includes('@') ? box.email : `${box.email}@gmail.com`;
      await pool.query(
        `INSERT INTO mailboxes (user_id, email_address, label)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label)`,
        [ids[u.email], email.toLowerCase(), box.label]
      );
      count++;
    }
  }
  console.log(`Seeded ${count} mailboxes (assigned to their owners).`);
}

/** Wipe portal tables so the legacy roster replaces any previous demo users. */
async function resetPortalData() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'mailboxes',
    'user_commission_rates',
    'manager_agent_rates',
    'commission_entries',
    'client_payments',
    'clients',
    'daily_progress',
    'attendance_sessions',
    'attendance_records',
    'production_card_activity',
    'production_cards',
    'notifications',
    'users',
  ]) {
    await pool.query(`TRUNCATE TABLE \`${table}\``);
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('Cleared previous portal data.');
}

async function seed() {
  await resetPortalData();
  const ids = await seedUsers();
  await seedAttendance(ids);
  await seedProduction(ids);
  await seedCommissionRates(ids);
  await seedMailboxes(ids);
  console.log('\nDemo logins (password for all: "password123"):');
  USERS.forEach((u) => console.log(`  ${u.role.padEnd(10)} ${u.email}`));
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
