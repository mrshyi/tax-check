# Tax Check

Tax Check is a local-first overseas securities tax worksheet for mainland China tax residents. It turns broker statements into an auditable view of realized capital gains, dividends, withholding tax credits, exclusions, transfers, and items that still need manual confirmation.

## MVP Scope

- Mainland China resident rules as the default lens.
- Capital gains: annual realized stock gain/loss netting, converted to RMB, then 20% estimated tax.
- Dividends: gross dividend income, less foreign withholding tax credit where present, then estimated China top-up tax.
- Separate realized trades, dividends, open positions, exclusions, and review issues.
- Initial parser adapters for Futu Excel workbooks and Longbridge encrypted monthly PDFs.

This app produces an estimate and working paper. It is not legal or tax advice.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
