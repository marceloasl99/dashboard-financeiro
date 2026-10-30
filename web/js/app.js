// App shell: hash routing, navigation, theme, global "new transaction" button.
import { icon } from './components/icons.js';
import { openTransactionModal } from './components/txModal.js';
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
  { id: 'import', title: 'Importar extrato', icon: 'upload' },
  { id: 'settings', title: 'Configurações', icon: 'settings', tab: true },
];

let current = null;
let currentId = null;

function applyTheme() {
  const pref = state.settings?.theme || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').content = dark ? '#141B20' : '#1B3A4B';
  const t = document.getElementById('themeToggle');
  if (t) t.innerHTML = `${icon(dark ? 'sun' : 'moon', 15)} ${dark ? 'Claro' : 'Escuro'}`;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); render(true); });

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

window.addEventListener('hashchange', () => render());
document.getElementById('fab').onclick = () => openTransactionModal();
document.getElementById('themeToggle').onclick = async () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  state.settings.theme = dark ? 'light' : 'dark';
  applyTheme();
  render(true);
  const { api } = await import('./api.js');
  api.put('/settings', { theme: state.settings.theme }, { silent: true }).catch(() => {});
};
document.addEventListener('keydown', e => {
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && !document.querySelector('.modal')) openTransactionModal();
});

(async () => {
  restorePeriod();
  applyTheme();
  try {
    await loadReference();
    document.getElementById('syncState').textContent = 'Conectado';
  } catch {
    document.getElementById('syncState').textContent = 'Sem conexão';
  }
  render();
})();
