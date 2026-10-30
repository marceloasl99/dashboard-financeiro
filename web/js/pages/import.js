// Import: drop a statement (CSV/XLSX/OFX/PDF), review rows, confirm.
import { api } from '../api.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { dateBR, esc, money } from '../format.js';
import { activeAccounts, activeCards, emit, expenseCategories, incomeCategories } from '../state.js';

export async function render(view) {
  view.innerHTML = `
    <section class="card"><div class="body" style="display:grid;gap:14px">
      <div class="row" style="grid-template-columns:1fr 2fr;align-items:end">
        <div class="field"><label for="imp-target">Lançar em</label><select id="imp-target">
          <optgroup label="Contas">${activeAccounts().map(a => `<option value="acc:${a.id}">${esc(a.name)}</option>`).join('')}</optgroup>
          <optgroup label="Cartões (fatura)">${activeCards().map(c => `<option value="card:${c.id}">${esc(c.name)}</option>`).join('')}</optgroup></select></div>
        <label class="drop" id="drop">${icon('upload', 22)}<div style="margin-top:6px"><b>Arraste o extrato aqui</b> ou clique para escolher</div><div style="font-size:12px;color:var(--ink-3);margin-top:2px">CSV, XLSX, OFX ou PDF do banco ou do cartão</div><input id="file" type="file" accept=".csv,.txt,.xlsx,.xlsm,.ofx,.qfx,.pdf"></label>
      </div>
      <div id="status" style="font-size:12.5px;color:var(--ink-3)">Nada entra nos seus dados antes de você revisar e confirmar.</div>
    </div></section>
    <section class="card" id="preview" hidden></section>`;
  const drop = view.querySelector('#drop'), file = view.querySelector('#file');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); });
  file.onchange = () => { if (file.files[0]) upload(file.files[0]); file.value = ''; };

  let preview = null;
  async function upload(f) {
    const [kind, id] = view.querySelector('#imp-target').value.split(':');
    const fd = new FormData();
    fd.append('file', f);
    fd.append(kind === 'acc' ? 'account_id' : 'card_id', id);
    view.querySelector('#status').textContent = `Lendo ${f.name}…`;
    try {
      preview = await api.upload('/import/preview', fd, { silent: true });
      preview.isCard = kind === 'card';
      view.querySelector('#status').textContent = `${preview.rows.length} linha(s) encontradas em ${f.name}${preview.duplicates ? `, ${preview.duplicates} já existente(s) desmarcada(s)` : ''}.`;
      renderPreview();
    } catch (e) { view.querySelector('#status').innerHTML = `<span style="color:var(--neg)">${esc(e.message)}</span>`; }
  }

  function renderPreview() {
    const box = view.querySelector('#preview');
    box.hidden = false;
    const cats = kind => (kind === 'income' ? incomeCategories() : expenseCategories());
    box.innerHTML = `<div class="head" style="align-items:center"><div><h2>Revisar antes de importar</h2><p class="sub">Ajuste categoria e tipo; desmarque o que não deve entrar. Linhas em cinza já existem.</p></div>
      <div class="inline"><label class="check"><input type="checkbox" id="all" checked> todas</label><button class="btn primary" id="commit" type="button">${icon('check', 14)} Importar selecionadas</button></div></div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th class="num">Valor</th></tr></thead><tbody>
      ${preview.rows.map(r => `<tr class="${r.duplicate_of ? 'planned' : ''}" data-i="${r.index}">
        <td><input type="checkbox" class="inc" ${r.include ? 'checked' : ''} aria-label="Incluir"></td>
        <td style="white-space:nowrap">${dateBR(r.date)}</td>
        <td><input class="desc" value="${esc(r.description)}" style="min-width:200px;min-height:32px;padding:5px 8px">${r.duplicate_of ? '<div style="font-size:11px;color:var(--ink-3)">já existe um lançamento igual</div>' : ''}</td>
        <td><select class="kind" style="min-height:32px;padding:5px 8px;width:auto"><option value="expense" ${r.kind === 'expense' ? 'selected' : ''}>Gasto</option><option value="income" ${r.kind === 'income' ? 'selected' : ''}>Receita</option></select></td>
        <td><select class="cat" style="min-height:32px;padding:5px 8px;min-width:150px"><option value="">Sem categoria</option>${cats(r.kind).map(c => `<option value="${c.id}" ${c.id === r.suggested_category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></td>
        <td class="num money ${r.kind === 'income' ? 'pos' : 'neg'}">${money(r.amount)}</td></tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('.kind').forEach(sel => sel.onchange = () => {
      const tr = sel.closest('tr'), cat = tr.querySelector('.cat');
      cat.innerHTML = `<option value="">Sem categoria</option>` + cats(sel.value).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      tr.querySelector('.num').className = `num money ${sel.value === 'income' ? 'pos' : 'neg'}`;
    });
    box.querySelector('#all').onchange = e => box.querySelectorAll('.inc').forEach(c => c.checked = e.target.checked);
    box.querySelector('#commit').onclick = async () => {
      const rows = [...box.querySelectorAll('tr[data-i]')].map(tr => ({ index: +tr.dataset.i, include: tr.querySelector('.inc').checked, category_id: tr.querySelector('.cat').value || null, kind: tr.querySelector('.kind').value, description: tr.querySelector('.desc').value }));
      const n = rows.filter(r => r.include).length;
      if (!n) return toast('Nenhuma linha selecionada.', 'error');
      box.querySelector('#commit').disabled = true;
      try {
        const r = await api.post('/import/commit', { import_id: preview.import_id, rows });
        toast(`${r.created} lançamento(s) importado(s)`, 'success');
        box.hidden = true; preview = null;
        view.querySelector('#status').textContent = 'Importação concluída. Veja em Lançamentos.';
        emit('data-changed');
      } finally { box.querySelector('#commit').disabled = false; }
    };
  }
  return { refresh() {}, destroy() {} };
}
