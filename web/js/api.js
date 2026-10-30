// Thin fetch wrapper for /api. Errors surface as ApiError and as a toast.
import { toast } from './components/toast.js';

export class ApiError extends Error {
  constructor(message, field, status) { super(message); this.field = field; this.status = status; }
}

async function request(method, path, { body, params, formData, silent } = {}) {
  let url = '/api' + path;
  if (params) {
    const q = Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    if (q.length) url += '?' + q.join('&');
  }
  const init = { method, headers: {} };
  if (formData) init.body = formData;
  else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    const err = new ApiError('Sem conexão com o servidor.', null, 0);
    if (!silent) toast(err.message, 'error');
    throw err;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = new ApiError(data?.error || `Erro ${res.status}`, data?.field || null, res.status);
    if (!silent) toast(err.message, 'error');
    throw err;
  }
  return data;
}

export const api = {
  get: (path, params, opts) => request('GET', path, { params, ...opts }),
  post: (path, body, opts) => request('POST', path, { body, ...opts }),
  put: (path, body, opts) => request('PUT', path, { body, ...opts }),
  del: (path, params, opts) => request('DELETE', path, { params, ...opts }),
  upload: (path, formData, opts) => request('POST', path, { formData, ...opts }),
};
