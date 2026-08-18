const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

/** Origin of the API host (no /api suffix), for resolving /api/uploads/... paths. */
export function apiOrigin() {
  try {
    const u = new URL(API_BASE, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    // API_BASE is typically https://host/api → origin https://host
    return u.origin;
  } catch {
    return '';
  }
}

function uploadsUrl(path) {
  const withApi = path.startsWith('/api/') ? path : `/api${path}`;
  const origin = apiOrigin();
  return origin ? `${origin}${withApi}` : withApi;
}

/** Turn an uploads path (or a stale absolute one) into a live API media URL. */
export function resolveMediaUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  // Older rows stored the host that happened to serve the upload request, which
  // dies whenever that host is the site domain instead of the API — re-anchor.
  const stored = raw.match(/^https?:\/\/[^/]+(\/api\/uploads\/.+)$/i);
  if (stored) return uploadsUrl(stored[1]);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/api/uploads/') || raw.startsWith('/uploads/')) return uploadsUrl(raw);
  return raw;
}

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

/** Multipart upload to Hostinger disk (no JSON Content-Type). */
async function uploadFiles(path, files, token) {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token) => request('/auth/me', { token }),
  updateProfile: (token, patch) => request('/auth/me', { method: 'PATCH', body: patch, token }),
  changePassword: (token, body) => request('/auth/change-password', { method: 'POST', body, token }),
  switchUser: (token, userId) =>
    request('/auth/switch-user', { method: 'POST', body: { userId }, token }),
  switchBack: (token) => request('/auth/switch-back', { method: 'POST', token }),
  // --- users ---
  listUsers: (token, query = '') => request(`/users${query}`, { token }),
  getUser: (token, id) => request(`/users/${id}`, { token }),
  createUser: (token, user) => request('/users', { method: 'POST', body: user, token }),
  updateUser: (token, id, patch) => request(`/users/${id}`, { method: 'PATCH', body: patch, token }),
  // Default is a soft delete (deactivate); hard=true removes the row entirely.
  deleteUser: (token, id, hard = false) =>
    request(`/users/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE', token }),

  // --- mailboxes ---
  listMailboxes: (token, userId) =>
    request(`/mailboxes${userId ? `?userId=${userId}` : ''}`, { token }),
  createMailbox: (token, mailbox) => request('/mailboxes', { method: 'POST', body: mailbox, token }),
  updateMailbox: (token, id, patch) =>
    request(`/mailboxes/${id}`, { method: 'PATCH', body: patch, token }),
  deleteMailbox: (token, id) => request(`/mailboxes/${id}`, { method: 'DELETE', token }),

  // --- follow-ups (agent/manager: own; admin: all, read-only) ---
  listFollowUps: (token, status) =>
    request(`/follow-ups${status ? `?status=${status}` : ''}`, { token }),
  createFollowUp: (token, followUp) =>
    request('/follow-ups', { method: 'POST', body: followUp, token }),
  updateFollowUp: (token, id, patch) =>
    request(`/follow-ups/${id}`, { method: 'PATCH', body: patch, token }),
  deleteFollowUp: (token, id) => request(`/follow-ups/${id}`, { method: 'DELETE', token }),

  // --- commission rates (own + manager-per-agent, month-wise) ---
  listRates: (token, month) =>
    request(`/commissions/rates${month ? `?month=${month}` : ''}`, { token }),
  updateRate: (token, userId, patch) =>
    request(`/commissions/rates/${userId}`, { method: 'PATCH', body: patch, token }),
  setManagerCut: (token, body) =>
    request('/commissions/overrides', { method: 'PUT', body, token }),
  deleteManagerCut: (token, managerId, agentId) =>
    request(`/commissions/overrides/${managerId}/${agentId}`, { method: 'DELETE', token }),
  getRateHistory: (token, userId) =>
    request(`/commissions/rates/${userId}/history`, { token }),
  getTeam: (token, managerId, month) => {
    const params = new URLSearchParams();
    if (managerId) params.set('managerId', managerId);
    if (month) params.set('month', month);
    const q = params.toString();
    return request(`/commissions/team${q ? `?${q}` : ''}`, { token });
  },

  // --- attendance ---
  attendanceToday: (token) => request('/attendance/today', { token }),
  attendanceCheckIn: (token, body = {}) =>
    request('/attendance/check-in', { method: 'POST', body, token }),
  attendanceCheckOut: (token, body) =>
    request('/attendance/check-out', { method: 'POST', body, token }),
  attendanceProgress: (token, body) =>
    request('/attendance/progress', { method: 'PATCH', body, token }),
  attendanceMe: (token, month) =>
    request(`/attendance/me${month ? `?month=${month}` : ''}`, { token }),
  attendanceTeam: (token, query = {}) => {
    if (typeof query === 'string') {
      return request(`/attendance/team${query ? `?month=${query}` : ''}`, { token });
    }
    const params = new URLSearchParams();
    if (query.date) params.set('date', query.date);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.month) params.set('month', query.month);
    const q = params.toString();
    return request(`/attendance/team${q ? `?${q}` : ''}`, { token });
  },
  attendanceMember: (token, userId, query = {}) => {
    const params = new URLSearchParams();
    if (query.month) params.set('month', query.month);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const q = params.toString();
    return request(`/attendance/team/${userId}${q ? `?${q}` : ''}`, { token });
  },

  // --- clients (admin) ---
  listClients: (token, query = {}) => {
    const params = new URLSearchParams();
    if (typeof query === 'string') {
      // legacy: listClients(token, 'search') or listClients(token, '?page=1')
      if (query.startsWith('?')) return request(`/clients${query}`, { token });
      if (query) params.set('q', query);
    } else {
      if (query.q) params.set('q', query.q);
      if (query.agentId) params.set('agentId', String(query.agentId));
      if (query.productionStatus) params.set('productionStatus', String(query.productionStatus));
      if (query.paymentStatus) params.set('paymentStatus', String(query.paymentStatus));
      if (query.orderStatus) params.set('orderStatus', String(query.orderStatus));
      if (query.dateFrom) params.set('dateFrom', query.dateFrom);
      if (query.dateTo) params.set('dateTo', query.dateTo);
      if (query.page) params.set('page', String(query.page));
      if (query.pageSize) params.set('pageSize', String(query.pageSize));
    }
    const q = params.toString();
    return request(`/clients${q ? `?${q}` : ''}`, { token });
  },
  getClient: (token, id) => request(`/clients/${id}`, { token }),
  createClient: (token, body) => request('/clients', { method: 'POST', body, token }),
  updateClient: (token, id, body) =>
    request(`/clients/${id}`, { method: 'PATCH', body, token }),
  // Soft-delete (is_active = 0); payments and commissions stay.
  deleteClient: (token, id) => request(`/clients/${id}`, { method: 'DELETE', token }),
  addClientPayment: (token, id, body) =>
    request(`/clients/${id}/payments`, { method: 'POST', body, token }),
  updateClientPayment: (token, id, paymentId, body) =>
    request(`/clients/${id}/payments/${paymentId}`, { method: 'PATCH', body, token }),
  deleteClientPayment: (token, id, paymentId) =>
    request(`/clients/${id}/payments/${paymentId}`, { method: 'DELETE', token }),

  // --- commission earnings + cycle policy ---
  commissionCycle: (token, date) =>
    request(`/commissions/cycle${date ? `?date=${encodeURIComponent(date)}` : ''}`, { token }),
  commissionEarnings: (token, query = {}) => {
    const params = new URLSearchParams();
    if (query.year) params.set('year', String(query.year));
    if (query.cycleStart) params.set('cycleStart', query.cycleStart);
    if (query.cycleEnd) params.set('cycleEnd', query.cycleEnd);
    if (query.userId) params.set('userId', query.userId);
    const q = params.toString();
    return request(`/commissions/earnings${q ? `?${q}` : ''}`, { token });
  },
  pendingCommissions: (token, query = {}) => {
    const params = new URLSearchParams();
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const q = params.toString();
    return request(`/commissions/pending${q ? `?${q}` : ''}`, { token });
  },
  postCommissions: (token, paymentIds) =>
    request('/commissions/post', { method: 'POST', body: { paymentIds }, token }),
  getCyclePolicy: (token) => request('/commissions/cycle-policy', { token }),
  createCyclePolicy: (token, body) =>
    request('/commissions/cycle-policy', { method: 'POST', body, token }),
  listCycleOverrides: (token) => request('/commissions/cycle-overrides', { token }),
  createCycleOverride: (token, body) =>
    request('/commissions/cycle-overrides', { method: 'POST', body, token }),
  deleteCycleOverride: (token, id) =>
    request(`/commissions/cycle-overrides/${id}`, { method: 'DELETE', token }),

  // --- WhatsApp (Wasender) ---
  whatsappStatus: (token) => request('/whatsapp/status', { token }),
  whatsappTest: (token, body) => request('/whatsapp/test', { method: 'POST', body, token }),

  // --- notifications ---
  listNotifications: (token, query = {}) => {
    const params = new URLSearchParams();
    if (query.channel) params.set('channel', query.channel);
    if (query.limit) params.set('limit', String(query.limit));
    const q = params.toString();
    return request(`/notifications${q ? `?${q}` : ''}`, { token });
  },
  notificationsUnreadCount: (token) => request('/notifications/unread-count', { token }),
  notificationsUnreadCards: (token) => request('/notifications/unread-cards', { token }),
  markNotificationRead: (token, id) =>
    request(`/notifications/${id}/read`, { method: 'PATCH', token }),
  markAllNotificationsRead: (token) =>
    request('/notifications/read-all', { method: 'POST', token }),
  markCardNotificationsRead: (token, cardId) =>
    request(`/notifications/read-card/${cardId}`, { method: 'POST', token }),

  // --- production board ---
  listProductionCards: (token, query = {}) => {
    const params = new URLSearchParams();
    if (query.stage) params.set('stage', query.stage);
    const q = params.toString();
    return request(`/production/cards${q ? `?${q}` : ''}`, { token });
  },
  getProductionCard: (token, id) => request(`/production/cards/${id}`, { token }),
  createProductionCard: (token, body) =>
    request('/production/cards', { method: 'POST', body, token }),
  updateProductionCard: (token, id, body) =>
    request(`/production/cards/${id}`, { method: 'PATCH', body, token }),
  deleteProductionCard: (token, id) =>
    request(`/production/cards/${id}`, { method: 'DELETE', token }),
  /** Upload files to Hostinger disk; returns { files: [{ id, name, size, type, url, uploadedAt }] } */
  uploadProductionFiles: (token, files) => uploadFiles('/production/uploads', files, token),
  migrateProductionBase64: (token) =>
    request('/production/uploads/migrate-base64', { method: 'POST', token }),
  listPortfolio: (token) => request('/production/portfolio', { token }),

  // --- portal settings (admin) ---
  getPortalSettings: (token) => request('/settings', { token }),
  updateWhatsAppSettings: (token, body) =>
    request('/settings/whatsapp', { method: 'PATCH', body, token }),
  testWhatsAppSettings: (token, body) =>
    request('/settings/whatsapp/test', { method: 'POST', body, token }),
  sendWhatsAppBroadcast: (token, body) =>
    request('/settings/whatsapp/send', { method: 'POST', body, token }),
};
