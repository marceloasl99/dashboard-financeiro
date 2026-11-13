// Global Command Palette (Ctrl + K / Cmd + K)
import { icon } from './icons.js';
import { openTransactionModal } from './txModal.js';
import { state } from '../state.js';
import { money, dateBR, esc, todayISO } from '../format.js';
import { guessCategory, parseQuickEntry } from '../analytics.js';
import { categoryById } from '../state.js';
import { api } from '../api.js';

let isOpen = false;
let rootEl = null;

const STATIC_ACTIONS = [
  { id: 'act-new-tx', title: 'Novo lançamento', sub: 'Registrar receita, despesa ou transferência', icon: 'plus', badge: 'Atalho: N', run: () => openTransactionModal() },
  { id: 'act-privacy', title: 'Alternar modo privacidade', sub: 'Ocultar / revelar valores na tela', icon: 'eye', badge: 'Privacidade', run: () => window.togglePrivacyMode?.() },
  { id: 'act-theme', title: 'Próximo tema visual', sub: 'Alternar entre os 6 temas disponíveis', icon: 'sun', badge: 'Atalho: T', run: () => window.cycleTheme?.() },
  { id: 'act-keys', title: 'Atalhos de teclado', sub: 'Ver todos os atalhos, incluindo G + letra para navegar', icon: 'keyboard', badge: 'Atalho: ?', run: () => import('../app.js').then(m => m.openShortcuts()) },
  { id: 'act-export', title: 'Baixar backup completo (JSON)', sub: 'Exportar todos os dados e lançamentos', icon: 'download', badge: 'Dados', run: () => api.get('/export.json') },
];

const PAGES = [
  { id: 'overview', title: 'Visão geral', sub: 'Dashboard, KPIs e fluxo dos 12 meses', icon: 'home' },
  { id: 'transactions', title: 'Lançamentos', sub: 'Extrato detalhado por período e filtros', icon: 'list' },
  { id: 'cards', title: 'Cartões de crédito', sub: 'Faturas abertas, limites e faturas pagas', icon: 'card' },
  { id: 'calendar', title: 'Calendário e projeção', sub: 'Vencimentos e fluxo de caixa de 90 dias', icon: 'calendar' },
  { id: 'budget', title: 'Orçamento', sub: 'Limites de gastos por categoria', icon: 'target' },
  { id: 'subscriptions', title: 'Assinaturas e contas fixas', sub: 'Cobranças recorrentes detectadas, custo anual e reajustes', icon: 'repeat' },
  { id: 'insights', title: 'Insights de gastos', sub: 'Mapa de calor diário, ritmo da semana e gastos fora do normal', icon: 'sparkles' },
  { id: 'import', title: 'Importar extrato', sub: 'CSV, XLSX, OFX ou PDF do banco', icon: 'upload' },
  { id: 'reports', title: 'Relatórios', sub: 'Evolução de despesas e comparativos anuais', icon: 'chart' },
  { id: 'investments', title: 'Investimentos', sub: 'Patrimônio, classes de ativos e cotações', icon: 'trending' },
  { id: 'goals', title: 'Metas', sub: 'Objetivos financeiros e prazos', icon: 'flag' },
  { id: 'fire', title: 'Independência Financeira (FIRE)', sub: 'Simulador de aposentadoria e liberdade financeira', icon: 'fire' },
  { id: 'settings', title: 'Configurações', sub: 'Contas, categorias, regras e temas', icon: 'settings' },
];

export function openCommandPalette() {
  if (isOpen) return;
  isOpen = true;

  rootEl = document.createElement('div');
  rootEl.className = 'cmd-backdrop';
  rootEl.innerHTML = `
    <div class="cmd-modal" role="dialog" aria-modal="true" aria-label="Busca e comandos">
      <div class="cmd-input-wrap">
        ${icon('search', 18)}
        <input type="text" id="cmdInput" placeholder="Buscar telas, contas e ações, ou lançar: “mercado 54,90 ontem”" autocomplete="off">
        <span class="cmd-badge"><kbd>ESC</kbd></span>
      </div>
      <div class="cmd-results" id="cmdResults"></div>
      <div class="cmd-foot">
        <span>Use <kbd>↑</kbd> <kbd>↓</kbd> para navegar e <kbd>ENTER</kbd> para abrir</span>
        <span>Digite um valor para lançar</span>
      </div>
    </div>
  `;

  document.body.appendChild(rootEl);
  const input = rootEl.querySelector('#cmdInput');
  const resultsContainer = rootEl.querySelector('#cmdResults');

  let selectedIndex = 0;
  let currentItems = [];
  let history = [];
  api.get('/transactions', { page_size: 1000 }, { silent: true }).then(r => { history = r?.items || []; }).catch(() => {});

  function close() {
    if (!isOpen) return;
    isOpen = false;
    rootEl?.remove();
    rootEl = null;
  }

  function renderList(query = '') {
    const q = query.trim().toLowerCase();
    const items = [];

    // Quick entry: any text with an amount becomes a ready-to-save transaction.
    const quick = parseQuickEntry(query, todayISO());
    if (quick) {
      const category_id = guessCategory(quick.description, history, quick.kind);
      const cat = categoryById(category_id);
      const verb = quick.kind === 'income' ? 'Lançar receita' : 'Lançar gasto';
      items.push({
        type: 'quick', quick: true,
        title: `${verb} de ${money(quick.amount)}${quick.description ? ` em “${esc(quick.description)}”` : ''}`,
        sub: `${dateBR(quick.date)}${cat ? `, categoria ${esc(cat.name)}` : ''}. Enter abre o formulário preenchido`,
        icon: 'bolt', badge: 'Lançar',
        action: () => { close(); openTransactionModal({ defaults: { ...quick, category_id } }); },
      });
    }

    // Filter pages
    for (const p of PAGES) {
      if (!q || p.title.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q)) {
        items.push({
          type: 'page',
          title: p.title,
          sub: p.sub,
          icon: p.icon,
          badge: 'Navegar',
          action: () => { location.hash = `#/${p.id}`; close(); },
        });
      }
    }

    // Filter quick actions
    for (const a of STATIC_ACTIONS) {
      if (!q || a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q)) {
        items.push({
          type: 'action',
          title: a.title,
          sub: a.sub,
          icon: a.icon,
          badge: a.badge,
          action: () => { close(); a.run(); },
        });
      }
    }

    // Filter accounts and cards
    for (const acc of (state.accounts || [])) {
      if (!q || acc.name.toLowerCase().includes(q)) {
        items.push({
          type: 'account',
          title: acc.name,
          sub: `Conta ${acc.type}`,
          icon: 'wallet',
          badge: 'Conta',
          action: () => { location.hash = `#/transactions?account_id=${acc.id}`; close(); },
        });
      }
    }

    for (const card of (state.cards || [])) {
      if (!q || card.name.toLowerCase().includes(q)) {
        items.push({
          type: 'card',
          title: card.name,
          sub: `Cartão de crédito · Limite ${money(card.limit)}`,
          icon: 'card',
          badge: 'Cartão',
          action: () => { location.hash = `#/cards`; close(); },
        });
      }
    }

    currentItems = items.slice(0, 10);
    if (selectedIndex >= currentItems.length) selectedIndex = 0;

    if (currentItems.length === 0) {
      resultsContainer.innerHTML = `<div style="padding:24px;text-align:center;color:var(--ink-3);font-size:13px">Nada encontrado para “${esc(query)}”. Para lançar, inclua um valor, como “${esc(query)} 25,00”.</div>`;
      return;
    }

    resultsContainer.innerHTML = currentItems.map((item, idx) => `
      <div class="cmd-item ${item.quick ? 'quick' : ''} ${idx === selectedIndex ? 'selected' : ''}" data-idx="${idx}">
        <div class="cmd-left">
          ${icon(item.icon, 16)}
          <div>
            <div style="font-weight:500">${item.title}</div>
            <div style="font-size:12px;color:var(--ink-3)">${item.sub}</div>
          </div>
        </div>
        <span class="cmd-badge">${item.badge}</span>
      </div>
    `).join('');

    resultsContainer.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        currentItems[idx]?.action();
      });
      el.addEventListener('mouseenter', () => {
        selectedIndex = parseInt(el.dataset.idx, 10);
        updateSelection();
      });
    });
  }

  function updateSelection() {
    resultsContainer.querySelectorAll('.cmd-item').forEach((el, idx) => {
      el.classList.toggle('selected', idx === selectedIndex);
      if (idx === selectedIndex) el.scrollIntoView({ block: 'nearest' });
    });
  }

  input.addEventListener('input', e => {
    selectedIndex = 0;
    renderList(e.target.value);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % Math.max(1, currentItems.length);
      updateSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentItems.length) % Math.max(1, currentItems.length);
      updateSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentItems[selectedIndex]) {
        currentItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      close();
    }
  });

  rootEl.addEventListener('click', e => {
    if (e.target === rootEl) close();
  });

  renderList('');
  setTimeout(() => input.focus(), 20);
}
