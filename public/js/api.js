// @ts-check
/**
 * public/js/api.js
 * Fetch wrapper and API endpoint functions.
 */

/**
 * Universal JSON fetch helper.
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    // @ts-ignore
    err.status = res.status;
    // @ts-ignore
    err.data = data;
    throw err;
  }
  return data;
}

export const authApi = {
  getMe: () => api('/api/auth/me'),
  switchRole: (role) => api('/api/auth/switch', { method: 'POST', body: JSON.stringify({ role }) }),
};

export const itemsApi = {
  search: (query) => api(`/api/items?${query}`),
  getById: (id) => api(`/api/items/${encodeURIComponent(id)}`),
  getBundle: (id) => api(`/api/items/${encodeURIComponent(id)}/bundle`),
};

export const bookingsApi = {
  list: () => api('/api/bookings'),
  getById: (id) => api(`/api/bookings/${encodeURIComponent(id)}`),
  create: (body) => api('/api/bookings', { method: 'POST', body: JSON.stringify(body) }),
  approve: (id, body) => api(`/api/bookings/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify(body) }),
  getReadiness: (id) => api(`/api/bookings/${encodeURIComponent(id)}/readiness`),
  checkin: (token) => api('/api/bookings/checkin', { method: 'POST', body: JSON.stringify({ token }) }),
  swapReply: (body) => api('/api/bookings/swapreply', { method: 'POST', body: JSON.stringify(body) }),
};

export const projectsApi = {
  list: () => api('/api/projects'),
  create: (body) => api('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
};

export const schedulerApi = {
  runConflictDemo: (itemId) => api('/api/scheduler/demo', { method: 'POST', body: JSON.stringify({ itemId }) }),
  getSlots: (itemId, date) => api(`/api/scheduler/slots?itemId=${encodeURIComponent(itemId)}&date=${encodeURIComponent(date)}`),
};

export const analyticsApi = {
  get: () => api('/api/analytics'),
};

export const notificationsApi = {
  list: () => api('/api/notifications'),
};

export const adminApi = {
  setClock: (datetime) => api('/api/admin/clock', { method: 'POST', body: JSON.stringify({ datetime }) }),
  resetClock: () => api('/api/admin/clock', { method: 'DELETE' }),
};
