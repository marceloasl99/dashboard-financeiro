# Finance OS v2 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Controle financeiro pessoal (contas, cartões, parcelas, recorrências, orçamento, metas, investimentos, importação de extratos) com backend FastAPI e front em JS puro, dados em JSON, instalável no Ubuntu com nginx.

**Architecture:** FastAPI serve a API em `/api` e os estáticos de `web/`. Regras de negócio em `server/services/` operam sobre modelos Pydantic carregados por um `JsonRepository` (arquivo único em memória, gravação atômica). O front é uma SPA sem build: `app.js` roteia entre páginas que renderizam a partir de `api.js`.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, Pydantic v2, openpyxl, pdfplumber, httpx, pytest; HTML/CSS/JS (módulos ES), Chart.js 4.

**Spec:** `docs/superpowers/specs/2026-10-29-finance-os-v2-design.md`

## Global Constraints

- Valores monetários sempre `int` em centavos; datas `YYYY-MM-DD` (strings) nos modelos e na API.
- `id` é UUID4 string; todo item tem `created_at` e `updated_at` ISO 8601.
- Textos de interface e mensagens de erro em português (pt-BR); código, identificadores e commits em inglês.
- Erros da API: `{"error": str, "field": str | null}`; 400 validação, 404 não encontrado, 409 conflito.
- Front sem build, sem framework; Chart.js 4.4.7 via CDN jsdelivr.
- `data/` no `.gitignore`. Nada de dados reais no repositório.
- Fatura nomeada pelo mês de vencimento; período = (fechamento anterior + 1 dia) até fechamento; dia inexistente no mês → último dia.
- Um lançamento tem `account_id` ou `card_id`, nunca os dois (transferência: `account_id` + `to_account_id` ou `to_card_id`).

## Review Focus

1. Lançamento em 29, 30 ou 31 de um mês com cartão de fechamento 31 em fevereiro: o período deve fechar em 28/29. Teste em Task 5.
2. Parcelas 12x de R$ 100,01 (10001 centavos): soma exata, resto na primeira. Teste em Task 6.
3. Recorrência mensal iniciada em 31/01: ocorrências em 28/02, 31/03. Teste em Task 7.
4. CSV com valores `1.234,56`, `-45,90`, `R$ 12,00` e colunas Débito/Crédito separadas. Teste em Task 10.
5. Dois processos gravando o JSON: nunca ficar com arquivo truncado. Teste em Task 2 (gravação atômica via `os.replace`).

---

### Task 1: Esqueleto do projeto e mover v1

**Files:**
- Create: `requirements.txt`, `.gitignore`, `server/__init__.py`, `server/main.py`, `server/tests/conftest.py`, `server/tests/test_health.py`, `web/index.html` (placeholder "Finance OS")
- Move: `index.html` → `legacy/v1/index.html`; `example-sheet.xlsx` → `legacy/v1/example-sheet.xlsx`; README atual → `legacy/v1/README.md`

**Interfaces:**
- Produces: `server.main:app` (FastAPI) com `GET /api/health` → `{"status": "ok", "version": "2.0.0-beta"}`; monta `web/` em `/` com `StaticFiles(html=True)`.

- [ ] **Step 1:** `git mv index.html legacy/v1/index.html`, idem para xlsx e README; `git tag v1 main`.
- [ ] **Step 2:** `requirements.txt`: `fastapi>=0.115`, `uvicorn[standard]>=0.30`, `pydantic>=2.7`, `python-multipart`, `openpyxl`, `pdfplumber`, `httpx`, `pytest`, `pytest-asyncio` não é necessário (usar `TestClient` síncrono).
- [ ] **Step 3:** Teste `test_health.py`:
```python
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
```
`conftest.py` define fixture `client` com `TestClient(create_app(data_dir=tmp_path))`.
- [ ] **Step 4:** Rodar `pytest -q`; esperado: falha por `create_app` inexistente.
- [ ] **Step 5:** Implementar `create_app(data_dir: Path | None = None) -> FastAPI` em `server/main.py` e `app = create_app()`. `data_dir` padrão: `Path(__file__).parent.parent / "data"` ou env `FINANCE_DATA_DIR`.
- [ ] **Step 6:** `pytest -q` passa. Commit `chore: scaffold v2 server, move v1 to legacy`.

### Task 2: Modelos e JsonRepository

**Files:**
- Create: `server/models.py`, `server/storage/__init__.py`, `server/storage/base.py`, `server/storage/json_repo.py`, `server/tests/test_json_repo.py`

**Interfaces:**
- Produces (`models.py`): classes Pydantic `Account, Card, Category, Transaction, Recurrence, Budget, Goal, Investment, Contribution, CategoryRule, Settings` com os campos da spec §4; `Installment(group_id, number, total)`; enums como `Literal`. Base `Entity(id, created_at, updated_at)` com defaults gerados. `Database(version: int = 1, accounts: list[Account] = [], ..., settings: Settings)`.
- Produces (`base.py`): `class Repository(ABC)` com `list(kind: str) -> list[Entity]`, `get(kind, id) -> Entity | None`, `add(kind, item) -> Entity`, `update(kind, id, data: dict) -> Entity` (atualiza `updated_at`, 404 → `KeyError`), `delete(kind, id) -> None`, `settings() -> Settings`, `save_settings(Settings)`, `replace_all(Database)`, `snapshot() -> Database`. `kind` é o nome da coleção (`"accounts"`, `"transactions"`, ...).
- Produces (`json_repo.py`): `JsonRepository(path: Path, backups_dir: Path, keep_days: int = 30)`; cria arquivo com categorias padrão (`DEFAULT_CATEGORIES` em `models.py`) se inexistente; `threading.Lock`; grava via temp + `os.replace`; `backup_today()` chamado em cada escrita e no init.

- [ ] **Step 1:** Testes em `test_json_repo.py`: `test_creates_file_with_default_categories` (≥ 14 categorias de despesa e 5 de receita), `test_add_and_get_roundtrip_after_reload` (novo `JsonRepository` no mesmo path lê o que o anterior gravou), `test_update_bumps_updated_at`, `test_delete_missing_raises_keyerror`, `test_backup_created_once_per_day` (duas escritas → um arquivo em backups), `test_write_is_atomic` (após `add`, não existe `*.tmp` no diretório e o JSON carrega).
- [ ] **Step 2:** `pytest server/tests/test_json_repo.py -q` falha (import).
- [ ] **Step 3:** Implementar modelos e repositório.
- [ ] **Step 4:** Testes passam. Commit `feat: pydantic models and json repository`.

### Task 3: CRUD genérico da API

**Files:**
- Create: `server/routers/__init__.py`, `server/routers/crud.py`, `server/errors.py`, `server/deps.py`, `server/tests/test_api_crud.py`
- Modify: `server/main.py` (registrar routers, handlers de erro)

**Interfaces:**
- Consumes: `Repository`.
- Produces: `deps.get_repo()` (dependência FastAPI, lê `app.state.repo`); `errors.ApiError(status, message, field=None)` + handler que responde `{"error","field"}`; `crud.make_router(kind: str, model: type[Entity], create_model: type[BaseModel]) -> APIRouter` com GET lista, POST, PUT, DELETE. Routers registrados para `accounts, cards, categories, budgets, goals, investments, contributions, rules`; `settings` com GET/PUT em `/api/settings`. (`transactions` e `recurrences` ganham router próprio nas Tasks 6 e 7.)
- Regras: DELETE de conta ou cartão com lançamentos → 409 `"Existem lançamentos vinculados; arquive em vez de excluir."`; DELETE de categoria em uso → 409.

- [ ] **Step 1:** Testes: `test_create_list_update_delete_account`, `test_validation_error_shape` (POST conta sem `name` → 400 com `field == "name"`), `test_delete_account_with_transactions_conflict` (409), `test_settings_get_put`.
- [ ] **Step 2:** Falham.
- [ ] **Step 3:** Implementar; converter `RequestValidationError` em `{"error": mensagem pt-BR, "field": primeiro loc}`.
- [ ] **Step 4:** Passam. Commit `feat: generic CRUD routers and error format`.

### Task 4: Dados de demonstração

**Files:**
- Create: `scripts/demo_data.py`, `server/demo.py`, `server/tests/test_demo.py`

**Interfaces:**
- Produces: `server.demo.build_demo(today: date, seed: int = 42) -> Database` com o conteúdo da spec §10 (14 meses até `today`); `scripts/demo_data.py --out data/finance.json [--seed N]` grava via `JsonRepository.replace_all`. Fixture `demo_client` em `conftest.py` com o demo carregado.

- [ ] **Step 1:** Testes: `test_demo_has_expected_shape` (2 contas + 1 fgts, 2 cartões, ≥ 600 lançamentos, ≥ 3 investimentos, 2 metas, recorrências ≥ 8, regras 6), `test_demo_is_deterministic` (mesmo seed → mesmo JSON), `test_demo_no_future_settled` (nenhum `settled` após `today`).
- [ ] **Step 2–4:** Falha → implementar → passa. Commit `feat: deterministic demo dataset`.

### Task 5: Faturas de cartão

**Files:**
- Create: `server/services/__init__.py`, `server/services/dates.py`, `server/services/statements.py`, `server/routers/cards.py`, `server/tests/test_statements.py`

**Interfaces:**
- Produces (`dates.py`): `clamp_day(year, month, day) -> date`; `add_months(d: date, n: int) -> date` (clamp); `month_key(d) -> "YYYY-MM"`.
- Produces (`statements.py`): `statement_period(card: Card, due_month: str) -> tuple[date, date]` (início, fim inclusivo); `statement_for(card, transaction_date: date) -> str` (chave `YYYY-MM` da fatura); `Statement(card_id, period: str, start, end, due_date, total: int, paid: int, status: Literal["open","closed","paid"], transactions: list[Transaction])`; `build_statements(card, transactions, payments, today) -> list[Statement]`; `status`: `open` se `today <= end`, `paid` se `paid >= total`, senão `closed`.
- Produces (rotas): `GET /api/cards/{id}/statements?from=YYYY-MM&to=YYYY-MM`, `POST /api/cards/{id}/statements/{period}/pay` body `{account_id, amount, date}` → cria `Transaction(kind="transfer", account_id, to_card_id=id, description="Pagamento fatura {period}", tags=["statement:{period}"])`. Pagamentos de uma fatura = transferências com essa tag.

- [ ] **Step 1:** Testes: `test_closing_25_purchase_26_goes_next_month`, `test_closing_31_in_february_clamps` (fechamento 31, vencimento 10: compra em 28/02 fecha em 28/02 e vence em 10/03 → fatura `2026-03`; compra em 01/03 → fatura `2026-04`). Regra: a fatura fechada na data C vence no primeiro `due_day` estritamente depois de C; `due_month` = mês desse vencimento, `test_status_transitions`, `test_pay_creates_transfer_and_marks_paid`.
- [ ] **Step 2–4:** Commit `feat: card statements`.

### Task 6: Lançamentos, filtros e parcelas

**Files:**
- Create: `server/services/installments.py`, `server/routers/transactions.py`, `server/tests/test_installments.py`, `server/tests/test_transactions_api.py`

**Interfaces:**
- Produces: `split_installments(amount: int, total: int) -> list[int]` (resto na primeira); `build_installments(base: TransactionCreate, total: int) -> list[Transaction]` (datas via `add_months`, `installment={group_id, number, total}`, descrição com sufixo ` (n/total)`).
- Rotas: `GET /api/transactions` com filtros da spec (`from,to,account_id,card_id,category_id,kind,status,q,page,page_size=100`) → `{items, total}`; `POST`, `PUT /{id}?scope=one|remaining`, `DELETE /{id}?scope=one|remaining`; `POST /api/transactions/installments`. Validação: exatamente um de `account_id`/`card_id` (transfer: `account_id` + um destino); `amount > 0`; 400 com `field`.

- [ ] **Step 1:** Testes: `test_split_10001_by_12_sums_exact`, `test_installments_dates_monthly`, `test_filter_by_period_and_text`, `test_both_account_and_card_rejected`, `test_delete_remaining_installments`.
- [ ] **Step 2–4:** Commit `feat: transactions API and installments`.

### Task 7: Recorrências

**Files:**
- Create: `server/services/recurrences.py`, `server/routers/recurrences.py`, `server/tests/test_recurrences.py`

**Interfaces:**
- Produces: `occurrences(rec: Recurrence, until: date) -> list[date]` (mensal com clamp, anual, semanal; respeita `start_date`, `end_date`, `active`); `materialize(repo, today) -> int` (cria `planned` faltantes até `today + 12 meses`, chave `recurrence_id+date`, retorna quantos criou); `confirm(repo, rec_id, date, amount) -> Transaction` (marca a ocorrência `settled` com `amount`, criando-a se ainda não existe).
- Rotas: CRUD `/api/recurrences` (POST e PUT chamam `materialize`; DELETE remove ocorrências `planned`), `POST /api/recurrences/{id}/confirm`. `materialize` também roda no startup do app.

- [ ] **Step 1:** Testes: `test_monthly_from_jan_31_clamps_feb`, `test_materialize_idempotent`, `test_confirm_sets_amount_and_settled`, `test_end_date_respected`.
- [ ] **Step 2–4:** Commit `feat: recurrences`.

### Task 8: Dashboard, projeção, calendário e relatórios

**Files:**
- Create: `server/services/balances.py`, `server/services/dashboard.py`, `server/services/forecast.py`, `server/services/calendar.py`, `server/services/reports.py`, `server/routers/insights.py`, `server/tests/test_balances.py`, `server/tests/test_forecast.py`, `server/tests/test_dashboard.py`, `server/tests/test_reports.py`

**Interfaces:**
- `balances.account_balance(account, transactions, until: date | None) -> int` (regra spec §4; só `settled`).
- `dashboard.build(repo, year, month, today) -> dict` com chaves `kpis{income, expense, balance, savings_rate, income_change, expense_change}`, `by_category[{category_id, amount}]`, `monthly[12]{income, expense, balance}`, `accounts[{id, balance}]`, `statements[{card_id, period, total, due_date, status}]`, `alerts[{level, message}]` (orçamento > 100%, fatura vence em ≤ 7 dias, saldo projetado negativo, recorrências `planned` com data ≤ hoje). Despesas de cartão contam no mês da compra.
- `forecast.build(repo, today, days=90) -> {series: [{date, balance}], first_negative_date}`: ponto de partida = soma dos saldos das contas; eventos = `planned` de contas + vencimentos de faturas não pagas (total da fatura na `due_date`).
- `calendar.build(repo, year, month) -> [{date, type, title, amount, ref_id}]` tipos: `card_closing, card_due, recurrence, planned, goal, investment_maturity`.
- `reports.annual(repo, year)`, `reports.compare(repo, a, b)`, `reports.category_series(repo, category_id, months)`.
- Rotas: `GET /api/dashboard`, `/api/forecast`, `/api/calendar`, `/api/reports/annual`, `/api/reports/compare`, `/api/reports/category/{id}`.

- [ ] **Step 1:** Testes: `test_balance_ignores_card_and_planned`, `test_transfer_moves_between_accounts`, `test_forecast_first_negative_includes_statement`, `test_dashboard_card_expense_in_purchase_month`, `test_annual_totals_match_transactions`.
- [ ] **Step 2–4:** Commit `feat: dashboard, forecast, calendar and reports`.

### Task 9: Categorização, export e restore

**Files:**
- Create: `server/services/categorizer.py`, `server/services/export.py`, `server/routers/data.py`, `server/tests/test_categorizer.py`, `server/tests/test_export.py`

**Interfaces:**
- `categorizer.normalize(s) -> str` (sem acento, minúsculas, espaços únicos); `suggest(description, rules, history: list[Transaction]) -> str | None` (regras por `priority` desc, depois histórico por Jaccard de tokens ≥ 0.5).
- `export.to_csv(db) -> str` (lançamentos com nomes de conta/cartão/categoria resolvidos, `;` separador, BOM UTF-8, valores `1234,56`).
- Rotas: `GET /api/export.json` (snapshot), `GET /api/export.csv`, `POST /api/import/backup` (multipart JSON; valida como `Database`; faz `backup_today()` com sufixo `-pre-restore` antes de `replace_all`).

- [ ] **Step 1:** Testes: `test_rule_wins_over_history`, `test_history_suggestion`, `test_no_match_none`, `test_csv_has_bom_and_semicolon`, `test_restore_roundtrip`.
- [ ] **Step 2–4:** Commit `feat: categorizer, export and restore`.

### Task 10: Importadores

**Files:**
- Create: `server/importers/__init__.py`, `server/importers/base.py`, `server/importers/csv_importer.py`, `server/importers/xlsx_importer.py`, `server/importers/ofx_importer.py`, `server/importers/pdf_importer.py`, `server/routers/imports.py`, `server/tests/test_importers.py`, `server/tests/fixtures/{extrato.csv, fatura.xlsx, extrato.ofx, fatura.pdf}`

**Interfaces:**
- `base.ImportedRow(date: date, amount: int, description: str, fitid: str | None, raw: str)`; `parse_amount_br(s: str) -> int` (aceita `1.234,56`, `-45,90`, `R$ 12,00`, `1234.56`, parênteses negativos); `detect(filename, content: bytes) -> list[ImportedRow]` despacha por extensão; `find_duplicates(rows, existing: list[Transaction]) -> dict[int, str]` (índice → id existente; mesmo valor e data e `normalize` da descrição com Jaccard ≥ 0.6, ou `fitid` igual em `import_id`).
- CSV/XLSX: detecta cabeçalho procurando colunas por sinônimos (`data`, `descricao|historico|lancamento`, `valor`, `debito`, `credito`); separador via `csv.Sniffer`; encoding utf-8-sig → latin-1.
- OFX: regex sobre `<STMTTRN>` blocos: `DTPOSTED`, `TRNAMT`, `MEMO|NAME`, `FITID`.
- PDF: `pdfplumber` texto por página; regex de linha `^(\d{2}/\d{2}(?:/\d{2,4})?)\s+(.+?)\s+(-?R?\$?\s?[\d.]+,\d{2})\s*([DC])?$`; ano ausente → ano do nome do arquivo ou atual; sinal `D` → despesa.
- Sinal: valor negativo ou `D` → `expense`; positivo em extrato de cartão → `expense` também (faturas listam compras positivas); regra: se `card_id` informado, tudo é `expense` exceto descrições com `pagamento|estorno`.
- Rotas: `POST /api/import/preview` (multipart `file`, form `account_id|card_id`) → `{import_id, rows:[{index, date, amount, description, kind, suggested_category_id, duplicate_of, include}]}`; preview guardado em memória por `import_id` (dict no app.state, TTL 1 h). `POST /api/import/commit` body `{import_id, rows:[{index, include, category_id, kind, description}]}` → cria lançamentos com `import_id`.

- [ ] **Step 1:** Testes: `test_parse_amount_variants`, `test_csv_debit_credit_columns`, `test_xlsx_basic`, `test_ofx_fitid`, `test_pdf_lines`, `test_duplicate_detection`, `test_preview_and_commit_api`. Gerar fixtures no próprio teste (xlsx via openpyxl, pdf via `reportlab` **não** — usar um PDF fixo pequeno gerado uma vez e commitado).
- [ ] **Step 2–4:** Commit `feat: statement importers (csv, xlsx, ofx, pdf)`.

### Task 11: Cotações (opcional)

**Files:**
- Create: `server/services/quotes.py`, `server/routers/quotes.py`, `server/tests/test_quotes.py`

**Interfaces:**
- `fetch_quotes(tickers: list[str], crypto: list[str], api_key: str | None, client: httpx.Client) -> dict[str, int]` (preço em centavos); brapi `GET https://brapi.dev/api/quote/{tickers}?token=`; CoinGecko `GET /api/v3/simple/price?ids=&vs_currencies=brl`. Timeout 10 s; falha por ativo isolada.
- `POST /api/quotes/refresh` → 409 `"Cotações desativadas nas configurações."` se `quotes_enabled` falso; atualiza `current_value = round(quantity * price)`; responde `{updated: [...], failed: [...]}`.

- [ ] **Step 1:** Testes com `httpx.MockTransport`: `test_refresh_disabled_409`, `test_refresh_updates_value_and_isolates_failure`.
- [ ] **Step 2–4:** Commit `feat: optional quotes refresh`.

### Task 12: Front — base, navegação, formato, API, modal de lançamento

**Files:**
- Create: `web/index.html`, `web/manifest.webmanifest`, `web/icon.svg`, `web/css/app.css`, `web/js/app.js`, `web/js/state.js`, `web/js/api.js`, `web/js/format.js`, `web/js/charts.js`, `web/js/components/period.js`, `web/js/components/txModal.js`, `web/js/components/table.js`, `web/js/pages/overview.js` (apenas esqueleto que renderiza KPIs), `web/js/pages/transactions.js`

**Interfaces:**
- `api.js`: `get(path, params)`, `post(path, body)`, `put`, `del`, `upload(path, formData)`; lança `ApiError(message, field, status)`; toast de erro global.
- `format.js`: `money(cents)`, `pct(x)`, `dateBR(iso)`, `monthName(i)`.
- `state.js`: `{year, month, accounts, cards, categories, settings}`, `load()`, `subscribe(fn)`.
- `app.js`: rotas por hash (`#/overview`, `#/transactions`, `#/cards`, `#/calendar`, `#/budget`, `#/reports`, `#/investments`, `#/goals`, `#/import`, `#/settings`); cada página exporta `render(el)` e `destroy()`; nav lateral (desktop) e barra inferior (mobile); botão `+ Lançar` fixo abre `txModal.open({defaults})`.
- `txModal`: campos da spec §7; valida inline; parcelas só com cartão; "repetir mensalmente" cria recorrência; ao salvar, `state.emit('data-changed')`.
- Tema: variáveis CSS em `:root` e `[data-theme=dark]`; `prefers-color-scheme` quando `auto`.

- [ ] **Step 1:** Implementar; verificar com o navegador headless (skill `browser-automation`): sem erros de console em `#/overview` e `#/transactions` com dados demo; modal cria lançamento e a tabela atualiza.
- [ ] **Step 2:** Commit `feat(web): app shell, API client, transaction modal, transactions page`.

### Task 13: Front — Visão geral, Cartões, Calendário/Projeção, Orçamento

**Files:**
- Create/Modify: `web/js/pages/overview.js` (completa), `web/js/pages/cards.js`, `web/js/pages/calendar.js`, `web/js/pages/budget.js`

- Overview: KPIs com variação, rosca por categoria (cores das categorias), barras 12 meses + linha de saldo, saldos por conta, faturas abertas, alertas.
- Cards: card por cartão; lista de faturas; detalhe; botão pagar (modal: conta, valor, data).
- Calendar: grade 7 colunas, eventos coloridos por tipo; abaixo, gráfico de linha da projeção com faixa vermelha abaixo de zero e destaque de `first_negative_date`.
- Budget: barras por categoria; edição inline do limite; acumulado anual.

- [ ] **Step 1:** Implementar; verificar headless cada rota sem erro de console; screenshot de cada uma em `docs/screenshots/`.
- [ ] **Step 2:** Commit `feat(web): overview, cards, calendar, budget pages`.

### Task 14: Front — Relatórios, Investimentos, Metas, Importar, Configurações

**Files:**
- Create: `web/js/pages/reports.js`, `web/js/pages/investments.js`, `web/js/pages/goals.js`, `web/js/pages/import.js`, `web/js/pages/settings.js`

- Reports: anual (barras empilhadas por categoria), comparativo (tabela com variação %), evolução de categoria (linha), botão exportar CSV.
- Investments: KPIs, rosca alocação, linha aportes × valor, lista de vencimentos, tabela, botão cotações (visível se habilitado, com aviso).
- Goals: cards com progresso, prazo e "R$ X/mês para chegar".
- Import: drop zone, seleção conta/cartão, tabela editável (incluir, categoria, tipo, descrição), duplicados destacados, confirmar.
- Settings: abas contas, cartões, categorias, regras, recorrências, backup (baixar JSON/CSV, restaurar), tema, cotações.

- [ ] **Step 1:** Implementar; verificação headless; screenshots.
- [ ] **Step 2:** Commit `feat(web): reports, investments, goals, import, settings`.

### Task 15: Deploy, README, publicação

**Files:**
- Create: `deploy/install.sh`, `deploy/finance.service`, `deploy/nginx.conf`, `README.md` (novo), `docs/screenshots/*.png`

- `install.sh`: idempotente; `set -euo pipefail`; usuário `finance`; `/opt/finance-os`; `python3 -m venv`; `pip install -r requirements.txt`; `data/` com dono `finance`; copia service e site nginx; `systemctl enable --now finance`; `nginx -t && systemctl reload nginx`.
- `finance.service`: `ExecStart=/opt/finance-os/.venv/bin/uvicorn server.main:app --host 127.0.0.1 --port 8000`, `WorkingDirectory=/opt/finance-os`, `Environment=FINANCE_DATA_DIR=/opt/finance-os/data`, `Restart=always`.
- `nginx.conf`: `location /api { proxy_pass http://127.0.0.1:8000; client_max_body_size 20m; }`, `location / { root /opt/finance-os/web; try_files $uri /index.html; expires 1h; }`.
- README (pt-BR): o que é, screenshots, instalação Ubuntu em 5 comandos, uso local no Windows, importação, backup, estrutura, fase 2.

- [ ] **Step 1:** Escrever arquivos; `bash -n deploy/install.sh`; `pytest -q` completo passa.
- [ ] **Step 2:** Commit `docs: README, deploy scripts and screenshots`; `git push -u origin v2`; `git push origin v1` (tag).
