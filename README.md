# Personal Finance Dashboard

A clean, responsive, and interactive personal finance dashboard built with **HTML, CSS, and vanilla JavaScript**. The dashboard reads financial transactions directly from a published Google Sheets workbook and transforms the data into monthly KPIs, charts, filters, and a searchable transaction table.

The project is intentionally dependency-light and does not require Node.js, npm, a build process, a backend server, or local installation. It can be hosted directly with GitHub Pages using a single `index.html` file.

## Live Demo

[Open the Personal Finance Dashboard](https://marceloasl99.github.io/dashboard-financeiro/)

> The dashboard requires a published Google Sheets workbook with the expected worksheet names and column structure. If the configured workbook is unavailable, private, or not published to the web, the dashboard will display a connection error.

## Repository

[github.com/marceloasl99/dashboard-financeiro](https://github.com/marceloasl99/dashboard-financeiro)

---

## Overview

The dashboard provides a consolidated view of personal income and expenses from **May through December 2026**. Each month is stored in a separate Google Sheets worksheet, while the browser application reads and processes the data in real time.

The interface includes:

- Monthly period selector
- Automatic detection of months with or without data
- Total income, total expenses, and monthly balance
- Percentage variation compared with the previous month
- Expense distribution by category
- Monthly income-versus-expense comparison
- Searchable transaction table
- Category filter
- Manual data refresh button
- Responsive layout for desktop, tablet, and mobile
- Local browser storage for the Google Sheets URL
- Detailed connection and data-validation messages

---

## Screens and Features

### Monthly Selector

The dashboard displays the following months:

- May
- June
- July
- August
- September
- October
- November
- December

Months without transactions are automatically disabled and marked as **No data**. When the workbook is refreshed, the application identifies the latest month containing transactions and uses it when the previously selected month has no data.

### KPI Cards

For the selected month, the dashboard calculates:

- **Total Income** — Sum of all values in the income column
- **Total Expenses** — Sum of all values in the expense column
- **Monthly Balance** — Total income minus total expenses
- **Month-over-Month Variation** — Percentage variation against the previous month, when a valid comparison exists

All calculations are performed in the browser from the current Google Sheets data.

### Expense Distribution Chart

A doughnut chart groups expenses by category for the selected month. Categories with no expenses are excluded automatically.

### Income vs. Expenses Chart

A bar chart compares total income and total expenses across all months that contain transactions.

### Transaction Table

The transaction table shows:

- Date
- Category
- Description
- Income
- Expense

The table supports:

- Free-text search across date, category, and description
- Filtering by category
- Automatic record count
- Brazilian Real currency formatting

### Data Refresh

The **Refresh Data** button forces a new read of all monthly worksheets. A timestamp is displayed after a successful refresh.

---

## Technology Stack

- **HTML5** — Application structure
- **CSS3** — Responsive layout and visual design
- **Vanilla JavaScript** — Data loading, calculations, filters, and user interaction
- **Chart.js** — Doughnut and bar charts
- **Google Visualization API** — Public Google Sheets data access
- **JSONP** — Cross-origin data loading without browser CORS errors
- **GitHub Pages** — Static website hosting
- **localStorage** — Persistence of the Google Sheets URL in the current browser

No package manager or compilation step is required.

---

## Project Structure

```text
dashboard-financeiro/
├── index.html
└── README.md
```

### `index.html`

Contains the complete application:

- HTML markup
- CSS theme and responsive rules
- Google Sheets connection logic
- JSONP data loader
- Financial calculations
- Chart.js configuration
- Search and category filtering
- Error handling

### `README.md`

Contains project documentation, setup instructions, workbook requirements, troubleshooting guidance, privacy considerations, and customization notes.

---

## Google Sheets Workbook Requirements

The workbook must contain these worksheets with exactly the following names:

```text
Maio
Junho
Julho
Agosto
Setembro
Outubro
Novembro
Dezembro
```

A worksheet named `Resumo` may also exist, but the dashboard does not depend on it. Monthly totals are calculated directly from the transaction worksheets.

### Required Columns

Row 1 of every monthly worksheet must contain these columns:

```text
Data | Categoria | Descrição | Entrada (R$) | Saída (R$)
```

The application normalizes capitalization and accents when identifying headers, but every worksheet must still contain the keywords corresponding to:

- `Data`
- `Categoria`
- `Descrição`
- `Entrada`
- `Saída`

### Example Data

```text
Data        Categoria             Descrição          Entrada (R$)   Saída (R$)
01/05/2026  Pró-labore/Salário    Salário mensal     8500.00
01/05/2026  Moradia               Aluguel                           2450.00
02/05/2026  Alimentação           Supermercado                      486.72
13/05/2026  Extra                 Freelance técnico  750.00
```

Each transaction should have a value in either **Income** or **Expense**, not both.

### Supported Expense Categories

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

### Supported Income Categories

```text
Pró-labore/Salário
Extra
Outras receitas
```

The chart can display additional categories, but using consistent category names prevents duplicated groups caused by spelling differences.

---

## Publishing the Google Sheets Workbook

Sharing a workbook as **Anyone with the link** may not be sufficient for anonymous access through the Google Visualization endpoint. The workbook should also be published to the web.

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
9. Keep automatic republishing enabled if available.

Publish the entire workbook rather than only one worksheet because the dashboard reads each monthly worksheet separately.

### Sharing Permission

For the most straightforward public-dashboard setup, configure:

```text
General access: Anyone with the link
Role: Viewer
```

After changing publication or sharing settings, Google may require a short period before the public endpoint reflects the new configuration.

### Workbook URL Format

The dashboard accepts the full workbook URL:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?usp=sharing
```

It also accepts only the spreadsheet ID:

```text
SPREADSHEET_ID
```

The ID is the value located between `/d/` and `/edit` in the Google Sheets URL.

---

## How the Google Sheets Connection Works

The dashboard reads every monthly worksheet from the Google Visualization endpoint:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/gviz/tq
```

The initial implementation used the browser `fetch()` API. When the HTML file was opened locally or loaded from another domain, the browser blocked the response because the Google endpoint did not return the required cross-origin header.

A typical browser error was:

```text
Access to fetch has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

The corrected version uses **JSONP** by dynamically creating a `<script>` element and supplying a unique Google Visualization response handler. Script resources can be loaded cross-origin, so this approach avoids the CORS restriction without requiring a proxy, backend service, API key, or OAuth flow.

The loading sequence is:

1. Extract the spreadsheet ID from the supplied URL.
2. Generate a unique callback name.
3. Create a Google Visualization request for one monthly worksheet.
4. Add the request to the page as a script resource.
5. Receive the worksheet table through the callback.
6. Validate the required headers.
7. Convert dates and numeric cells.
8. Repeat for all eight monthly worksheets.
9. Recalculate KPIs, charts, filters, and table rows.

The worksheets are loaded sequentially to avoid sending many simultaneous requests to the same workbook.

---

## Running the Dashboard

### Option 1 — GitHub Pages

This is the recommended option.

1. Upload `index.html` and `README.md` to the repository root.
2. Open the repository **Settings**.
3. Select **Pages**.
4. Under **Build and deployment**, select:

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

5. Save the configuration.
6. Wait for GitHub Pages to publish the site.
7. Open:

```text
https://marceloasl99.github.io/dashboard-financeiro/
```

No GitHub Actions workflow is required because the project is a static site with no build step.

### Option 2 — Open Locally

Download `index.html` and open it in a modern browser.

Because Google Sheets data is loaded through JSONP rather than `fetch()`, the corrected version can also work when opened as a local file:

```text
file:///C:/path/to/index.html
```

An internet connection is still required for:

- Google Sheets data
- Google Visualization responses
- Chart.js loaded from the CDN

### Option 3 — Other Static Hosting

The same `index.html` can be hosted on any static web service, including:

- Azure Static Web Apps
- Netlify
- Cloudflare Pages
- Amazon S3 static website hosting
- An internal static web server

No server-side processing is required for the current public-workbook architecture.

---

## Connecting the Dashboard

1. Open the dashboard.
2. Click **Connection**.
3. Paste the full Google Sheets URL or spreadsheet ID.
4. Click **Connect and Load**.
5. Wait while the dashboard reads the monthly worksheets.
6. Confirm that the status changes to a successful update timestamp.

The workbook URL is stored using browser `localStorage`. This means:

- The URL remains available after the page is closed.
- The URL is specific to the current browser profile.
- The URL is not uploaded to GitHub by this feature.
- Clearing browser site data removes the saved URL.

When the dashboard opens and a saved URL exists, it automatically attempts to refresh the data.

---

## Visual Design

The dashboard uses the following visual identity:

```text
Petroleum blue: #1B3A4B
Sand:           #EDE6D6
Dark:           #10181C
Page background:#F3EFE6
Positive:       #2E6F5E
Negative:       #A04D43
```

Design principles include:

- High-contrast KPI values
- Clear hierarchy
- No decorative gradients
- Limited and consistent color palette
- Responsive cards and charts
- Horizontal scrolling for month navigation on narrow screens
- Accessible status and error messaging

---

## Configuration and Customization

All configuration is contained in `index.html`.

### Change the Supported Months

Locate:

```javascript
const MONTHS = [
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];
```

Update both the array and the Google Sheets worksheet names. The names must match exactly.

### Change the Dashboard Year

Locate the period heading logic:

```javascript
`${selected} de 2026`
```

Replace `2026` with the required year. For a reusable multi-year solution, add a year selector and include the year in the workbook organization.

### Change the Default Spreadsheet

Locate the value assigned to the connection input:

```html
<input id="sheet" value="YOUR_GOOGLE_SHEETS_URL">
```

Replace the value or leave it empty so users must provide a workbook URL.

### Change Theme Colors

Edit the CSS variables at the beginning of the stylesheet:

```css
:root {
  --p: #1B3A4B;
  --a: #EDE6D6;
  --d: #10181C;
  --bg: #F3EFE6;
  --green: #2E6F5E;
  --red: #A04D43;
}
```

### Change Chart Colors

Locate the JavaScript `COLORS` array:

```javascript
const COLORS = [
  '#1B3A4B',
  '#2C5B6F',
  '#4D7A89',
  '#7697A2',
  '#A5B9BD',
  '#C7B996'
];
```

Add or reorder colors as necessary.

---

## Troubleshooting

### `Failed to fetch`

**Cause:** An older version of the dashboard uses `fetch()` against the Google Visualization endpoint and is blocked by CORS.

**Resolution:** Replace the old `index.html` with the corrected JSONP version. Hard-refresh the published page afterward.

```text
Windows: Ctrl + F5
macOS:   Command + Shift + R
```

### CORS Error in the Browser Console

Example:

```text
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**Resolution:** Confirm that the deployed file is the JSONP version. Search the deployed source for `responseHandler:`. The corrected file should not use `fetch()` for Google Sheets data.

### Worksheet Not Found

**Possible causes:**

- Worksheet name does not match the expected month.
- Worksheet contains a trailing space.
- Accent or spelling differs.
- Only one worksheet was published instead of the entire workbook.

**Resolution:** Confirm the exact worksheet names and publish the entire document.

### Invalid Headers

**Cause:** A monthly worksheet does not contain all required columns.

**Resolution:** Confirm row 1 contains:

```text
Data | Categoria | Descrição | Entrada (R$) | Saída (R$)
```

Do not add title rows above the header row.

### A Month Is Disabled

**Cause:** The worksheet contains no valid transaction rows.

**Resolution:** Add at least one transaction below the header. Refresh the dashboard.

### Values Are Zero or Incorrect

Check the following:

- Income values are in the income column.
- Expense values are in the expense column.
- Cells are numeric rather than text.
- Decimal formats are consistent with the workbook locale.
- A transaction does not place values in both amount columns.
- Thousand and decimal separators are not mixed incorrectly.

The parser supports common Brazilian and international decimal formats, but native numeric cells are always preferred.

### Updates Are Not Visible

Try the following:

1. Click **Refresh Data**.
2. Wait briefly for Google's published version to update.
3. Hard-refresh the browser.
4. Confirm automatic republishing remains enabled in Google Sheets.
5. Confirm the edited worksheet is included in the published workbook.

### Charts Do Not Appear

Check whether the browser or corporate network blocks:

```text
https://cdn.jsdelivr.net/
```

Chart.js is loaded from that CDN. The KPI cards and table may continue working even if the chart library is blocked.

---

## Browser Compatibility

The dashboard is intended for current desktop and mobile versions of:

- Microsoft Edge
- Google Chrome
- Mozilla Firefox
- Safari

JavaScript and browser storage must be enabled.

Older browsers may not support all language features used by the application.

---

## Privacy and Security

This project uses a **public-data architecture**.

Publishing a Google Sheets workbook to the web makes its published content accessible outside the Google Sheets editing interface. Anyone who can inspect the dashboard source code or browser network activity may discover the spreadsheet ID and query the published data.

Do not use this architecture for sensitive information such as:

- Bank account numbers
- Credit card details
- Passwords or access tokens
- Tax identification numbers
- Personal addresses
- Confidential employer or customer information
- Detailed financial descriptions that should remain private

The dashboard does not send the workbook data to a custom server. Processing occurs in the browser, but the source workbook is still publicly obtainable from Google when it is published to the web.

For private financial data, use a protected architecture with:

- Google OAuth or another identity provider
- A private Google Sheets API integration
- A secured backend or serverless function
- Access control and authorization
- Secret management
- Appropriate logging and monitoring

GitHub Pages alone does not provide application-level authentication for this static dashboard.

---

## Known Limitations

- The current dashboard supports May through December only.
- The displayed year is fixed at 2026.
- The workbook must be publicly readable.
- There is no user authentication.
- Data is read-only; transactions cannot be edited from the dashboard.
- The Google published version may not update immediately.
- Chart.js requires access to an external CDN.
- Month-over-month comparison is unavailable when the previous month has a zero baseline.
- The dashboard reads all monthly worksheets during every refresh.
- There is no offline data cache.

---

## Possible Future Improvements

- Year selector and multi-year workbooks
- Budget versus actual analysis
- Savings-rate KPI
- Running balance chart
- Expense trend lines
- Date-range filters
- Export filtered transactions to CSV
- Light and dark themes
- Installable Progressive Web App
- Offline cache
- Google OAuth authentication
- Private Google Sheets API access
- Azure Functions or Google Apps Script backend
- Automated tests
- Accessibility audit
- Additional localization options

---

## Deployment Updates

To update the GitHub Pages site without Git or local tools:

1. Open the repository in GitHub.
2. Open `index.html`.
3. Select **Edit this file** or delete and upload a replacement.
4. Commit the change to the `main` branch.
5. Wait for GitHub Pages to publish the new version.
6. Hard-refresh the dashboard.

The site is updated automatically from the repository root after every commit to the configured publishing branch.

---

## Contributing

Suggestions and improvements are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make focused changes.
4. Test the dashboard with a non-sensitive sample workbook.
5. Open a pull request with a clear description.

When contributing, never commit private spreadsheet IDs, financial exports, credentials, API keys, or personal data.

---

## License

No license has been added to this repository yet. Until a license file is included, the repository remains under the default copyright rules and reuse is not automatically granted.

If open-source reuse is intended, consider adding a standard license such as the MIT License.

---

## Author

**Marcelo Augusto Sartori Lopes**

GitHub: [@marceloasl99](https://github.com/marceloasl99)

---

## Acknowledgements

- Chart.js for browser-based chart rendering
- Google Sheets and the Google Visualization API for published worksheet data
- GitHub Pages for static website hosting
