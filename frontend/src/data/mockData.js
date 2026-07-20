import { computeDueDate } from '../utils/deadlineUtils.js';

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
  { id: 'live', title: 'Live', color: '#2F6FED' },
  { id: 'done', title: 'Done', color: '#A2A2A0' },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function makeCard({
  id, stage, type, title, client, assignee, createdAgo, priority = 'none',
  comments = [], attachments = [], description, feedback,
}) {
  const createdAt = daysAgo(createdAgo);
  const dueDate = computeDueDate(type, createdAt).toISOString();
  const commentList = Array.isArray(comments) ? comments : [];
  const fileList = Array.isArray(attachments) ? attachments : [];
  return {
    id,
    stage,
    type,
    title,
    client,
    assignee,
    createdAt,
    dueDate,
    priority: priority === true ? 'high' : (priority || 'none'),
    comments: commentList.length,
    attachments: fileList.length,
    commentList,
    fileList,
    description,
    feedback: feedback || { status: 'none', note: '', rating: null, updatedAt: null, author: null },
  };
}

function seedComment(author, text, hoursAgo) {
  return {
    id: `c-${author.id}-${hoursAgo}-${text.slice(0, 8)}`,
    author: author.name,
    avatar: author.avatar,
    text,
    time: hoursAgo <= 1 ? 'just now' : `${hoursAgo}h ago`,
    createdAt: daysAgo(0),
  };
}

export const productionCardsSeed = [
  makeCard({
    id: 1, stage: 'new_draft', type: 'draft', title: 'Landing Page Draft', client: 'Acme Corp',
    assignee: agents[3], createdAgo: 1,
    description: 'First homepage draft for the Q3 redesign, briefed by the marketing team.',
  }),
  makeCard({
    id: 2, stage: 'new_draft', type: 'draft', title: 'Product Explainer Video', client: 'Globex Inc',
    assignee: agents[0], createdAgo: 3, priority: 'high',
    description: '60-second explainer covering the new onboarding flow.',
  }),
  makeCard({
    id: 3, stage: 'in_progress', type: 'draft', title: 'Brand Style Guide', client: 'Soylent Corp',
    assignee: agents[1], createdAgo: 2, priority: 'medium',
    comments: [
      seedComment(agents[1], 'Working through typography scale today.', 5),
      seedComment(agents[3], 'Please keep logo clear-space at 1x.', 3),
    ],
    description: 'Full brand guide draft: typography, color system and logo usage.',
  }),
  makeCard({
    id: 4, stage: 'revision', type: 'revision', title: 'Homepage Revision Round 2', client: 'Initech',
    assignee: agents[4], createdAgo: 1, priority: 'high',
    comments: [
      seedComment(agents[4], 'Hero copy tightened — ready for review.', 2),
      seedComment(agents[0], 'CTA color still feels soft on dark.', 1),
      seedComment(agents[4], 'Updated CTA to #C65A79.', 1),
    ],
    description: 'Client requested tighter hero copy and a new CTA color.',
    feedback: { status: 'changes_requested', note: 'CTA needs more contrast on dark hero.', rating: 3, updatedAt: daysAgo(0), author: 'Client' },
  }),
  makeCard({
    id: 5, stage: 'revision', type: 'revision', title: 'Logo Revision', client: 'Umbrella Corp',
    assignee: agents[2], createdAgo: 3, priority: 'low',
    comments: [seedComment(agents[2], 'Second pass on the primary mark uploaded.', 6)],
    description: 'Second revision pass on the primary logo mark.',
  }),
  makeCard({
    id: 6, stage: 'review', type: 'draft', title: 'Social Campaign Assets', client: 'Hooli',
    assignee: agents[3], createdAgo: 4, priority: 'medium',
    attachments: [
      { id: 'f1', name: 'ig-story-01.png', size: 420000, type: 'image/png', url: null, uploadedAt: daysAgo(1) },
      { id: 'f2', name: 'ig-feed-01.png', size: 510000, type: 'image/png', url: null, uploadedAt: daysAgo(1) },
      { id: 'f3', name: 'campaign-brief.pdf', size: 890000, type: 'application/pdf', url: null, uploadedAt: daysAgo(2) },
      { id: 'f4', name: 'copy-sheet.xlsx', size: 120000, type: 'application/vnd.ms-excel', url: null, uploadedAt: daysAgo(2) },
    ],
    description: 'Ready for internal review before client delivery.',
    feedback: { status: 'pending', note: '', rating: null, updatedAt: daysAgo(0), author: null },
  }),
  makeCard({
    id: 8, stage: 'live', type: 'draft', title: 'Wiki Studio Launch Page', client: 'The Wiki Studio',
    assignee: agents[0], createdAgo: 2, priority: 'high',
    comments: [
      seedComment(agents[0], 'Page is live on production CDN.', 4),
      seedComment(agents[3], 'Analytics pixel verified.', 2),
    ],
    attachments: [
      { id: 'f5', name: 'launch-screenshot.png', size: 640000, type: 'image/png', url: null, uploadedAt: daysAgo(1) },
      { id: 'f6', name: 'go-live-checklist.pdf', size: 210000, type: 'application/pdf', url: null, uploadedAt: daysAgo(2) },
    ],
    description: 'Public launch page currently live — monitor feedback and hotfix if needed.',
    feedback: { status: 'approved', note: 'Looks great — ship it.', rating: 5, updatedAt: daysAgo(1), author: 'Client' },
  }),
  makeCard({
    id: 7, stage: 'done', type: 'draft', title: 'Email Template Set', client: 'Stark Industries',
    assignee: agents[0], createdAgo: 6, priority: 'none',
    attachments: [
      { id: 'f7', name: 'welcome.html', size: 18000, type: 'text/html', url: null, uploadedAt: daysAgo(5) },
      { id: 'f8', name: 'receipt.html', size: 16000, type: 'text/html', url: null, uploadedAt: daysAgo(5) },
    ],
    description: 'Approved and delivered transactional email templates.',
    feedback: { status: 'approved', note: 'Delivered and signed off.', rating: 5, updatedAt: daysAgo(4), author: 'Client' },
  }),
];

