// Investments: portfolio KPIs, allocation, contributions vs value, maturities, positions, quotes.
import { api } from '../api.js';
import { donut, make, moneyAxis, plainAxis, theme } from '../charts.js';
import { icon } from '../components/icons.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { centsToInput, dateBR, daysBetween, esc, money, monthKey, monthLabel, parseMoneyInput, pct, todayISO } from '../format.js';
import { state } from '../state.js';

const CLASSES = ['Renda fixa', 'Tesouro Direto', 'ETF', 'Ações', 'FIIs', 'Fundo de investimento', 'Criptoativos', 'Previdência', 'FGTS', 'Caixa', 'Outros'];
const CLASS_COLORS = { 'Renda fixa': '#2a78d6', 'Tesouro Direto': '#1baf7a', ETF: '#eb6834', 'Ações': '#e34948', FIIs: '#eda100', 'Fundo de investimento': '#6250d6', Criptoativos: '#e87ba4', 'Previdência': '#008300', FGTS: '#5c6b73', Caixa: '#898781', Outros: '#7b6f5e' };

export async function render(view, tools) {
  tools.innerHTML = `${state.settings.quotes_enabled ? `<button class="btn" id="quotes" type="button">${icon('refresh', 15)} Atualizar cotações</button>` : ''}<button class="btn primary" id="newInv" type="button">${icon('plus', 15)} Posição</button>`;
  view.innerHTML = `
    <section class="card ruler" id="kpis"></section>
    <div class="grid-2">
      <section class="card"><div class="head"><div><h2>Aportes acumulados × valor atual</h2><p class="sub">Linha pontilhada: quanto você colocou. Linha cheia: quanto vale hoje.</p></div></div><div class="body"><div class="chart"><canvas id="evo"></canvas></div></div></section>
      <section class="card"><div class="head"><div><h2>Alocação por classe</h2><p class="sub">Posições ativas</p></div></div><div class="body"><div class="chart" style="height:220px"><canvas id="alloc"></canvas></div><div id="allocList" class="list" style="margin-top:6px"></div></div></section>
    </div>
    <div class="grid-2" style="grid-template-columns:1fr 1.4fr">
      <section class="card"><div class="head"><div><h2>Vencimentos e liquidez</h2><p class="sub">Quando o dinheiro fica disponível</p></div></div><div id="maturity" class="list body tight"></div></section>
      <section class="card"><div class="head"><div><h2>Posições</h2><p class="sub" id="posSub"></p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Ativo</th><th class="hide-sm">Classe</th><th class="num">Custo</th><th class="num">Valor</th><th class="num">Resultado</th></tr></thead><tbody id="pos"></tbody></table></div></section>
    </div>
    <p style="font-size:12px;color:var(--ink-3)">Acompanhamento gerencial, sem recomendação de investimento. Valores atuais são informados por você${state.settings.quotes_enabled ? ' ou atualizados por cotação aproximada' : ''}.</p>`;

  let investments = [], contributions = [];
  async function load() {
    let dash;
    [investments, contributions, dash] = await Promise.all([api.get('/investments'), api.get('/contributions'), api.get('/dashboard')]);
    // FGTS accounts are shown as read-only positions (balance comes from their transactions)
    const fgts = dash.accounts.filter(a => a.type === 'fgts').map(a => ({ id: 'acc:' + a.id, asset: a.name, class: 'FGTS', institution: 'Saque-rescisão / aniversário', cost: a.balance, current_value: a.balance, status: 'active', liquidity: '', readonly: true }));
    investments = [...investments, ...fgts];
    const active = investments.filter(i => i.status === 'active');
    const value = active.reduce((s, i) => s + i.current_value, 0);
    const cost = active.reduce((s, i) => s + i.cost, 0);
    const ret = value - cost;
    const today = todayISO();
    const d90 = new Date(); d90.setDate(d90.getDate() + 90);
    const soon = active.filter(i => i.maturity && i.maturity >= today && new Date(i.maturity) <= d90);
    view.querySelector('#kpis').innerHTML = `<div><div class="lead">Patrimônio investido</div><div class="big">${money(value)}</div></div>
      <div class="stats"><div><div class="k">Custo total</div><div class="v">${money(cost)}</div></div><div><div class="k">Resultado</div><div class="v money ${ret >= 0 ? 'pos' : 'neg'}">${money(ret)}</div><span class="delta ${ret >= 0 ? 'good' : 'bad'}">${cost ? pct(ret / cost * 100) : '—'}</span></div><div><div class="k">Vence em 90 dias</div><div class="v">${money(soon.reduce((s, i) => s + i.current_value, 0))}</div><span class="delta flat">${soon.length} posição(ões)</span></div></div>`;

    // evolution: cumulative contributions by month vs value (value only known today -> last point)
    const byMonth = {};
    contributions.forEach(c => { byMonth[c.date.slice(0, 7)] = (byMonth[c.date.slice(0, 7)] || 0) + c.amount; });
    const keys = Object.keys(byMonth).sort();
    const nowKey = monthKey(+today.slice(0, 4), +today.slice(5, 7));
    if (keys.length && keys[keys.length - 1] < nowKey) keys.push(nowKey);
    let run = 0; const cum = keys.map(k => (run += byMonth[k] || 0));
    const t = theme();
    make(view.querySelector('#evo'), { type: 'line', data: { labels: keys.map(monthLabel), datasets: [
      { label: 'Aportado', data: cum, borderColor: '#898781', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, stepped: true },
      { label: 'Valor atual', data: cum.map((v, i) => i === cum.length - 1 ? value : null), borderColor: t.pos, backgroundColor: t.pos, pointRadius: 5, borderWidth: 2 }] },
      options: { scales: { x: plainAxis(), y: moneyAxis() }, plugins: { tooltip: { filter: i => i.raw != null } } } });

    const alloc = {};
    active.forEach(i => alloc[i.class] = (alloc[i.class] || 0) + i.current_value);
    const items = Object.entries(alloc).map(([label, v]) => ({ label, value: v, color: CLASS_COLORS[label] || '#898781' })).sort((a, b) => b.value - a.value);
    if (items.length) donut(view.querySelector('#alloc'), items);
    view.querySelector('#allocList').innerHTML = items.map(x => `<div class="item" style="padding:6px 0"><span class="dot" style="background:${x.color}"></span><div class="t">${esc(x.label)}</div><div class="v">${money(x.value)}<div class="s">${Math.round(x.value / value * 100)}%</div></div></div>`).join('');
    const concentration = items[0] ? Math.round(items[0].value / value * 100) : 0;
    if (concentration > 60) view.querySelector('#allocList').insertAdjacentHTML('beforeend', `<div class="alert warning" style="margin-top:8px">${icon('alert', 14)}<span>${concentration}% em ${esc(items[0].label)}: concentração alta em uma única classe.</span></div>`);

    const mats = active.filter(i => i.maturity).sort((a, b) => a.maturity.localeCompare(b.maturity));
    view.querySelector('#maturity').innerHTML = (mats.map(i => { const d = daysBetween(today, i.maturity); return `<div class="item"><span class="swatch" style="background:${d < 0 ? 'var(--neg)' : d <= 90 ? 'var(--warn)' : 'var(--ink-3)'};font-size:11px;line-height:1.1">${d < 0 ? 'venceu' : d === 0 ? 'hoje' : d + 'd'}</span><div><div class="t">${esc(i.asset)}</div><div class="s">${dateBR(i.maturity)} · ${esc(i.institution)}</div></div><div class="v">${money(i.current_value)}</div></div>`; }).join('')) +
      active.filter(i => !i.maturity).map(i => `<div class="item"><span class="swatch" style="background:var(--surface-2);color:var(--ink-2);font-size:11px">${/^D\+\d+$/i.test(i.liquidity || '') ? esc(i.liquidity.toUpperCase()) : icon('wallet', 16)}</span><div><div class="t">${esc(i.asset)}</div><div class="s">${i.liquidity ? 'liquidez ' + esc(i.liquidity) : 'sem vencimento'}</div></div><div class="v">${money(i.current_value)}</div></div>`).join('') || '<div class="empty">Nenhuma posição ativa.</div>';

    view.querySelector('#posSub').textContent = `${active.length} ativa(s)${investments.length - active.length ? `, ${investments.length - active.length} encerrada(s)` : ''} · clique para editar`;
    view.querySelector('#pos').innerHTML = investments.sort((a, b) => (a.status !== 'active') - (b.status !== 'active') || b.current_value - a.current_value).map(i => { const r = i.current_value - i.cost; return `<tr class="clickable ${i.status !== 'active' ? 'planned' : ''}" data-id="${i.id}"><td><div class="t">${esc(i.asset)}${i.ticker ? ` <span class="tag">${esc(i.ticker)}</span>` : ''}${i.status !== 'active' ? ` <span class="pill planned">${i.status === 'redeemed' ? 'resgatado' : 'vencido'}</span>` : ''}</div><div class="s" style="font-size:12px;color:var(--ink-3)">${esc(i.institution)}</div></td><td class="hide-sm"><span class="tag"><span class="dot" style="background:${CLASS_COLORS[i.class] || '#898781'}"></span>${esc(i.class)}</span></td><td class="num">${money(i.cost)}</td><td class="num"><b>${money(i.current_value)}</b></td><td class="num money ${r >= 0 ? 'pos' : 'neg'}">${money(r)}<div class="s" style="font-size:11px">${i.cost ? pct(r / i.cost * 100) : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="5"><div class="empty"><strong>Nenhum investimento.</strong>Cadastre a primeira posição.</div></td></tr>';
    view.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { const i = investments.find(x => x.id === tr.dataset.id); if (i.readonly) toast('O FGTS é uma conta: edite em Configurações › Contas.'); else editInvestment(i); });
  }

  function editInvestment(inv) {
    const content = document.createElement('div'); content.style.cssText = 'display:grid;gap:12px';
    const f = (id, label, html) => `<div class="field"><label for="${id}">${label}</label>${html}</div>`;
    content.innerHTML = `<div class="row">${f('i-asset', 'Ativo', `<input id="i-asset" value="${esc(inv?.asset || '')}" placeholder="Ex.: CDB Banco X, BOVA11">`)}${f('i-class', 'Classe', `<select id="i-class">${CLASSES.map(c => `<option ${c === (inv?.class || 'Renda fixa') ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}</div>
      <div class="row">${f('i-inst', 'Instituição', `<input id="i-inst" value="${esc(inv?.institution || '')}">`)}${f('i-qty', 'Quantidade', `<input id="i-qty" inputmode="decimal" value="${inv?.quantity ?? 1}">`)}</div>
      <div class="row">${f('i-cost', 'Custo total', `<div class="amount-input"><input id="i-cost" inputmode="decimal" value="${inv ? centsToInput(inv.cost) : ''}" style="font-size:15px;min-height:38px;padding-left:36px"></div>`)}${f('i-val', 'Valor atual', `<div class="amount-input"><input id="i-val" inputmode="decimal" value="${inv ? centsToInput(inv.current_value) : ''}" style="font-size:15px;min-height:38px;padding-left:36px"></div>`)}</div>
      <div class="row">${f('i-mat', 'Vencimento (opcional)', `<input id="i-mat" type="date" value="${inv?.maturity || ''}">`)}${f('i-liq', 'Liquidez', `<input id="i-liq" value="${esc(inv?.liquidity || '')}" placeholder="D+0, D+1, no vencimento…">`)}${f('i-status', 'Situação', `<select id="i-status"><option value="active" ${inv?.status === 'active' || !inv ? 'selected' : ''}>Ativo</option><option value="redeemed" ${inv?.status === 'redeemed' ? 'selected' : ''}>Resgatado</option><option value="matured" ${inv?.status === 'matured' ? 'selected' : ''}>Vencido</option></select>`)}</div>
      <div class="row">${f('i-ticker', 'Ticker para cotação (opcional)', `<input id="i-ticker" value="${esc(inv?.ticker || '')}" placeholder="BOVA11, PETR4, bitcoin">`)}${f('i-src', 'Fonte da cotação', `<select id="i-src"><option value="">Nenhuma</option><option value="brapi" ${inv?.quote_source === 'brapi' ? 'selected' : ''}>brapi (B3)</option><option value="coingecko" ${inv?.quote_source === 'coingecko' ? 'selected' : ''}>CoinGecko (cripto)</option></select>`)}</div>
      <div class="err" id="i-err"></div>`;
    const foot = document.createElement('div'); foot.style.display = 'contents';
    foot.innerHTML = `${inv ? '<button class="btn danger" id="i-del" type="button">Excluir</button>' : '<span></span>'}<div class="right"><button class="btn" data-close type="button">Cancelar</button><button class="btn primary" id="i-ok" type="button">Salvar</button></div>`;
    const m = openModal({ title: inv ? 'Editar posição' : 'Nova posição', content, footer: foot });
    foot.querySelector('[data-close]').onclick = () => m.close();
    foot.querySelector('#i-ok').onclick = async () => {
      const q = s => content.querySelector(s).value;
      const body = { asset: q('#i-asset').trim(), class: q('#i-class'), institution: q('#i-inst').trim(), quantity: Number(String(q('#i-qty')).replace(',', '.')) || 1,
        cost: parseMoneyInput(q('#i-cost')) || 0, current_value: parseMoneyInput(q('#i-val')) || 0, maturity: q('#i-mat') || null, liquidity: q('#i-liq').trim(),
        status: q('#i-status'), ticker: q('#i-ticker').trim() || null, quote_source: q('#i-src') || null };
      if (!body.asset) { content.querySelector('#i-err').textContent = 'Informe o nome do ativo.'; return; }
      try {
        if (inv) await api.put(`/investments/${inv.id}`, body, { silent: true }); else await api.post('/investments', body, { silent: true });
        toast('Posição salva', 'success'); m.close(); load();
      } catch (e) { content.querySelector('#i-err').textContent = e.message; }
    };
    foot.querySelector('#i-del')?.addEventListener('click', async () => { await api.del(`/investments/${inv.id}`); toast('Excluída', 'success'); m.close(); load(); });
  }

  tools.querySelector('#newInv').onclick = () => editInvestment(null);
  tools.querySelector('#quotes')?.addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await api.post('/quotes/refresh'); toast(`${r.updated.length} atualizada(s)${r.failed.length ? `, ${r.failed.length} sem cotação` : ''} — valores aproximados`, 'success', 5000); load(); }
    finally { e.target.disabled = false; }
  });
  await load();
  return { refresh: load, destroy() {} };
}
