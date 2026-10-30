// Calendar of the month's events + 90-day balance projection.
import { api } from '../api.js';
import { make, moneyAxis, plainAxis, theme } from '../charts.js';
import { periodPicker } from '../components/period.js';
import { openTransactionModal } from '../components/txModal.js';
import { WEEKDAYS, dateBR, dateShort, esc, money, todayISO } from '../format.js';
import { state } from '../state.js';

const TYPE_LABEL = { card_closing: 'Fechamento', card_due: 'Vencimento', planned: 'Previsto', recurrence: 'Recorrência', goal: 'Meta', investment_maturity: 'Investimento' };

export async function render(view, tools) {
  tools.appendChild(periodPicker());
  view.innerHTML = `
    <section class="card"><div class="head"><div><h2>Saldo projetado para os próximos 90 dias</h2><p class="sub" id="fcSub"></p></div></div>
      <div class="body"><div class="chart short"><canvas id="fc"></canvas></div></div></section>
    <div class="grid-2" style="grid-template-columns:1.5fr 1fr">
      <section class="card"><div class="head"><h2 id="calTitle"></h2></div><div class="body"><div class="cal" id="cal"></div></div></section>
      <section class="card"><div class="head"><h2>Agenda do mês</h2></div><div id="agenda" class="list body tight" style="max-height:620px;overflow:auto"></div></section>
    </div>`;

  async function load() {
    const [fc, events] = await Promise.all([api.get('/forecast', { days: 90 }), api.get('/calendar', { year: state.year, month: state.month })]);
    const t = theme();
    const neg = fc.first_negative_date;
    view.querySelector('#fcSub').textContent = neg ? `Atenção: o saldo fica negativo em ${dateBR(neg)}. Ponto mais baixo: ${money(fc.lowest.balance)} em ${dateBR(fc.lowest.date)}.`
      : `Menor saldo previsto: ${money(fc.lowest.balance)} em ${dateBR(fc.lowest.date)}. Considera previstos, recorrências e faturas.`;
    make(view.querySelector('#fc'), {
      type: 'line',
      data: { labels: fc.series.map(p => p.date), datasets: [{ label: 'Saldo', data: fc.series.map(p => p.balance), borderColor: t.brand, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .2, fill: { target: { value: 0 }, above: 'rgba(31,122,94,.10)', below: 'rgba(168,63,53,.18)' } }] },
      options: { scales: { x: plainAxis({ ticks: { callback: (v, i) => i % 15 === 0 ? dateShort(fc.series[i].date) : '', maxRotation: 0, autoSkip: false } }), y: moneyAxis() },
        plugins: { tooltip: { callbacks: { title: items => dateBR(items[0].label), label: c => ` Saldo: ${money(c.raw)}${fc.events[c.label] ? ` (movimento ${money(fc.events[c.label])})` : ''}` } } } },
    });

    // calendar grid
    const first = new Date(state.year, state.month - 1, 1);
    const daysIn = new Date(state.year, state.month, 0).getDate();
    const today = todayISO();
    const byDay = {};
    events.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
    let html = WEEKDAYS.map(w => `<div class="wd">${w}</div>`).join('');
    for (let i = 0; i < first.getDay(); i++) html += '<div class="day off"></div>';
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${state.year}-${String(state.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const evs = byDay[iso] || [];
      html += `<div class="day ${iso === today ? 'today' : ''} ${evs.length ? 'has' : ''}" data-date="${iso}"><span class="n">${d}</span>
        ${evs.slice(0, 3).map(e => `<span class="ev" style="border-color:${e.color}" title="${esc(e.title)}">${esc(e.title)}${e.amount ? ` ${money(Math.abs(e.amount))}` : ''}</span>`).join('')}${evs.length > 3 ? `<span class="more">+${evs.length - 3}</span>` : ''}</div>`;
    }
    view.querySelector('#cal').innerHTML = html;
    view.querySelector('#calTitle').textContent = `${events.length} evento(s) no mês`;
    view.querySelectorAll('.day[data-date]').forEach(d => d.ondblclick = () => openTransactionModal({ defaults: { date: d.dataset.date } }));
    view.querySelector('#agenda').innerHTML = events.length ? events.map(e => `
      <div class="item"><span class="swatch" style="background:${e.color};font-size:11px;width:40px;height:40px;border-radius:9px;line-height:1.1;text-align:center">${dateShort(e.date)}</span>
        <div><div class="t">${esc(e.title)}</div><div class="s">${TYPE_LABEL[e.type] || e.type}${e.status === 'paid' ? ' · paga' : ''}</div></div>
        <div class="v ${e.amount > 0 && e.type === 'planned' ? 'money pos' : ''}">${e.amount != null && e.amount !== 0 ? money(Math.abs(e.amount)) : ''}</div></div>`).join('')
      : '<div class="empty">Nada agendado para este mês.</div>';
  }
  await load();
  return { refresh: load, destroy() {} };
}
