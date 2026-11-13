// Subscriptions & fixed bills: detected from 13 months of history (no setup needed),
// with yearly cost, share of income, next expected charge and price-increase flags.
import { api } from '../api.js';
import { detectSubscriptions, fetchAllTransactions } from '../analytics.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { dateBR, daysBetween, esc, money, todayISO } from '../format.js';
import { cardById, accountById, categoryById } from '../state.js';

const HIDDEN_KEY = 'finance.subs.hidden';
const readHidden = () => { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); } };
const writeHidden = set => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch {} };

export async function render(view, tools) {
  let filter = 'all';
  let showHidden = false;
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Filtrar');
  seg.innerHTML = `<button type="button" data-f="all" aria-pressed="true">Todas</button><button type="button" data-f="subscription" aria-pressed="false">Preço fixo</button><button type="button" data-f="bill" aria-pressed="false">Valor variável</button>`;
  tools.appendChild(seg);

  view.innerHTML = `
    <section class="card subs-hero" id="hero" aria-label="Resumo dos compromissos fixos"></section>
    <section class="kpis" id="kpis"></section>
    <section class="card">
      <div class="head"><div><h2>Cobranças que se repetem todo mês</h2>
        <p class="sub">Encontradas automaticamente no seu histórico: mesma descrição, cerca de uma vez por mês e valor estável.</p></div>
        <label class="check" style="font-size:12.5px;white-space:nowrap"><input type="checkbox" id="showHidden"> Mostrar ignoradas</label></div>
      <div class="table-wrap" style="margin-top:10px"><table>
        <thead><tr><th>Cobrança</th><th class="hide-sm">Pago com</th><th class="hide-sm">Última</th><th>Próxima</th><th class="num">Por mês</th><th class="num hide-sm">Por ano</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table></div>
    </section>`;

  const to = todayISO();
  const fromD = new Date(); fromD.setMonth(fromD.getMonth() - 13);
  const from = fromD.toISOString().slice(0, 10);
  let all = [], income = 0;

  async function load() {
    const txs = await fetchAllTransactions(api, { from, to, status: 'settled' });
    all = detectSubscriptions(txs, { today: to });
    // Average monthly income over the last 3 full months, for the "share of income" bar.
    const last3 = new Set([1, 2, 3].map(i => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); }));
    income = Math.round(txs.filter(t => t.kind === 'income' && last3.has(t.date.slice(0, 7))).reduce((s, t) => s + t.amount, 0) / 3);
    draw();
  }

  function draw() {
    const hidden = readHidden();
    const active = all.filter(s => s.active && !hidden.has(s.key));
    const subs = active.filter(s => s.kind === 'subscription');
    const bills = active.filter(s => s.kind === 'bill');
    const total = active.reduce((s, x) => s + x.monthly, 0);
    const subsTotal = subs.reduce((s, x) => s + x.monthly, 0);
    const billsTotal = bills.reduce((s, x) => s + x.monthly, 0);
    const share = income ? Math.round(total / income * 100) : null;
    const pctW = v => income ? Math.min(100, v / income * 100).toFixed(1) + '%' : '0%';

    view.querySelector('#hero').innerHTML = `
      <div>
        <div class="lead">Todo mês, antes de qualquer outro gasto, já saem</div>
        <div class="big money">${money(total)}</div>
        <div class="s">São <b class="money">${money(total * 12)}</b> por ano em ${active.length} compromissos.${share != null ? ` Isso leva ${share}% da sua renda média.` : ''}</div>
      </div>
      <div class="share" aria-label="Parte da renda comprometida">
        <div class="track"><span style="width:${pctW(subsTotal)};background:var(--accent)"></span><span style="width:${pctW(billsTotal)};background:var(--warn)"></span></div>
        <div class="lg"><span><i style="background:var(--accent)"></i>Preço fixo <b class="money">${money(subsTotal)}</b></span><span><i style="background:var(--warn)"></i>Variável <b class="money">${money(billsTotal)}</b></span></div>
        <div class="lg"><span>Renda média (3 meses)</span><b class="money">${income ? money(income) : '—'}</b></div>
      </div>`;

    const ups = active.filter(s => s.change && s.change.pct > 0);
    const soon = active.filter(s => { const d = daysBetween(to, s.next_date); return d >= 0 && d <= 7; });
    const biggest = active[0];
    const smallSubs = subs.filter(s => s.monthly <= 6000);
    view.querySelector('#kpis').innerHTML = `
      <div class="kpi"><div class="k">Nos próximos 7 dias</div><div class="v money">${money(soon.reduce((s, x) => s + x.monthly, 0))}</div><div class="s">${soon.length ? soon.map(s => esc(s.name)).slice(0, 3).join(', ') : 'Nada previsto'}</div></div>
      <div class="kpi"><div class="k">Maior compromisso</div><div class="v money">${biggest ? money(biggest.monthly) : '—'}</div><div class="s">${biggest ? esc(biggest.name) : 'Nenhum encontrado'}</div></div>
      <div class="kpi"><div class="k">Ficaram mais caras</div><div class="v">${ups.length}</div><div class="s">${ups.length ? ups.map(s => `${esc(s.name)} +${s.change.pct}%`).slice(0, 2).join(', ') : 'Nenhum reajuste no período'}</div></div>
      <div class="kpi"><div class="k">Assinaturas pequenas</div><div class="v money">${money(smallSubs.reduce((s, x) => s + x.monthly, 0) * 12)}</div><div class="s">por ano somando ${smallSubs.length} de até R$ 60</div></div>`;

    const rows = all
      .filter(s => (filter === 'all' || s.kind === filter) && (showHidden || !hidden.has(s.key)))
      .sort((a, b) => (b.active - a.active) || b.monthly - a.monthly);
    view.querySelector('#rows').innerHTML = rows.length ? rows.map(s => {
      const cat = categoryById(s.category_id);
      const color = cat?.color || '#898781';
      const src = cardById(s.card_id)?.name || accountById(s.account_id)?.name || '—';
      const days = daysBetween(to, s.next_date);
      const isHidden = hidden.has(s.key);
      const when = !s.active ? 'Parou de cobrar' : days < 0 ? `Atrasada ${-days} d` : days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `Em ${days} dias`;
      return `<tr class="${!s.active || isHidden ? 'muted' : ''}">
        <td><div class="namecell"><span class="logo" style="background:${color}">${esc(s.name.trim()[0] || '?').toUpperCase()}</span>
          <div style="min-width:0"><div class="t">${esc(s.name)}</div>
          <div class="s">${s.kind === 'subscription' ? 'Preço fixo' : 'Valor variável'}${cat ? `, ${esc(cat.name.toLowerCase())}` : ''}${s.change ? ` <span class="chg ${s.change.pct > 0 ? 'up' : 'down'}">${s.change.pct > 0 ? '+' : ''}${s.change.pct}% desde ${dateBR(s.first_date).slice(3)}</span>` : ''}</div></div></div></td>
        <td class="hide-sm">${esc(src)}</td>
        <td class="hide-sm">${dateBR(s.last_date)}</td>
        <td>${when}<div class="s" style="font-size:12px;color:var(--ink-3)">${s.active ? dateBR(s.next_date) : ''}</div></td>
        <td class="num">${money(s.monthly)}</td>
        <td class="num hide-sm">${money(s.yearly)}</td>
        <td class="num"><a class="subtle-btn" href="#/transactions?q=${encodeURIComponent(s.name)}" title="Ver lançamentos">${icon('list', 14)}</a><button class="subtle-btn" type="button" data-hide="${esc(s.key)}">${isHidden ? 'Voltar' : 'Ignorar'}</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty"><strong>Nenhuma cobrança recorrente encontrada.</strong>Com pelo menos três meses de lançamentos, assinaturas e contas fixas aparecem aqui sozinhas.</div></td></tr>`;

    view.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => {
      const h = readHidden();
      const k = b.dataset.hide;
      if (h.has(k)) { h.delete(k); toast('Cobrança voltou para a conta.'); } else { h.add(k); toast('Cobrança ignorada. Marque “Mostrar ignoradas” para trazer de volta.'); }
      writeHidden(h);
      draw();
    });
  }

  seg.querySelectorAll('button').forEach(b => b.onclick = () => {
    filter = b.dataset.f;
    seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  view.querySelector('#showHidden').onchange = e => { showHidden = e.target.checked; draw(); };

  await load();
  return { refresh: load, destroy() {} };
}
