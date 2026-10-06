# AutoBidX — used-car marketplace & dealer auction platform

*Buy Smarter. Sell Faster.*

A full-stack B2B/B2C used-car marketplace where verified dealers list vehicles and other verified dealers
browse, bid in real-time auctions (with proxy bidding and anti-sniping), make offers, Buy Now, pay, and
track handover — with a configurable fee/commission engine and a complete admin console.

| | |
|---|---|
| **Framework** | Next.js 15 (App Router, React 19, TypeScript strict) — SSR pages + REST API routes |
| **Database** | PostgreSQL 16 via Prisma 6 (≈50 normalised tables, migrations, trigram search index) |
| **Realtime** | Server-Sent Events backed by Postgres `LISTEN/NOTIFY` (works across instances, no extra infra) |
| **Jobs** | Postgres-backed queue (`FOR UPDATE SKIP LOCKED`) + scheduler; run in-process or as a worker |
| **Auth** | bcrypt passwords, HS256 JWT in an httpOnly cookie, server-side sessions (revocable), RBAC |
| **Media** | sharp: content-sniffed uploads re-encoded to WebP + thumbnails, served via a CDN-ready `/media` route |
| **Documents** | pdf-lib: tax invoices, fee invoices, receipts, sale agreement, delivery challan, inspection report |
| **Styling** | Tailwind CSS v4, custom design system (no UI kit), lucide icons, hand-built SVG charts |

---

## Quick start

```bash
# 1. Postgres (or use an existing server)
docker compose up -d            # postgres:16 on :5432 (user/pass postgres/postgres)

# 2. App
cp .env.example .env            # set AUTH_SECRET to a long random string
npm install
npx prisma migrate deploy
npm run db:seed                 # ~90s: 22 dealers, 134 vehicles, 48 auctions, 288 bids, 39 orders
npm run dev                     # http://localhost:3000
```

### Demo accounts (shown on the login page only when `APP_MODE` ≠ `production`)

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@autobidx.in` | `Admin@123` |
| Admin (operations) | `ops@autobidx.in` | `Admin@123` |
| Dealer — seller (Malabar Motors, Kochi) | `seller@autobidx.in` | `Demo@1234` |
| Dealer — buyer (Pooram Auto Hub, Thrissur) | `buyer@autobidx.in` | `Demo@1234` |

Payments use a **sandbox gateway** in development: checkout redirects to `/pay/mock/…`, which plays the
provider's role and delivers an HMAC-signed webhook to the real webhook endpoint. It is disabled in production.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run worker` | Dedicated background worker (auction start/close, notifications, expiries) |
| `npm test` | 69 Vitest integration tests against a real Postgres test DB (`autobidx_test`) |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run db:seed` | Reset and reseed demo data (wipes the database!) |
| `node scripts/e2e-smoke.mjs` | Browser E2E: mobile bid → SSE update → sandbox payment → seller confirm → admin approve |

Tests need a database named `autobidx_test` (or set `TEST_DATABASE_URL`); migrations are applied automatically.

---

## What's inside

### Roles
`SUPER_ADMIN`, `ADMIN`, `DEALER` (seller + buyer; dealership members are `OWNER`/`MANAGER`/`STAFF` with
per-member *can bid* / *can list* flags), and `INDIVIDUAL_BUYER` (implemented, gated by the
`features.individualBuyers` setting). Permissions are rows in `Permission`/`RolePermission`, viewable under
Admin → Settings → Roles. Only **VERIFIED** dealerships can bid, buy, accept offers or publish.

### Auction engine — `src/server/services/auctions.ts`
* Every bid runs in a transaction that first takes `SELECT … FOR UPDATE` on the auction row, so concurrent
  bids serialise and always validate against committed state (tested with 8–10 simultaneous bidders).
* Validates: live window (server clock), min next bid = current + increment, integer amount, fat-finger
  ceiling, verified bidder, not own vehicle (attempt is flagged), not already leading.
* **Proxy bidding** (`resolveProxyBids`): bids only what is needed to stay ahead; maximums are never
  exposed; ties go to the earlier proxy. Spec example (A max ₹7L, B bids ₹5.5L → A at ₹5.6L) is a test.
* **Anti-sniping**: a bid inside `auction.antiSnipeTriggerSeconds` extends by `antiSnipeExtendSeconds`
  (with optional cap), audited and pushed live.
* **Close**: highest valid bid → reserve check → `WON` (order + invoices + notifications) /
  `RESERVE_NOT_MET` (seller may accept within N hours or relist) / `NO_BIDS`. Further bids are rejected.
* Realtime: commits emit `pg_notify` inside the transaction (delivered only on commit) → SSE streams.
  Countdown timers sync to server time; the server remains authoritative.

### Fee & commission engine — `src/server/services/fees.ts`
`Fee` (code, payer, trigger: transaction / listing / auction / featured) + `FeeRule` (fixed or %, min/max cap,
price slab, GST on/off + rate override, priority, optional subscription-plan override). Everything is edited
in Admin → Settings → Fees; nothing is hard-coded. The breakdown is computed server-side, shown before every
bid/Buy Now confirmation, and **snapshotted onto each order**. Seeded defaults reproduce the spec example:
₹6,00,000 → buyer pays ₹6,04,720, seller nets ₹5,94,000.

### Payments — `src/server/payments/*`, `src/server/services/payments.ts`
`PaymentGateway` interface with adapters: **sandbox (mock)**, **Razorpay** (Orders API, signature-verified
callback & webhook, refunds), **Stripe** (stub — pending), **bank transfer** (UTR capture → finance
reconciliation). Amounts are always derived on the server; a payment becomes `PAID` only from a verified
webhook/callback or an admin reconciliation. Webhooks are idempotent (`PaymentEvent` unique key) and amount-checked.
Statuses: pending, processing, paid, failed, refunded, partially refunded.

### Orders
Auction won / Buy Now / Offer accepted → **Payment Pending → Payment Received → Seller Confirmed →
Documents Pending → Vehicle Ready → Pickup/Delivery → Completed**, with role-checked transitions,
cancellation, disputes (freeze + payout hold), payout release, reviews after completion, and a
DB-level guard against selling a vehicle twice (`activeVehicleKey` unique).

### Admin console (`/admin`)
Dashboard (GMV, revenue, approvals, KYC, disputes, fraud + charts), dealers & KYC review, vehicles
(approve/reject/edit/suspend/feature/remove/inspect), auctions (start/stop/end), bid ledger (cancel bids),
orders, payments (reconcile/refund), disputes console (messages, internal notes, document requests,
refund/penalty/close), reports (KPIs, geography, CSV export), fraud flags, audit log, platform settings
(~45 rules), fee rules, subscription plans, CMS (legal pages, help, FAQs, banners), roles matrix.

### Security
bcrypt + login lockout; revocable server sessions; RBAC on every API route; CSRF Origin check on all
cookie-authenticated mutations; Zod validation; Prisma parameterised queries; React escaping + safe
Markdown renderer for CMS; CSP & security headers; per-user/IP rate limits; upload content sniffing,
size limits and image re-encoding (strips EXIF/GPS); private documents served only via authorised
routes; AES-256-GCM for bank account numbers; HMAC-verified webhooks; registration/VIN masked publicly;
audit log with sensitive-field redaction; safe post-login redirects; no stack traces in responses.

### Fraud heuristics (flag for review — never auto-ban)
Rapid bidding, self-bid attempts, shared signup IP/device between bidder and seller (shill signal),
repeated failed payments, excessive bid cancellations, many accounts from one device, suspended
PAN/GSTIN re-registering.

### SEO
Canonical vehicle URLs `/cars/{make}/{model}/{year}/{code}` (`/vehicles/[id]` 308-redirects), dynamic
metadata + Open Graph, schema.org `Car` JSON-LD with `Offer`, `sitemap.xml`, `robots.txt`
(no-index outside production).

---

## Project layout

```
prisma/              schema.prisma, migrations (incl. trigram + partial indexes), seed.ts, seed-data.ts
src/app/(home)       landing page
src/app/(site)       marketplace: /vehicles, /cars/…, /auctions, /dealers, /dealer/[id], /checkout, /pages, /help
src/app/(auth)       /login, /register (4-step wizard), /verify, /forgot-password, /reset-password
src/app/dashboard    dealer dashboard (vehicles, auctions, bids, offers, orders, payments, documents, analytics, KYC, settings)
src/app/admin        admin console
src/app/api          REST API (auth, catalog, locations, uploads, vehicles, auctions, offers, orders, payments, admin…)
src/server           auth/, services/ (domain logic), payments/, notifications/, realtime/, jobs/, storage/, pdf/, search/
src/components       design-system primitives, vehicle/auction components, dashboard widgets, charts, forms
src/lib              formatting, validation schemas (shared client/server), ids, crypto, procedural vehicle art
tests/               Vitest integration tests (real Postgres)
scripts/             e2e smoke test, screenshot & art preview tools
```

## Production notes

* Set `APP_MODE=production`, a strong `AUTH_SECRET`, `FIELD_ENCRYPTION_KEY` (32 bytes base64), `APP_URL` (https).
* Run `npm run worker` as a separate process and set `JOBS_IN_PROCESS=false` on web instances (both are safe to
  run concurrently — auction closing locks rows; jobs use `SKIP LOCKED`).
* Put the app behind a reverse proxy that sets `X-Forwarded-For` (used for rate limits and audit IPs) and a CDN
  in front of `/media` (`MEDIA_BASE_URL`). Swap `src/server/storage` for S3/GCS for multi-instance deployments.
* Rate limiting is per-process; use Redis or the API gateway for a shared limit across instances.
* Search uses Postgres trigram + B-tree indexes; plug OpenSearch/Meilisearch in `src/server/search` beyond ~1M listings.
* Seed images are procedurally rendered vehicle illustrations (the build environment had no access to stock
  photography); dealer uploads replace them.

## Integrations pending (architecture in place)

| Area | Status |
|---|---|
| Razorpay | Adapter implemented (orders, signature verification, webhooks, refunds); needs keys + client checkout script and CSP allowance for `checkout.razorpay.com` |
| Stripe | Stub adapter — implement Checkout Sessions + webhook secret |
| Seller payouts | Payout status workflow done; bank payout API (RazorpayX / Cashfree Payouts) not connected |
| Email | Console provider in dev; SMTP/SES adapter slot in `notifications/channels.ts` |
| SMS / WhatsApp / Push | Deliveries are queued and recorded as `SKIPPED` until a provider (MSG91, Gupshup, Web Push) is configured |
| KYC verification APIs | Manual admin review; PAN/GST/bank verification APIs can be added to the KYC review step |
| Object storage / CDN | Local disk driver; S3/GCS driver to implement for multi-instance |
| Financing / insurance referrals | Fee engine supports new fee codes; referral partners not integrated |
| Legal content | CMS pages contain clearly-marked template text for counsel to replace |
