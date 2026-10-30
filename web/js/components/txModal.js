// The transaction form: expense / income / transfer, with installments and "repeat monthly".
import { api } from '../api.js';
import { centsToInput, esc, parseMoneyInput, todayISO } from '../format.js';
import { activeAccounts, activeCards, emit, expenseCategories, incomeCategories, state } from '../state.js';
import { confirmDialog, openModal } from './modal.js';
import { toast } from './toast.js';

export function openTransactionModal({ tx = null, defaults = {} } = {}) {
  const editing = !!tx;
  const data = {
    kind: tx?.kind || defaults.kind || 'expense',
    amount: tx?.amount ?? defaults.amount ?? null,
    date: tx?.date || defaults.date || todayISO(),
    category_id: tx?.category_id || defaults.category_id || null,
    source: tx?.card_id ? `card:${tx.card_id}` : tx?.account_id ? `acc:${tx.account_id}` : defaults.source || defaultSource(),
    to: tx?.to_account_id ? `acc:${tx.to_account_id}` : tx?.to_card_id ? `card:${tx.to_card_id}` : '',
    description: tx?.description || defaults.description || '',
    installments: 1,
    repeat: false,
    goal_id: tx?.goal_id || null,
    status: tx?.status || 'settled',
  };

  const content = document.createElement('div');
  content.style.display = 'grid';
  content.style.gap = '14px';
  const foot = document.createElement('div');
  foot.className = 'right';
  foot.style.display = 'contents';
  foot.innerHTML = `${editing ? '<button class="btn danger" type="button" data-del>Excluir</button>' : '<span></span>'}
    <div class="right"><button class="btn" type="button" data-close>Cancelar</button>
    <button class="btn primary" type="button" data-save>${editing ? 'Salvar' : 'Lançar'}</button></div>`;
  const modal = openModal({ title: editing ? 'Editar lançamento' : 'Novo lançamento', content, footer: foot });

  let goals = [];
  api.get('/goals', null, { silent: true }).then(g => { goals = g || []; render(); }).catch(() => {});

  function render() {
    const cats = data.kind === 'income' ? incomeCategories() : expenseCategories();
    const sources = [...activeAccounts().map(a => ({ v: `acc:${a.id}`, l: a.name })),
                     ...(data.kind === 'transfer' ? [] : activeCards().map(c => ({ v: `card:${c.id}`, l: `${c.name} (cartão)` })))];
    const dests = [...activeAccounts().map(a => ({ v: `acc:${a.id}`, l: a.name })), ...activeCards().map(c => ({ v: `card:${c.id}`, l: `${c.name} (fatura)` }))]
      .filter(d => d.v !== data.source);
    const isCard = data.source.startsWith('card:');
    content.innerHTML = `
      <div class="seg" role="group" aria-label="Tipo">
        <button type="button" class="exp" data-kind="expense" aria-pressed="${data.kind === 'expense'}">Gasto</button>
        <button type="button" class="inc" data-kind="income" aria-pressed="${data.kind === 'income'}">Receita</button>
        <button type="button" data-kind="transfer" aria-pressed="${data.kind === 'transfer'}">Transferência</button>
      </div>
      <div class="field"><label for="f-amount">Valor</label>
        <div class="amount-input"><input id="f-amount" inputmode="decimal" placeholder="0,00" value="${data.amount != null ? centsToInput(data.amount) : ''}" autocomplete="off"></div>
        <div class="err" data-err="amount"></div></div>
      <div class="row">
        <div class="field"><label for="f-date">Data</label><input id="f-date" type="date" value="${data.date}"><div class="err" data-err="date"></div></div>
        <div class="field"><label for="f-source">${data.kind === 'transfer' ? 'Sai de' : data.kind === 'income' ? 'Entra em' : 'Pago com'}</label>
          <select id="f-source">${sources.map(s => `<option value="${s.v}" ${s.v === data.source ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}</select>
          <div class="err" data-err="account_id"></div></div>
        ${data.kind === 'transfer' ? `<div class="field"><label for="f-to">Vai para</label>
          <select id="f-to"><option value="">Escolha…</option>${dests.map(s => `<option value="${s.v}" ${s.v === data.to ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}</select>
          <div class="err" data-err="to_account_id"></div></div>` : ''}
      </div>
      ${data.kind !== 'transfer' ? `<div class="field"><label>Categoria</label>
        <div class="catgrid" role="group">${cats.map(c => `<button type="button" data-cat="${c.id}" aria-pressed="${c.id === data.category_id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}</div>
        <div class="err" data-err="category_id"></div></div>` : ''}
      <div class="field"><label for="f-desc">${data.kind === 'expense' ? 'Onde foi (opcional)' : 'Descrição (opcional)'}</label>
        <input id="f-desc" value="${esc(data.description)}" placeholder="${data.kind === 'expense' ? 'Ex.: Supermercado, iFood, farmácia…' : 'Ex.: Salário, freelance…'}" maxlength="200" autocomplete="off"></div>
      ${!editing && data.kind === 'expense' && isCard ? `<div class="row">
        <div class="field"><label for="f-inst">Parcelas</label>
          <select id="f-inst">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 24].map(n => `<option value="${n}" ${n === data.installments ? 'selected' : ''}>${n === 1 ? 'À vista' : n + 'x'}</option>`).join('')}</select>
          <div class="hint">${data.installments > 1 && data.amount ? `${data.installments}x de ${centsToInput(Math.round(data.amount / data.installments))}` : 'Valor total da compra'}</div></div>
      </div>` : ''}
      ${!editing && data.kind !== 'transfer' ? `<label class="check"><input type="checkbox" id="f-repeat" ${data.repeat ? 'checked' : ''}> Repetir todo mês nesta data</label>` : ''}
      ${goals.length && data.kind !== 'expense' ? `<div class="field"><label for="f-goal">Vincular a uma meta (opcional)</label>
        <select id="f-goal"><option value="">Nenhuma</option>${goals.map(g => `<option value="${g.id}" ${g.id === data.goal_id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>` : ''}
      ${editing ? `<label class="check"><input type="checkbox" id="f-settled" ${data.status === 'settled' ? 'checked' : ''}> Efetivado (desmarque para deixar como previsto)</label>` : ''}
    `;
    content.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => {
      data.kind = b.dataset.kind;
      if (data.kind === 'transfer' && data.source.startsWith('card:')) data.source = defaultSource(true);
      const cats2 = data.kind === 'income' ? incomeCategories() : expenseCategories();
      if (!cats2.some(c => c.id === data.category_id)) data.category_id = null;
      capture(); render();
    });
    content.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { data.category_id = b.dataset.cat; capture(); render(); });
    content.querySelector('#f-source').onchange = e => { data.source = e.target.value; capture(); render(); };
    content.querySelector('#f-inst')?.addEventListener('change', e => { data.installments = +e.target.value; capture(); render(); });
    content.querySelector('#f-amount').addEventListener('input', () => { data.amount = parseMoneyInput(content.querySelector('#f-amount').value); });
    content.querySelector('#f-amount').addEventListener('blur', () => { const v = data.amount; if (Number.isFinite(v)) content.querySelector('#f-amount').value = centsToInput(v); });
  }

  function capture() {
    const q = s => content.querySelector(s);
    const a = parseMoneyInput(q('#f-amount')?.value);
    data.amount = Number.isFinite(a) ? a : data.amount;
    data.date = q('#f-date')?.value || data.date;
    data.description = q('#f-desc')?.value ?? data.description;
    data.to = q('#f-to')?.value ?? data.to;
    data.repeat = q('#f-repeat')?.checked ?? data.repeat;
    data.goal_id = q('#f-goal')?.value || null;
    if (q('#f-settled')) data.status = q('#f-settled').checked ? 'settled' : 'planned';
  }

  function showError(field, msg) {
    const el = content.querySelector(`[data-err="${field}"]`) || content.querySelector('[data-err="amount"]');
    if (el) el.textContent = msg;
  }

  async function save() {
    capture();
    content.querySelectorAll('.err').forEach(e => e.textContent = '');
    if (!Number.isFinite(data.amount) || data.amount <= 0) return showError('amount', 'Informe um valor maior que zero.');
    if (!data.date) return showError('date', 'Informe a data.');
    if (data.kind !== 'transfer' && !data.category_id) return showError('category_id', 'Escolha uma categoria.');
    if (data.kind === 'transfer' && !data.to) return showError('to_account_id', 'Escolha o destino.');
    const [srcKind, srcId] = data.source.split(':');
    const body = {
      date: data.date, amount: data.amount, kind: data.kind, description: data.description.trim(),
      category_id: data.kind === 'transfer' ? null : data.category_id,
      account_id: srcKind === 'acc' ? srcId : null, card_id: srcKind === 'card' ? srcId : null,
      to_account_id: null, to_card_id: null, goal_id: data.goal_id, status: data.status,
    };
    if (data.kind === 'transfer') {
      const [tk, tid] = data.to.split(':');
      if (tk === 'acc') body.to_account_id = tid; else body.to_card_id = tid;
    }
    const btn = foot.querySelector('[data-save]');
    btn.disabled = true;
    try {
      if (editing) {
        let scope = 'one';
        if (tx.installment) {
          const r = await confirmDialog('Este lançamento é uma parcela. Aplicar a alteração a:', { title: 'Parcelas', options: [{ value: 'one', label: 'Só esta' }, { value: 'remaining', label: 'Esta e as próximas' }] });
          if (!r) { btn.disabled = false; return; }
          scope = r;
        }
        await api.put(`/transactions/${tx.id}?scope=${scope}`, body, { silent: true });
        toast('Lançamento salvo', 'success');
      } else if (data.installments > 1 && body.card_id) {
        await api.post('/transactions/installments', { ...body, total: data.installments }, { silent: true });
        toast(`${data.installments} parcelas lançadas`, 'success');
      } else {
        await api.post('/transactions', body, { silent: true });
        if (data.repeat) {
          const day = +data.date.slice(8, 10);
          await api.post('/recurrences', { description: body.description || state.categories.find(c => c.id === body.category_id)?.name || 'Recorrência',
            amount: body.amount, kind: body.kind, category_id: body.category_id, account_id: body.account_id, card_id: body.card_id,
            frequency: 'monthly', day, start_date: nextMonth(data.date) }, { silent: true });
          toast('Lançado e repetição mensal criada', 'success');
        } else toast('Lançado', 'success');
      }
      modal.close();
      emit('data-changed');
    } catch (e) {
      showError(e.field || 'amount', e.message);
      btn.disabled = false;
    }
  }

  foot.querySelector('[data-save]').onclick = save;
  foot.querySelector('[data-close]').onclick = () => modal.close();
  foot.querySelector('[data-del]')?.addEventListener('click', async () => {
    let scope = 'one';
    if (tx.installment) {
      const r = await confirmDialog('Excluir esta parcela ou todas as próximas também?', { title: 'Excluir', options: [{ value: 'one', label: 'Só esta', danger: true }, { value: 'remaining', label: 'Esta e as próximas', danger: true }] });
      if (!r) return; scope = r;
    } else if (!(await confirmDialog('Excluir este lançamento?', { title: 'Excluir', ok: 'Excluir', danger: true }))) return;
    await api.del(`/transactions/${tx.id}`, { scope });
    toast('Excluído', 'success');
    modal.close();
    emit('data-changed');
  });
  content.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
  render();
  return modal;
}

function defaultSource(accountsOnly = false) {
  const a = activeAccounts()[0];
  if (a) return `acc:${a.id}`;
  const c = !accountsOnly && activeCards()[0];
  return c ? `card:${c.id}` : '';
}
function nextMonth(iso) {
  const d = new Date(iso + 'T00:00');
  const day = d.getDate();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  n.setDate(Math.min(day, last));
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
