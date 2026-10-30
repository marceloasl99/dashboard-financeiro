// Transactions: filters, grouped-by-day table, click to edit, confirm planned rows.
import { api } from '../api.js';
import { icon } from '../components/icons.js';
import { periodPicker } from '../components/period.js';
import { openTransactionModal } from '../components/txModal.js';
import { toast } from '../components/toast.js';
import { dateBR, esc, money, monthKey } from '../format.js';
import { categoryById, emit, sourceName, state } from '../state.js';

export async function render(view, tools, params) {
  tools.appendChild(periodPicker());
  const filters = { q: '', category_id: params.category_id || '', account_id: params.account_id || '', card_id: params.card_id || '', kind: '', status: params.status || '', all: !!(params.status) };
  view.innerHTML = `
    <section class="card">
      <div class="filters">
        <input class="search" id="f-q" placeholder="Buscar descrição ou tag" aria-label="Buscar">
        <select id="f-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${state.categories.map(c => `<option value="${c.id}" ${c.id === filters.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select id="f-src" aria-label="Conta ou cartão"><option value="">Contas e cartões</option>
          ${state.accounts.map(a => `<option value="acc:${a.id}" ${a.id === filters.account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          ${state.cards.map(c => `<option value="card:${c.id}" ${c.id === filters.card_id ? 'selected' : ''}>${esc(c.name)} (cartão)</option>`).join('')}</select>
        <select id="f-kind" aria-label="Tipo"><option value="">Todos os tipos</option><option value="expense">Gastos</option><option value="income">Receitas</option><option value="transfer">Transferências</option></select>
        <select id="f-status" aria-label="Situação"><option value="">Efetivados e previstos</option><option value="settled">Só efetivados</option><option value="planned" ${filters.status === 'planned' ? 'selected' : ''}>Só previstos</option></select>
        <label class="check" style="flex:0 0 auto"><input type="checkbox" id="f-all" ${filters.all ? 'checked' : ''}> Todos os meses</label>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Descrição</th><th class="hide-sm">Categoria</th><th class="hide-sm">Conta / cartão</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table></div>
      <div class="body" id="foot" style="display:flex;justify-content:space-between;align-items:center;color:var(--ink-3);font-size:12.5px"></div>
    </section>`;

  const q = s => view.querySelector(s);
  let page = 1;
  let timer;
  q('#f-q').oninput = () => { clearTimeout(timer); timer = setTimeout(() => { filters.q = q('#f-q').value; page = 1; load(); }, 250); };
  q('#f-cat').onchange = e => { filters.category_id = e.target.value; page = 1; load(); };
  q('#f-src').onchange = e => { const [k, id] = e.target.value.split(':'); filters.account_id = k === 'acc' ? id : ''; filters.card_id = k === 'card' ? id : ''; page = 1; load(); };
  q('#f-kind').onchange = e => { filters.kind = e.target.value; page = 1; load(); };
  q('#f-status').onchange = e => { filters.status = e.target.value; page = 1; load(); };
  q('#f-all').onchange = e => { filters.all = e.target.checked; page = 1; load(); };

  async function load() {
    const key = monthKey(state.year, state.month);
    const last = new Date(state.year, state.month, 0).getDate();
    const p = { ...filters, page, page_size: 200 };
    delete p.all;
    if (!filters.all) { p.from = `${key}-01`; p.to = `${key}-${String(last).padStart(2, '0')}`; }
    const r = await api.get('/transactions', p);
    const rows = r.items;
    let html = '', lastDate = null, dayTotal = 0;
    const sums = { expense: 0, income: 0 };
    rows.forEach(t => { if (t.status === 'settled' && sums[t.kind] != null) sums[t.kind] += t.amount; });
    rows.forEach(t => {
      if (t.date !== lastDate) {
        lastDate = t.date;
        html += `<tr class="day-sep"><td colspan="6">${dateBR(t.date)}</td></tr>`;
      }
      const cat = categoryById(t.category_id);
      const sign = t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : '';
      const cls = t.kind === 'income' ? 'pos' : t.kind === 'expense' ? 'neg' : '';
      const dest = t.kind === 'transfer' ? ` → ${state.accounts.find(a => a.id === t.to_account_id)?.name || state.cards.find(c => c.id === t.to_card_id)?.name || '?'}` : '';
      html += `<tr class="clickable ${t.status}" data-id="${t.id}">
        <td class="hide-sm" style="color:var(--ink-3)">${t.date.slice(8)}</td>
        <td><div class="t">${esc(t.description || cat?.name || (t.kind === 'transfer' ? 'Transferência' : '—'))}${t.installment ? ` <span class="tag">${t.installment.number}/${t.installment.total}</span>` : ''}${t.status === 'planned' ? ' <span class="pill planned">previsto</span>' : ''}</div></td>
        <td class="hide-sm">${cat ? `<span class="tag"><span class="dot" style="background:${cat.color}"></span>${esc(cat.name)}</span>` : t.kind === 'transfer' ? `<span class="tag">${icon('swap', 12)} transferência</span>` : ''}</td>
        <td class="hide-sm" style="color:var(--ink-2)">${esc(sourceName(t))}${esc(dest)}</td>
        <td class="num money ${cls}">${sign}${money(t.amount)}</td>
        <td class="num">${t.status === 'planned' ? `<button class="btn small" type="button" data-confirm="${t.id}" title="Confirmar como efetivado">${icon('check', 14)}</button>` : ''}</td></tr>`;
    });
    q('#rows').innerHTML = html || `<tr><td colspan="6"><div class="empty"><strong>Nenhum lançamento aqui.</strong>Ajuste os filtros ou lance o primeiro.<br><button class="btn primary" type="button" data-new>${icon('plus', 14)} Lançar</button></div></td></tr>`;
    q('#foot').innerHTML = `<span>${r.total} lançamento(s)${r.total > rows.length ? `, mostrando ${rows.length}` : ''}</span><span>Receitas ${money(sums.income)} · Gastos ${money(sums.expense)} · <b style="color:var(--ink)">Saldo ${money(sums.income - sums.expense)}</b></span>`;
    q('#rows').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = e => {
      if (e.target.closest('[data-confirm]')) return;
      openTransactionModal({ tx: rows.find(x => x.id === tr.dataset.id) });
    });
    q('#rows').querySelectorAll('[data-confirm]').forEach(b => b.onclick = async () => {
      const t = rows.find(x => x.id === b.dataset.confirm);
      if (t.recurrence_id) await api.post(`/recurrences/${t.recurrence_id}/confirm`, { date: t.recurrence_date || t.date, amount: t.amount });
      else await api.put(`/transactions/${t.id}`, { status: 'settled' });
      toast('Confirmado', 'success');
      emit('data-changed');
    });
    q('[data-new]')?.addEventListener('click', () => openTransactionModal());
  }
  await load();
  return { refresh: load, update(p) { Object.assign(filters, { category_id: p.category_id || '', account_id: p.account_id || '', card_id: p.card_id || '', status: p.status || '' }); load(); }, destroy() {} };
}
