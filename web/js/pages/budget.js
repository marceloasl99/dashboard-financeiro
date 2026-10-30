// Budget: per-category limit vs spent for the selected month, inline editing, year-to-date.
import { api } from '../api.js';
import { icon } from '../components/icons.js';
import { periodPicker } from '../components/period.js';
import { toast } from '../components/toast.js';
import { centsToInput, esc, money, parseMoneyInput } from '../format.js';
import { categoryById, expenseCategories, state } from '../state.js';

export async function render(view, tools) {
  tools.appendChild(periodPicker());
  view.innerHTML = `
    <section class="card ruler" id="summary"></section>
    <div class="grid-2">
      <section class="card"><div class="head"><div><h2>Orçamento do mês</h2><p class="sub">Clique no limite para alterar</p></div><button class="btn small" id="add" type="button">${icon('plus', 14)} Categoria</button></div><div id="list" class="list body tight"></div></section>
      <section class="card"><div class="head"><div><h2>Acumulado no ano</h2><p class="sub">Gasto até agora contra o limite anual (12 × mensal)</p></div></div><div id="ytd" class="list body tight"></div></section>
    </div>`;

  async function load() {
    const [budgets, dash, annual] = await Promise.all([api.get('/budgets'), api.get('/dashboard', { year: state.year, month: state.month }), api.get('/reports/annual', { year: state.year })]);
    const spentMonth = Object.fromEntries(dash.by_category.map(x => [x.category_id, x.amount]));
    const rows = budgets.map(b => ({ b, cat: categoryById(b.category_id), limit: b.overrides?.[`${state.year}-${String(state.month).padStart(2, '0')}`] ?? b.amount, spent: spentMonth[b.category_id] || 0 }))
      .filter(r => r.cat).sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)));
    const totalLimit = rows.reduce((s, r) => s + r.limit, 0), totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    const unbudgeted = dash.by_category.filter(x => !budgets.some(b => b.category_id === x.category_id)).reduce((s, x) => s + x.amount, 0);
    view.querySelector('#summary').innerHTML = `<div><div class="lead">Orçado para o mês</div><div class="big">${money(totalLimit)}</div></div>
      <div class="stats"><div><div class="k">Gasto nas categorias orçadas</div><div class="v">${money(totalSpent)}</div></div><div><div class="k">${totalSpent > totalLimit ? 'Acima do orçamento' : 'Ainda disponível'}</div><div class="v money ${totalSpent > totalLimit ? 'neg' : 'pos'}">${money(Math.abs(totalLimit - totalSpent))}</div></div><div><div class="k">Fora do orçamento</div><div class="v">${money(unbudgeted)}</div></div></div>
      <div class="track"><span class="exp" style="width:${Math.min(100, totalSpent / (totalLimit || 1) * 100)}%"></span></div>`;
    view.querySelector('#list').innerHTML = rows.map(r => {
      const p = r.limit ? r.spent / r.limit * 100 : 0;
      return `<div class="item" style="grid-template-columns:auto 1fr auto"><span class="dot" style="background:${r.cat.color}"></span>
        <div><div style="display:flex;justify-content:space-between;gap:8px"><span class="t">${esc(r.cat.name)}</span><span style="font-size:12.5px;color:${p > 100 ? 'var(--neg)' : 'var(--ink-3)'}">${Math.round(p)}%${p > 100 ? ` · ${money(r.spent - r.limit)} acima` : ''}</span></div>
          <div class="bar ${p > 100 ? 'over' : ''}" style="margin-top:5px"><span style="width:${Math.min(100, p)}%;${p > 100 ? '' : `background:${r.cat.color}`}"></span></div></div>
        <div class="v"><div>${money(r.spent)}</div><button class="btn small" type="button" data-edit="${r.b.id}" title="Alterar limite" style="margin-top:3px">de ${money(r.limit)}</button></div></div>`;
    }).join('') || `<div class="empty"><strong>Nenhum orçamento definido.</strong>Defina um limite mensal por categoria para acompanhar.</div>`;
    view.querySelector('#ytd').innerHTML = rows.map(r => {
      const annualRow = annual.categories.find(c => c.category_id === r.b.category_id);
      const spentY = annualRow?.total || 0, limitY = r.b.amount * 12;
      const p = limitY ? spentY / limitY * 100 : 0;
      return `<div class="item" style="grid-template-columns:auto 1fr auto"><span class="dot" style="background:${r.cat.color}"></span>
        <div><div class="t">${esc(r.cat.name)}</div><div class="bar ${p > 100 ? 'over' : ''}" style="margin-top:5px"><span style="width:${Math.min(100, p)}%;${p > 100 ? '' : `background:${r.cat.color}`}"></span></div></div>
        <div class="v"><div>${money(spentY)}</div><div class="s">de ${money(limitY)} · média ${money(annualRow?.average || 0)}/mês</div></div></div>`;
    }).join('') || '<div class="empty">Sem dados no ano.</div>';

    view.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editLimit(budgets.find(x => x.id === b.dataset.edit)));
    view.querySelector('#add').onclick = () => editLimit(null, budgets);
  }

  function editLimit(budget, existing = []) {
    const row = document.createElement('div');
    row.className = 'inline';
    row.style.cssText = 'padding:10px 18px;border-top:1px solid var(--line);gap:8px';
    const free = expenseCategories().filter(c => !existing.some(b => b.category_id === c.id));
    row.innerHTML = budget ? `<span class="t" style="flex:1">${esc(categoryById(budget.category_id)?.name)}</span>` : `<select id="b-cat" style="flex:1;min-width:140px">${free.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`;
    row.innerHTML += `<div class="amount-input" style="width:150px"><input id="b-amt" inputmode="decimal" value="${budget ? centsToInput(budget.amount) : ''}" placeholder="0,00" style="font-size:15px;min-height:38px;padding-left:36px"></div>
      ${budget ? `<label class="check" style="font-size:12.5px"><input type="checkbox" id="b-only"> só este mês</label>` : ''}
      <button class="btn primary small" id="b-ok" type="button">Salvar</button>${budget ? `<button class="btn danger small" id="b-del" type="button">${icon('trash', 14)}</button>` : ''}<button class="btn small" id="b-cancel" type="button">Cancelar</button>`;
    const list = view.querySelector('#list');
    list.prepend(row);
    row.querySelector('#b-amt').focus();
    row.querySelector('#b-cancel').onclick = () => row.remove();
    row.querySelector('#b-ok').onclick = async () => {
      const amount = parseMoneyInput(row.querySelector('#b-amt').value);
      if (!(amount >= 0)) { toast('Informe um valor válido.', 'error'); return; }
      if (budget) {
        if (row.querySelector('#b-only').checked) await api.put(`/budgets/${budget.id}`, { overrides: { ...budget.overrides, [`${state.year}-${String(state.month).padStart(2, '0')}`]: amount } });
        else await api.put(`/budgets/${budget.id}`, { amount });
      } else await api.post('/budgets', { category_id: row.querySelector('#b-cat').value, amount });
      toast('Orçamento salvo', 'success'); load();
    };
    row.querySelector('#b-del')?.addEventListener('click', async () => { await api.del(`/budgets/${budget.id}`); toast('Removido', 'success'); load(); });
    row.addEventListener('keydown', e => { if (e.key === 'Enter') row.querySelector('#b-ok').click(); if (e.key === 'Escape') row.remove(); });
  }
  await load();
  return { refresh: load, destroy() {} };
}
