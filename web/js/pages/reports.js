// Reports: annual stacked bars by category, year-over-year comparison, category trend, CSV export.
import { api } from '../api.js';
import { make, moneyAxis, plainAxis, seriesColor } from '../charts.js';
import { icon } from '../components/icons.js';
import { MONTHS_SHORT, esc, money, monthLabel, signedPct } from '../format.js';
import { expenseCategories, state } from '../state.js';

export async function render(view, tools) {
  let year = state.year;
  let catId = expenseCategories()[0]?.id;
  tools.innerHTML = `<select id="rYear" aria-label="Ano" style="width:auto;font-weight:600">${[year - 3, year - 2, year - 1, year, year + 1].map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <a class="btn" href="/api/export.csv" download>${icon('download', 15)} Exportar CSV</a>`;
  tools.querySelector('#rYear').onchange = e => { year = +e.target.value; load(); };
  view.innerHTML = `
    <section class="card"><div class="head"><div><h2 id="annualTitle"></h2><p class="sub">Gastos de cada mês, empilhados por categoria. Passe o mouse para ver os valores.</p></div></div>
      <div class="body"><div class="chart tall"><canvas id="annual"></canvas></div><div id="annualLegend" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--ink-2)"></div></div></section>
    <div class="grid-2">
      <section class="card"><div class="head"><div><h2 id="cmpTitle"></h2><p class="sub">Variação por categoria entre os dois anos</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Categoria</th><th class="num" id="cmpA"></th><th class="num" id="cmpB"></th><th class="num">Variação</th></tr></thead><tbody id="cmpBody"></tbody></table></div></section>
      <section class="card"><div class="head" style="align-items:center"><div><h2>Evolução de uma categoria</h2><p class="sub" id="trendSub"></p></div>
        <select id="rCat" aria-label="Categoria" style="width:auto">${expenseCategories().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="body"><div class="chart short"><canvas id="trend"></canvas></div></div></section>
    </div>`;
  view.querySelector('#rCat').onchange = e => { catId = e.target.value; loadTrend(); };

  async function load() {
    const [annual, cmp] = await Promise.all([api.get('/reports/annual', { year }), api.get('/reports/compare', { year_a: year - 1, year_b: year })]);
    const exp = annual.categories.filter(c => c.kind === 'expense');
    const top = exp.slice(0, 8);
    const rest = exp.slice(8);
    const datasets = top.map(c => ({ label: c.name, data: c.months, backgroundColor: seriesColor(c.color), borderRadius: 3, stack: 's' }));
    if (rest.length) datasets.push({ label: 'Outros', data: Array.from({ length: 12 }, (_, i) => rest.reduce((s, c) => s + c.months[i], 0)), backgroundColor: '#898781', stack: 's' });
    view.querySelector('#annualTitle').textContent = `${year}: ${money(annual.totals.expense)} em gastos, ${money(annual.totals.income)} em receitas, saldo ${money(annual.totals.balance)}`;
    make(view.querySelector('#annual'), { type: 'bar', data: { labels: MONTHS_SHORT, datasets },
      options: { scales: { x: plainAxis({ stacked: true }), y: moneyAxis({ stacked: true }) }, interaction: { mode: 'index' },
        plugins: { tooltip: { callbacks: { footer: items => `Total: ${money(items.reduce((s, i) => s + i.raw, 0))}` } } } } });
    view.querySelector('#annualLegend').innerHTML = datasets.map(d => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${d.backgroundColor};margin-right:6px;vertical-align:-1px"></i>${esc(d.label)}</span>`).join('');

    view.querySelector('#cmpTitle').textContent = `${year - 1} × ${year}`;
    view.querySelector('#cmpA').textContent = year - 1; view.querySelector('#cmpB').textContent = year;
    const rows = cmp.categories.filter(c => c.kind === 'expense' && (c.a || c.b));
    view.querySelector('#cmpBody').innerHTML = rows.map(c => `<tr><td><span class="tag"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span></td><td class="num">${money(c.a)}</td><td class="num">${money(c.b)}</td><td class="num"><span class="delta ${c.change == null ? 'flat' : c.change > 0 ? 'bad' : 'good'}">${c.change == null ? 'novo' : signedPct(c.change)}</span></td></tr>`).join('') +
      `<tr><td><b>Total de gastos</b></td><td class="num"><b>${money(cmp.totals.a.expense)}</b></td><td class="num"><b>${money(cmp.totals.b.expense)}</b></td><td class="num"><span class="delta ${cmp.totals.a.expense && cmp.totals.b.expense > cmp.totals.a.expense ? 'bad' : 'good'}">${cmp.totals.a.expense ? signedPct((cmp.totals.b.expense - cmp.totals.a.expense) / cmp.totals.a.expense * 100) : '—'}</span></td></tr>` || '<tr><td colspan="4"><div class="empty">Sem dados para comparar.</div></td></tr>';
    await loadTrend();
  }
  async function loadTrend() {
    if (!catId) return;
    const s = await api.get(`/reports/category/${catId}`, { months: 24 });
    const cat = expenseCategories().find(c => c.id === catId);
    view.querySelector('#trendSub').textContent = `Média ${money(s.average)}/mês nos últimos 24 meses · pico ${money(s.max)}`;
    make(view.querySelector('#trend'), { type: 'bar', data: { labels: s.series.map(p => monthLabel(p.month)), datasets: [
      { label: cat?.name, data: s.series.map(p => p.amount), backgroundColor: seriesColor(cat?.color), borderRadius: 3 },
      { label: 'Média', type: 'line', data: s.series.map(() => s.average), borderColor: '#898781', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 }] },
      options: { scales: { x: plainAxis({ ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }), y: moneyAxis() } } });
  }
  await load();
  return { refresh: load, destroy() {} };
}
