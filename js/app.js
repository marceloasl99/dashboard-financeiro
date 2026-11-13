// App shell: hash routing, navigation, theme suite, privacy mode, command palette.
import { icon } from './components/icons.js';
import { openTransactionModal } from './components/txModal.js';
import { openCommandPalette } from './components/commandPalette.js';
import { destroyAll } from './charts.js';
import { loadReference, restorePeriod, state, subscribe } from './state.js';

const ROUTES = [
  { id: 'overview', title: 'Visão geral', icon: 'home', tab: true },
  { id: 'transactions', title: 'Lançamentos', icon: 'list', tab: true },
  { id: 'cards', title: 'Cartões', icon: 'card', tab: true },
  { id: 'calendar', title: 'Calendário e projeção', icon: 'calendar', tab: true },
  { id: 'budget', title: 'Orçamento', icon: 'target' },
  { id: 'reports', title: 'Relatórios', icon: 'chart' },
  { id: 'investments', title: 'Investimentos', icon: 'trending' },
  { id: 'goals', title: 'Metas', icon: 'flag' },
  { id: 'fire', title: 'Independência FIRE', icon: 'fire' },
  { id: 'import', title: 'Importar extrato', icon: 'upload' },
  { id: 'settings', title: 'Configurações', icon: 'settings', tab: true },
];

export const THEMES = ['light', 'dark', 'oled', 'nord', 'emerald', 'sunset'];
export const THEME_LABELS = {
  light: 'Clássico',
  dark: 'Meia-noite',
  oled: 'OLED Puro',
  nord: 'Nord Ártico',
  emerald: 'Esmeralda',
  sunset: 'Crepúsculo',
};

const THEME_COLORS = {
  light: '#1B3A4B',
  dark: '#141B20',
  oled: '#000000',
  nord: '#242933',
  emerald: '#091712',
  sunset: '#1A1412',
};

let current = null;
let currentId = null;

// Privacy mode toggle
export function togglePrivacyMode() {
  if (typeof document === 'undefined') return;
  const isPrivate = document.body.classList.toggle('privacy-mode');
  try { localStorage.setItem('finance.privacy', isPrivate ? '1' : '0'); } catch {}
  updatePrivacyIcon();
}
if (typeof window !== 'undefined') window.togglePrivacyMode = togglePrivacyMode;

function updatePrivacyIcon() {
  if (typeof document === 'undefined') return;
  const isPrivate = document.body.classList.contains('privacy-mode');
  const btn = document.getElementById('privacyBtn');
  if (btn) {
    btn.innerHTML = icon(isPrivate ? 'eye-off' : 'eye', 16);
    btn.title = isPrivate ? 'Revelar valores (Modo Privacidade ativo)' : 'Ocultar valores (Modo Privacidade)';
  }
}

function restorePrivacyMode() {
  if (typeof document === 'undefined') return;
  try {
    if (localStorage.getItem('finance.privacy') === '1') {
      document.body.classList.add('privacy-mode');
    }
  } catch {}
  updatePrivacyIcon();
}

export function applyTheme(specificTheme = null) {
  let pref = specificTheme || state.settings?.theme || 'auto';
  if (pref === 'auto') {
    pref = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (!THEMES.includes(pref)) pref = 'light';

  document.documentElement.dataset.theme = pref;
  const metaTheme = document.querySelector('meta[name=theme-color]');
  if (metaTheme) metaTheme.content = THEME_COLORS[pref] || '#1B3A4B';

  const t = document.getElementById('themeToggle');
  if (t) {
    const isDark = pref !== 'light';
    t.innerHTML = `${icon(isDark ? 'sun' : 'moon', 15)} ${THEME_LABELS[pref] || 'Tema'}`;
  }
}

export async function cycleTheme() {
  if (typeof document === 'undefined') return;
  const currentTheme = document.documentElement.dataset.theme || 'light';
  const idx = THEMES.indexOf(currentTheme);
  const nextTheme = THEMES[(idx + 1) % THEMES.length];
  state.settings.theme = nextTheme;
  applyTheme(nextTheme);
  render(true);
  const { api } = await import('./api.js');
  api.put('/settings', { theme: nextTheme }, { silent: true }).catch(() => {});
}
if (typeof window !== 'undefined') window.cycleTheme = cycleTheme;

if (typeof matchMedia !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings?.theme === 'auto') { applyTheme(); render(true); }
  });
}

function renderNav() {
  const route = location.hash.replace(/^#\/?/, '').split('?')[0] || 'overview';
  document.getElementById('nav').innerHTML = ROUTES.map(r =>
    `<a href="#/${r.id}" class="${r.id === route ? 'active' : ''}">${icon(r.icon)}<span>${r.title}</span></a>`).join('');
  document.getElementById('tabbar').innerHTML = ROUTES.filter(r => r.tab).map(r =>
    `<a href="#/${r.id}" class="${r.id === route ? 'active' : ''}">${icon(r.icon, 20)}<span>${r.title.split(' ')[0]}</span></a>`).join('');
}

async function render(force = false) {
  const hash = location.hash.replace(/^#\/?/, '') || 'overview';
  const [id, qs] = hash.split('?');
  const route = ROUTES.find(r => r.id === id) || ROUTES[0];
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  renderNav();
  document.getElementById('pageTitle').textContent = route.title;
  document.title = `${route.title} · Finance OS`;
  if (!force && currentId === route.id && current?.update) { current.update(params); return; }
  current?.destroy?.();
  destroyAll();
  const view = document.getElementById('view');
  const tools = document.getElementById('pageTools');
  view.innerHTML = '';
  tools.innerHTML = '';
  currentId = route.id;
  try {
    const mod = await import(`./pages/${route.id}.js`);
    current = await mod.render(view, tools, params);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><div class="empty"><strong>Não foi possível abrir esta tela.</strong>${e.message}</div></div>`;
  }
}

subscribe(event => {
  if (event === 'period' || event === 'data-changed') current?.refresh ? current.refresh() : render(true);
  if (event === 'reference') { applyTheme(); }
});

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => render());

  document.getElementById('fab')?.addEventListener('click', () => openTransactionModal());
  document.getElementById('themeToggle')?.addEventListener('click', () => cycleTheme());
  document.getElementById('searchBtn')?.addEventListener('click', () => openCommandPalette());
  document.getElementById('privacyBtn')?.addEventListener('click', () => togglePrivacyMode());

  document.addEventListener('keydown', e => {
    // Ctrl + K or Cmd + K: Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    // Ignore single-key shortcuts when typing in inputs
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || document.querySelector('.modal')) {
      return;
    }
    // Key 'n': new transaction
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      openTransactionModal();
    }
    // Key 'p': toggle privacy
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      togglePrivacyMode();
    }
  });

  (async () => {
    restorePeriod();
    restorePrivacyMode();
    applyTheme();
    try {
      await loadReference();
      const { api } = await import('./api.js');
      const syncEl = document.getElementById('syncState');
      if (syncEl) syncEl.textContent = api.isLocal() ? 'Online (Demo)' : 'Conectado';
    } catch {
      const syncEl = document.getElementById('syncState');
      if (syncEl) syncEl.textContent = 'Sem conexão';
    }
    render();
  })();
}
