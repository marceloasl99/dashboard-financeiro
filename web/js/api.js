// Thin fetch wrapper for /api with automatic fallback to client-side LocalBackend
// for GitHub Pages and offline/standalone environments.
import { toast } from './components/toast.js';
import { LocalBackend } from './local_backend.js';

export class ApiError extends Error {
  constructor(message, field, status) { super(message); this.field = field; this.status = status; }
}

let localBackend = null;
function getLocalBackend() {
  if (!localBackend) localBackend = new LocalBackend();
  return localBackend;
}

// Check if running on GitHub Pages or file protocol
const isStaticHost =
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('github.io') ||
   window.location.protocol === 'file:' ||
   window.location.port === '5500' ||
   window.location.port === '3000' && !window.location.search.includes('backend=true'));

let useLocal = isStaticHost;

async function request(method, path, { body, params, formData, silent } = {}) {
  if (useLocal) {
    try {
      return await getLocalBackend().handle(method, path, { body, params, formData });
    } catch (err) {
      if (!silent) toast(err.message || 'Erro na operação local.', 'error');
      throw new ApiError(err.message, null, 500);
    }
  }

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
    // If server unreachable, switch to local backend
    console.info('[Finance OS] Servidor /api inacessível. Alternando para modo offline/local.');
    useLocal = true;
    return await getLocalBackend().handle(method, path, { body, params, formData });
  }

  if (res.status === 404 && path.startsWith('/')) {
    // If endpoint not found on static server (e.g. GitHub Pages without hostname match), switch to local
    console.info('[Finance OS] Rota /api retornou 404. Alternando para modo offline/local.');
    useLocal = true;
    return await getLocalBackend().handle(method, path, { body, params, formData });
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
  isLocal: () => useLocal,
  resetDemo: () => getLocalBackend().resetToDemo(),
};
