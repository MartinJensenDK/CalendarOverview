// Small fetch wrapper: JSON in/out, CSRF header, session-expiry handling.
const csrf = () => (window.__APP__ && window.__APP__.csrf) || document.querySelector('meta[name="csrf-token"]')?.content || '';

export class ApiError extends Error {
  constructor(status, body) {
    super((body && (body.message || body.error)) || `HTTP ${status}`);
    this.status = status;
    this.body = body || {};
  }
}

async function request(method, url, data, opts = {}) {
  const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-TOKEN': csrf() };
  let body;
  if (data !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }
  if (method === 'GET' && data) {
    const qs = new URLSearchParams();
    Object.entries(data).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
      else qs.append(k, v);
    });
    const q = qs.toString();
    if (q) url += (url.includes('?') ? '&' : '?') + q;
  }
  const res = await fetch(url, { method, headers, body, credentials: 'same-origin', signal: opts.signal });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (res.status === 401) {
    const target = (json && json.login_url) || (window.__APP__ && window.__APP__.loginUrl) || '/login';
    if (!opts.noRedirect) window.location.href = target;
    throw new ApiError(401, json);
  }
  if (res.status === 503 && json && json.error === 'not_installed') {
    window.location.href = json.setup_url;
  }
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

export const api = {
  get: (url, params, opts) => request('GET', url, params, opts),
  post: (url, data, opts) => request('POST', url, data, opts),
  put: (url, data, opts) => request('PUT', url, data, opts),
  del: (url, opts) => request('DELETE', url, undefined, opts),
};

/** Validation errors (422) as a flat "field: message" map. */
export function fieldErrors(err) {
  const out = {};
  if (err instanceof ApiError && err.body && err.body.errors) {
    Object.entries(err.body.errors).forEach(([k, v]) => { out[k] = Array.isArray(v) ? v[0] : String(v); });
  }
  return out;
}
