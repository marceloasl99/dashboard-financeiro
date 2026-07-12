# Personal Finance Dashboard

A generic, multi-year personal finance dashboard built with HTML, CSS, and vanilla JavaScript. It reads a single Google Sheets transaction table and automatically derives every available year and month.

## Live Demo

https://marceloasl99.github.io/dashboard-financeiro/

## Key Design Principle

The application is **not limited to May–December 2026**. It supports all twelve months and transaction dates from **1900 through 2200**. Years appear automatically in the year selector when at least one valid transaction exists for that year.

## Recommended Google Sheets Structure

Create one worksheet named exactly:

```text
Lancamentos
```

Row 1 must contain:

```text
Data | Categoria | Descrição | Entrada (R$) | Saída (R$)
```

All years must be stored in this same worksheet. New years do not require new code, new worksheets, or dashboard changes.

Example:

```text
Data        Categoria             Descrição          Entrada (R$)  Saída (R$)
01/05/2026  Pró-labore/Salário    Salário mensal     8500.00
01/05/2026  Moradia               Aluguel                          2450.00
15/01/2027  Pró-labore/Salário    Salário mensal     9000.00
15/01/2200  Outras receitas       Receita futura     1000.00
```

## How Dynamic Period Detection Works

1. The dashboard loads the `Lancamentos` worksheet.
2. Every valid date is parsed in the browser.
3. The application extracts the year and month from each date.
4. The year selector is generated from the years actually present in the dataset.
5. All twelve months are generated for the selected year.
6. Months without data are disabled.
7. January compares against December of the previous year.
8. Charts and KPIs are recalculated when the year or month changes.

## Features

- Dynamic year selector
- Support for 1900–2200
- All twelve months
- Automatic month availability detection
- Total income, expenses, and balance
- Month-over-month variation
- January-versus-December cross-year comparison
- Expense distribution chart
- Twelve-month income-versus-expense chart
- Searchable and filterable transaction table
- Google Sheets live refresh
- JSONP loading to avoid browser CORS errors
- GitHub Pages compatible
- No npm, Node.js, Git, backend, or build process required

## Google Sheets Publication

1. Open the workbook.
2. Select **File → Share → Publish to web**.
3. Publish the **entire document**.
4. Keep automatic republishing enabled.
5. Optionally set general access to **Anyone with the link — Viewer**.

The workbook must not contain sensitive financial information because published Sheets data can be accessed publicly.

## Deployment on GitHub Pages

Upload these files to the repository root:

```text
index.html
README.md
```

Then configure:

```text
Settings → Pages
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

The site will be available at:

```text
https://marceloasl99.github.io/dashboard-financeiro/
```

## Updating the Dashboard

Replace `index.html` in GitHub, commit the change, wait for GitHub Pages to redeploy, and perform a hard refresh:

```text
Windows: Ctrl + F5
macOS: Command + Shift + R
```

## Troubleshooting

### The dashboard reports that `Lancamentos` does not exist

Create or rename the master worksheet to exactly `Lancamentos`.

### Invalid headers

Confirm row 1 contains the five required headers and that no title row exists above them.

### A year does not appear

Add at least one valid date for that year to `Lancamentos`, then refresh the dashboard.

### A month is disabled

That month has no valid transactions for the selected year.

### `Failed to fetch` or CORS error

Replace the old dashboard with the current JSONP version. The current version does not use `fetch()` for Google Sheets data.

### Charts do not render

Confirm that the browser or corporate network allows access to `cdn.jsdelivr.net`, which hosts Chart.js.

## Privacy and Security

This is a public static dashboard architecture. Do not publish bank accounts, card information, passwords, tax IDs, private addresses, employer-confidential information, or sensitive transaction descriptions. For private data, use authentication and a protected backend with the Google Sheets API.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- Chart.js
- Google Visualization API
- JSONP
- GitHub Pages
- Browser localStorage

## Author

**Marcelo Lopes**

GitHub: https://github.com/marceloasl99
