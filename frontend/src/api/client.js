const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token) => request('/auth/me', { token }),
  listUsers: (token, role) => request(`/users${role ? `?role=${role}` : ''}`, { token }),
  createUser: (token, user) => request('/users', { method: 'POST', body: user, token }),
  updateUser: (token, id, patch) => request(`/users/${id}`, { method: 'PATCH', body: patch, token }),
  deleteUser: (token, id) => request(`/users/${id}`, { method: 'DELETE', token }),
};
