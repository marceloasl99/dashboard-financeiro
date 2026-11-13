// FIRE (Financial Independence, Retire Early) Simulator & Freedom Planner
import { api } from '../api.js';
import { make, moneyAxis, plainAxis } from '../charts.js';
import { icon } from '../components/icons.js';
import { centsToInput, esc, money, parseMoneyInput } from '../format.js';
import { state } from '../state.js';

export async function render(view, tools) {
  const [dash, invs, accounts] = await Promise.all([
    api.get('/dashboard', { year: state.year, month: state.month }),
    api.get('/investments'),
    api.get('/accounts'),
  ]);

  // Current liquid net worth: accounts (non-FGTS) + active investments
  const totalAccountBalance = (dash.accounts || [])
    .filter(a => a.type !== 'fgts')
    .reduce((s, a) => s + (a.balance || 0), 0);
  
  const totalInvestments = (invs || [])
    .filter(i => i.status === 'active')
    .reduce((s, i) => s + (i.current_value || 0), 0);

  const initialNetWorth = Math.max(0, totalAccountBalance + totalInvestments);
  const monthlyExpenseEstimate = Math.max(200000, dash.kpis?.expense || 500000); // centavos
  const monthlySavingsEstimate = Math.max(50000, dash.kpis?.balance > 0 ? dash.kpis.balance : 150000);

  tools.innerHTML = `
    <button class="btn primary small" id="btnRecalc" type="button">${icon('refresh', 14)} Recalcular</button>
  `;

  view.innerHTML = `
    <section class="fire-hero">
      <div>
        <div class="fire-badge">${icon('fire', 14)} Planejador de Liberdade Financeira (FIRE)</div>
        <h2 style="font-size:20px;margin-bottom:6px">Seu caminho até a Independência Financeira</h2>
        <p style="color:var(--ink-2);max-width:580px;font-size:13.5px;line-height:1.4">
          Descubra quando seus rendimentos passivos cobrirão 100% do seu custo de vida, utilizando a clássica <b>Regra dos 4%</b> e o poder dos juros compostos.
        </p>
      </div>
      <div style="text-align:right">
        <div style="font-size:12.5px;color:var(--ink-3);font-weight:500;margin-bottom:2px">Número Mágico FIRE</div>
        <div class="fire-big-number money" id="fireTargetText">—</div>
        <div style="font-size:12px;color:var(--pos);font-weight:600;margin-top:4px" id="fireYearsText">—</div>
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="head">
          <div>
            <h2>Parâmetros da simulação</h2>
            <p class="sub">Ajuste os valores para ver a projeção em tempo real</p>
          </div>
        </div>
        <div class="body fire-grid-inputs">
          <div class="field">
            <label for="f-networth">Patrimônio atual investido</label>
            <input type="text" id="f-networth" value="${centsToInput(initialNetWorth)}">
            <span class="hint">Saldo em contas líquidas + investimentos</span>
          </div>

          <div class="field">
            <label for="f-monthly-save">Aporte mensal médio</label>
            <input type="text" id="f-monthly-save" value="${centsToInput(monthlySavingsEstimate)}">
            <span class="hint">Quanto você consegue guardar por mês</span>
          </div>

          <div class="field">
            <label for="f-target-expense">Custo de vida mensal desejado</label>
            <input type="text" id="f-target-expense" value="${centsToInput(monthlyExpenseEstimate)}">
            <span class="hint">Renda mensal para viver de renda</span>
          </div>

          <div class="field">
            <label for="f-real-rate">Rentabilidade real (% a.a.)</label>
            <input type="number" id="f-real-rate" min="1" max="25" step="0.5" value="6.0">
            <span class="hint">Retorno líquido anual acima da inflação</span>
          </div>

          <div class="field">
            <label for="f-swr">Taxa de retirada segura (SWR %)</label>
            <input type="number" id="f-swr" min="2" max="8" step="0.5" value="4.0">
            <span class="hint">Tradicionalmente 4% (Regra dos 25 anos)</span>
          </div>

          <div class="field">
            <label for="f-current-age">Idade atual (anos)</label>
            <input type="number" id="f-current-age" min="16" max="90" value="30">
            <span class="hint">Para projetar a sua idade na conquista</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="head">
          <div>
            <h2>Diagnóstico FIRE</h2>
            <p class="sub">Resumo das métricas para a sua liberdade</p>
          </div>
        </div>
        <div class="body">
          <div class="list" style="margin-bottom:14px">
            <div class="item">
              <div>
                <div class="t">Renda passiva gerada na meta</div>
                <div class="s">Retirada mensal sustentável sem consumir o principal</div>
              </div>
              <div class="v money pos" id="diagPassiveIncome">—</div>
            </div>
            <div class="item">
              <div>
                <div class="t">Idade estimada de conquista</div>
                <div class="s">Quando você poderá escolher não trabalhar por dinheiro</div>
              </div>
              <div class="v" id="diagAge">—</div>
            </div>
            <div class="item">
              <div>
                <div class="t">Progresso atual da meta FIRE</div>
                <div class="s">Parcela do patrimônio necessário já acumulada</div>
              </div>
              <div class="v" id="diagProgress">—</div>
            </div>
          </div>
          <div class="bar" style="height:12px;border-radius:6px">
            <span id="fireProgressBar" style="width:0%;background:var(--pos)"></span>
          </div>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="head">
        <div>
          <h2>Curva de acumulação patrimonial até o FIRE</h2>
          <p class="sub">Evolução do patrimônio investido (juros compostos + aportes) vs Meta de Aposentadoria</p>
        </div>
      </div>
      <div class="body">
        <div class="chart tall"><canvas id="fireChart"></canvas></div>
      </div>
    </section>
  `;

  let chart = null;

  function calculate() {
    const netWorth = parseMoneyInput(view.querySelector('#f-networth').value) || 0;
    const monthlySave = parseMoneyInput(view.querySelector('#f-monthly-save').value) || 0;
    const targetMonthlyExpense = parseMoneyInput(view.querySelector('#f-target-expense').value) || 100000;
    const annualRate = (parseFloat(view.querySelector('#f-real-rate').value) || 6.0) / 100;
    const swr = (parseFloat(view.querySelector('#f-swr').value) || 4.0) / 100;
    const currentAge = parseInt(view.querySelector('#f-current-age').value, 10) || 30;

    // Target FIRE capital = Annual expenses / SWR
    const annualExpense = targetMonthlyExpense * 12;
    const fireTarget = Math.round(annualExpense / swr);

    view.querySelector('#fireTargetText').textContent = money(fireTarget);
    view.querySelector('#diagPassiveIncome').textContent = `${money(targetMonthlyExpense)} / mês`;

    const progressPct = fireTarget > 0 ? Math.min(100, Math.round((netWorth / fireTarget) * 1000) / 10) : 0;
    view.querySelector('#diagProgress').textContent = `${progressPct}% concluído`;
    view.querySelector('#fireProgressBar').style.width = `${progressPct}%`;

    // Monthly compounding simulation
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
    let balance = netWorth;
    let months = 0;
    const maxMonths = 50 * 12; // 50 years max

    const yearsData = [{ year: 0, age: currentAge, balance: Math.round(balance / 100), target: Math.round(fireTarget / 100) }];

    while (balance < fireTarget && months < maxMonths) {
      months++;
      balance = balance * (1 + monthlyRate) + monthlySave;
      if (months % 12 === 0) {
        const yr = months / 12;
        yearsData.push({
          year: yr,
          age: currentAge + yr,
          balance: Math.round(balance / 100),
          target: Math.round(fireTarget / 100),
        });
      }
    }

    // Continue for 5 more years after target for chart visual context
    const extraMonths = Math.min(60, maxMonths - months);
    for (let i = 1; i <= extraMonths; i++) {
      balance = balance * (1 + monthlyRate) + monthlySave;
      if (i % 12 === 0) {
        const yr = (months + i) / 12;
        yearsData.push({
          year: yr,
          age: currentAge + yr,
          balance: Math.round(balance / 100),
          target: Math.round(fireTarget / 100),
        });
      }
    }

    const fireYears = Math.floor(months / 12);
    const fireRemainingMonths = months % 12;

    if (months >= maxMonths) {
      view.querySelector('#fireYearsText').textContent = 'Meta além de 50 anos com os aportes atuais';
      view.querySelector('#diagAge').textContent = '> 80 anos';
    } else if (months === 0) {
      view.querySelector('#fireYearsText').textContent = '🎉 Meta FIRE já alcançada!';
      view.querySelector('#diagAge').textContent = `${currentAge} anos (Hoje!)`;
    } else {
      const timeStr = `${fireYears} ano(s) ${fireRemainingMonths > 0 ? `e ${fireRemainingMonths} mês(es)` : ''}`;
      view.querySelector('#fireYearsText').textContent = `Liberdade em ~${timeStr} (${new Date().getFullYear() + fireYears})`;
      view.querySelector('#diagAge').textContent = `${currentAge + fireYears} anos`;
    }

    renderChart(yearsData);
  }

  function renderChart(series) {
    chart?.destroy?.();
    const ctx = view.querySelector('#fireChart').getContext('2d');
    chart = make(ctx, {
      type: 'line',
      data: {
        labels: series.map(d => `${d.age} anos`),
        datasets: [
          {
            label: 'Patrimônio Projetado',
            data: series.map(d => d.balance),
            borderColor: '#1F7A5E',
            backgroundColor: 'rgba(31,122,94,0.12)',
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: 3,
          },
          {
            label: 'Meta FIRE (Liberdade)',
            data: series.map(d => d.target),
            borderColor: '#E28743',
            borderDash: [6, 6],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'IBM Plex Sans' } } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: R$ ${ctx.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          x: plainAxis(),
          y: moneyAxis(),
        },
      },
    });
  }

  view.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => calculate());
  });

  tools.querySelector('#btnRecalc').onclick = () => calculate();

  calculate();

  return {
    destroy() { chart?.destroy?.(); },
  };
}
