// Client-side engine providing 100% offline & GitHub Pages full capability
// Matches server/services calculations with complete fidelity.
import { DEMO_DATA } from './demo_data.js';

const STORAGE_KEY = 'finance_os_db';

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDate(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDay(year, month, day) {
  const last = lastDayOfMonth(year, month);
  return new Date(Date.UTC(year, month - 1, Math.min(day, last)));
}

function addMonths(d, n) {
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return clampDay(year, month, d.getUTCDate());
}

function monthKey(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function monthBounds(year, month) {
  const start = `${year}-${pad2(month)}-01`;
  const end = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`;
  return { start, end };
}

function normalizeStr(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export class LocalBackend {
  constructor() {
    this.db = this.loadDb();
    this.materializeRecurrences();
  }

  loadDb() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.accounts && parsed.transactions) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar dados locais, reiniciando com dados demo:', e);
    }
    const fresh = JSON.parse(JSON.stringify(DEMO_DATA));
    this.saveDb(fresh);
    return fresh;
  }

  saveDb(custom) {
    if (custom) this.db = custom;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch (e) {
      console.error('Falha ao salvar no localStorage:', e);
    }
  }

  resetToDemo() {
    this.db = JSON.parse(JSON.stringify(DEMO_DATA));
    this.saveDb();
    this.materializeRecurrences();
    return this.db;
  }

  // --- Balances ---
  accountBalance(account, transactions, until = null, includePlanned = false) {
    let bal = account.initial_balance || 0;
    for (const t of transactions) {
      if (t.status !== 'settled' && !includePlanned) continue;
      if (until && t.date > until) continue;
      if (t.kind === 'income' && t.account_id === account.id) {
        bal += t.amount;
      } else if (t.kind === 'expense' && t.account_id === account.id) {
        bal -= t.amount;
      } else if (t.kind === 'transfer') {
        if (t.account_id === account.id) bal -= t.amount;
        if (t.to_account_id === account.id) bal += t.amount;
      }
    }
    return bal;
  }

  // --- Cards & Statements ---
  closingIn(card, year, month) {
    return clampDay(year, month, card.closing_day);
  }

  dueAfter(card, closing) {
    let candidate = clampDay(closing.getUTCFullYear(), closing.getUTCMonth() + 1, card.due_day);
    if (candidate <= closing) {
      const nxt = addMonths(new Date(Date.UTC(closing.getUTCFullYear(), closing.getUTCMonth(), 1)), 1);
      candidate = clampDay(nxt.getUTCFullYear(), nxt.getUTCMonth() + 1, card.due_day);
    }
    return candidate;
  }

  closingFor(card, d) {
    let closing = this.closingIn(card, d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (d > closing) {
      const nxt = addMonths(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), 1);
      closing = this.closingIn(card, nxt.getUTCFullYear(), nxt.getUTCMonth() + 1);
    }
    return closing;
  }

  statementFor(card, txDate) {
    return monthKey(this.dueAfter(card, this.closingFor(card, txDate)));
  }

  statementPeriod(card, dueMonth) {
    const year = parseInt(dueMonth.slice(0, 4), 10);
    const month = parseInt(dueMonth.slice(5, 7), 10);
    const first = new Date(Date.UTC(year, month - 1, 1));
    for (const offset of [0, -1, -2]) {
      const ref = addMonths(first, offset);
      const closing = this.closingIn(card, ref.getUTCFullYear(), ref.getUTCMonth() + 1);
      if (monthKey(this.dueAfter(card, closing)) === dueMonth) {
        const prev = addMonths(ref, -1);
        const start = new Date(this.closingIn(card, prev.getUTCFullYear(), prev.getUTCMonth() + 1).getTime() + 86400000);
        return { start, closing };
      }
    }
    return { start: first, closing: first };
  }

  paymentPeriod(tx) {
    for (const t of (tx.tags || [])) {
      if (t.startsWith('statement:')) return t.slice(10);
    }
    return null;
  }

  buildStatements(card, transactions, today) {
    const groups = {};
    for (const t of transactions) {
      if (t.card_id !== card.id || t.kind === 'transfer') continue;
      const period = this.statementFor(card, parseDate(t.date));
      if (!groups[period]) groups[period] = [];
      groups[period].push(t);
    }

    const paid = {};
    for (const p of transactions) {
      if (p.kind === 'transfer' && p.to_card_id === card.id) {
        const period = this.paymentPeriod(p);
        if (period) {
          paid[period] = (paid[period] || 0) + p.amount;
        }
      }
    }

    const allPeriods = Array.from(new Set([...Object.keys(groups), ...Object.keys(paid)])).sort();
    const out = [];

    for (const period of allPeriods) {
      const txs = (groups[period] || []).sort((a, b) => a.date.localeCompare(b.date));
      const { start, closing } = this.statementPeriod(card, period);
      const total = txs.reduce((sum, t) => sum + (t.kind === 'expense' ? t.amount : -t.amount), 0);
      const p = paid[period] || 0;
      let status = 'open';
      if (today <= closing) {
        status = 'open';
      } else if (total > 0 && p >= total) {
        status = 'paid';
      } else {
        status = 'closed';
      }
      out.push({
        card_id: card.id,
        period,
        start: toIsoDate(start),
        end: toIsoDate(closing),
        due_date: toIsoDate(this.dueAfter(card, closing)),
        total,
        paid: p,
        status,
        transactions: txs,
      });
    }
    return out;
  }

  // --- Recurrences ---
  materializeRecurrences() {
    const today = new Date();
    const todayIso = toIsoDate(today);
    const until = addMonths(today, 12);
    const existing = new Set(
      this.db.transactions
        .filter(t => t.recurrence_id)
        .map(t => `${t.recurrence_id}:${t.recurrence_date || t.date}`)
    );

    const newTxs = [];
    for (const rec of (this.db.recurrences || [])) {
      if (!rec.active) continue;
      const start = parseDate(rec.start_date);
      const end = rec.end_date ? new Date(Math.min(until.getTime(), parseDate(rec.end_date).getTime())) : until;
      
      let dates = [];
      if (rec.frequency === 'weekly') {
        let d = new Date(start.getTime() + (((rec.day - start.getUTCDay() + 7) % 7) * 86400000));
        while (d <= end) {
          dates.push(new Date(d));
          d = new Date(d.getTime() + 7 * 86400000);
        }
      } else if (rec.frequency === 'yearly') {
        let d = clampDay(start.getUTCFullYear(), start.getUTCMonth() + 1, rec.day);
        if (d < start) d = clampDay(start.getUTCFullYear() + 1, start.getUTCMonth() + 1, rec.day);
        while (d <= end) {
          dates.push(new Date(d));
          d = clampDay(d.getUTCFullYear() + 1, start.getUTCMonth() + 1, rec.day);
        }
      } else {
        let ref = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        let d = clampDay(ref.getUTCFullYear(), ref.getUTCMonth() + 1, rec.day);
        if (d < start) {
          ref = addMonths(ref, 1);
          d = clampDay(ref.getUTCFullYear(), ref.getUTCMonth() + 1, rec.day);
        }
        while (d <= end) {
          dates.push(new Date(d));
          ref = addMonths(ref, 1);
          d = clampDay(ref.getUTCFullYear(), ref.getUTCMonth() + 1, rec.day);
        }
      }

      for (const d of dates) {
        const dIso = toIsoDate(d);
        if ((rec.skipped_dates || []).includes(dIso)) continue;
        const key = `${rec.id}:${dIso}`;
        if (!existing.has(key)) {
          existing.add(key);
          newTxs.push({
            id: uuidv4(),
            created_at: nowIso(),
            updated_at: nowIso(),
            date: dIso,
            amount: rec.amount,
            kind: rec.kind,
            category_id: rec.category_id || null,
            account_id: rec.account_id || null,
            card_id: rec.card_id || null,
            to_account_id: rec.to_account_id || null,
            goal_id: rec.goal_id || null,
            description: rec.description || '',
            tags: [],
            installment: null,
            recurrence_id: rec.id,
            recurrence_date: dIso,
            status: 'planned',
          });
        }
      }
    }

    if (newTxs.length > 0) {
      this.db.transactions.push(...newTxs);
      this.saveDb();
    }
  }

  // --- Forecast ---
  buildForecast(today, days = 90) {
    const until = new Date(today.getTime() + days * 86400000);
    const untilIso = toIsoDate(until);
    const todayIso = toIsoDate(today);

    const activeAccounts = (this.db.accounts || []).filter(a => !a.archived && a.type !== 'fgts');
    const activeIds = new Set(activeAccounts.map(a => a.id));

    let bal = activeAccounts.reduce((sum, a) => sum + this.accountBalance(a, this.db.transactions), 0);

    const ev = {};
    const addEv = (d, v) => { ev[d] = (ev[d] || 0) + v; };

    for (const t of this.db.transactions) {
      if (t.status !== 'planned' || !(t.date > todayIso && t.date <= untilIso)) continue;
      if (t.kind === 'income' && activeIds.has(t.account_id)) {
        addEv(t.date, t.amount);
      } else if (t.kind === 'expense' && activeIds.has(t.account_id)) {
        addEv(t.date, -t.amount);
      } else if (t.kind === 'transfer') {
        if (activeIds.has(t.account_id) && !activeIds.has(t.to_account_id)) addEv(t.date, -t.amount);
        if (activeIds.has(t.to_account_id) && !activeIds.has(t.account_id)) addEv(t.date, t.amount);
      }
    }

    for (const card of (this.db.cards || [])) {
      if (card.archived) continue;
      for (const s of this.buildStatements(card, this.db.transactions, today)) {
        if (s.status === 'paid') continue;
        const tomorrow = new Date(today.getTime() + 86400000);
        const due = parseDate(s.due_date) < tomorrow ? toIsoDate(tomorrow) : s.due_date;
        if (due <= untilIso && s.total - s.paid > 0) {
          addEv(due, -(s.total - s.paid));
        }
      }
    }

    const series = [{ date: todayIso, balance: bal }];
    let firstNegative = null;
    let d = new Date(today.getTime());

    while (d < until) {
      d = new Date(d.getTime() + 86400000);
      const dIso = toIsoDate(d);
      bal += ev[dIso] || 0;
      series.push({ date: dIso, balance: bal });
      if (bal < 0 && firstNegative === null) {
        firstNegative = dIso;
      }
    }

    const lowest = series.reduce((min, p) => (p.balance < min.balance ? p : min), series[0]);
    return { series, first_negative_date: firstNegative, lowest, events: ev };
  }

  // --- Dashboard ---
  buildDashboard(year, month) {
    const today = new Date();
    const todayIso = toIsoDate(today);
    const { start, end } = monthBounds(year, month);

    const txs = this.db.transactions;
    const cur = txs.filter(t => t.date >= start && t.date <= end);

    let py = year, pm = month - 1;
    if (pm < 1) { py = year - 1; pm = 12; }
    const prevBounds = monthBounds(py, pm);
    const prev = txs.filter(t => t.date >= prevBounds.start && t.date <= prevBounds.end);

    const calcTotals = (list, settledOnly = true) => {
      let inc = 0, exp = 0;
      for (const t of list) {
        if (settledOnly && t.status !== 'settled') continue;
        if (t.kind === 'income') inc += t.amount;
        else if (t.kind === 'expense') exp += t.amount;
      }
      return { income: inc, expense: exp, balance: inc - exp };
    };

    const tCur = calcTotals(cur, true);
    const tPrev = calcTotals(prev, true);

    const change = (c, p) => (!p ? null : Math.round(((c - p) / Math.abs(p)) * 1000) / 10);

    const byCat = {};
    for (const t of cur) {
      if (t.kind === 'expense' && t.status === 'settled') {
        const k = t.category_id || '';
        byCat[k] = (byCat[k] || 0) + t.amount;
      }
    }
    const byCategory = Object.entries(byCat)
      .map(([k, v]) => ({ category_id: k || null, amount: v }))
      .sort((a, b) => b.amount - a.amount);

    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const b = monthBounds(year, m);
      const inM = txs.filter(t => t.date >= b.start && t.date <= b.end);
      const tt = calcTotals(inM, true);
      tt.month = m;
      monthly.push(tt);
    }

    const accounts = (this.db.accounts || [])
      .filter(a => !a.archived)
      .map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        color: a.color,
        balance: this.accountBalance(a, txs),
      }));

    const statements = [];
    const alerts = [];

    for (const card of (this.db.cards || [])) {
      if (card.archived) continue;
      const stList = this.buildStatements(card, txs, today);
      for (const s of stList) {
        if (s.status === 'paid' || s.total <= 0) continue;
        const maxOpen = new Date(today.getTime() + 35 * 86400000);
        if (s.status === 'open' && parseDate(s.start) > maxOpen) continue;

        statements.push({
          card_id: card.id,
          card_name: card.name,
          color: card.color,
          period: s.period,
          total: s.total,
          paid: s.paid,
          due_date: s.due_date,
          end: s.end,
          status: s.status,
          limit: card.limit,
        });

        const diffDays = Math.round((parseDate(s.due_date).getTime() - today.getTime()) / 86400000);
        const fmtMoney = (val) =>
          `R$ ${(val / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (s.status === 'closed' && diffDays >= 0 && diffDays <= 7) {
          alerts.push({
            type: 'statement_due',
            level: 'warning',
            message: `Fatura ${card.name} (${s.period}) vence em ${diffDays} dia(s): ${fmtMoney(s.total - s.paid)}`,
            ref_id: card.id,
          });
        } else if (s.status === 'closed' && diffDays < 0) {
          alerts.push({
            type: 'statement_overdue',
            level: 'danger',
            message: `Fatura ${card.name} (${s.period}) vencida há ${-diffDays} dia(s).`,
            ref_id: card.id,
          });
        }
      }
    }

    const cats = Object.fromEntries((this.db.categories || []).map(c => [c.id, c]));
    const budgets = [];
    for (const b of (this.db.budgets || [])) {
      const monthStr = `${year}-${pad2(month)}`;
      const limit = b.overrides && b.overrides[monthStr] !== undefined ? b.overrides[monthStr] : b.amount;
      const spent = byCat[b.category_id] || 0;
      budgets.push({ category_id: b.category_id, limit, spent });
      if (limit && spent > limit) {
        const catName = cats[b.category_id]?.name || 'Categoria';
        const pct = Math.floor((spent * 100) / limit);
        alerts.push({
          type: 'budget',
          level: 'danger',
          ref_id: b.category_id,
          message: `${catName}: orçamento estourado (${pct}% do limite).`,
        });
      }
    }

    const fc = this.buildForecast(today, 90);
    if (fc.first_negative_date) {
      const [fy, fm, fd] = fc.first_negative_date.split('-');
      alerts.push({
        type: 'forecast',
        level: 'danger',
        ref_id: null,
        message: `Saldo projetado fica negativo em ${fd}/${fm}.`,
      });
    }

    const pending = txs.filter(
      t => t.status === 'planned' && t.recurrence_id && t.date <= todayIso
    );
    if (pending.length > 0) {
      alerts.push({
        type: 'pending',
        level: 'info',
        ref_id: null,
        message: `${pending.length} lançamento(s) previsto(s) aguardando confirmação.`,
      });
    }

    const plannedExpense = calcTotals(cur, false).expense - tCur.expense;

    return {
      year,
      month,
      kpis: {
        ...tCur,
        savings_rate: tCur.income ? Math.round((tCur.balance / tCur.income) * 1000) / 10 : 0.0,
        income_change: change(tCur.income, tPrev.income),
        expense_change: change(tCur.expense, tPrev.expense),
        planned_expense: plannedExpense,
      },
      by_category: byCategory,
      monthly,
      accounts,
      statements: statements.sort((a, b) => a.due_date.localeCompare(b.due_date)),
      budgets,
      alerts,
      forecast: { first_negative_date: fc.first_negative_date, lowest: fc.lowest },
      pending: pending.slice(0, 20),
    };
  }

  // --- Calendar ---
  buildCalendar(year, month) {
    const today = new Date();
    const { start, end } = monthBounds(year, month);
    const txs = this.db.transactions;
    const cats = Object.fromEntries((this.db.categories || []).map(c => [c.id, c]));
    const out = [];

    for (const card of (this.db.cards || [])) {
      if (card.archived) continue;
      const closing = this.closingIn(card, year, month);
      out.push({
        date: toIsoDate(closing),
        type: 'card_closing',
        title: `Fecha ${card.name}`,
        amount: null,
        ref_id: card.id,
        color: card.color,
      });

      const stList = this.buildStatements(card, txs, today);
      const sts = {};
      for (const st of stList) sts[st.due_date] = st;

      const due = this.dueAfter(card, closing);
      const dueIso = toIsoDate(due);

      for (const [dIso, st] of Object.entries(sts)) {
        if (dIso >= start && dIso <= end) {
          out.push({
            date: dIso,
            type: 'card_due',
            title: `Vence ${card.name}`,
            amount: st.total - st.paid,
            ref_id: card.id,
            color: card.color,
            status: st.status,
          });
        }
      }

      if (dueIso >= start && dueIso <= end && !sts[dueIso]) {
        out.push({
          date: dueIso,
          type: 'card_due',
          title: `Vence ${card.name}`,
          amount: 0,
          ref_id: card.id,
          color: card.color,
          status: 'open',
        });
      }
    }

    for (const t of txs) {
      if (t.status === 'planned' && t.date >= start && t.date <= end) {
        const cat = cats[t.category_id || ''];
        out.push({
          date: t.date,
          type: 'planned',
          title: t.description || (cat ? cat.name : 'Previsto'),
          amount: t.kind === 'income' ? t.amount : -t.amount,
          ref_id: t.id,
          color: cat ? cat.color : '#6C7D84',
          kind: t.kind,
          recurrence_id: t.recurrence_id,
        });
      }
    }

    for (const g of (this.db.goals || [])) {
      if (g.deadline && g.deadline >= start && g.deadline <= end) {
        out.push({
          date: g.deadline,
          type: 'goal',
          title: `Prazo: ${g.name}`,
          amount: g.target,
          ref_id: g.id,
          color: g.color,
        });
      }
    }

    for (const inv of (this.db.investments || [])) {
      if (inv.maturity && inv.status === 'active' && inv.maturity >= start && inv.maturity <= end) {
        out.push({
          date: inv.maturity,
          type: 'investment_maturity',
          title: `Vencimento: ${inv.asset}`,
          amount: inv.current_value,
          ref_id: inv.id,
          color: '#9A6A1D',
        });
      }
    }

    return out.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  }

  // --- Reports ---
  buildAnnualReport(year) {
    const cats = Object.fromEntries((this.db.categories || []).map(c => [c.id, c]));
    const txs = this.db.transactions.filter(
      t => t.status === 'settled' && t.date.startsWith(String(year))
    );

    const per = {};
    const totals = { income: 0, expense: 0 };
    const monthly = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));

    for (const t of txs) {
      if (t.kind === 'transfer') continue;
      const m = parseInt(t.date.slice(5, 7), 10) - 1;
      totals[t.kind] += t.amount;
      monthly[m][t.kind] += t.amount;
      const key = t.category_id || '';
      if (!per[key]) per[key] = Array(12).fill(0);
      per[key][m] += t.amount;
    }

    const rows = [];
    for (const [key, months] of Object.entries(per)) {
      const c = cats[key];
      const activeMonths = months.filter(m => m > 0).length || 1;
      const total = months.reduce((s, v) => s + v, 0);
      rows.push({
        category_id: key || null,
        name: c ? c.name : 'Sem categoria',
        kind: c ? c.kind : 'expense',
        color: c ? c.color : '#A5B9BD',
        months,
        total,
        average: Math.round(total / activeMonths),
      });
    }

    rows.sort((a, b) => (a.kind !== 'expense') - (b.kind !== 'expense') || b.total - a.total);

    return {
      year,
      categories: rows,
      monthly,
      totals: { ...totals, balance: totals.income - totals.expense },
    };
  }

  buildCompareReport(y1, y2) {
    const a = this.buildAnnualReport(y1);
    const b = this.buildAnnualReport(y2);
    const ta = Object.fromEntries(a.categories.map(r => [r.category_id || '', r]));
    const tb = Object.fromEntries(b.categories.map(r => [r.category_id || '', r]));
    const allKeys = Array.from(new Set([...Object.keys(ta), ...Object.keys(tb)]));

    const rows = [];
    const change = (cur, prev) => (!prev ? null : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10);

    for (const key of allKeys) {
      const ra = ta[key];
      const rb = tb[key];
      const ref = ra || rb;
      const va = ra ? ra.total : 0;
      const vb = rb ? rb.total : 0;
      rows.push({
        category_id: key || null,
        name: ref.name,
        kind: ref.kind,
        color: ref.color,
        a: va,
        b: vb,
        change: change(vb, va),
      });
    }

    rows.sort((x, y) => (x.kind !== 'expense') - (y.kind !== 'expense') || Math.abs(y.b - y.a) - Math.abs(x.b - x.a));

    return {
      year_a: y1,
      year_b: y2,
      categories: rows,
      totals: { a: a.totals, b: b.totals },
    };
  }

  buildCategoryHistory(categoryId, months = 24) {
    const today = new Date();
    const first = addMonths(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), -(months - 1));
    const keys = [];
    for (let i = 0; i < months; i++) {
      keys.push(monthKey(addMonths(first, i)));
    }

    const acc = Object.fromEntries(keys.map(k => [k, 0]));
    for (const t of this.db.transactions) {
      if (t.status === 'settled' && t.category_id === categoryId) {
        const mKey = t.date.slice(0, 7);
        if (acc[mKey] !== undefined) acc[mKey] += t.amount;
      }
    }

    const series = keys.map(k => ({ month: k, amount: acc[k] }));
    const vals = series.map(p => p.amount);
    const nonZero = vals.filter(v => v > 0).length || 1;
    const total = vals.reduce((s, v) => s + v, 0);

    return {
      category_id: categoryId,
      series,
      average: Math.round(total / nonZero),
      max: vals.length ? Math.max(...vals) : 0,
    };
  }

  // --- Dispatcher: handles method + path + body + params ---
  async handle(method, path, { body, params, formData } = {}) {
    // Normalization
    const url = new URL('http://local' + path);
    const pathname = url.pathname.replace(/^\/api/, '');
    const q = { ...Object.fromEntries(url.searchParams), ...(params || {}) };

    // GET collections
    if (method === 'GET') {
      if (pathname === '/health') return { status: 'ok', version: '2.0.0-github-pages', mode: 'offline' };
      if (pathname === '/accounts') return this.db.accounts || [];
      if (pathname === '/cards') return this.db.cards || [];
      if (pathname === '/categories') return this.db.categories || [];
      if (pathname === '/settings') return this.db.settings || { theme: 'auto', quotes_enabled: false };
      if (pathname === '/budgets') return this.db.budgets || [];
      if (pathname === '/goals') return this.db.goals || [];
      if (pathname === '/investments') return this.db.investments || [];
      if (pathname === '/contributions') return this.db.contributions || [];
      if (pathname === '/rules') return this.db.rules || [];
      if (pathname === '/recurrences') return this.db.recurrences || [];

      if (pathname === '/dashboard') {
        const y = parseInt(q.year, 10) || new Date().getFullYear();
        const m = parseInt(q.month, 10) || new Date().getMonth() + 1;
        return this.buildDashboard(y, m);
      }

      if (pathname === '/forecast') {
        const days = parseInt(q.days, 10) || 90;
        return this.buildForecast(new Date(), days);
      }

      if (pathname === '/calendar') {
        const y = parseInt(q.year, 10) || new Date().getFullYear();
        const m = parseInt(q.month, 10) || new Date().getMonth() + 1;
        return this.buildCalendar(y, m);
      }

      if (pathname === '/reports/annual') {
        const y = parseInt(q.year, 10) || new Date().getFullYear();
        return this.buildAnnualReport(y);
      }

      if (pathname === '/reports/compare') {
        const y1 = parseInt(q.y1, 10);
        const y2 = parseInt(q.y2, 10);
        return this.buildCompareReport(y1, y2);
      }

      if (pathname === '/reports/category-history') {
        const catId = q.category_id;
        const months = parseInt(q.months, 10) || 24;
        return this.buildCategoryHistory(catId, months);
      }

      if (pathname === '/transactions') {
        let rows = [...this.db.transactions];
        if (q.from) rows = rows.filter(t => t.date >= q.from);
        if (q.to) rows = rows.filter(t => t.date <= q.to);
        if (q.account_id) rows = rows.filter(t => t.account_id === q.account_id || t.to_account_id === q.account_id);
        if (q.card_id) rows = rows.filter(t => t.card_id === q.card_id || t.to_card_id === q.card_id);
        if (q.category_id) rows = rows.filter(t => t.category_id === q.category_id);
        if (q.kind) rows = rows.filter(t => t.kind === q.kind);
        if (q.status) rows = rows.filter(t => t.status === q.status);
        if (q.q) {
          const nq = normalizeStr(q.q);
          rows = rows.filter(t => normalizeStr(t.description).includes(nq) || (t.tags || []).some(tg => normalizeStr(tg).includes(nq)));
        }
        rows.sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || ''));
        const page = parseInt(q.page, 10) || 1;
        const pageSize = parseInt(q.page_size, 10) || 100;
        const startIdx = (page - 1) * pageSize;
        return { items: rows.slice(startIdx, startIdx + pageSize), total: rows.length };
      }

      // Card statements: /cards/:id/statements
      const cardStMatch = pathname.match(/^\/cards\/([^/]+)\/statements$/);
      if (cardStMatch) {
        const cardId = cardStMatch[1];
        const card = (this.db.cards || []).find(c => c.id === cardId);
        if (!card) return [];
        return this.buildStatements(card, this.db.transactions, new Date());
      }

      if (pathname === '/export.json') {
        const blob = new Blob([JSON.stringify(this.db, null, 2)], { type: 'application/json' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'finance-backup.json';
        a.click();
        URL.revokeObjectURL(downloadUrl);
        return { ok: true };
      }

      if (pathname === '/export.csv' || pathname === '/reports/export.csv') {
        let csv = 'Data;Descrição;Categoria;Conta/Cartão;Tipo;Valor;Status\n';
        for (const t of this.db.transactions) {
          const cat = (this.db.categories || []).find(c => c.id === t.category_id)?.name || '';
          const src = (this.db.accounts || []).find(a => a.id === t.account_id)?.name || (this.db.cards || []).find(c => c.id === t.card_id)?.name || '';
          const val = (t.amount / 100).toFixed(2).replace('.', ',');
          csv += `"${t.date}";"${(t.description || '').replace(/"/g, '""')}";"${cat}";"${src}";"${t.kind}";"${val}";"${t.status}"\n`;
        }
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'lancamentos.csv';
        a.click();
        URL.revokeObjectURL(downloadUrl);
        return { ok: true };
      }
    }

    // POST
    if (method === 'POST') {
      if (pathname === '/quotes/refresh') {
        return { updated: 0, message: 'Cotações em modo estático' };
      }

      if (pathname === '/import/backup') {
        let text = '';
        if (formData && formData.get('file')) {
          text = await formData.get('file').text();
        } else if (body && body.data) {
          text = body.data;
        }
        if (text) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.accounts && parsed.transactions) {
              this.db = parsed;
              this.saveDb();
              this.materializeRecurrences();
              return { ok: true, transactions: this.db.transactions.length };
            }
          } catch (e) {
            throw new Error('Arquivo de backup inválido.');
          }
        }
        return { ok: false };
      }

      // Card statement payment: /cards/:id/statements/:period/pay
      const payMatch = pathname.match(/^\/cards\/([^/]+)\/statements\/([^/]+)\/pay$/);
      if (payMatch) {
        const cardId = payMatch[1];
        const period = payMatch[2];
        const tx = {
          id: uuidv4(),
          created_at: nowIso(),
          updated_at: nowIso(),
          date: body.date || toIsoDate(new Date()),
          amount: body.amount,
          kind: 'transfer',
          account_id: body.account_id,
          to_card_id: cardId,
          description: `Pagamento fatura ${period}`,
          tags: [`statement:${period}`],
          status: 'settled',
        };
        this.db.transactions.push(tx);
        this.saveDb();
        return tx;
      }

      // Recurrence confirm: /recurrences/:id/confirm
      const recConfirmMatch = pathname.match(/^\/recurrences\/([^/]+)\/confirm$/);
      if (recConfirmMatch) {
        const recId = recConfirmMatch[1];
        const rec = (this.db.recurrences || []).find(r => r.id === recId);
        const targetDate = body.date;
        const amount = body.amount || (rec ? rec.amount : 0);
        let found = this.db.transactions.find(
          t => t.recurrence_id === recId && (t.recurrence_date || t.date) === targetDate
        );
        if (found) {
          found.status = 'settled';
          found.amount = amount;
          found.updated_at = nowIso();
          this.saveDb();
          return found;
        } else if (rec) {
          const newTx = {
            id: uuidv4(),
            created_at: nowIso(),
            updated_at: nowIso(),
            date: targetDate,
            amount,
            kind: rec.kind,
            category_id: rec.category_id,
            account_id: rec.account_id,
            card_id: rec.card_id,
            to_account_id: rec.to_account_id,
            description: rec.description,
            tags: [],
            recurrence_id: rec.id,
            recurrence_date: targetDate,
            status: 'settled',
          };
          this.db.transactions.push(newTx);
          this.saveDb();
          return newTx;
        }
      }

      // Installments: /transactions/installments
      if (pathname === '/transactions/installments') {
        const total = parseInt(body.total, 10) || 2;
        const baseAmount = Math.floor(body.amount / total);
        const rest = body.amount % total;
        const groupId = uuidv4();
        const first = parseDate(body.date);
        const desc = body.description || '';
        const created = [];

        for (let i = 0; i < total; i++) {
          const partAmount = i === 0 ? baseAmount + rest : baseAmount;
          const tx = {
            ...body,
            id: uuidv4(),
            created_at: nowIso(),
            updated_at: nowIso(),
            date: toIsoDate(addMonths(first, i)),
            amount: partAmount,
            description: `${desc} (${i + 1}/${total})`.trim(),
            installment: { group_id: groupId, number: i + 1, total },
          };
          delete tx.total;
          this.db.transactions.push(tx);
          created.push(tx);
        }
        this.saveDb();
        return created;
      }

      // Generic collections POST
      const coll = pathname.slice(1);
      if (this.db[coll] && Array.isArray(this.db[coll])) {
        const entity = {
          ...body,
          id: uuidv4(),
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        this.db[coll].push(entity);
        this.saveDb();
        if (coll === 'recurrences') this.materializeRecurrences();
        return entity;
      }
    }

    // PUT
    if (method === 'PUT') {
      if (pathname === '/settings') {
        this.db.settings = { ...(this.db.settings || {}), ...body };
        this.saveDb();
        return this.db.settings;
      }

      // Scoped transaction edit: /transactions/:id?scope=...
      const txMatch = pathname.match(/^\/transactions\/([^/]+)$/);
      if (txMatch) {
        const id = txMatch[1];
        const tx = this.db.transactions.find(t => t.id === id);
        if (!tx) throw new Error('Lançamento não encontrado');

        const scope = q.scope || 'single';
        if (scope === 'remaining' && tx.installment) {
          const groupId = tx.installment.group_id;
          const minNum = tx.installment.number;
          for (const t of this.db.transactions) {
            if (t.installment && t.installment.group_id === groupId && t.installment.number >= minNum) {
              Object.assign(t, body, { updated_at: nowIso() });
            }
          }
        } else {
          Object.assign(tx, body, { updated_at: nowIso() });
        }
        this.saveDb();
        return tx;
      }

      // Generic collections PUT: /:collection/:id
      const collMatch = pathname.match(/^\/([^/]+)\/([^/]+)$/);
      if (collMatch) {
        const [, coll, id] = collMatch;
        if (this.db[coll] && Array.isArray(this.db[coll])) {
          const item = this.db[coll].find(x => x.id === id);
          if (item) {
            Object.assign(item, body, { updated_at: nowIso() });
            this.saveDb();
            return item;
          }
        }
      }
    }

    // DELETE
    if (method === 'DELETE') {
      // Scoped transaction delete: /transactions/:id
      const txMatch = pathname.match(/^\/transactions\/([^/]+)$/);
      if (txMatch) {
        const id = txMatch[1];
        const tx = this.db.transactions.find(t => t.id === id);
        const scope = q.scope || 'single';
        if (tx && scope === 'remaining' && tx.installment) {
          const groupId = tx.installment.group_id;
          const minNum = tx.installment.number;
          this.db.transactions = this.db.transactions.filter(
            t => !(t.installment && t.installment.group_id === groupId && t.installment.number >= minNum)
          );
        } else {
          this.db.transactions = this.db.transactions.filter(t => t.id !== id);
        }
        this.saveDb();
        return null;
      }

      // Generic collections DELETE: /:collection/:id
      const collMatch = pathname.match(/^\/([^/]+)\/([^/]+)$/);
      if (collMatch) {
        const [, coll, id] = collMatch;
        if (this.db[coll] && Array.isArray(this.db[coll])) {
          this.db[coll] = this.db[coll].filter(x => x.id !== id);
          this.saveDb();
          return null;
        }
      }
    }

    console.warn(`[LocalBackend] Rota não tratada: ${method} ${pathname}`);
    return null;
  }
}
