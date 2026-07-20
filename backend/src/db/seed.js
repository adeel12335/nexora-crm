import bcrypt from 'bcrypt';
import 'dotenv/config';
import { pool } from '../config/db.js';
import { computeDueDate } from '../utils/deadlineUtils.js';

const DEMO_PASSWORD = 'password123';

// Mirrors frontend/src/data/mockData.js so both sides agree during manual testing.
const USERS = [
  { name: 'Jane Cooper', email: 'admin@nexora.test', role: 'admin', avatar: '/assets/avatar-jane.svg' },
  { name: 'Robert Fox', email: 'manager@nexora.test', role: 'manager', avatar: '/assets/avatar-robert.svg' },
  { name: 'Sara Malik', email: 'production@nexora.test', role: 'production', avatar: '/assets/avatar-omar.svg' },
  { name: 'Lina Souza', email: 'lina@nexora.test', role: 'agent', avatar: '/assets/avatar-lina.svg', lateCount: 3, offsTaken: 1 },
  { name: 'Maya Chen', email: 'maya@nexora.test', role: 'agent', avatar: '/assets/avatar-maya.svg', lateCount: 1, offsTaken: 2 },
  { name: 'Omar Haddad', email: 'omar@nexora.test', role: 'agent', avatar: '/assets/avatar-omar.svg', lateCount: 4, offsTaken: 1 },
  { name: 'Priya Nair', email: 'priya@nexora.test', role: 'agent', avatar: '/assets/avatar-jane.svg', lateCount: 0, offsTaken: 0 },
  { name: 'Chris Alden', email: 'chris@nexora.test', role: 'agent', avatar: '/assets/avatar-robert.svg', lateCount: 2, offsTaken: 3 },
];

const CARDS = [
  { stage: 'new_draft', type: 'draft', title: 'Landing Page Draft', client: 'Acme Corp', assigneeEmail: 'priya@nexora.test', createdAgo: 1, description: 'First homepage draft for the Q3 redesign, briefed by the marketing team.' },
  { stage: 'new_draft', type: 'draft', title: 'Product Explainer Video', client: 'Globex Inc', assigneeEmail: 'lina@nexora.test', createdAgo: 3, priority: true, description: '60-second explainer covering the new onboarding flow.' },
  { stage: 'in_progress', type: 'draft', title: 'Brand Style Guide', client: 'Soylent Corp', assigneeEmail: 'maya@nexora.test', createdAgo: 2, comments_count: 2, description: 'Full brand guide draft: typography, color system and logo usage.' },
  { stage: 'revision', type: 'revision', title: 'Homepage Revision Round 2', client: 'Initech', assigneeEmail: 'chris@nexora.test', createdAgo: 1, priority: true, comments_count: 3, description: 'Client requested tighter hero copy and a new CTA color.' },
  { stage: 'revision', type: 'revision', title: 'Logo Revision', client: 'Umbrella Corp', assigneeEmail: 'omar@nexora.test', createdAgo: 3, comments_count: 1, description: 'Second revision pass on the primary logo mark.' },
  { stage: 'review', type: 'draft', title: 'Social Campaign Assets', client: 'Hooli', assigneeEmail: 'priya@nexora.test', createdAgo: 4, attachments_count: 4, description: 'Ready for internal review before client delivery.' },
  { stage: 'done', type: 'draft', title: 'Email Template Set', client: 'Stark Industries', assigneeEmail: 'lina@nexora.test', createdAgo: 6, attachments_count: 2, description: 'Approved and delivered transactional email templates.' },
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
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, avatar_url)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), avatar_url = VALUES(avatar_url)`,
      [u.name, u.email, passwordHash, u.role, u.avatar]
    );
    const [[row]] = await pool.query('SELECT id FROM users WHERE email = ?', [u.email]);
    ids[u.email] = row.id;
  }
  console.log(`Seeded ${USERS.length} users (demo password: "${DEMO_PASSWORD}").`);
  return ids;
}

async function seedAttendance(ids) {
  const agents = USERS.filter((u) => u.role === 'agent');
  const totalDays = new Date().getDate();

  for (const agent of agents) {
    const userId = ids[agent.email];
    let lateLeft = agent.lateCount;
    let offLeft = agent.offsTaken;

    for (let day = totalDays; day >= 1; day -= 3) {
      if (lateLeft <= 0 && offLeft <= 0) break;
      const workDate = new Date();
      workDate.setDate(day);

      let status = 'present';
      if (offLeft > 0) { status = 'off'; offLeft--; }
      else if (lateLeft > 0) { status = 'late'; lateLeft--; }

      let checkIn = null;
      if (status !== 'off') {
        checkIn = new Date(workDate);
        checkIn.setHours(status === 'late' ? 9 : 8, status === 'late' ? 40 : 45, 0, 0);
      }

      await pool.query(
        `INSERT IGNORE INTO attendance_records (user_id, work_date, check_in_time, status)
         VALUES (?, ?, ?, ?)`,
        [userId, toMysqlDate(workDate), checkIn ? toMysqlDatetime(checkIn) : null, status]
      );
    }

    // Fill remaining days of the month as present (INSERT IGNORE keeps the late/off rows above intact).
    for (let day = 1; day <= totalDays; day++) {
      const workDate = new Date();
      workDate.setDate(day);
      const checkIn = new Date(workDate);
      checkIn.setHours(8, 45, 0, 0);
      await pool.query(
        `INSERT IGNORE INTO attendance_records (user_id, work_date, check_in_time, status)
         VALUES (?, ?, ?, 'present')`,
        [userId, toMysqlDate(workDate), toMysqlDatetime(checkIn)]
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
    const createdAt = daysAgo(c.createdAgo);
    const dueDate = computeDueDate(c.type, createdAt);
    await pool.query(
      `INSERT INTO production_cards
        (title, client, type, stage, assignee_id, priority, comments_count, attachments_count, description, created_at, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.title, c.client, c.type, c.stage, ids[c.assigneeEmail],
        c.priority ? 1 : 0, c.comments_count || 0, c.attachments_count || 0,
        c.description, toMysqlDatetime(createdAt), toMysqlDatetime(dueDate),
      ]
    );
  }
  console.log(`Seeded ${CARDS.length} production cards.`);
}

async function seed() {
  const ids = await seedUsers();
  await seedAttendance(ids);
  await seedProduction(ids);
  console.log('\nDemo logins (password for all: "password123"):');
  USERS.forEach((u) => console.log(`  ${u.role.padEnd(10)} ${u.email}`));
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
