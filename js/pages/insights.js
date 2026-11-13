// Spending insights: a year of daily spending as a heatmap, weekday rhythm,
// categories running above/below their usual level, and the month's biggest purchases.
import { api } from '../api.js';
import { categoryAnomalies, dailySpend, fetchAllTransactions, weekdayAverages } from '../analytics.js';
import { make, moneyAxis, plainAxis, theme } from '../charts.js';
import { periodPicker } from '../components/period.js';
import { openTransactionModal } from '../components/txModal.js';
import { MONTHS, MONTHS_SHORT, WEEKDAYS, dateBR, esc, money, todayISO } from '../format.js';
import { categoryById, sourceName, state } from '../state.js';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function render(view, tools) {
  tools.appendChild(periodPicker());
  view.innerHTML = `
    <section class="kpis" id="kpis"></section>
    <section class="card">
      <div class="head"><div><h2>Um ano de gastos, dia a dia</h2><p class="sub" id="heatSub"></p></div></div>
      <div class="body"><div class="heat-wrap" id="heat"></div><div class="heat-legend" id="heatLegend"></div></div>
    </section>
    <div class="grid-2">
      <section class="card"><div class="head"><div><h2>Fora do normal neste mês</h2><p class="sub" id="anomSub"></p></div></div>
        <div class="body tight" id="anom"></div></section>
      <section class="card"><div class="head"><div><h2>Ritmo da semana</h2><p class="sub">Gasto médio por dia da semana nos últimos 12 meses</p></div></div>
        <div class="body"><div class="chart short"><canvas id="wdChart"></canvas></div></div></section>
    </div>
    <section class="card"><div class="head"><div><h2>Maiores compras do mês</h2><p class="sub">Clique para editar</p></div></div>
      <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Data</th><th>Descrição</th><th class="hide-sm">Categoria</th><th class="hide-sm">Conta / cartão</th><th class="num">Valor</th></tr></thead><tbody id="top"></tbody></table></div></section>`;

  const end = new Date();
  const start = new Date(end); start.setDate(start.getDate() - 364);
  // align to the Sunday on/before start so columns are whole weeks
  start.setDate(start.getDate() - start.getDay());
  const lookFrom = new Date(start); lookFrom.setMonth(lookFrom.getMonth() - 7);
  let txs = [];

  async function load() {
    txs = await fetchAllTransactions(api, { from: iso(lookFrom), to: iso(end), status: 'settled' });
    draw();
  }

  function draw() {
    const daily = dailySpend(txs, iso(start), iso(end));
    drawHeat(daily);
    drawWeekdays(daily);
    drawMonth();
  }

  function drawHeat(daily) {
    const vals = [...daily.values()].sort((a, b) => a - b);
    const q = p => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] || 0;
    const steps = [q(.25), q(.5), q(.75), q(.92)];
    const level = v => (!v ? 0 : v <= steps[0] ? 1 : v <= steps[1] ? 2 : v <= steps[2] ? 3 : v <= steps[3] ? 4 : 5);
    const mix = [0, 18, 36, 58, 80, 100];
    const fill = l => (l === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--neg) ${mix[l]}%, var(--surface))`);
    const cell = 13, gap = 3, left = 30, top = 18;
    const weeks = Math.ceil((end - start) / 86400000 / 7) + 1;
    let rects = '', months = '', lastMonth = -1, zero = 0, total = 0;
    const d = new Date(start);
    for (let w = 0; w < weeks; w++) {
      for (let wd = 0; wd < 7; wd++) {
        if (d > end) break;
        const k = iso(d);
        const v = daily.get(k) || 0;
        total += v; if (!v) zero++;
        rects += `<rect class="d" x="${left + w * (cell + gap)}" y="${top + wd * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${fill(level(v))}"><title>${dateBR(k)}: ${v ? money(v) : 'sem gastos'}</title></rect>`;
        if (wd === 0 && d.getMonth() !== lastMonth && d.getDate() <= 7) {
          months += `<text x="${left + w * (cell + gap)}" y="11">${MONTHS_SHORT[d.getMonth()]}</text>`;
          lastMonth = d.getMonth();
        }
        d.setDate(d.getDate() + 1);
      }
    }
    const labels = [1, 3, 5].map(i => `<text x="0" y="${top + i * (cell + gap) + 10}">${WEEKDAYS[i]}</text>`).join('');
    const W = left + weeks * (cell + gap), H = top + 7 * (cell + gap);
    view.querySelector('#heat').innerHTML = `<svg class="heat" width="100%" style="min-width:${Math.round(W * .8)}px;max-height:${Math.round(H * 1.35)}px" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de calor dos gastos diários">${months}${labels}${rects}</svg>`;
    view.querySelector('#heatLegend').innerHTML = `Menos ${[0, 1, 2, 3, 4, 5].map(l => `<i style="background:${fill(l)}"></i>`).join('')} Mais`;
    view.querySelector('#heatSub').innerHTML = `${money(total)} em 12 meses. Você passou <b>${zero} dias</b> sem gastar nada.`;
  }

  function drawWeekdays(daily) {
    const avgs = weekdayAverages(daily, iso(start), iso(end));
    const t = theme();
    const maxI = avgs.indexOf(Math.max(...avgs));
    make(view.querySelector('#wdChart'), {
      type: 'bar',
      data: { labels: WEEKDAYS, datasets: [{ label: 'Média', data: avgs, backgroundColor: avgs.map((_, i) => (i === maxI ? t.neg : t.muted)), borderRadius: 4, barPercentage: .62 }] },
      options: { scales: { x: plainAxis(), y: moneyAxis() } },
    });
    return { avgs, maxI };
  }

  function drawMonth() {
    const { year, month } = state;
    const today = todayISO();
    const isCurrent = year === +today.slice(0, 4) && month === +today.slice(5, 7);
    const dayLimit = isCurrent ? +today.slice(8, 10) : 31;
    const mk = `${year}-${String(month).padStart(2, '0')}`;
    const monthTx = txs.filter(t => t.kind === 'expense' && t.date.startsWith(mk));
    const spent = monthTx.reduce((s, t) => s + t.amount, 0);
    const days = isCurrent ? dayLimit : new Date(year, month, 0).getDate();
    const spentDays = new Set(monthTx.map(t => t.date)).size;
    const top = [...monthTx].sort((a, b) => b.amount - a.amount);

    // weekday stats for the KPI strip
    const daily = dailySpend(txs, iso(start), iso(end));
    const avgs = weekdayAverages(daily, iso(start), iso(end));
    const maxI = avgs.indexOf(Math.max(...avgs));
    const prev30 = [...daily.entries()].filter(([k]) => k > iso(new Date(end - 30 * 86400000))).reduce((s, [, v]) => s + v, 0);

    view.querySelector('#kpis').innerHTML = `
      <div class="kpi"><div class="k">Média por dia em ${MONTHS[month - 1].toLowerCase()}</div><div class="v money">${money(Math.round(spent / (days || 1)))}</div><div class="s">${money(Math.round(prev30 / 30))} nos últimos 30 dias</div></div>
      <div class="kpi"><div class="k">Dias sem gastar</div><div class="v">${days - spentDays} de ${days}</div><div class="s">${isCurrent ? 'até hoje neste mês' : 'no mês'}</div></div>
      <div class="kpi"><div class="k">Maior compra</div><div class="v money">${top[0] ? money(top[0].amount) : '—'}</div><div class="s">${top[0] ? esc(top[0].description) : 'Nenhum gasto'}</div></div>
      <div class="kpi"><div class="k">Dia mais caro da semana</div><div class="v">${WEEKDAYS[maxI]}</div><div class="s">média de ${money(avgs[maxI])}</div></div>`;

    const rows = categoryAnomalies(txs, year, month, 6, dayLimit).filter(r => Math.abs(r.diff) >= 2000).slice(0, 6);
    view.querySelector('#anomSub').textContent = isCurrent
      ? `Comparado ao que você costuma gastar até o dia ${dayLimit}, na média dos 6 meses anteriores`
      : 'Comparado à média dos 6 meses anteriores';
    const max = Math.max(1, ...rows.flatMap(r => [r.current, r.average]));
    view.querySelector('#anom').innerHTML = rows.length ? rows.map(r => {
      const c = categoryById(r.category_id);
      const up = r.diff > 0;
      return `<a class="anom" href="#/transactions?category_id=${r.category_id || ''}">
        <span class="dot" style="background:${c?.color || '#898781'}"></span>
        <div><div class="t">${esc(c?.name || 'Sem categoria')}</div>
          <div class="cmp"><div class="bar" title="Este mês"><span style="width:${(r.current / max * 100).toFixed(1)}%;background:${up ? 'var(--neg)' : 'var(--pos)'}"></span></div>
          <div class="bar avg" title="Média"><span style="width:${(r.average / max * 100).toFixed(1)}%"></span></div></div>
          <div class="s">${money(r.current)} agora, ${money(r.average)} de costume</div></div>
        <div class="v"><span class="chg ${up ? 'up' : 'down'}">${up ? '+' : '−'}${money(Math.abs(r.diff))}</span><div class="s">${r.pct == null ? 'novo' : `${up ? '+' : ''}${r.pct}%`}</div></div></a>`;
    }).join('') : '<div class="empty"><strong>Nada fora do comum.</strong>Seus gastos por categoria estão perto da média.</div>';

    view.querySelector('#top').innerHTML = top.slice(0, 8).map(t => {
      const c = categoryById(t.category_id);
      return `<tr class="clickable" data-id="${t.id}"><td>${dateBR(t.date)}</td><td>${esc(t.description)}</td>
        <td class="hide-sm"><span class="tag"><span class="dot" style="background:${c?.color || '#898781'}"></span>${esc(c?.name || '—')}</span></td>
        <td class="hide-sm">${esc(sourceName(t))}</td><td class="num">${money(t.amount)}</td></tr>`;
    }).join('') || '<tr><td colspan="5"><div class="empty">Nenhum gasto neste mês.</div></td></tr>';
    view.querySelectorAll('#top tr[data-id]').forEach(tr => tr.onclick = () => {
      const tx = txs.find(x => x.id === tr.dataset.id);
      if (tx) openTransactionModal({ tx });
    });
  }

  await load();
  return { refresh: load, destroy() {} };
}
