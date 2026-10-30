// Cards: one panel per card (current statement, limit), statement history, detail with pay action.
import { api } from '../api.js';
import { icon } from '../components/icons.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { openTransactionModal } from '../components/txModal.js';
import { centsToInput, dateBR, daysBetween, esc, money, monthLabel, parseMoneyInput, todayISO } from '../format.js';
import { activeAccounts, activeCards, categoryById, emit, state } from '../state.js';

export async function render(view, tools, params) {
  const cards = activeCards();
  if (!cards.length) {
    view.innerHTML = `<div class="card"><div class="empty"><strong>Nenhum cartão cadastrado.</strong>Cadastre o cartão com dia de fechamento e vencimento para ver as faturas.<br><a class="btn primary" href="#/settings?tab=cards">Cadastrar cartão</a></div></div>`;
    return { destroy() {} };
  }
  let selected = params.card && cards.find(c => c.id === params.card) ? params.card : cards[0].id;
  let period = params.period || null;
  view.innerHTML = `<div id="cardsRow" class="grid-3"></div><section class="card" id="detail"></section>`;

  async function load() {
    const today = todayISO();
    const all = await Promise.all(cards.map(c => api.get(`/cards/${c.id}/statements`, { from: today.slice(0, 4) - 1 + '-01' })));
    const byCard = Object.fromEntries(cards.map((c, i) => [c.id, all[i]]));
    view.querySelector('#cardsRow').innerHTML = cards.map(c => {
      const sts = byCard[c.id];
      const open = sts.find(s => s.status === 'open' && s.start <= today) || null;
      const closed = sts.filter(s => s.status === 'closed');
      const used = sts.filter(s => s.status !== 'paid').reduce((s, x) => s + x.total - x.paid, 0);
      const usedPct = c.limit ? Math.min(100, used / c.limit * 100) : 0;
      return `<button type="button" class="card" data-card="${c.id}" style="text-align:left;padding:0;cursor:pointer;border-width:${c.id === selected ? 2 : 1}px;border-color:${c.id === selected ? c.color : 'var(--line)'}">
        <div class="body" style="display:grid;gap:10px">
          <div style="display:flex;align-items:center;gap:10px"><span class="swatch" style="background:${c.color}">${icon('card', 16)}</span><div><div style="font-weight:600">${esc(c.name)}</div><div class="s" style="font-size:12px;color:var(--ink-3)">${esc(c.brand || '')} · fecha dia ${c.closing_day}, vence dia ${c.due_day}</div></div></div>
          <div><div style="font-size:12px;color:var(--ink-3)">Fatura atual${open ? ` · fecha ${dateBR(open.end)}` : ''}</div><div style="font-size:22px;font-weight:600">${money(open?.total || 0)}</div></div>
          ${closed.length ? `<div class="alert warning" style="padding:6px 10px">${icon('alert', 14)}<span>${closed.length} fatura(s) fechada(s) a pagar: ${money(closed.reduce((s, x) => s + x.total - x.paid, 0))}</span></div>` : ''}
          ${c.limit ? `<div><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-3)"><span>Limite usado</span><span>${money(used)} de ${money(c.limit)}</span></div><div class="bar ${usedPct > 90 ? 'over' : ''}" style="margin-top:4px"><span style="width:${usedPct}%;background:${usedPct > 90 ? '' : c.color}"></span></div></div>` : ''}
        </div></button>`;
    }).join('');
    view.querySelectorAll('[data-card]').forEach(b => b.onclick = () => { selected = b.dataset.card; period = null; load(); });

    const card = cards.find(c => c.id === selected);
    const sts = [...byCard[selected]].sort((a, b) => b.period.localeCompare(a.period));
    if (!period || !sts.some(s => s.period === period)) period = (sts.find(s => s.status === 'open' && s.start <= today) || sts.find(s => s.status === 'closed') || sts[0])?.period || null;
    const st = sts.find(s => s.period === period);
    const detail = view.querySelector('#detail');
    if (!st) { detail.innerHTML = `<div class="empty"><strong>Sem faturas ainda.</strong>Lance uma compra neste cartão.</div>`; return; }
    const byCat = {};
    st.transactions.forEach(t => { byCat[t.category_id] = (byCat[t.category_id] || 0) + (t.kind === 'expense' ? t.amount : -t.amount); });
    const cats = Object.entries(byCat).map(([id, v]) => ({ cat: categoryById(id), v })).sort((a, b) => b.v - a.v);
    const days = daysBetween(today, st.due_date);
    detail.innerHTML = `
      <div class="head" style="flex-wrap:wrap;align-items:center"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="period" aria-label="Fatura" style="width:auto;font-weight:600">${sts.map(s => `<option value="${s.period}" ${s.period === period ? 'selected' : ''}>Fatura ${monthLabel(s.period)} · ${s.status === 'open' ? 'aberta' : s.status === 'paid' ? 'paga' : 'fechada'}</option>`).join('')}</select>
        <span class="pill ${st.status}">${st.status === 'open' ? `fecha em ${dateBR(st.end)}` : st.status === 'paid' ? `paga` : `vence ${dateBR(st.due_date)}${days >= 0 ? ` (${days} dia${days === 1 ? '' : 's'})` : ' · vencida'}`}</span></div>
        <div class="inline">${st.status !== 'paid' && st.status !== 'open' ? `<button class="btn primary" id="pay" type="button">${icon('check', 14)} Pagar fatura</button>` : ''}
          <button class="btn" id="newTx" type="button">${icon('plus', 14)} Compra neste cartão</button></div></div>
      <div class="body" style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start">
        <div><div style="font-size:12px;color:var(--ink-3)">Período ${dateBR(st.start)} a ${dateBR(st.end)}</div>
          <div style="font-size:30px;font-weight:600;letter-spacing:-.02em">${money(st.total)}</div>
          ${st.paid ? `<div style="font-size:12.5px;color:var(--pos)">Pago ${money(st.paid)}${st.paid < st.total ? ` · restam ${money(st.total - st.paid)}` : ''}</div>` : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;max-width:420px;justify-content:flex-end">${cats.slice(0, 6).map(x => `<span class="tag"><span class="dot" style="background:${x.cat?.color || '#898781'}"></span>${esc(x.cat?.name || 'Sem categoria')} <b>${money(x.v)}</b></span>`).join('')}</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th class="hide-sm">Categoria</th><th class="num">Valor</th></tr></thead>
        <tbody>${st.transactions.map(t => { const c = categoryById(t.category_id); return `<tr class="clickable ${t.status}" data-id="${t.id}"><td style="color:var(--ink-3)">${dateBR(t.date).slice(0, 5)}</td><td><div class="t">${esc(t.description || c?.name || '—')}${t.installment ? ` <span class="tag">${t.installment.number}/${t.installment.total}</span>` : ''}${t.status === 'planned' ? ' <span class="pill planned">previsto</span>' : ''}</div></td><td class="hide-sm">${c ? `<span class="tag"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span>` : ''}</td><td class="num money ${t.kind === 'income' ? 'pos' : ''}">${t.kind === 'income' ? '−' : ''}${money(t.amount)}</td></tr>`; }).join('') || '<tr><td colspan="4"><div class="empty">Nenhuma compra nesta fatura.</div></td></tr>'}</tbody></table></div>`;
    detail.querySelector('#period').onchange = e => { period = e.target.value; load(); };
    detail.querySelector('#newTx').onclick = () => openTransactionModal({ defaults: { source: `card:${card.id}` } });
    detail.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => openTransactionModal({ tx: st.transactions.find(t => t.id === tr.dataset.id) }));
    detail.querySelector('#pay')?.addEventListener('click', () => payDialog(card, st));
  }

  function payDialog(card, st) {
    const accs = activeAccounts();
    const content = document.createElement('div');
    content.style.cssText = 'display:grid;gap:12px';
    content.innerHTML = `<p>Fatura ${monthLabel(st.period)} do ${esc(card.name)}: <b>${money(st.total - st.paid)}</b> em aberto.</p>
      <div class="row"><div class="field"><label for="p-acc">Pagar com</label><select id="p-acc">${accs.map(a => `<option value="${a.id}" ${a.id === card.payment_account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="p-date">Data</label><input id="p-date" type="date" value="${todayISO()}"></div></div>
      <div class="field"><label for="p-amount">Valor</label><div class="amount-input"><input id="p-amount" inputmode="decimal" value="${centsToInput(st.total - st.paid)}"></div><div class="hint">Pagar menos que o total deixa o restante na fatura.</div><div class="err" id="p-err"></div></div>`;
    const foot = document.createElement('div'); foot.className = 'right';
    foot.innerHTML = `<button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="button" id="p-ok">Registrar pagamento</button>`;
    const m = openModal({ title: 'Pagar fatura', content, footer: foot });
    foot.querySelector('[data-close]').onclick = () => m.close();
    foot.querySelector('#p-ok').onclick = async () => {
      const amount = parseMoneyInput(content.querySelector('#p-amount').value);
      if (!(amount > 0)) { content.querySelector('#p-err').textContent = 'Informe um valor válido.'; return; }
      await api.post(`/cards/${card.id}/statements/${st.period}/pay`, { account_id: content.querySelector('#p-acc').value, amount, date: content.querySelector('#p-date').value });
      toast('Pagamento registrado', 'success');
      m.close(); emit('data-changed');
    };
  }
  await load();
  return { refresh: load, update(p) { if (p.card) selected = p.card; if (p.period) period = p.period; load(); }, destroy() {} };
}
