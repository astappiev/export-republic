# ExportRepublic

Export your broker transactions and import them into your favorite portfolio tracker.

ExportRepublic connects to **Trade Republic** and **Scalable Capital** to pull your complete transaction history, resolves ISINs to ticker symbols, and generates ready-to-import files for tools like Ghostfolio, Portfolio Performance, TradingView, and Investbrain.

## ✨ Features

- 🔌 **Live API access** — fetch transactions via Trade Republic WebSocket or Scalable Capital browser automation
- 📄 **Offline import** — parse Trade Republic PDF statements or Scalable Capital CSV exports
- 🔍 **Symbol resolution** — automatically map ISINs to ticker symbols via TradingView, Yahoo Finance, and OpenFIGI
- 📂 **Local caching** — resolved symbols are cached in SQLite to avoid repeated lookups
- 📤 **Multiple exports** — output to Ghostfolio, Portfolio Performance, TradingView, Investbrain, or raw JSON

## 📐 Installation

Requires [Node.js](https://nodejs.org/) **v24.11.0+**.

```bash
git clone https://github.com/astappiev/export-republic.git
cd export-republic
npm install
```

## 🚀 Quick Start

```bash
# Fetch transactions from Trade Republic (interactive 2FA)
node --experimental-transform-types src/cli.ts fetch -p +49123456789

# Export directly to Ghostfolio
node --experimental-transform-types src/cli.ts fetch -p +49123456789 -f ghostfolio -o portfolio.csv

# Convert an existing CSV file
node --experimental-transform-types src/cli.ts convert transactions.csv -f tradingview

# Resolve an ISIN to a ticker symbol
node --experimental-transform-types src/cli.ts resolve US0378331005
```

### 🏦 Readers

| Reader                | Flag                     | Description                            |
|-----------------------|--------------------------|----------------------------------------|
| `traderepublic-ws`    | `-r traderepublic-ws`    | Trade Republic WebSocket API (default) |
| `traderepublic-pdf`   | `-r traderepublic-pdf`   | Parse Trade Republic PDF statements    |
| `scalablecapital-pw`  | `-r scalablecapital-pw`  | Scalable Capital via Playwright        |
| `scalablecapital-csv` | `-r scalablecapital-csv` | Scalable Capital CSV file              |

### 📊 Formatters

| Formatter             | Flag                                  | Output |
|-----------------------|---------------------------------------|--------|
| Ghostfolio            | `-f gf` or `-f ghostfolio`            | CSV    |
| Portfolio Performance | `-f pp` or `-f portfolio-performance` | CSV    |
| TradingView           | `-f tv` or `-f tradingview`           | CSV    |
| Investbrain           | `-f ib` or `-f investbrain`           | CSV    |
| JSON                  | `-f json`                             | JSON   |

## 🔗 Related Projects

- [pytr](https://github.com/pytr-org/pytr) — Python, WebSocket-based TR client
- [traderepublic-portfolio-downloader](https://github.com/dhojayev/traderepublic-portfolio-downloader) — Go, downloads PDFs & transactions
- [stoetzms-ghostfolio-importer](https://github.com/milesstoetzner/stoetzms-ghostfolio-importer) — TypeScript, PDF-based Ghostfolio import
- [TradeRepublicApi](https://github.com/Zarathustra2/TradeRepublicApi) — Python, minimal TR API wrapper
- [neobroker-portfolio-importer](https://github.com/roboes/neobroker-portfolio-importer) - Python, Selenium-based portfolio export
- [TradeRepublic-History-Exporter-For-PortfolioPerformance](https://github.com/Misterbural/TradeRepublic-History-Exporter-For-PortfolioPerformance) - JS, single file WS exporter
