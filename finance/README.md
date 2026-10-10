# Books: chat-first accounting for Indian businesses

**Chat in. Books out.** Type (or photograph) what happened in the business. The app drafts a proper double-entry voucher, you confirm it, and the books, GST and TDS positions update. Built for SMEs, LLPs, partnership firms and private limited companies, and for the CAs who look after them.

Next.js 15 · TypeScript · Tailwind · PostgreSQL/Prisma · Auth.js · Claude · Recharts · react-pdf · exceljs

## What's inside

| Area | What it does |
| --- | --- |
| **Home** | A Record card where you describe an entry → draft → edit → post, with photo OCR, inline clarifying questions and undo; books-health score and logging streak; net-profit donut; cash, bank, receivable and payable cards; GST/TDS/PF/PT due-date tiles |
| **Ask AI** | Plain-English questions answered from posted entries, with a chart and a link to the ledger. Read-only and company-scoped |
| **Invoices** | GST tax invoices: CGST+SGST or IGST from place of supply, HSN/SAC, per-FY numbering, PDF, signed share link, WhatsApp/email, UPI QR, receipts (with customer TDS), cancellation |
| **Receivables / Collect** | Ageing 0-30 / 31-60 / 61-90 / 90+; one-tap reminders carrying the invoice link and a UPI pay link |
| **Bills / Payables** | Purchase bills with photo prefill, TDS suggestions, reverse charge, input GST, payment scheduling, ageing |
| **Parties** | Customers and vendors with GSTIN check-digit and PAN validation, credit terms, default TDS section, statements |
| **Banking** | CSV/XLSX statement import, auto-match, manual match, create-entry, ignore; book vs statement balance |
| **Reports** | Trial Balance, P&L and Balance Sheet (Schedule III or Tally layout), Day Book, Ledger, Cash Flow, GSTR-1 and GSTR-3B workings, ITC register, TDS summary; every report exports to PDF and Excel |
| **GST** | Period tax position and the compliance calendar with mark-as-filed |
| **Tally** | Tally Prime XML export and import (masters + vouchers), idempotent, behind a pluggable adapter |
| **Settings / Firm** | Company profile, UPI, compliance switches, FY lock, members (owner/accountant/auditor), activity log, dark theme; CA view across all client companies |

Accounting rules: true double entry; posted vouchers are immutable (edits are reversal + new voucher, with an audit trail); Tally-style chart of accounts; April–March FY with year lock; input/output GST ledgers per head; reverse charge; round-off ledger. See [`DECISIONS.md`](DECISIONS.md) for every assumption and simplification.

## Run it locally

Prerequisites: Node 20+ (22 recommended) and PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL and AUTH_SECRET at minimum
npm install                     # also runs prisma generate
npx prisma migrate deploy       # create tables
npm run db:seed                 # demo company AUDIT TEST TRADERS (wipes the DATABASE_URL database!)
npm run dev                     # http://localhost:3000
```

Sign in with **Explore the demo company** (needs `ALLOW_DEMO_LOGIN=true`), or with an email magic link: the link is printed in the terminal running `npm run dev`.

Things to try on Home: *"Paid office rent ₹25,000 from HDFC Bank for October"*, *"Received ₹1.2L from Sahyadri"*, *"Bought stationery ₹1,800 in cash"*. On Ask AI: *"Who owes me the most?"*

### AI

Set `ANTHROPIC_API_KEY` to have Claude draft entries, read receipt and bill photos, and answer open-ended questions (model: `claude-opus-5-5`, override with `ANTHROPIC_MODEL`). Without a key, everything except photo reading works through the built-in rule-based drafter and question router. All AI calls are server-side and rate-limited.

### Customising

| Change | File |
| --- | --- |
| Colours, radii, dark theme | `src/app/globals.css` (CSS variables) |
| Chart of accounts for new companies | `src/config/chart-of-accounts.ts` |
| Due dates and notified extensions | `src/config/compliance-calendar.ts` (`EXTENSIONS` map) |
| GST rates, TDS sections and thresholds, state codes | `src/config/tax.ts` |
| Navigation | `src/components/shell/nav.ts` |
| Book Antiqua in PDFs | set `PDF_HEADING_FONT` to a licensed TTF |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` |
| `npm test` | Vitest: accounting, GST, parsing and formatting unit tests, plus Postgres integration tests (uses `TEST_DATABASE_URL`, migrate-deploy only) |
| `npm run test:e2e` | Playwright flows against the seeded demo (dev server must be running or startable). Set `PW_CHROMIUM_PATH` to use a system Chromium |
| `npm run db:seed` | Reset the database to the demo company |

## Project layout

```
prisma/              schema.prisma, migrations, seed.ts
src/config/          chart of accounts, tax tables, compliance calendar
src/lib/accounting/  core.ts (pure rules) · reports.ts (pure builders) · post.ts (posting/reversal/lock) · ledger.ts (queries)
src/lib/ai/          Claude drafter, rule drafter, Ask tools, bill OCR
src/lib/bank/        statement parser, reconciliation
src/lib/sync/        SyncAdapter interface, Tally XML
src/lib/reports/     ReportDoc builders (screen, PDF and Excel share one source)
src/lib/pdf, export/ invoice/report PDFs, Excel writer
src/app/(app)/       signed-in pages · src/app/actions/ server actions · src/app/api/ PDFs, exports, sync, auth, health
tests/ e2e/          Vitest and Playwright
```

## Deploying (Vercel)

1. Create a Postgres database (Neon, Supabase, Vercel Postgres) and set `DATABASE_URL`. For pooled connections, use the pooled URL in `DATABASE_URL` and add `directUrl` in `schema.prisma` for migrations.
2. Set `AUTH_SECRET`, `AUTH_URL` (your domain), `EMAIL_WEBHOOK_URL` and `EMAIL_FROM` for magic links, optionally the Google keys and `ANTHROPIC_API_KEY`. **Leave `ALLOW_DEMO_LOGIN` unset.**
3. Build command: `prisma migrate deploy && next build`. `postinstall` runs `prisma generate`.
4. PDF and Excel routes run on the Node.js runtime (`serverExternalPackages` in `next.config.ts`). Large reports may need a longer function timeout.
5. Replace the in-memory AI rate limiter with Redis/Upstash for multi-instance deployments (`src/lib/rate-limit.ts`).
6. Health check: `GET /api/health`.

## Not yet built

- e-Invoice IRN generation (fields exist, no IRP call)
- GST and TDS portal filing (working papers only)
- Live Tally sync (file-based only); Winman and Zoho adapters
- Inventory and closing-stock valuation
- WhatsApp Business API sending (uses `wa.me` deep links)
- A typed OTP code for email sign-in (magic link only)
