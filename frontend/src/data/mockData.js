import { computeDueDate, getDeadlineInfo } from '../utils/deadlineUtils.js';

export const avatarPool = [
  '/assets/avatar-jane.svg',
  '/assets/avatar-robert.svg',
  '/assets/avatar-lina.svg',
  '/assets/avatar-maya.svg',
  '/assets/avatar-omar.svg',
];

// agents[0] is the fallback "me" on /agent pages when the logged-in user
// isn't one of these mock agents (e.g. previewing without a matching seed).
// Emails match backend/src/db/seed.js so a real logged-in agent resolves to their own row.
export const agents = [
  { id: 1, name: 'Lina Souza', email: 'lina@nexora.test', avatar: avatarPool[2], lateCount: 3, offsTaken: 1, presentCount: 15, statusToday: 'late', checkIn: '09:42 AM', checkOut: null },
  { id: 2, name: 'Maya Chen', email: 'maya@nexora.test', avatar: avatarPool[3], lateCount: 1, offsTaken: 2, presentCount: 16, statusToday: 'present', checkIn: '08:55 AM', checkOut: '06:05 PM' },
  { id: 3, name: 'Omar Haddad', email: 'omar@nexora.test', avatar: avatarPool[4], lateCount: 4, offsTaken: 1, presentCount: 13, statusToday: 'off', checkIn: null, checkOut: null },
  { id: 4, name: 'Priya Nair', email: 'priya@nexora.test', avatar: avatarPool[0], lateCount: 0, offsTaken: 0, presentCount: 18, statusToday: 'present', checkIn: '08:40 AM', checkOut: null },
  { id: 5, name: 'Chris Alden', email: 'chris@nexora.test', avatar: avatarPool[1], lateCount: 2, offsTaken: 3, presentCount: 14, statusToday: 'absent', checkIn: null, checkOut: null },
];

export function findAgentForUser(user) {
  return agents.find((a) => a.email === user?.email) || agents[0];
}

export const productionStages = [
  { id: 'new_draft', title: 'New Draft', color: '#6A9FB5' },
  { id: 'in_progress', title: 'In Progress', color: '#07524D' },
  { id: 'revision', title: 'Revision', color: '#D8A74C' },
  { id: 'review', title: 'Review', color: '#C65A79' },
  { id: 'done', title: 'Done', color: '#A2A2A0' },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function makeCard({ id, stage, type, title, client, assignee, createdAgo, priority, comments, attachments, description }) {
  const createdAt = daysAgo(createdAgo);
  const dueDate = computeDueDate(type, createdAt).toISOString();
  return { id, stage, type, title, client, assignee, createdAt, dueDate, priority: !!priority, comments, attachments, description };
}

export const productionCardsSeed = [
  makeCard({ id: 1, stage: 'new_draft', type: 'draft', title: 'Landing Page Draft', client: 'Acme Corp', assignee: agents[3], createdAgo: 1, description: 'First homepage draft for the Q3 redesign, briefed by the marketing team.' }),
  makeCard({ id: 2, stage: 'new_draft', type: 'draft', title: 'Product Explainer Video', client: 'Globex Inc', assignee: agents[0], createdAgo: 3, priority: true, description: '60-second explainer covering the new onboarding flow.' }),
  makeCard({ id: 3, stage: 'in_progress', type: 'draft', title: 'Brand Style Guide', client: 'Soylent Corp', assignee: agents[1], createdAgo: 2, comments: 2, description: 'Full brand guide draft: typography, color system and logo usage.' }),
  makeCard({ id: 4, stage: 'revision', type: 'revision', title: 'Homepage Revision Round 2', client: 'Initech', assignee: agents[4], createdAgo: 1, priority: true, comments: 3, description: 'Client requested tighter hero copy and a new CTA color.' }),
  makeCard({ id: 5, stage: 'revision', type: 'revision', title: 'Logo Revision', client: 'Umbrella Corp', assignee: agents[2], createdAgo: 3, comments: 1, description: 'Second revision pass on the primary logo mark.' }),
  makeCard({ id: 6, stage: 'review', type: 'draft', title: 'Social Campaign Assets', client: 'Hooli', assignee: agents[3], createdAgo: 4, attachments: 4, description: 'Ready for internal review before client delivery.' }),
  makeCard({ id: 7, stage: 'done', type: 'draft', title: 'Email Template Set', client: 'Stark Industries', assignee: agents[0], createdAgo: 6, attachments: 2, description: 'Approved and delivered transactional email templates.' }),
];

export const baseAlerts = [
  {
    id: 'a-late-1',
    tone: 'orange',
    icon: 'i-alert',
    channel: 'app',
    title: 'Late check-in warning',
    body: 'Lina Souza has 3 late check-ins this month — one more auto-converts into a counted day off.',
    time: '2h ago',
  },
  {
    id: 'a-deduction-1',
    tone: 'red',
    icon: 'i-deduction',
    channel: 'email',
    title: 'Deduction triggered',
    body: "Chris Alden has used 3 offs this month (limit is 2 free) — salary deduction has been flagged for payroll.",
    time: '5h ago',
  },
  {
    id: 'a-whatsapp-1',
    tone: 'green',
    icon: 'i-whatsapp',
    channel: 'whatsapp',
    title: 'Check-in reminder sent',
    body: 'WhatsApp reminder sent to 2 agents who had not checked in by 9:30 AM.',
    time: 'Yesterday',
  },
];

export function generateDeadlineAlerts(cards) {
  return cards
    .filter((card) => card.stage !== 'done')
    .map((card) => ({ card, info: getDeadlineInfo(card.dueDate) }))
    .filter(({ info }) => info.tone !== 'ok')
    .map(({ card, info }) => ({
      id: `deadline-${card.id}`,
      tone: info.tone === 'overdue' ? 'red' : 'orange',
      icon: card.type === 'revision' ? 'i-revision' : 'i-production',
      channel: 'whatsapp',
      title: card.type === 'revision'
        ? `Revision nearing deadline: ${card.title}`
        : `Draft nearing deadline: ${card.title}`,
      body: `${card.assignee.name} — ${info.label}. Production has been auto-notified in-app and via WhatsApp.`,
      time: 'Just now',
    }));
}

export function getAllAlerts() {
  return [...generateDeadlineAlerts(productionCardsSeed), ...baseAlerts];
}
