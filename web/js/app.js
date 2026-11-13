// App shell: hash routing, navigation, theme suite, privacy mode, command palette.
import { icon } from './components/icons.js';
import { openTransactionModal } from './components/txModal.js';
import { openCommandPalette } from './components/commandPalette.js';
import { destroyAll } from './charts.js';
import { loadReference, restorePeriod, state, subscribe } from './state.js';

export const ROUTES = [
  { id: 'overview', title: 'Visão geral', icon: 'home', tab: true, group: 'Dia a dia', key: 'v' },
  { id: 'transactions', title: 'Lançamentos', icon: 'list', tab: true, group: 'Dia a dia', key: 'l' },
  { id: 'cards', title: 'Cartões', icon: 'card', tab: true, group: 'Dia a dia', key: 'c' },
  { id: 'calendar', title: 'Calendário e projeção', short: 'Calendário', icon: 'calendar', tab: true, group: 'Dia a dia', key: 'a' },
  { id: 'subscriptions', title: 'Assinaturas e contas fixas', short: 'Assinaturas', nav: 'Assinaturas', icon: 'repeat', group: 'Análise', key: 's', isNew: true },
  { id: 'insights', title: 'Insights de gastos', short: 'Insights', nav: 'Insights', icon: 'sparkles', group: 'Análise', key: 'i', isNew: true },
  { id: 'reports', title: 'Relatórios', icon: 'chart', group: 'Análise', key: 'r' },
  { id: 'budget', title: 'Orçamento', icon: 'target', group: 'Planejamento', key: 'o' },
  { id: 'goals', title: 'Metas', icon: 'flag', group: 'Planejamento', key: 'm' },
  { id: 'investments', title: 'Investimentos', icon: 'trending', group: 'Planejamento', key: 'n' },
  { id: 'fire', title: 'Independência FIRE', short: 'FIRE', icon: 'fire', group: 'Planejamento', key: 'f' },
  { id: 'import', title: 'Importar extrato', short: 'Importar', icon: 'upload', group: 'Sistema', key: 'e' },
  { id: 'settings', title: 'Configurações', short: 'Ajustes', icon: 'settings', group: 'Sistema', key: 'g' },
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

function currentRoute() {
  return location.hash.replace(/^#\/?/, '').split('?')[0] || 'overview';
}

function renderNav() {
  const route = currentRoute();
  let html = '', group = null;
  for (const r of ROUTES) {
    if (r.group !== group) { group = r.group; html += `<div class="group">${group}</div>`; }
    html += `<a href="#/${r.id}" class="${r.id === route ? 'active' : ''}" ${r.id === route ? 'aria-current="page"' : ''}>${icon(r.icon)}<span>${r.nav || r.title}</span>${r.isNew ? '<span class="new">novo</span>' : ''}</a>`;
  }
  document.getElementById('nav').innerHTML = html;
  const inTabs = ROUTES.some(r => r.tab && r.id === route);
  document.getElementById('tabbar').innerHTML = ROUTES.filter(r => r.tab).map(r =>
    `<a href="#/${r.id}" class="${r.id === route ? 'active' : ''}">${icon(r.icon, 20)}<span>${r.short || r.title}</span></a>`).join('') +
    `<button type="button" id="moreTab" class="${inTabs ? '' : 'active'}" aria-haspopup="dialog">${icon('grid', 20)}<span>Mais</span></button>`;
  document.getElementById('moreTab').onclick = openMoreSheet;
}

// Mobile: every screen reachable from a bottom sheet (the tab bar only fits four).
function openMoreSheet() {
  const route = currentRoute();
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Todas as telas');
  const groups = [...new Set(ROUTES.map(r => r.group))];
  sheet.innerHTML = '<div class="grab"></div>' + groups.map(g => `<div class="g">${g}</div><div class="grid">${ROUTES.filter(r => r.group === g).map(r =>
    `<a href="#/${r.id}" class="${r.id === route ? 'active' : ''}">${icon(r.icon, 20)}<span>${r.short || r.title}</span></a>`).join('')}</div>`).join('');
  const close = () => { back.remove(); sheet.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  back.onclick = close;
  sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  document.body.append(back, sheet);
  sheet.querySelector('a')?.focus();
}

export function openShortcuts() {
  import('./components/modal.js').then(({ openModal }) => {
    const nav = ROUTES.map(r => `<dt><kbd>G</kbd> <kbd>${r.key.toUpperCase()}</kbd></dt><dd>${r.title}</dd>`).join('');
    openModal({
      title: 'Atalhos de teclado',
      wide: true,
      content: `<div class="grid-2" style="gap:28px">
        <dl class="keys">
          <dt><kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Buscar telas e lançar rápido digitando, por exemplo, “mercado 54,90 ontem”</dd>
          <dt><kbd>N</kbd></dt><dd>Novo lançamento</dd>
          <dt><kbd>P</kbd></dt><dd>Ocultar ou mostrar valores</dd>
          <dt><kbd>T</kbd></dt><dd>Próximo tema</dd>
          <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>Mês anterior e próximo</dd>
          <dt><kbd>?</kbd></dt><dd>Esta lista</dd>
        </dl>
        <dl class="keys">${nav}</dl></div>`,
    });
  });
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
  document.getElementById('helpBtn')?.addEventListener('click', () => openShortcuts());
  let pendingG = false;

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
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // "g" then a letter jumps to a screen
    if (pendingG) {
      pendingG = false;
      const r = ROUTES.find(x => x.key === e.key.toLowerCase());
      if (r) { e.preventDefault(); location.hash = `#/${r.id}`; }
      return;
    }
    if (e.key === 'g') { pendingG = true; setTimeout(() => { pendingG = false; }, 1200); return; }
    if (e.key === 'n') openTransactionModal();
    else if (e.key === 'p') togglePrivacyMode();
    else if (e.key === 't') cycleTheme();
    else if (e.key === '?') openShortcuts();
    else if (e.key === '[' || e.key === ']') import('./state.js').then(s => s.shiftMonth(e.key === '[' ? -1 : 1));
  });

  (async () => {
    restorePeriod();
    restorePrivacyMode();
    applyTheme();
    try {
      await loadReference();
      const { api } = await import('./api.js');
      const syncEl = document.getElementById('syncState');
      if (syncEl) syncEl.textContent = api.isLocal() ? 'Salvo neste navegador' : 'Conectado ao servidor';
    } catch {
      const syncEl = document.getElementById('syncState');
      if (syncEl) syncEl.textContent = 'Sem conexão';
    }
    render();
  })();
}
