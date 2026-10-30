// Settings: accounts, cards, categories, rules, recurrences, backup, preferences.
import { api } from '../api.js';
import { icon } from '../components/icons.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { centsToInput, dateBR, esc, money, parseMoneyInput, todayISO } from '../format.js';
import { categoryById, loadReference, state } from '../state.js';

const TABS = [['accounts', 'Contas'], ['cards', 'Cartões'], ['categories', 'Categorias'], ['rules', 'Regras'], ['recurrences', 'Recorrências'], ['backup', 'Backup'], ['prefs', 'Preferências']];
const ACCOUNT_TYPES = { checking: 'Conta corrente', savings: 'Poupança', wallet: 'Carteira / dinheiro', fgts: 'FGTS' };

export async function render(view, tools, params) {
  let tab = TABS.some(t => t[0] === params.tab) ? params.tab : 'accounts';
  view.innerHTML = `<section class="card"><div class="tabs" role="tablist" id="tabs"></div><div id="panel"></div></section>`;
  function renderTabs() {
    view.querySelector('#tabs').innerHTML = TABS.map(([id, label]) => `<button role="tab" aria-selected="${id === tab}" data-tab="${id}">${label}</button>`).join('');
    view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); load(); });
  }
  const panel = () => view.querySelector('#panel');
  const field = (id, label, html, hint = '') => `<div class="field"><label for="${id}">${label}</label>${html}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;

  async function load() {
    const p = panel();
    if (tab === 'accounts') {
      p.innerHTML = listHead('Conta', 'newAcc') + `<div class="list">${state.accounts.map(a => `<div class="item clickable" data-id="${a.id}"><span class="swatch" style="background:${a.color}">${a.name[0]}</span><div><div class="t">${esc(a.name)}${a.archived ? ' <span class="pill planned">arquivada</span>' : ''}</div><div class="s">${ACCOUNT_TYPES[a.type]} · saldo inicial ${money(a.initial_balance)}</div></div><span>${icon('edit', 16)}</span></div>`).join('') || empty('Nenhuma conta. Crie a conta corrente para começar.')}</div>`;
      p.querySelectorAll('[data-id]').forEach(el => el.onclick = () => editAccount(state.accounts.find(a => a.id === el.dataset.id)));
      p.querySelector('#newAcc').onclick = () => editAccount(null);
    } else if (tab === 'cards') {
      p.innerHTML = listHead('Cartão', 'newCard') + `<div class="list">${state.cards.map(c => `<div class="item clickable" data-id="${c.id}"><span class="swatch" style="background:${c.color}">${icon('card', 16)}</span><div><div class="t">${esc(c.name)}${c.archived ? ' <span class="pill planned">arquivado</span>' : ''}</div><div class="s">${esc(c.brand || '')} · fecha dia ${c.closing_day}, vence dia ${c.due_day}${c.limit ? ` · limite ${money(c.limit)}` : ''}</div></div><span>${icon('edit', 16)}</span></div>`).join('') || empty('Nenhum cartão cadastrado.')}</div>`;
      p.querySelectorAll('[data-id]').forEach(el => el.onclick = () => editCard(state.cards.find(c => c.id === el.dataset.id)));
      p.querySelector('#newCard').onclick = () => editCard(null);
    } else if (tab === 'categories') {
      const group = kind => state.categories.filter(c => c.kind === kind).map(c => `<div class="item clickable" data-id="${c.id}"><span class="dot" style="background:${c.color};width:14px;height:14px"></span><div class="t">${esc(c.name)}</div><span>${icon('edit', 16)}</span></div>`).join('');
      p.innerHTML = listHead('Categoria', 'newCat') + `<div class="grid-2"><div><h3 style="padding:8px 18px">Gastos</h3><div class="list">${group('expense')}</div></div><div><h3 style="padding:8px 18px">Receitas</h3><div class="list">${group('income')}</div></div></div>`;
      p.querySelectorAll('[data-id]').forEach(el => el.onclick = () => editCategory(categoryById(el.dataset.id)));
      p.querySelector('#newCat').onclick = () => editCategory(null);
    } else if (tab === 'rules') {
      const rules = (await api.get('/rules')).sort((a, b) => b.priority - a.priority);
      p.innerHTML = listHead('Regra', 'newRule', 'Quando a descrição contém o texto, a categoria é sugerida ao lançar e ao importar extratos.') + `<div class="list">${rules.map(r => { const c = categoryById(r.category_id); return `<div class="item clickable" data-id="${r.id}"><span class="dot" style="background:${c?.color || '#898781'}"></span><div><div class="t">contém “${esc(r.pattern)}”</div><div class="s">→ ${esc(c?.name || '?')} · prioridade ${r.priority}</div></div><span>${icon('edit', 16)}</span></div>`; }).join('') || empty('Nenhuma regra. Exemplo: “ifood” → Alimentação.')}</div>`;
      p.querySelectorAll('[data-id]').forEach(el => el.onclick = () => editRule(rules.find(r => r.id === el.dataset.id)));
      p.querySelector('#newRule').onclick = () => editRule(null);
    } else if (tab === 'recurrences') {
      const recs = await api.get('/recurrences');
      const FREQ = { monthly: 'mensal', yearly: 'anual', weekly: 'semanal' };
      p.innerHTML = listHead('Recorrência', 'newRec', 'Lançamentos previstos são criados automaticamente até 12 meses à frente; confirme-os quando acontecerem.') + `<div class="list">${recs.map(r => { const c = categoryById(r.category_id); const src = state.accounts.find(a => a.id === r.account_id)?.name || state.cards.find(x => x.id === r.card_id)?.name || ''; return `<div class="item clickable ${r.active ? '' : 'planned'}" data-id="${r.id}"><span class="dot" style="background:${c?.color || '#898781'}"></span><div><div class="t">${esc(r.description)}${r.active ? '' : ' <span class="pill planned">pausada</span>'}</div><div class="s">${FREQ[r.frequency]} · dia ${r.day} · ${esc(src)}${r.end_date ? ` · até ${dateBR(r.end_date)}` : ''}</div></div><div class="v money ${r.kind === 'income' ? 'pos' : 'neg'}">${money(r.amount)}</div></div>`; }).join('') || empty('Nenhuma recorrência. Marque “repetir todo mês” ao lançar, ou crie aqui.')}</div>`;
      p.querySelectorAll('[data-id]').forEach(el => el.onclick = () => editRecurrence(recs.find(r => r.id === el.dataset.id)));
      p.querySelector('#newRec').onclick = () => editRecurrence(null);
    } else if (tab === 'backup') {
      p.innerHTML = `<div class="body" style="display:grid;gap:18px;max-width:640px">
        <div><h2>Exportar</h2><p style="color:var(--ink-2);margin:4px 0 10px">O backup JSON contém tudo (contas, cartões, lançamentos, metas…) e pode ser restaurado aqui. O CSV é só a lista de lançamentos, para abrir em planilha.</p>
          <div class="inline"><a class="btn primary" href="/api/export.json" download>${icon('download', 15)} Baixar backup completo (JSON)</a><a class="btn" href="/api/export.csv" download>${icon('download', 15)} Lançamentos (CSV)</a></div></div>
        <div><h2>Restaurar</h2><p style="color:var(--ink-2);margin:4px 0 10px">Substitui <b>todos</b> os dados atuais pelo conteúdo do arquivo. Uma cópia dos dados atuais é guardada em <code>data/backups/</code> antes.</p>
          <label class="btn danger" style="display:inline-flex">${icon('upload', 15)} Escolher backup JSON…<input type="file" id="restore" accept=".json" style="display:none"></label></div>
        <div><h2>Backups automáticos</h2><p style="color:var(--ink-2);margin-top:4px">O servidor guarda uma cópia diária em <code>data/backups/</code> e mantém os últimos ${state.settings.backup_keep_days} dias.</p></div></div>`;
      p.querySelector('#restore').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        if (!(await confirmDialog(`Substituir todos os dados pelo arquivo “${esc(f.name)}”?`, { title: 'Restaurar backup', ok: 'Substituir tudo', danger: true }))) return;
        const fd = new FormData(); fd.append('file', f);
        const r = await api.upload('/import/backup', fd);
        toast(`Restaurado: ${r.transactions} lançamentos`, 'success');
        await loadReference(); location.hash = '#/overview';
      };
    } else if (tab === 'prefs') {
      const s = state.settings;
      p.innerHTML = `<div class="body" style="display:grid;gap:16px;max-width:560px">
        ${field('s-theme', 'Tema', `<select id="s-theme"><option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>Automático (segue o sistema)</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Claro</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Escuro</option></select>`)}
        <label class="check"><input type="checkbox" id="s-quotes" ${s.quotes_enabled ? 'checked' : ''}> Permitir atualizar cotações pela internet (brapi.dev para B3, CoinGecko para cripto)</label>
        ${field('s-key', 'Token do brapi.dev (opcional)', `<input id="s-key" value="${esc(s.quotes_api_key || '')}" placeholder="sem token o limite gratuito é baixo">`, 'Cotações são aproximadas e podem ter atraso. O app nunca envia seus dados; só consulta preços.')}
        ${field('s-keep', 'Dias de backup automático a manter', `<input id="s-keep" type="number" min="1" max="365" value="${s.backup_keep_days}">`)}
        <div><button class="btn primary" id="s-save" type="button">Salvar preferências</button></div>
        <p style="font-size:12px;color:var(--ink-3)">Atalho: tecle <kbd>n</kbd> em qualquer tela para lançar.</p></div>`;
      p.querySelector('#s-save').onclick = async () => {
        await api.put('/settings', { theme: p.querySelector('#s-theme').value, quotes_enabled: p.querySelector('#s-quotes').checked, quotes_api_key: p.querySelector('#s-key').value.trim(), backup_keep_days: +p.querySelector('#s-keep').value || 30 });
        toast('Preferências salvas', 'success'); await loadReference();
      };
    }
  }
  const listHead = (what, id, hint = '') => `<div class="head" style="align-items:center;padding-bottom:12px"><div>${hint ? `<p class="sub">${hint}</p>` : ''}</div><button class="btn primary small" id="${id}" type="button">${icon('plus', 14)} ${what}</button></div>`;
  const empty = msg => `<div class="empty">${msg}</div>`;

  function form(title, html, { onSave, onDelete, deleteLabel = 'Excluir', archive }) {
    const content = document.createElement('div'); content.style.cssText = 'display:grid;gap:12px';
    content.innerHTML = html + '<div class="err" data-err></div>';
    const foot = document.createElement('div'); foot.style.display = 'contents';
    foot.innerHTML = `<div class="inline">${onDelete ? `<button class="btn danger" data-del type="button">${deleteLabel}</button>` : ''}${archive ? `<button class="btn" data-arch type="button">${archive.label}</button>` : ''}</div><div class="right"><button class="btn" data-close type="button">Cancelar</button><button class="btn primary" data-ok type="button">Salvar</button></div>`;
    const m = openModal({ title, content, footer: foot });
    const q = s => content.querySelector(s);
    foot.querySelector('[data-close]').onclick = () => m.close();
    foot.querySelector('[data-ok]').onclick = async () => { try { await onSave(q); m.close(); await loadReference(); renderTabs(); load(); } catch (e) { q('[data-err]').textContent = e.message; } };
    foot.querySelector('[data-del]')?.addEventListener('click', async () => { try { await onDelete(); m.close(); await loadReference(); load(); } catch (e) { q('[data-err]').textContent = e.message; } });
    foot.querySelector('[data-arch]')?.addEventListener('click', async () => { await archive.run(); m.close(); await loadReference(); load(); });
    content.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') foot.querySelector('[data-ok]').click(); });
    return m;
  }
  const colorField = (id, value) => field(id, 'Cor', `<input id="${id}" type="color" value="${value}" style="height:38px;padding:3px">`);

  function editAccount(a) {
    form(a ? 'Editar conta' : 'Nova conta', `<div class="row">${field('a-name', 'Nome', `<input id="a-name" value="${esc(a?.name || '')}" placeholder="Ex.: Nubank, Itaú, Carteira">`)}${field('a-type', 'Tipo', `<select id="a-type">${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}" ${(a?.type || 'checking') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}</div>
      <div class="row">${field('a-init', 'Saldo inicial', `<div class="amount-input"><input id="a-init" inputmode="decimal" value="${a ? centsToInput(a.initial_balance) : '0,00'}" style="font-size:15px;min-height:38px;padding-left:36px"></div>`, 'Saldo que a conta tinha antes do primeiro lançamento registrado aqui.')}${colorField('a-color', a?.color || '#1B3A4B')}</div>`,
      { onSave: async q => { const body = { name: q('#a-name').value.trim(), type: q('#a-type').value, initial_balance: parseMoneyInput(q('#a-init').value) || 0, color: q('#a-color').value }; if (!body.name) throw new Error('Informe o nome.'); if (a) await api.put(`/accounts/${a.id}`, body, { silent: true }); else await api.post('/accounts', body, { silent: true }); toast('Conta salva', 'success'); },
        onDelete: a ? async () => { if (!(await confirmDialog('Excluir esta conta? Só é possível sem lançamentos.', { ok: 'Excluir', danger: true }))) throw new Error(''); await api.del(`/accounts/${a.id}`, null, { silent: true }); toast('Conta excluída', 'success'); } : null,
        archive: a ? { label: a.archived ? 'Reativar' : 'Arquivar', run: () => api.put(`/accounts/${a.id}`, { archived: !a.archived }) } : null });
  }
  function editCard(c) {
    form(c ? 'Editar cartão' : 'Novo cartão', `<div class="row">${field('c-name', 'Nome', `<input id="c-name" value="${esc(c?.name || '')}" placeholder="Ex.: Nubank, Itaú Visa">`)}${field('c-brand', 'Bandeira', `<input id="c-brand" value="${esc(c?.brand || '')}" placeholder="Visa, Mastercard…">`)}</div>
      <div class="row">${field('c-close', 'Dia de fechamento', `<input id="c-close" type="number" min="1" max="31" value="${c?.closing_day || 1}">`)}${field('c-due', 'Dia de vencimento', `<input id="c-due" type="number" min="1" max="31" value="${c?.due_day || 10}">`)}${field('c-limit', 'Limite', `<div class="amount-input"><input id="c-limit" inputmode="decimal" value="${c?.limit ? centsToInput(c.limit) : ''}" style="font-size:15px;min-height:38px;padding-left:36px"></div>`)}</div>
      <div class="row">${field('c-acc', 'Conta de pagamento', `<select id="c-acc"><option value="">—</option>${state.accounts.map(a => `<option value="${a.id}" ${a.id === c?.payment_account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`)}${colorField('c-color', c?.color || '#285568')}</div>`,
      { onSave: async q => { const body = { name: q('#c-name').value.trim(), brand: q('#c-brand').value.trim(), closing_day: +q('#c-close').value, due_day: +q('#c-due').value, limit: parseMoneyInput(q('#c-limit').value) || 0, payment_account_id: q('#c-acc').value || null, color: q('#c-color').value }; if (!body.name) throw new Error('Informe o nome.'); if (c) await api.put(`/cards/${c.id}`, body, { silent: true }); else await api.post('/cards', body, { silent: true }); toast('Cartão salvo', 'success'); },
        onDelete: c ? async () => { if (!(await confirmDialog('Excluir este cartão? Só é possível sem lançamentos.', { ok: 'Excluir', danger: true }))) throw new Error(''); await api.del(`/cards/${c.id}`, null, { silent: true }); toast('Cartão excluído', 'success'); } : null,
        archive: c ? { label: c.archived ? 'Reativar' : 'Arquivar', run: () => api.put(`/cards/${c.id}`, { archived: !c.archived }) } : null });
  }
  function editCategory(c) {
    form(c ? 'Editar categoria' : 'Nova categoria', `<div class="row">${field('k-name', 'Nome', `<input id="k-name" value="${esc(c?.name || '')}">`)}${field('k-kind', 'Tipo', `<select id="k-kind"><option value="expense" ${c?.kind !== 'income' ? 'selected' : ''}>Gasto</option><option value="income" ${c?.kind === 'income' ? 'selected' : ''}>Receita</option></select>`)}${colorField('k-color', c?.color || '#6F95A1')}</div>`,
      { onSave: async q => { const body = { name: q('#k-name').value.trim(), kind: q('#k-kind').value, color: q('#k-color').value }; if (!body.name) throw new Error('Informe o nome.'); if (c) await api.put(`/categories/${c.id}`, body, { silent: true }); else await api.post('/categories', body, { silent: true }); toast('Categoria salva', 'success'); },
        onDelete: c ? async () => { if (!(await confirmDialog('Excluir esta categoria? Só é possível se não houver lançamentos nela.', { ok: 'Excluir', danger: true }))) throw new Error(''); await api.del(`/categories/${c.id}`, null, { silent: true }); toast('Categoria excluída', 'success'); } : null });
  }
  function editRule(r) {
    form(r ? 'Editar regra' : 'Nova regra', `<div class="row">${field('r-pat', 'Se a descrição contém', `<input id="r-pat" value="${esc(r?.pattern || '')}" placeholder="ifood, uber, posto…">`)}${field('r-cat', 'Categoria', `<select id="r-cat">${state.categories.map(c => `<option value="${c.id}" ${c.id === r?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}${field('r-pri', 'Prioridade', `<input id="r-pri" type="number" value="${r?.priority ?? 0}">`, 'Maior vence quando duas regras casam.')}</div>`,
      { onSave: async q => { const body = { pattern: q('#r-pat').value.trim(), category_id: q('#r-cat').value, priority: +q('#r-pri').value || 0 }; if (!body.pattern) throw new Error('Informe o texto.'); if (r) await api.put(`/rules/${r.id}`, body, { silent: true }); else await api.post('/rules', body, { silent: true }); toast('Regra salva', 'success'); },
        onDelete: r ? async () => { await api.del(`/rules/${r.id}`); toast('Regra excluída', 'success'); } : null });
  }
  function editRecurrence(r) {
    const sources = [...state.accounts.filter(a => !a.archived).map(a => ({ v: `acc:${a.id}`, l: a.name })), ...state.cards.filter(c => !c.archived).map(c => ({ v: `card:${c.id}`, l: c.name + ' (cartão)' }))];
    const cur = r?.card_id ? `card:${r.card_id}` : r?.account_id ? `acc:${r.account_id}` : sources[0]?.v;
    form(r ? 'Editar recorrência' : 'Nova recorrência', `<div class="row">${field('e-desc', 'Descrição', `<input id="e-desc" value="${esc(r?.description || '')}" placeholder="Aluguel, Netflix, Salário…">`)}${field('e-kind', 'Tipo', `<select id="e-kind"><option value="expense" ${r?.kind !== 'income' ? 'selected' : ''}>Gasto</option><option value="income" ${r?.kind === 'income' ? 'selected' : ''}>Receita</option></select>`)}</div>
      <div class="row">${field('e-amount', 'Valor', `<div class="amount-input"><input id="e-amount" inputmode="decimal" value="${r ? centsToInput(r.amount) : ''}" style="font-size:15px;min-height:38px;padding-left:36px"></div>`)}${field('e-cat', 'Categoria', `<select id="e-cat">${state.categories.map(c => `<option value="${c.id}" ${c.id === r?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}${field('e-src', 'Conta / cartão', `<select id="e-src">${sources.map(s => `<option value="${s.v}" ${s.v === cur ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}</select>`)}</div>
      <div class="row">${field('e-freq', 'Frequência', `<select id="e-freq"><option value="monthly" ${r?.frequency !== 'yearly' && r?.frequency !== 'weekly' ? 'selected' : ''}>Mensal</option><option value="yearly" ${r?.frequency === 'yearly' ? 'selected' : ''}>Anual</option><option value="weekly" ${r?.frequency === 'weekly' ? 'selected' : ''}>Semanal</option></select>`)}${field('e-day', 'Dia', `<input id="e-day" type="number" min="0" max="31" value="${r?.day ?? 1}">`, 'Dia do mês (mensal/anual) ou da semana (0 = segunda).')}${field('e-start', 'Início', `<input id="e-start" type="date" value="${r?.start_date || todayISO()}">`)}${field('e-end', 'Fim (opcional)', `<input id="e-end" type="date" value="${r?.end_date || ''}">`)}</div>
      ${r ? `<label class="check"><input type="checkbox" id="e-active" ${r.active ? 'checked' : ''}> Ativa</label>` : ''}`,
      { onSave: async q => { const [sk, sid] = q('#e-src').value.split(':'); const body = { description: q('#e-desc').value.trim(), kind: q('#e-kind').value, amount: parseMoneyInput(q('#e-amount').value), category_id: q('#e-cat').value, account_id: sk === 'acc' ? sid : null, card_id: sk === 'card' ? sid : null, frequency: q('#e-freq').value, day: +q('#e-day').value, start_date: q('#e-start').value, end_date: q('#e-end').value || null, active: q('#e-active') ? q('#e-active').checked : true }; if (!body.description) throw new Error('Informe a descrição.'); if (!(body.amount > 0)) throw new Error('Informe o valor.'); if (r) await api.put(`/recurrences/${r.id}`, body, { silent: true }); else await api.post('/recurrences', body, { silent: true }); toast('Recorrência salva', 'success'); },
        onDelete: r ? async () => { if (!(await confirmDialog('Excluir a recorrência? Os lançamentos previstos ainda não confirmados serão removidos; os efetivados ficam.', { ok: 'Excluir', danger: true }))) throw new Error(''); await api.del(`/recurrences/${r.id}`); toast('Recorrência excluída', 'success'); } : null });
  }
  renderTabs();
  await load();
  return { refresh: load, update(p) { if (p.tab) { tab = p.tab; renderTabs(); load(); } }, destroy() {} };
}
