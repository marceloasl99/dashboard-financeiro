// Shared app state: selected period, reference lists, settings. Pages subscribe to changes.
import { api } from './api.js';

const now = new Date();
const listeners = new Set();

export const state = {
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  accounts: [],
  cards: [],
  categories: [],
  settings: { theme: 'auto', quotes_enabled: false },
  loaded: false,
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(event, payload) { for (const fn of listeners) fn(event, payload); }

export async function loadReference() {
  const [accounts, cards, categories, settings] = await Promise.all([
    api.get('/accounts'), api.get('/cards'), api.get('/categories'), api.get('/settings'),
  ]);
  Object.assign(state, { accounts, cards, categories, settings, loaded: true });
  emit('reference');
}

export function setPeriod(year, month) {
  state.year = year; state.month = month;
  try { localStorage.setItem('finance.period', JSON.stringify({ year, month })); } catch {}
  emit('period');
}
export function restorePeriod() {
  try {
    const p = JSON.parse(localStorage.getItem('finance.period') || 'null');
    if (p && p.year && p.month) { state.year = p.year; state.month = p.month; }
  } catch {}
}
export const shiftMonth = delta => {
  let m = state.month + delta, y = state.year;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  setPeriod(y, m);
};

export const categoryById = id => state.categories.find(c => c.id === id);
export const accountById = id => state.accounts.find(a => a.id === id);
export const cardById = id => state.cards.find(c => c.id === id);
export const sourceName = tx => accountById(tx.account_id)?.name || cardById(tx.card_id)?.name || '—';
export const activeAccounts = () => state.accounts.filter(a => !a.archived);
export const activeCards = () => state.cards.filter(c => !c.archived);
export const expenseCategories = () => state.categories.filter(c => c.kind === 'expense');
export const incomeCategories = () => state.categories.filter(c => c.kind === 'income');
