// Overview: the month ruler (hero), category donut, 12-month flow, accounts, statements, alerts.
import { api } from '../api.js';
import { donut, make, moneyAxis, plainAxis, theme } from '../charts.js';
import { icon } from '../components/icons.js';
import { periodPicker } from '../components/period.js';
import { openTransactionModal } from '../components/txModal.js';
import { MONTHS, MONTHS_SHORT, dateBR, daysBetween, esc, money, pct, signedPct, todayISO } from '../format.js';
import { categoryById, state } from '../state.js';

export async function render(view, tools) {
  tools.appendChild(periodPicker());
  view.innerHTML = `
    <section class="card ruler" id="ruler" aria-label="Resumo do mês"></section>
    <div class="grid-2">
      <section class="card"><div class="head"><div><h2>Para onde foi o dinheiro</h2><p class="sub" id="catSub"></p></div></div>
        <div class="body"><div class="chart" style="height:250px"><canvas id="catChart"></canvas></div><div id="catList" class="list" style="margin-top:8px"></div></div></section>
      <section class="card"><div class="head"><div><h2>Fluxo do ano</h2><p class="sub">Entradas, saídas e o que sobrou em cada mês</p></div></div>
        <div class="body"><div class="chart" style="height:250px"><canvas id="flowChart"></canvas></div>
        <div id="flowLegend" class="ruler legend" style="padding:10px 0 0;display:flex;gap:18px;font-size:12.5px;color:var(--ink-2)"></div></div></section>
    </div>
    <div class="grid-3">
      <section class="card"><div class="head"><h2>Contas</h2></div><div id="accounts" class="list body tight"></div></section>
      <section class="card"><div class="head"><h2>Faturas em aberto</h2></div><div id="statements" class="list body tight"></div></section>
      <section class="card"><div class="head"><h2>Atenção</h2></div><div id="alerts" class="body alerts"></div></section>
    </div>`;

  async function load() {
    const d = await api.get('/dashboard', { year: state.year, month: state.month });
    const k = d.kpis;
    const left = Math.max(0, k.balance);
    const scale = Math.max(k.income, k.expense, 1);
    const w = v => (v / scale * 100).toFixed(1) + '%';
    const isCurrent = state.year === +todayISO().slice(0, 4) && state.month === +todayISO().slice(5, 7);
    document.getElementById('ruler').innerHTML = `
      <div><div class="lead">${isCurrent ? 'Até agora em' : 'Resultado de'} ${MONTHS[state.month - 1].toLowerCase()} de ${state.year}, sobrou</div>
        <div class="big ${k.balance < 0 ? 'neg' : ''}">${money(k.balance)}</div></div>
      <div class="stats">
        <div><div class="k">Entradas</div><div class="v">${money(k.income)}</div><span class="delta ${deltaClass(k.income_change, false)}">${signedPct(k.income_change)}</span></div>
        <div><div class="k">Saídas</div><div class="v">${money(k.expense)}</div><span class="delta ${deltaClass(k.expense_change, true)}">${signedPct(k.expense_change)}</span></div>
        <div><div class="k">Taxa de poupança</div><div class="v">${pct(k.savings_rate)}</div>${k.planned_expense ? `<span class="delta flat">${money(k.planned_expense)} previstos</span>` : ''}</div>
      </div>
      <div class="track" role="img" aria-label="Entradas ${money(k.income)}, saídas ${money(k.expense)}">
        <span class="exp" style="width:${w(k.expense)}"></span><span class="left" style="width:${w(left)}"></span></div>
      <div class="legend"><span><i style="background:var(--neg)"></i>Gastei<b>${money(k.expense)}</b></span><span><i style="background:var(--pos);opacity:.5"></i>Sobrou<b>${money(left)}</b></span>${k.balance < 0 ? `<span><i style="background:var(--neg)"></i>Faltou<b>${money(-k.balance)}</b></span>` : ''}<span style="margin-left:auto">Entradas<b>${money(k.income)}</b></span></div>`;

    // categories
    const items = d.by_category.map(x => ({ ...x, cat: categoryById(x.category_id) })).map(x => ({ label: x.cat?.name || 'Sem categoria', value: x.amount, color: x.cat?.color || '#898781', id: x.category_id }));
    document.getElementById('catSub').textContent = items.length ? `${items.length} categorias em ${MONTHS[state.month - 1].toLowerCase()}` : 'Nenhum gasto neste mês';
    if (items.length) donut(document.getElementById('catChart'), items);
    const total = items.reduce((s, x) => s + x.value, 0);
    document.getElementById('catList').innerHTML = items.slice(0, 6).map(x => `
      <a class="item clickable" href="#/transactions?category_id=${x.id || ''}" style="padding:7px 0"><span class="dot" style="background:${x.color}"></span>
        <div><div class="t">${esc(x.label)}</div><div class="bar" style="margin-top:4px;width:min(100%,220px)"><span style="width:${(x.value / total * 100).toFixed(1)}%;background:${x.color}"></span></div></div>
        <div class="v">${money(x.value)}<div class="s">${Math.round(x.value / total * 100)}%</div></div></a>`).join('') || '<div class="empty">Lance um gasto para ver a distribuição.</div>';

    // flow
    const t = theme();
    make(document.getElementById('flowChart'), {
      type: 'bar',
      data: { labels: MONTHS_SHORT, datasets: [
        { label: 'Entradas', data: d.monthly.map(m => m.income), backgroundColor: t.pos, borderRadius: 4, barPercentage: .7, categoryPercentage: .6 },
        { label: 'Saídas', data: d.monthly.map(m => m.expense), backgroundColor: t.neg, borderRadius: 4, barPercentage: .7, categoryPercentage: .6 },
        { label: 'Sobrou', type: 'line', data: d.monthly.map(m => m.balance), borderColor: t.brand, backgroundColor: t.brand, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: .3 },
      ] },
      options: { scales: { x: plainAxis(), y: moneyAxis() }, onClick: (_, els) => { if (els.length) { import('../state.js').then(s => s.setPeriod(state.year, els[0].index + 1)); } } },
    });
    document.getElementById('flowLegend').innerHTML = [['Entradas', t.pos], ['Saídas', t.neg], ['Sobrou', t.brand]].map(([l, c]) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:6px;vertical-align:-1px"></i>${l}</span>`).join('');

    // accounts
    document.getElementById('accounts').innerHTML = d.accounts.map(a => `
      <a class="item clickable" href="#/transactions?account_id=${a.id}"><span class="swatch" style="background:${a.color}">${a.name[0]}</span>
        <div><div class="t">${esc(a.name)}</div><div class="s">${{ checking: 'Conta corrente', savings: 'Poupança', wallet: 'Carteira', fgts: 'FGTS' }[a.type] || ''}</div></div>
        <div class="v money ${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</div></a>`).join('') +
      `<div class="item" style="border-top:1px solid var(--line)"><span></span><div class="t">Total disponível</div><div class="v">${money(d.accounts.filter(a => a.type !== 'fgts').reduce((s, a) => s + a.balance, 0))}</div></div>`;

    // statements
    document.getElementById('statements').innerHTML = d.statements.length ? d.statements.map(s => {
      const days = daysBetween(todayISO(), s.due_date);
      return `<a class="item clickable" href="#/cards?card=${s.card_id}&period=${s.period}"><span class="swatch" style="background:${s.color}">${icon('card', 16)}</span>
        <div><div class="t">${esc(s.card_name)} <span class="pill ${s.status}">${s.status === 'open' ? 'aberta' : 'fechada'}</span></div>
        <div class="s">${s.status === 'open' ? `fecha ${dateBR(s.end)}` : `vence ${dateBR(s.due_date)}`}${days >= 0 && days <= 10 && s.status === 'closed' ? ` · em ${days} dia(s)` : ''}</div></div>
        <div class="v">${money(s.total - s.paid)}</div></a>`;
    }).join('') : '<div class="empty">Nenhuma fatura em aberto.</div>';

    // alerts
    document.getElementById('alerts').innerHTML = d.alerts.length ? d.alerts.map(a => `<div class="alert ${a.level}">${icon(a.level === 'info' ? 'info' : 'alert')}<span>${esc(a.message)}</span></div>`).join('')
      : `<div class="alert info">${icon('check')}<span>Tudo em ordem: sem orçamentos estourados, faturas vencendo ou saldo negativo previsto.</span></div>`;
    if (d.pending?.length) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<button class="btn small" type="button">${icon('check', 14)} Confirmar ${d.pending.length} previsto(s)</button>`;
      wrap.querySelector('button').onclick = () => { location.hash = '#/transactions?status=planned'; };
      document.getElementById('alerts').appendChild(wrap);
    }
  }
  view.querySelector('#ruler').addEventListener('dblclick', () => openTransactionModal());
  await load();
  return { refresh: load, destroy() {} };
}

function deltaClass(v, invert) {
  if (v == null || v === 0) return 'flat';
  const good = invert ? v < 0 : v > 0;
  return good ? 'good' : 'bad';
}
