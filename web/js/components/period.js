// Month/year picker bound to global state.
import { MONTHS } from '../format.js';
import { setPeriod, shiftMonth, state } from '../state.js';
import { icon } from './icons.js';

export function periodPicker() {
  const el = document.createElement('div');
  el.className = 'period';
  const years = [];
  for (let y = state.year - 4; y <= state.year + 1; y++) years.push(y);
  if (!years.includes(state.year)) years.push(state.year);
  el.innerHTML = `
    <button class="btn icon" type="button" data-prev aria-label="Mês anterior">${icon('left', 16)}</button>
    <select data-month aria-label="Mês">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === state.month ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <select data-year aria-label="Ano">${years.sort().map(y => `<option ${y === state.year ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <button class="btn icon" type="button" data-next aria-label="Próximo mês">${icon('right', 16)}</button>`;
  el.querySelector('[data-prev]').onclick = () => shiftMonth(-1);
  el.querySelector('[data-next]').onclick = () => shiftMonth(1);
  el.querySelector('[data-month]').onchange = e => setPeriod(state.year, +e.target.value);
  el.querySelector('[data-year]').onchange = e => setPeriod(+e.target.value, state.month);
  return el;
}
