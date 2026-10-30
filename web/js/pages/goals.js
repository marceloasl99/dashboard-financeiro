// Goals: progress from linked transactions, deadline, monthly pace needed.
import { api } from '../api.js';
import { icon } from '../components/icons.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { centsToInput, dateBR, daysBetween, esc, money, parseMoneyInput, todayISO } from '../format.js';

const COLORS = ['#1F7A5E', '#2a78d6', '#9A6A1D', '#6250d6', '#eb6834', '#e87ba4'];

export async function render(view, tools) {
  tools.innerHTML = `<button class="btn primary" id="newGoal" type="button">${icon('plus', 15)} Meta</button>`;
  view.innerHTML = `<div class="grid-3" id="goals"></div><p style="font-size:12.5px;color:var(--ink-3)">O progresso soma os lançamentos vinculados à meta (transferências para a poupança, aportes, receitas). Vincule pelo formulário de lançamento.</p>`;

  async function load() {
    const [goals, txs] = await Promise.all([api.get('/goals'), api.get('/transactions', { page_size: 1000, status: 'settled' })]);
    const saved = {};
    txs.items.forEach(t => { if (t.goal_id) saved[t.goal_id] = (saved[t.goal_id] || 0) + t.amount; });
    const today = todayISO();
    view.querySelector('#goals').innerHTML = goals.map(g => {
      const cur = saved[g.id] || 0, p = Math.min(100, cur / g.target * 100), left = Math.max(0, g.target - cur);
      const months = g.deadline ? Math.max(1, Math.ceil(daysBetween(today, g.deadline) / 30)) : null;
      const late = g.deadline && g.deadline < today && left > 0;
      return `<section class="card" data-id="${g.id}" style="cursor:pointer"><div class="body" style="display:grid;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><h2>${esc(g.name)}</h2><div style="font-size:12.5px;color:var(--ink-3)">${g.deadline ? (late ? `prazo ${dateBR(g.deadline)} passou` : `até ${dateBR(g.deadline)}`) : 'sem prazo'}</div></div><span class="delta ${p >= 100 ? 'good' : late ? 'bad' : 'flat'}">${Math.round(p)}%</span></div>
        <div style="font-size:26px;font-weight:600;letter-spacing:-.02em">${money(cur)} <span style="font-size:13px;font-weight:400;color:var(--ink-3)">de ${money(g.target)}</span></div>
        <div class="bar" style="height:10px"><span style="width:${p}%;background:${g.color}"></span></div>
        <div style="font-size:13px;color:var(--ink-2)">${p >= 100 ? `${icon('check', 14)} Meta alcançada` : months ? `Faltam ${money(left)} · <b>${money(Math.ceil(left / months))}/mês</b> por ${months} mês(es)` : `Faltam ${money(left)}`}</div>
      </div></section>`;
    }).join('') || `<div class="card" style="grid-column:1/-1"><div class="empty"><strong>Nenhuma meta ainda.</strong>Crie uma meta com valor e prazo e vincule aportes a ela.</div></div>`;
    view.querySelectorAll('[data-id]').forEach(el => el.onclick = () => edit(goals.find(g => g.id === el.dataset.id)));
  }

  function edit(goal) {
    const content = document.createElement('div'); content.style.cssText = 'display:grid;gap:12px';
    content.innerHTML = `<div class="field"><label for="g-name">Nome</label><input id="g-name" value="${esc(goal?.name || '')}" placeholder="Ex.: Reserva de emergência"></div>
      <div class="row"><div class="field"><label for="g-target">Valor alvo</label><div class="amount-input"><input id="g-target" inputmode="decimal" value="${goal ? centsToInput(goal.target) : ''}" style="font-size:15px;min-height:38px;padding-left:36px"></div></div>
      <div class="field"><label for="g-deadline">Prazo (opcional)</label><input id="g-deadline" type="date" value="${goal?.deadline || ''}"></div></div>
      <div class="field"><label>Cor</label><div class="inline">${COLORS.map(c => `<button type="button" class="btn icon" data-color="${c}" aria-label="${c}" style="background:${c};border-color:${(goal?.color || COLORS[0]) === c ? 'var(--ink)' : 'transparent'}"></button>`).join('')}</div></div><div class="err" id="g-err"></div>`;
    let color = goal?.color || COLORS[0];
    content.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; content.querySelectorAll('[data-color]').forEach(x => x.style.borderColor = x.dataset.color === color ? 'var(--ink)' : 'transparent'); });
    const foot = document.createElement('div'); foot.style.display = 'contents';
    foot.innerHTML = `${goal ? '<button class="btn danger" id="g-del" type="button">Excluir</button>' : '<span></span>'}<div class="right"><button class="btn" data-close type="button">Cancelar</button><button class="btn primary" id="g-ok" type="button">Salvar</button></div>`;
    const m = openModal({ title: goal ? 'Editar meta' : 'Nova meta', content, footer: foot });
    foot.querySelector('[data-close]').onclick = () => m.close();
    foot.querySelector('#g-ok').onclick = async () => {
      const body = { name: content.querySelector('#g-name').value.trim(), target: parseMoneyInput(content.querySelector('#g-target').value), deadline: content.querySelector('#g-deadline').value || null, color };
      if (!body.name) return content.querySelector('#g-err').textContent = 'Informe o nome.';
      if (!(body.target > 0)) return content.querySelector('#g-err').textContent = 'Informe o valor alvo.';
      try { if (goal) await api.put(`/goals/${goal.id}`, body, { silent: true }); else await api.post('/goals', body, { silent: true }); toast('Meta salva', 'success'); m.close(); load(); }
      catch (e) { content.querySelector('#g-err').textContent = e.message; }
    };
    foot.querySelector('#g-del')?.addEventListener('click', async () => { try { await api.del(`/goals/${goal.id}`); toast('Meta excluída', 'success'); m.close(); load(); } catch {} });
  }
  tools.querySelector('#newGoal').onclick = () => edit(null);
  await load();
  return { refresh: load, destroy() {} };
}
