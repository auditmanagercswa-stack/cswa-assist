# Decisions & assumptions

Notes on choices made while building, where the brief left room or the environment forced a call.

## Stack

| Brief | Decision | Why |
| --- | --- | --- |
| Next.js 15, TypeScript strict | Next 15.5 App Router, `strict: true`, target ES2022 | ES2022 for `BigInt` literals. |
| Tailwind + shadcn/ui | Tailwind v4 + hand-written shadcn-style components (`src/components/ui`) on Radix primitives | The shadcn CLI downloads from its registry, which the build sandbox couldn't reach. The components follow shadcn's API (`Button` with `asChild`, `cva` variants), so `npx shadcn add …` can be used later. |
| PostgreSQL via Prisma (SQLite fallback) | PostgreSQL 16 everywhere | Postgres was available. Raw SQL aggregates use Postgres syntax (`date_trunc`, `::bigint`), so SQLite is **not** supported. |
| Auth.js email OTP / magic link + Google | Magic link (Auth.js email provider) + Google + dev-only demo login | No SMTP dependency: links print to the console in dev, or go to `EMAIL_WEBHOOK_URL`. A typed 6-digit OTP isn't implemented — the magic link carries the one-time token. JWT sessions so the Credentials-based demo login works. |
| Fonts | Inter and JetBrains Mono from `@fontsource`; Book Antiqua from the user's system with Palatino/Georgia fallbacks | Google Fonts was unreachable at build time, and Book Antiqua is a licensed Monotype face, so it isn't bundled. PDFs use Times-Roman unless `PDF_HEADING_FONT` points to a TTF. Excel files name "Book Antiqua" directly (Office ships it). |
| Claude | `claude-opus-5-5` (override with `ANTHROPIC_MODEL`), structured outputs via `beta.messages.parse` + Zod, server-side refusal fallback (`fallbacks: "default"`), `effort: "low"` for drafting | Drafting is extraction work; low effort keeps it fast. The chart of accounts is a cached prompt block. |

## Money, dates, numbering

- Money is **BigInt paise** in the database, converted to JS numbers at the data-access edge. Safe up to about ₹90 trillion.
- Accounting dates are `@db.Date` (UTC midnight). "Today" is computed in the server's local date; "days" in streaks use IST.
- Voucher numbers are assigned **on posting** from a per-company, per-FY, per-type series: `PMT/26-27/0007`. Drafts have no number. Invoices have their own series: `INV/26-27/0001`.
- PDFs print **"Rs."** instead of ₹ because react-pdf's built-in fonts lack the rupee glyph. Supplying `PDF_HEADING_FONT` doesn't change body text.

## Accounting rules

- **Immutability:** posted vouchers are never edited or deleted. "Undo" and "Reverse" post a mirror voucher on the same date. "Amend" reverses and opens a draft copy. A reversal can't itself be reversed. Every step is in `AuditLog` (who, when, before/after).
- **FY lock** is a single `booksLockedUpto` date. Posting or reversing on or before it is refused. Only the owner can lock or unlock.
- **Opening balances** live on the ledger (`openingPaise`). If they don't balance, the balance sheet shows "Difference in opening balances", as Tally does, rather than hiding it.
- **P&L ledgers restart each FY.** Year-end closing entries aren't posted; the balance sheet shows cumulative P&L as "Surplus in Profit & Loss".
- **Inventory** isn't valued. There's no stock module, so closing stock must be journalised manually. Noted on the P&L.
- **GST set-off** in the 3B working is simplified (total ITC against total output). The portal's head-wise utilisation order isn't modelled, and RCM is shown as payable in cash.
- **TDS:** the section and rate come from `src/config/tax.ts`. Suggestions use the vendor's default section and warn when one bill is below the annual threshold. Cumulative-threshold tracking isn't automated.
- **Professional tax** due dates use Maharashtra's rule (end of month). Change `PROF_TAX` in `src/config/compliance-calendar.ts` for other states.

## AI behaviour

- The model never posts. Every draft is validated server-side (Zod schema, ledger names resolved to this company's ledgers, Dr = Cr) and shown for confirmation.
- Unknown ledgers are parked in **Suspense** with a warning; confidence below 0.6 asks one question inline.
- **Learning:** when the user swaps the drafted ledger for another, the sentence's keywords are stored as `MappingHint` rows. They're sent to Claude as "learned hints" and win in the rule-based drafter.
- **No API key:** a rule-based drafter (`src/lib/ai/rules.ts`) and keyword question router keep the app usable. Receipt and bill OCR need a key.
- **Ask your books** never runs model-written SQL. Claude can only call the read-only tools in `src/lib/ai/ask-tools.ts`, each one parameterised (Zod) and scoped to the caller's company.

## Security

- Tenancy: `getCtx()` resolves the company from a cookie **validated against memberships**. Every query takes `companyId` from there, never from the client. Services re-check that referenced ledgers, parties and documents belong to that company.
- Roles: owner, accountant, auditor. Auditors are read-only, enforced in the services (`assertCanWrite`) and not just hidden in the UI.
- AI endpoints are rate-limited per user (20/min). The limiter is **in-memory**, fine for a single Node process; use Redis/Upstash on serverless or multi-instance deployments.
- PAN and bank account numbers are masked in the UI (`mask()`). Bank ledgers store only masked account numbers. Server logs don't print request bodies.
- Invoice share links are HMAC-signed per invoice (`AUTH_SECRET`). Rotating the secret invalidates old links.

## Integrations

- **Tally:** XML export and import behind a `SyncAdapter` interface (`src/lib/sync`). Import is idempotent: it skips existing ledgers, previously imported vouchers, and this app's own vouchers coming back (same number and date). Live Tally ODBC/HTTP sync isn't implemented; the sidebar dot reflects the last file sync.
- **Winman / Zoho:** listed as planned adapters.
- **e-Invoice (IRP):** `irn` and `ackNo` fields exist on invoices but nothing calls the IRP.
- **GST/TDS filing:** working papers only, no portal or GSP integration.
- **WhatsApp:** `wa.me` deep links with a prefilled message, no WhatsApp Business API.

## Testing

- `npm test`: Vitest. Pure accounting, GST, parsing and formatting tests, plus integration tests against `TEST_DATABASE_URL`. Global setup runs `prisma migrate deploy` only (non-destructive). Each run creates its own company, so runs are isolated by tenancy instead of wiping the database.
- `npm run test:e2e`: Playwright against the seeded demo (`ALLOW_DEMO_LOGIN=true`). The flows **write** to the demo company (entries, an invoice), so reseed afterwards for a pristine demo.

## Demo data

`npm run db:seed` **truncates the database named in `DATABASE_URL`** and creates AUDIT TEST TRADERS (Pvt Ltd, Pune) with FY 2026-27 activity up to today: about 25 invoices, 35 bills, salaries, rent, GST and TDS settlements, a bank statement with some unmatched lines, one draft, one overdue filing, and a vendor without a GSTIN, so the health score has something to say. A second company (SHREE GANESH ENTERPRISES) populates the firm view. Users: `owner@demo.in`, `accountant@demo.in`, `auditor@demo.in`. All parties, GSTINs and figures are fictitious.
