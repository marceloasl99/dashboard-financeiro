# Finance OS v2 — Spec de design

Data: 2026-10-29
Status: aprovado em conversa, aguardando revisão do texto

## 1. Objetivo

Controle financeiro pessoal completo, sem planilha. Roda em um servidor Linux
(Ubuntu + nginx + systemd), acessado pelo navegador em celular e computador.
Beta: um usuário, sem login, dados em um arquivo JSON no servidor que carrega
sozinho. Fase 2 (fora deste spec): login com usuário e senha e SQLite/MariaDB
com dados separados por usuário.

Foco: gastos mensais e anuais, cartões de crédito com fatura e parcelas,
compras, impostos, assinaturas e mensalidades, salário, FGTS, investimentos.
Patrimônio de bens (imóveis, veículos) e dívidas de financiamento ficam fora.

Critérios de sucesso:
- Lançar um gasto em menos de dez segundos pelo celular.
- Ver, por mês, para onde o dinheiro foi, por categoria, com gráficos.
- Saber a fatura de cada cartão e quando vence, com parcelas corretas.
- Saber se o saldo vai ficar negativo nos próximos 90 dias.
- Importar extrato do banco ou do cartão (CSV, XLSX, OFX, PDF) com revisão.
- Instalar no Ubuntu em cinco comandos.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Backend | Python 3.11+, FastAPI, uvicorn |
| Frontend | HTML, CSS e JavaScript puro (módulos ES), sem build; Chart.js |
| Armazenamento beta | `data/finance.json`, gravação atômica, trava, backup diário |
| Interface de dados | `Repository` abstrata; `JsonRepository` agora, `SqliteRepository` depois |
| Entrada de dados | Formulário estruturado. Sem linguagem natural |
| Importação | CSV, XLSX, OFX e PDF, sempre com pré-visualização e confirmação |
| Cotações | Extra opcional, desligado por padrão, com aviso de valor aproximado |
| v1 | Movida para `legacy/v1/`, tag git `v1`. A v2 ocupa a raiz |
| Deploy | Sem Docker. `deploy/install.sh`, `finance.service`, `nginx.conf` |

## 3. Estrutura do repositório

```
dashboard-financeiro/
├── server/
│   ├── main.py            # app FastAPI, monta rotas e estáticos
│   ├── models.py          # modelos Pydantic
│   ├── storage/
│   │   ├── base.py        # Repository (interface)
│   │   └── json_repo.py   # JsonRepository
│   ├── services/
│   │   ├── statements.py  # faturas de cartão
│   │   ├── installments.py
│   │   ├── recurrences.py
│   │   ├── forecast.py    # projeção de saldo
│   │   ├── dashboard.py   # agregações para a tela principal
│   │   ├── reports.py
│   │   ├── categorizer.py # regras de categorização
│   │   └── quotes.py      # cotações (opcional)
│   ├── importers/
│   │   ├── base.py        # ImportedRow, detecção de duplicados
│   │   ├── csv_importer.py
│   │   ├── xlsx_importer.py
│   │   ├── ofx_importer.py
│   │   └── pdf_importer.py
│   ├── routers/           # um arquivo por recurso da API
│   └── tests/
├── web/
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── css/app.css
│   └── js/
│       ├── app.js         # roteamento entre telas, estado global
│       ├── api.js         # fetch para /api
│       ├── format.js      # moeda, datas, percentuais pt-BR
│       ├── charts.js      # wrappers do Chart.js com a paleta
│       ├── components/    # modal de lançamento, tabela, seletor de período
│       └── pages/         # overview, transactions, cards, calendar, budget,
│                          # reports, investments, goals, import, settings
├── data/                  # finance.json e backups/ (no .gitignore)
├── deploy/
│   ├── install.sh
│   ├── finance.service
│   └── nginx.conf
├── scripts/demo_data.py
├── docs/
├── legacy/v1/index.html
├── requirements.txt
└── README.md
```

## 4. Modelo de dados

Arquivo `data/finance.json`, com `version` e uma coleção por entidade. Todo
item tem `id` (UUID), `created_at` e `updated_at` (ISO 8601). Valores
monetários em centavos inteiros (`int`), para evitar erro de ponto flutuante.
Datas em `YYYY-MM-DD`.

- **Account**: `name`, `type` (`checking`, `savings`, `wallet`, `fgts`),
  `initial_balance`, `color`, `archived`. Saldo atual é calculado:
  `initial_balance + receitas - despesas + transferências recebidas -
  transferências enviadas` (apenas lançamentos `settled`).
- **Card**: `name`, `brand`, `closing_day`, `due_day`, `limit`,
  `payment_account_id`, `color`, `archived`.
- **Category**: `name`, `kind` (`expense`, `income`), `icon`, `color`,
  `group` opcional. Conjunto inicial em português: Moradia, Contas (luz, água,
  internet), Alimentação, Transporte, Saúde, Assinaturas, Mensalidades,
  Impostos, Lazer, Compras, Educação, Cuidados pessoais, Pet, Outros;
  receitas: Salário, FGTS, Extra, Rendimentos, Outras receitas.
- **Transaction**: `date`, `amount` (positivo), `kind` (`expense`, `income`,
  `transfer`), `category_id`, `account_id` ou `card_id` (exatamente um, exceto
  transferência que tem `account_id` e `to_account_id`), `description`
  opcional, `tags` lista, `installment` opcional `{group_id, number, total}`,
  `recurrence_id` opcional, `import_id` opcional, `goal_id` opcional,
  `status` (`settled`, `planned`).
- **Recurrence**: modelo de lançamento (mesmos campos, sem data) +
  `frequency` (`monthly`, `yearly`, `weekly`), `day` (dia do mês ou da
  semana), `start_date`, `end_date` opcional, `active`. O serviço materializa
  ocorrências `planned` até 12 meses à frente, sem duplicar as já existentes
  (chave `recurrence_id + date`).
- **Budget**: `category_id`, `amount` mensal, `overrides` opcional
  `{ "2026-11": amount }`.
- **Goal**: `name`, `target`, `deadline` opcional, `color`. Progresso =
  soma dos lançamentos com `goal_id`.
- **Investment**: `asset`, `class`, `institution`, `quantity`, `cost`,
  `current_value`, `maturity` opcional, `liquidity`, `status` (`active`,
  `redeemed`, `matured`), `ticker` opcional (para cotação),
  `quote_source` opcional. **Contribution**: `investment_id`, `date`, `amount`.
  FGTS é um Investment de classe `FGTS`, alimentado por uma Recurrence de
  aporte.
- **CategoryRule**: `pattern` (texto, comparação sem acento e sem caixa),
  `category_id`, `priority`.
- **Settings**: `currency` (`BRL`), `theme` (`light`, `dark`, `auto`),
  `quotes_enabled`, `quotes_api_key`, `backup_keep_days` (30).

Regras:
1. Parcelas são N lançamentos, um por mês, ligados por `installment.group_id`.
   Editar ou excluir pergunta se aplica a uma ou a todas as parcelas restantes.
2. Transferência é um único lançamento. Não entra em receitas nem despesas.
3. Lançamento no cartão não altera saldo de conta. Entra na categoria no mês
   da compra (orçamento e relatórios) e no caixa na data de vencimento da
   fatura (projeção). Pagar a fatura cria uma transferência conta → cartão
   com `kind = transfer` e `card_id` como destino.
4. A fatura de um cartão com `closing_day = 25` contém os lançamentos de
   26 do mês anterior até 25 do mês. A fatura é nomeada pelo mês do
   vencimento. Se o dia não existe no mês (31 em abril), usa o último dia.
5. Exclusão de conta ou cartão com lançamentos é bloqueada; o item vai para
   `archived`.

## 5. API

Prefixo `/api`. JSON. Sem autenticação na beta. Erros no formato
`{ "error": "mensagem em português", "field": "nome_do_campo" | null }` com
status HTTP adequado (400 validação, 404 não encontrado, 409 conflito).

CRUD (`GET` lista com filtros, `POST`, `PUT /{id}`, `DELETE /{id}`):
`accounts`, `cards`, `categories`, `transactions`, `recurrences`, `budgets`,
`goals`, `investments`, `contributions`, `rules`, `settings` (só GET e PUT).

Filtros de `GET /api/transactions`: `from`, `to`, `account_id`, `card_id`,
`category_id`, `kind`, `status`, `q` (texto), `page`, `page_size`.

Rotas de negócio:
- `GET /api/dashboard?year&month` → KPIs do mês (receitas, despesas, saldo,
  taxa de poupança, variação sobre o mês anterior), despesas por categoria,
  fluxo dos 12 meses do ano, saldo por conta, faturas abertas por cartão,
  alertas (orçamento acima de 100%, fatura vencendo em 7 dias, saldo
  projetado negativo, recorrências pendentes de confirmação).
- `GET /api/cards/{id}/statements?from&to` → faturas calculadas: período,
  vencimento, total, status (`open`, `closed`, `paid`), lançamentos.
- `POST /api/cards/{id}/statements/{YYYY-MM}/pay` body `{account_id, amount,
  date}` → cria a transferência de pagamento.
- `GET /api/forecast?days=90` → série diária `{date, balance}` somando todas
  as contas não arquivadas, considerando lançamentos `planned`, recorrências
  e vencimentos de fatura; devolve `first_negative_date` ou `null`.
- `GET /api/calendar?year&month` → eventos: vencimento e fechamento de
  cartões, recorrências, lançamentos previstos, prazos de metas, vencimentos
  de investimentos.
- `POST /api/transactions/installments` body `{...lançamento, total}` → cria
  as N parcelas.
- `POST /api/recurrences/{id}/confirm` body `{date, amount}` → marca a
  ocorrência como `settled` com o valor informado.
- `GET /api/reports/annual?year` → por categoria, por mês, totais.
- `GET /api/reports/compare?year_a&year_b` → variação por categoria.
- `GET /api/reports/category/{id}?months=24` → série mensal da categoria.
- `POST /api/import/preview` (multipart: arquivo, `account_id` ou `card_id`)
  → `{import_id, rows: [{date, amount, description, suggested_category_id,
  duplicate_of, include}]}`.
- `POST /api/import/commit` body `{import_id, rows}` → grava os aprovados.
- `POST /api/quotes/refresh` → atualiza `current_value` dos investimentos com
  `ticker`; responde com os que falharam. Só se `quotes_enabled`.
- `GET /api/export.json`, `GET /api/export.csv`,
  `POST /api/import/backup` (substitui o arquivo inteiro, após backup).
- `GET /api/health`.

## 6. Serviços

- **statements**: dado um cartão e um intervalo, agrupa lançamentos por
  período de fechamento; determina status pelo pagamento registrado.
- **installments**: gera N lançamentos a partir de um lançamento base;
  divide centavos sem perder nem sobrar (resto vai na primeira parcela).
- **recurrences**: `materialize(until)` cria ocorrências `planned`
  faltantes; `confirm(id, date, amount)`.
- **forecast**: saldo atual das contas + eventos futuros ordenados por data.
- **categorizer**: aplica `CategoryRule` por prioridade; se nenhuma casa,
  sugere pela descrição mais parecida no histórico (comparação simples por
  tokens), senão `null`.
- **importers**: cada um devolve `list[ImportedRow]` (`date`, `amount`,
  `description`, `raw`). CSV detecta separador e colunas por cabeçalho
  (data, descrição/histórico, valor ou débito/crédito). XLSX via `openpyxl`,
  mesma detecção. OFX via parser próprio (formato SGML simples), sem
  dependência. PDF via `pdfplumber`: extrai texto, encontra linhas com
  padrão `data ... valor`, trata sinais e `D`/`C`. Duplicado = mesmo valor e
  data e descrição parecida já existente, ou mesmo `fitid` do OFX.
- **quotes**: brapi.dev para ações, FIIs e ETFs brasileiros; CoinGecko para
  cripto. Tempo limite de 10 s, falha isolada por ativo.
- **backup**: ao iniciar e a cada escrita, se não há backup do dia, copia
  `finance.json` para `backups/finance-YYYY-MM-DD.json`; apaga os mais
  antigos que `backup_keep_days`.

## 7. Frontend

Sem build. `web/index.html` carrega `app.js` como módulo. Estado global
simples (`state.js`): período selecionado, cache do `dashboard`, listas de
contas, cartões e categorias. Cada página exporta `render(container)` e
`destroy()`. Gráficos sempre destruídos antes de recriar.

Navegação: lateral fixa no desktop, barra inferior com cinco itens no
celular (Visão geral, Lançamentos, Cartões, Mais, +Lançar). PWA com
`manifest.webmanifest` e ícone; sem service worker na beta (o servidor é
local, não há offline).

Telas:
1. **Visão geral**: seletor mês/ano; KPIs; rosca por categoria; barras do
   fluxo mensal com linha de saldo; saldos por conta; faturas abertas;
   alertas.
2. **Lançamentos**: filtros; tabela com edição em modal; exclusão; confirmar
   previstos; agrupar por dia.
3. **Cartões**: card por cartão (fatura atual, limite usado, fechamento,
   vencimento); lista de faturas; detalhe com lançamentos; botão pagar.
4. **Calendário e projeção**: grade mensal com eventos; linha de 90 dias.
5. **Orçamento**: barra por categoria, realizado × limite, acumulado anual.
6. **Relatórios**: anual, comparativo, evolução de categoria, exportar CSV.
7. **Investimentos**: KPIs, alocação, evolução, vencimentos, tabela,
   botão de cotações quando habilitado.
8. **Metas**: progresso, prazo, valor mensal necessário.
9. **Importar**: arrastar arquivo, escolher conta/cartão, pré-visualização
   editável, confirmar.
10. **Configurações**: contas, cartões, categorias, regras, recorrências,
    backup e restauração, tema, cotações.

Formulário de lançamento (modal, usado em qualquer tela): tipo (três botões),
valor (campo numérico grande), data (hoje), categoria (grade de ícones),
conta ou cartão (lista), descrição opcional, parcelas (só cartão), repetir
mensalmente (cria recorrência), meta (opcional). Validação inline.

Visual: paleta da v1 (azul-petróleo `#1B3A4B`, areia `#EDE6D6`, verde
`#24735B`, vermelho `#A2483E`, âmbar `#9A6A1D`) com tema escuro; números
tabulares; cores de categoria vindas do dado e usadas em todos os gráficos;
acessível (labels ligados, contraste AA, foco visível).

## 8. Deploy

- `requirements.txt`: fastapi, uvicorn[standard], pydantic, python-multipart,
  openpyxl, pdfplumber, httpx (cotações).
- `deploy/install.sh`: cria usuário `finance`, `venv` em `/opt/finance-os`,
  instala dependências, cria `data/`, instala `finance.service` (uvicorn em
  `127.0.0.1:8000`, `Restart=always`), instala `nginx.conf` (proxy `/api` e
  estáticos de `web/` com cache; comentários para certbot), recarrega.
- README com: requisitos, instalação em cinco comandos, atualização,
  backup, uso local no Windows para desenvolvimento.

## 9. Testes

`pytest` em `server/tests/`:
- `test_statements.py`: fechamento 25, lançamento 26 vai para a próxima;
  meses curtos; status paga.
- `test_installments.py`: 12x de R$ 100,01 soma exata; datas mês a mês.
- `test_recurrences.py`: materializa sem duplicar; confirma com valor
  ajustado; fim de recorrência.
- `test_forecast.py`: primeiro dia negativo; inclui fatura.
- `test_categorizer.py`: regra, histórico, nenhum.
- `test_importers.py`: um arquivo de exemplo por formato em `tests/fixtures`.
- `test_api.py`: CRUD, validações, dashboard com dados demo, import preview e
  commit, export e restore.
- `test_json_repo.py`: gravação atômica, backup diário, arquivo inexistente.

Fluxo de desenvolvimento: TDD (teste antes de cada regra). Verificação
visual com o navegador headless (screenshots) antes de publicar.

## 10. Dados de demonstração

`scripts/demo_data.py --out data/finance.json`: 14 meses, 2 contas (corrente
e poupança) + FGTS, 2 cartões, salário com FGTS mensal, aluguel, condomínio,
luz e água variáveis, internet, 4 assinaturas, 1 mensalidade, IPVA e IPTU
anuais, compras parceladas, supermercado e restaurantes semanais, transporte,
saúde eventual, 1 viagem, 3 investimentos com aportes, 2 metas, 6 regras de
categorização e um orçamento. Valores em reais plausíveis, sem dados reais.

## 11. Fora do escopo desta versão

Login e múltiplos usuários; SQLite/MariaDB; patrimônio de bens e dívidas;
offline; sincronização com bancos por API; notificações push.
