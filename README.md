# Finance OS — Personal Finance & Investment Dashboard

A responsive personal finance dashboard built with **HTML, CSS, and vanilla JavaScript**. Finance OS reads data from a published Google Sheets workbook and turns it into practical views for cash flow, spending, budgets, goals, investments, contributions, portfolio allocation, and maturity monitoring.

The project runs as a static website and does not require Node.js, npm, a backend, a database, or a build process. A single `index.html` file can be deployed directly to GitHub Pages.

## Live Demo

```text
https://marceloasl99.github.io/dashboard-financeiro/
```

> The live dashboard requires a valid published Google Sheets workbook. Do not publish real sensitive financial information.

---

## Main Features

### Financial Overview

- Dynamic year selector based on the transaction dates available in Google Sheets
- All twelve months displayed in a responsive grid
- Automatic disabling of months without data
- Monthly income, expenses, and balance
- Month-over-month percentage changes
- Savings rate
- Average daily expense
- Expense distribution by category
- Monthly income-versus-expense comparison
- Monthly surplus or deficit line
- Annual result summary
- Best and worst month of the selected year
- Automatic financial insights
- Searchable transaction table
- Category filter

### Investment Management

- Current portfolio value
- Total contributed capital
- Accumulated gain or loss
- Portfolio return percentage
- Amount becoming available within the next 90 days
- Maturity and liquidity calendar
- Position quantity
- Invested amount and current value
- Result by investment position
- Portfolio allocation by asset class
- Contribution history
- Portfolio evolution chart
- Investment institution and liquidity information
- Active, redeemed, and matured investment status

### Planning

- Monthly budget by category
- Actual spending versus budget limit
- Budget utilization progress bars
- Overspending indication
- Financial goals
- Current value versus target value
- Goal completion percentage
- Goal deadline monitoring

### Technical Features

- No installation required
- No package manager
- No build process
- No backend server
- GitHub Pages compatible
- Responsive desktop, tablet, and mobile layout
- Google Sheets JSONP integration
- Avoids the browser CORS issue found in direct `fetch()` requests
- Browser `localStorage` for the saved spreadsheet URL
- Manual refresh button
- Automatic refresh when a saved spreadsheet is available
- Optional workbook modules

---

## Technology Stack

- **HTML5** — Page structure
- **CSS3** — Layout, visual system, and responsiveness
- **Vanilla JavaScript** — Data loading, calculations, filtering, navigation, and rendering
- **Chart.js** — Financial and investment charts
- **Google Visualization API** — Published Google Sheets data access
- **JSONP** — Cross-origin data loading without a custom backend
- **GitHub Pages** — Static website hosting
- **Browser localStorage** — Local persistence of the workbook URL

---

## Repository Structure

```text
dashboard-financeiro/
├── index.html
├── README.md
└── finance-os-planilha-exemplo.xlsx   # Optional workbook template
```

### `index.html`

Contains the entire dashboard application:

- HTML structure
- CSS theme
- Responsive layouts
- Navigation between modules
- Google Sheets connection logic
- JSONP data loader
- Financial calculations
- Investment calculations
- Charts
- Tables
- Filters
- Alerts and insights

### `README.md`

Contains project documentation, workbook structure, deployment instructions, customization options, troubleshooting, and privacy considerations.

### `finance-os-planilha-exemplo.xlsx`

Optional example workbook containing sample data and all supported worksheets.

---

## Google Sheets Workbook Structure

The dashboard reads up to five worksheets:

```text
Lancamentos
Investimentos
Aportes
Orcamentos
Metas
```

Only `Lancamentos` is required. The other worksheets are optional. If an optional worksheet does not exist, the rest of the dashboard continues working and the corresponding module displays a setup message.

Worksheet names must match exactly, including capitalization and accents.

---

## 1. Transactions Worksheet

Create a worksheet named:

```text
Lancamentos
```

Required columns:

```text
Data | Categoria | Descrição | Entrada (R$) | Saída (R$)
```

Example:

```text
Data        Categoria             Descrição          Entrada (R$)  Saída (R$)
01/05/2026  Pró-labore/Salário    Salário mensal     8500.00
01/05/2026  Moradia               Aluguel                          2450.00
02/05/2026  Alimentação           Supermercado                      486.72
13/05/2026  Extra                 Freelance técnico   750.00
01/01/2027  Pró-labore/Salário    Salário mensal     9200.00
```

### Transaction Rules

- Use one row per transaction.
- Enter a value in either `Entrada (R$)` or `Saída (R$)`.
- Do not enter values in both columns on the same row.
- Use real date cells instead of text whenever possible.
- Keep all months and years in the same worksheet.
- Do not create a separate worksheet for each month.
- New years are detected automatically from the `Data` column.

### Suggested Expense Categories

```text
Moradia
Contas
Alimentação
Transporte
Saúde
Pet
Assinaturas
Educação
Lazer
Cuidados pessoais
Compras
Imprevistos/Outros
```

### Suggested Income Categories

```text
Pró-labore/Salário
Extra
Outras receitas
```

Additional categories are supported, but consistent spelling is important. For example, `Alimentação` and `Alimentacao` will appear as separate categories.

---

## 2. Investments Worksheet

Create a worksheet named:

```text
Investimentos
```

Required columns:

```text
Ativo
Classe
Instituição
Quantidade
Valor aportado
Valor atual
Vencimento
Liquidez
Status
```

Example:

```text
Ativo                 Classe          Instituição       Quantidade  Valor aportado  Valor atual  Vencimento  Liquidez       Status
CDB Banco A 110% CDI  Renda fixa      Banco A           1           10000.00        10650.00     15/09/2026  No vencimento  Ativo
Tesouro Selic 2029    Tesouro Direto  Tesouro Nacional  4.25        6200.00         6480.00      01/03/2029  D+1            Ativo
BOVA11                 ETF             Corretora A       35          4100.00         4350.00                  D+2            Ativo
```

### Column Definitions

- **Ativo** — Investment or security name
- **Classe** — Asset class used in the allocation chart
- **Instituição** — Bank, broker, platform, or issuer
- **Quantidade** — Number of shares, units, or contracts
- **Valor aportado** — Total acquisition cost or contributed amount
- **Valor atual** — Current manually updated market or redemption value
- **Vencimento** — Maturity date, when applicable
- **Liquidez** — Availability rule such as `D+0`, `D+1`, or `No vencimento`
- **Status** — Use `Ativo`, `Resgatado`, or `Vencido`

Positions marked as `Resgatado` are excluded from active portfolio totals.

### Suggested Asset Classes

```text
Renda fixa
Tesouro Direto
ETF
Ações
Fundo de investimento
Criptoativos
Previdência
Caixa
Outros
```

---

## 3. Contributions Worksheet

Create a worksheet named:

```text
Aportes
```

Required columns:

```text
Data | Ativo | Valor
```

Example:

```text
Data        Ativo                  Valor
10/01/2026  CDB Banco A 110% CDI   5000.00
10/02/2026  CDB Banco A 110% CDI   5000.00
15/03/2026  Tesouro Selic 2029     3200.00
10/05/2026  BOVA11                  2100.00
```

The dashboard uses this worksheet to build the contribution timeline and compare accumulated contributions with the current portfolio value.

For the best result, use the same asset name in `Aportes` and `Investimentos`.

---

## 4. Budgets Worksheet

Create a worksheet named:

```text
Orcamentos
```

Required columns:

```text
Ano | Mês | Categoria | Limite
```

Example:

```text
Ano   Mês  Categoria     Limite
2026  5    Moradia       2800.00
2026  5    Alimentação   1100.00
2026  5    Transporte     600.00
2026  5    Lazer          450.00
2027  1    Moradia       2900.00
```

Use numeric month values:

```text
1  = January
2  = February
3  = March
4  = April
5  = May
6  = June
7  = July
8  = August
9  = September
10 = October
11 = November
12 = December
```

The category name must match the category used in `Lancamentos`.

---

## 5. Goals Worksheet

Create a worksheet named:

```text
Metas
```

Required columns:

```text
Meta | Valor objetivo | Valor atual | Prazo
```

Example:

```text
Meta                    Valor objetivo  Valor atual  Prazo
Reserva de emergência   30000.00        12500.00     31/12/2027
Viagem internacional    15000.00         4800.00     30/06/2028
Entrada de imóvel      120000.00        23500.00     31/12/2032
```

The dashboard calculates progress as:

```text
Progress = Current value / Target value
```

Update `Valor atual` periodically to keep the goal progress accurate.

---

## Supported Date Range

The transactions architecture is designed to work across multiple years. Years are generated dynamically from the dates in `Lancamentos`.

The current implementation supports dates from:

```text
1900 through 2200
```

There is no hardcoded May-to-December limitation. January of a new year works automatically as soon as a valid transaction exists for that year.

January month-over-month comparisons use December of the previous year.

---

## Publishing the Google Sheets Workbook

Sharing the workbook as **Anyone with the link** may not be sufficient. The workbook must also be published to the web so that the Google Visualization endpoint can return anonymous data.

### Publish the Entire Workbook

In Google Sheets:

1. Open the workbook.
2. Select **File**.
3. Select **Share**.
4. Select **Publish to web**.
5. Choose **Entire document**.
6. Choose **Web page**.
7. Click **Publish**.
8. Confirm the publication.
9. Keep automatic republishing enabled.

Publish the entire document so all optional worksheets can be read.

### Recommended Sharing Setting

```text
General access: Anyone with the link
Role: Viewer
```

Google may require a short period before workbook changes become available through the published endpoint.

---

## Connecting the Dashboard

1. Open the dashboard.
2. Click **Connection**.
3. Paste the full Google Sheets URL or spreadsheet ID.
4. Click **Connect and Load**.
5. Wait for the successful synchronization message.

Accepted full URL format:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?usp=sharing
```

Accepted ID format:

```text
SPREADSHEET_ID
```

The URL is stored in browser `localStorage`. It remains available in the same browser profile until site data is cleared.

---

## How Data Loading Works

The application reads published worksheet data through the Google Visualization endpoint:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/gviz/tq
```

The dashboard uses JSONP instead of the browser `fetch()` API. This avoids cross-origin restrictions that can produce errors such as:

```text
Access to fetch has been blocked by CORS policy.
No 'Access-Control-Allow-Origin' header is present.
```

For each worksheet, the dashboard:

1. Creates a unique JavaScript callback.
2. Adds a temporary `<script>` element to the page.
3. Requests the worksheet through Google Visualization.
4. Receives the table through the callback.
5. Normalizes the headers.
6. Converts dates and numeric values.
7. Updates KPIs, charts, tables, filters, and insights.
8. Removes the temporary script and callback.

`Lancamentos` is required. Optional worksheets are loaded when available.

---

## Dashboard Navigation

### Overview

The Overview section contains:

- Year selector
- Responsive twelve-month selector
- Income KPI
- Expense KPI
- Monthly balance KPI
- Savings rate
- Average daily expense
- Spending by category
- Monthly cash flow
- Annual surplus or deficit
- Best and worst month
- Automatic financial insights
- Transaction search and category filter

### Investments

The Investments section contains:

- Active portfolio value
- Total contributions
- Accumulated return
- Return percentage
- Amount available within 90 days
- Portfolio evolution
- Asset allocation
- Maturity schedule
- Portfolio health alerts
- Position table
- Asset-class filter

### Planning

The Planning section contains:

- Category budgets
- Actual versus planned spending
- Visual utilization bars
- Overspending indication
- Financial goals
- Progress percentages
- Goal deadlines

---

## Financial Calculations

### Monthly Balance

```text
Monthly Balance = Total Income - Total Expenses
```

### Savings Rate

```text
Savings Rate = Monthly Balance / Total Income
```

If total income is zero, the savings rate is displayed as zero rather than dividing by zero.

### Average Daily Expense

```text
Average Daily Expense = Total Expenses / Number of Days With Expenses
```

### Month-over-Month Change

```text
Change % = (Current Month - Previous Month) / Absolute Value of Previous Month
```

If the previous value is zero, the dashboard displays `No baseline`.

### Investment Result

```text
Investment Result = Current Value - Contributed Value
```

### Investment Return Percentage

```text
Return % = Investment Result / Total Contributions
```

This is a simple management return calculation. It is not IRR, XIRR, or time-weighted return.

### Budget Utilization

```text
Budget Utilization = Actual Category Expense / Category Limit
```

### Goal Progress

```text
Goal Progress = Current Value / Target Value
```

---

## Running Locally

Download `index.html` and open it in a current browser.

Example local address:

```text
file:///C:/Users/username/Downloads/index.html
```

The JSONP implementation allows Google Sheets data to load without a local HTTP server. Internet access is still required for:

- Google Sheets
- Google Visualization API
- Chart.js CDN

---

## Deploying to GitHub Pages

No Git, Node.js, npm, or local installation is required.

### Upload Through the GitHub Website

1. Open the repository.
2. Select **Add file**.
3. Select **Upload files**.
4. Upload `index.html` and `README.md`.
5. Commit directly to the `main` branch.

### Enable GitHub Pages

Open:

```text
Settings → Pages
```

Configure:

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

Save the configuration and wait for publication.

The website URL will follow this format:

```text
https://GITHUB_USERNAME.github.io/REPOSITORY_NAME/
```

### Updating the Dashboard

1. Replace `index.html` in the repository.
2. Commit the change.
3. Wait for GitHub Pages to redeploy.
4. Perform a hard refresh.

```text
Windows: Ctrl + F5
macOS: Command + Shift + R
```

---

## Visual Design

The dashboard uses a clean financial interface with the following main colors:

```text
Petroleum blue: #1B3A4B
Sand:           #EDE6D6
Dark:           #10181C
Canvas:         #F5F2EB
Positive:       #24735B
Negative:       #A2483E
Warning:        #9A6A1D
```

The month selector uses a responsive grid:

- 12 columns on large screens
- 6 columns on medium screens
- 3 columns on small screens

This prevents the final months from being cut off and removes the need for horizontal scrolling on normal desktop layouts.

---

## Customization

All configuration is contained in `index.html`.

### Change Theme Colors

Edit the CSS variables near the beginning of the file:

```css
:root {
  --ink: #10181C;
  --navy: #1B3A4B;
  --sand: #EDE6D6;
  --canvas: #F5F2EB;
  --green: #24735B;
  --red: #A2483E;
}
```

### Change Chart Colors

Edit the JavaScript `COLORS` array:

```javascript
const COLORS = [
  '#1B3A4B',
  '#285568',
  '#417387',
  '#6F95A1',
  '#A5B9BD',
  '#C7B996'
];
```

### Change the Default Spreadsheet

Edit the value of the workbook input:

```html
<input id="sheet" value="YOUR_GOOGLE_SHEETS_URL">
```

Leave the value empty if every user should provide a workbook manually.

---

## Troubleshooting

### `Failed to fetch`

The deployed site may still be using an older version that reads Google Sheets with `fetch()`.

**Resolution:**

- Replace `index.html` with the JSONP version.
- Commit the new file.
- Wait for GitHub Pages to update.
- Perform a hard refresh.

### CORS Error

Example:

```text
No 'Access-Control-Allow-Origin' header is present.
```

**Resolution:** Confirm that the deployed source contains `responseHandler:` and does not use `fetch()` for Google Sheets data.

### `Lancamentos` Cannot Be Loaded

Check that:

- The worksheet exists.
- The name is exactly `Lancamentos`.
- The entire workbook was published to the web.
- Row 1 contains the required headers.
- There is no title row above the headers.

### Optional Module Is Empty

Create the relevant worksheet:

```text
Investimentos
Aportes
Orcamentos
Metas
```

Confirm that the worksheet headers match the documentation.

### A Month Is Disabled

The selected year has no valid transaction rows for that month. Add at least one dated transaction and refresh the dashboard.

### A Year Does Not Appear

The year selector is generated from the `Data` values in `Lancamentos`. Add at least one valid transaction for the year and refresh.

### Investment Value Is Incorrect

Check that:

- `Valor aportado` and `Valor atual` are numeric cells.
- Active positions use the status `Ativo`.
- Redeemed positions use the status `Resgatado`.
- Decimal separators match the Google Sheets locale.

### Maturity Is Not Displayed

Check that `Vencimento` is a real date cell. Leave the cell empty only for investments without a maturity date.

### Budget Does Not Match Expenses

The category in `Orcamentos` must exactly match the category in `Lancamentos`.

### Chart Is Missing

Confirm that the browser or corporate network allows access to:

```text
https://cdn.jsdelivr.net/
```

Chart.js is loaded from this CDN.

### Changes Are Not Visible

1. Click **Refresh Data**.
2. Wait for the Google published version to update.
3. Hard-refresh the browser.
4. Confirm automatic republishing is enabled.

---

## Privacy and Security

This project uses a public workbook architecture.

Publishing a Google Sheets workbook to the web makes its published content accessible outside the normal spreadsheet editing interface. Anyone who inspects the dashboard source code or browser requests may discover the spreadsheet ID and read the published data.

Do not publish:

- Bank account numbers
- Credit card information
- Passwords
- API keys
- Tax identification numbers
- Personal addresses
- Confidential company information
- Sensitive transaction descriptions
- Any information that should remain private

The dashboard processes data in the browser and does not send it to a custom application server. However, the published source workbook is still publicly accessible through Google.

For private financial data, use a protected architecture with:

- User authentication
- Google OAuth
- Private Google Sheets API access
- A secured backend or serverless function
- Authorization controls
- Secret management
- Audit logging

GitHub Pages alone does not provide application-level authentication.

---

## Investment Disclaimer

The investment module is intended for organization, visualization, and personal recordkeeping only.

It does not provide:

- Investment advice
- Tax advice
- Legal advice
- Guaranteed valuations
- Guaranteed return calculations
- Automated market prices
- Risk assessment suitable for regulated decisions

Investment values are manually supplied through Google Sheets. Verify values, maturity dates, liquidity rules, fees, taxes, and redemption conditions directly with the relevant financial institution.

---

## Known Limitations

- The workbook must be published for anonymous reading.
- There is no user authentication.
- Investment prices are not downloaded automatically.
- Investment return is a simple contribution-versus-current-value calculation.
- IRR, XIRR, and time-weighted return are not currently calculated.
- The dashboard is read-only.
- Transactions cannot be edited from the interface.
- Google may delay updates to published worksheets.
- Chart.js requires an external CDN.
- There is no offline cache.
- Recurring transactions are not automatically generated.
- Debt and loan amortization are not yet included.

---

## Possible Future Improvements

- Net worth history
- Assets and liabilities module
- Debt payoff planner
- Credit card statement tracking
- Recurring bills and subscription calendar
- Emergency fund coverage in months
- Cash flow forecasting
- Scenario simulation
- Retirement projections
- Dividend and interest income tracking
- Benchmark comparison
- IRR and time-weighted return
- Import from bank CSV files
- Export filtered data
- Progressive Web App support
- Dark mode
- Multiple currencies
- Authentication and private API access
- Automated tests
- Accessibility improvements

---

## Contributing

Contributions, suggestions, and issue reports are welcome.

1. Fork the repository.
2. Create a focused feature branch.
3. Test changes with a workbook containing fictional data.
4. Do not commit private spreadsheet IDs, credentials, or personal data.
5. Open a pull request with a clear explanation of the change.

---

## License

No license is included by default. Without a license file, standard copyright rules apply and reuse is not automatically granted.

To make the project openly reusable, add a recognized license such as the MIT License.

---

## Acknowledgements

- Chart.js for browser-based financial visualizations
- Google Sheets and Google Visualization API for published worksheet data
- GitHub Pages for static website hosting
