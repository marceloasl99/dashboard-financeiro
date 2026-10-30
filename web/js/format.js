// pt-BR formatting helpers. All money values are integer cents.
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const money = cents => brl.format((cents || 0) / 100);
export const moneyCompact = cents => 'R$ ' + brlCompact.format((cents || 0) / 100);
export const signedMoney = cents => (cents > 0 ? '+' : '') + money(cents);
export const pct = v => (v == null ? '—' : num.format(v) + '%');
export const signedPct = v => (v == null ? '—' : (v > 0 ? '+' : '') + num.format(v) + '%');
export const monthName = i => MONTHS[i];
export const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export const monthLabel = key => { const [y, m] = key.split('-'); return `${MONTHS_SHORT[+m - 1]}/${y.slice(2)}`; };

export function dateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
export function dateShort(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function daysBetween(aIso, bIso) {
  return Math.round((new Date(bIso + 'T00:00') - new Date(aIso + 'T00:00')) / 86400000);
}
// "1.234,56" -> 123456 ; "12" -> 1200
export function parseMoneyInput(str) {
  if (str == null) return NaN;
  let s = String(str).trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const v = Number(s);
  return Number.isFinite(v) ? Math.round(v * 100) : NaN;
}
export const centsToInput = cents => (cents / 100).toFixed(2).replace('.', ',');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
