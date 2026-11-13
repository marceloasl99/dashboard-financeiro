// Client-side analytics over plain transaction lists. Pure functions (no DOM), so they
// work against both the FastAPI server and the offline LocalBackend, and run in Node tests.

export function normalizeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(parcela|parc)\b.*$/, '')
    .replace(/\d{2}\/\d{2}/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isoToDate = iso => new Date(iso + 'T00:00:00');
const dayDiff = (a, b) => Math.round((isoToDate(b) - isoToDate(a)) / 86400000);
const addMonthsIso = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, last));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Find charges that repeat roughly once a month with a stable amount.
 * Returns items sorted by monthly cost, each tagged as a fixed-price subscription
 * or a variable bill (utility-like), with price-change detection.
 */
export function detectSubscriptions(transactions, { today, minMonths = 3 } = {}) {
  const todayIso = today || new Date().toISOString().slice(0, 10);
  const groups = new Map();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'settled' || t.installment) continue;
    const key = normalizeName(t.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = [];
  for (const [key, txs] of groups) {
    txs.sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(txs.map(t => t.date.slice(0, 7)));
    if (months.size < minMonths) continue;
    // Roughly one charge per month: skip things bought several times a month (restaurants, rides).
    if (txs.length / months.size > 1.25) continue;
    const gaps = txs.slice(1).map((t, i) => dayDiff(txs[i].date, t.date));
    const gap = median(gaps);
    if (gap < 24 || gap > 38) continue;
    const amounts = txs.map(t => t.amount);
    const avg = mean(amounts);
    const cv = Math.sqrt(mean(amounts.map(a => (a - avg) ** 2))) / (avg || 1);
    if (cv > 0.22) continue;
    const last = txs[txs.length - 1];
    const recent = txs.slice(-3).map(t => t.amount);
    const fixed = cv < 0.03 || new Set(recent).size === 1;
    const monthly = fixed ? last.amount : Math.round(mean(recent));
    // Price change: compare the latest price with the oldest one in the window.
    const first = txs[0].amount;
    const change = fixed && first > 0 && Math.abs(last.amount - first) / first > 0.01
      ? { from: first, to: last.amount, pct: Math.round((last.amount / first - 1) * 1000) / 10 }
      : null;
    const sinceLast = dayDiff(last.date, todayIso);
    out.push({
      key,
      name: last.description,
      category_id: last.category_id,
      card_id: last.card_id,
      account_id: last.account_id,
      kind: fixed ? 'subscription' : 'bill',
      monthly,
      yearly: monthly * 12,
      count: txs.length,
      first_date: txs[0].date,
      last_date: last.date,
      next_date: addMonthsIso(last.date, 1),
      active: sinceLast <= 45,
      change,
      history: txs.map(t => ({ date: t.date, amount: t.amount })),
    });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/** Map of ISO date -> settled expense total (cents) in [from, to]. */
export function dailySpend(transactions, from, to) {
  const map = new Map();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'settled' || t.date < from || t.date > to) continue;
    map.set(t.date, (map.get(t.date) || 0) + t.amount);
  }
  return map;
}

/** Average spend per weekday (0 = Sunday) over the days in [from, to]. */
export function weekdayAverages(daily, from, to) {
  const sum = Array(7).fill(0), n = Array(7).fill(0);
  for (let d = isoToDate(from); d <= isoToDate(to); d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    sum[d.getDay()] += daily.get(iso) || 0;
    n[d.getDay()]++;
  }
  return sum.map((s, i) => Math.round(s / (n[i] || 1)));
}

/**
 * Compare each expense category in month (y, m) with its average over the previous
 * `lookback` months. With `dayLimit`, previous months only count days 1..dayLimit, so a
 * month in progress is compared like for like. Returns rows sorted by absolute deviation.
 */
export function categoryAnomalies(transactions, year, month, lookback = 6, dayLimit = 31) {
  const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const cur = key(year, month);
  const prev = [];
  for (let i = 1; i <= lookback; i++) {
    const d = new Date(year, month - 1 - i, 1);
    prev.push(key(d.getFullYear(), d.getMonth() + 1));
  }
  const prevSet = new Set(prev);
  const curBy = new Map(), prevBy = new Map();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'settled') continue;
    const mk = t.date.slice(0, 7);
    const c = t.category_id || '';
    if (mk === cur) curBy.set(c, (curBy.get(c) || 0) + t.amount);
    else if (prevSet.has(mk) && +t.date.slice(8, 10) <= dayLimit) prevBy.set(c, (prevBy.get(c) || 0) + t.amount);
  }
  const rows = [];
  for (const c of new Set([...curBy.keys(), ...prevBy.keys()])) {
    const now = curBy.get(c) || 0;
    const avg = Math.round((prevBy.get(c) || 0) / lookback);
    if (now === 0 && avg === 0) continue;
    rows.push({ category_id: c || null, current: now, average: avg, diff: now - avg, pct: avg ? Math.round((now / avg - 1) * 100) : null });
  }
  return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/**
 * Parse quick-entry text such as "mercado 54,90 ontem", "+ freela 1.200" or "uber 23.5 12/11".
 * Returns null when there is no amount.
 */
export function parseQuickEntry(text, todayIso) {
  let s = String(text || '').trim();
  if (!s) return null;
  // The amount is the last standalone number (so "99 taxi 30" reads as R$ 30); dates like 10/11 never match.
  const all = [...s.matchAll(/(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?=\s|$)/gi)];
  const m = all[all.length - 1];
  if (!m) return null;
  let raw = m[1];
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if ((raw.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(raw)) raw = raw.replace(/\./g, '');
  const amount = Math.round(parseFloat(raw) * 100);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim();

  let kind = 'expense';
  if (/^\+/.test(s) || /\b(recebi|receita|salario|salário|entrada)\b/i.test(s)) { kind = 'income'; s = s.replace(/^\+\s*/, ''); }

  const base = isoToDate(todayIso || new Date().toISOString().slice(0, 10));
  let date = new Date(base);
  const dm = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (/\banteontem\b/i.test(s)) { date.setDate(date.getDate() - 2); s = s.replace(/\banteontem\b/i, ''); }
  else if (/\bontem\b/i.test(s)) { date.setDate(date.getDate() - 1); s = s.replace(/\bontem\b/i, ''); }
  else if (/\bhoje\b/i.test(s)) { s = s.replace(/\bhoje\b/i, ''); }
  else if (dm) {
    let y = dm[3] ? +dm[3] : base.getFullYear();
    if (y < 100) y += 2000;
    date = new Date(y, +dm[2] - 1, +dm[1]);
    s = s.replace(dm[0], '');
  }
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const description = s.replace(/\s+/g, ' ').trim();
  return { amount, kind, date: iso, description: description ? description[0].toUpperCase() + description.slice(1) : '' };
}

/** Best category for a description, learned from past transactions with the same normalized name. */
export function guessCategory(description, transactions, kind = 'expense') {
  const key = normalizeName(description);
  if (!key) return null;
  const counts = new Map();
  for (const t of transactions) {
    if (t.kind !== kind || !t.category_id) continue;
    const n = normalizeName(t.description);
    if (n === key || n.startsWith(key + ' ') || key.startsWith(n + ' ')) counts.set(t.category_id, (counts.get(t.category_id) || 0) + 1);
  }
  let best = null, max = 0;
  for (const [c, n] of counts) if (n > max) { best = c; max = n; }
  return best;
}

/** Fetch every transaction in a date range, following pagination. */
export async function fetchAllTransactions(api, params) {
  const pageSize = 1000;
  const items = [];
  for (let page = 1; page < 50; page++) {
    const r = await api.get('/transactions', { ...params, page, page_size: pageSize });
    items.push(...r.items);
    if (items.length >= r.total || !r.items.length) break;
  }
  return items;
}
