# FairSplit — Build Instructions & Technical Design

> A full, actionable product + engineering doc for building the **FairSplit** visual bill-splitting web app. Intended for your cursor to implement from scratch.

---

## Table of contents
1. Executive summary
2. Business & product features (MVP + Roadmap)
3. Interaction & state logic (concise reference)
4. Data model (Postgres schema & explanation)
5. System architecture & chosen tech stack
6. API design & endpoints (REST-style) + payloads
7. Frontend structure (Next.js) — pages, components, data flows
8. Backend structure — services, workers, CRON jobs
9. AI & OCR integration plan
10. Real-time & collaboration (WebSockets/Realtime)
11. Security, auth, privacy, GDPR considerations
12. Infrastructure, deployment & scaling
13. Testing strategy & QA
14. Monitoring, observability & backups
15. Edge cases, conflicts & dispute flows
16. Performance & cost optimizations
17. Roadmap, milestones & release checklist
18. Appendix: algorithms (debt simplification, rounding rules)

---

## 1. Executive summary
**Goal**: Build a web app where someone uploads/scans a bill, shares a link, and participants claim items to auto-split the cost. Supports multi-person shared items, provisional totals, and finalization by the bill owner.

**Primary user story (MVP)**:
- Payer uploads a receipt or enters items manually.
- AI/OCR extracts items and prices and produces a clean interactive item list.
- Payer shares a link with participants (no login required for MVP).
- Participants open the link, enter a display name, claim items they consumed, submit their selection.
- Payer finalizes the bill → totals lock and show final amounts owed.

Non-functional priorities: privacy, reliability, minimal friction (no signup), simple UI, safe defaults.

---

## 2. Business & product features
### MVP features (must-have)
- Create bill (upload receipt image or manual entry)
- OCR + AI item extraction and translation (basic)
- Shareable link accessible without login
- Claim/unclaim items by participants (session-based identity)
- Provisional totals shown, labelled "Estimated"
- Payer can finalize bill (locks and produces final totals)
- Manage unclaimed items (default to payer)
- Customizable tax & service charge (percentage-based, configurable by payer)
- Basic UI: group of pages (Create, Bill (open), Finalized, History)
- Simple export/summary (PNG or shareable final page)

### Important enhancements (v1+)
- Real-time collaboration (live updates when someone claims)
- Basic payment link integration (Stripe, PayPal, or regional e-wallet links)
- AI improvements: grouping items, suggested splits, language translate
- Receipt scanner improvements: multi-page receipts, rotated images

### Nice-to-have / future
- Persistent accounts (optional) and cross-bill balances
- Bank sync and imported transactions (Plaid or local equivalent)
- Shared wallets for couples/flatmates
- Per-user preferences and recurring bills

---

## 3. Interaction & state logic (concise reference)
States: `Draft` → `Open` → `Pending Finalization` → `Finalized` → `Archived`.

Key invariants:
- Totals are **provisional** during `Open`; only `Finalized` totals are immutable.
- Each item can be claimed by 0..N participants; share = price / N.
- Tax/service charge are customizable as percentages (applied to subtotal) and calculated proportionally to each participant's subtotal.
- Tip can be set as fixed amount or percentage (applied proportionally).
- All money arithmetic must maintain ledger zero-sum (bill total == sum of per-person shares).

UX labels: always label estimates as **Estimated** and lock/final values as **Final**.

---

## 4. Data model (Postgres recommended with Prisma)
Below is a simplified schema. Use `id` as UUID for all primary keys.

### Tables (core):

**users** (optional for MVP no-login but useful later)
- id UUID PK
- email text
- name text
- created_at timestamptz

**bills**
- id UUID PK
- code varchar (short share code)
- title text
- currency varchar
- payer_display_name text
- payer_session_id varchar (session id if anonymous)
- total_amount numeric(12,2)
- tax_percentage numeric(5,2) default 0 (percentage, e.g., 10.00 for 10%)
- service_percentage numeric(5,2) default 0 (percentage, e.g., 5.00 for 5%)
- tax_amount numeric(12,2) (calculated: subtotal * tax_percentage / 100)
- service_amount numeric(12,2) (calculated: subtotal * service_percentage / 100)
- tip_amount numeric(12,2)
- status enum('draft','open','pending','finalized','archived')
- created_at timestamptz
- finalized_at timestamptz nullable
- auto_close_at timestamptz nullable

**items**
- id UUID PK
- bill_id UUID FK -> bills.id
- name text
- quantity integer default 1
- unit_price numeric(12,2)
- total_price numeric(12,2)
- notes text
- created_at timestamptz

**participants** (session-based or user-based)
- id UUID PK
- bill_id UUID FK
- session_id varchar (for anonymous user sessions) OR user_id UUID nullable
- display_name text
- joined_at timestamptz
- is_payer boolean default false
- paid_amount numeric(12,2) default 0

**claims**
- id UUID PK
- bill_id UUID FK
- item_id UUID FK
- participant_id UUID FK
- share_count integer default 1 (for fractional shares, rarely used)
- created_at timestamptz

**final_totals**
- id UUID PK
- bill_id UUID FK
- participant_id UUID FK
- subtotal numeric(12,2)
- tax_share numeric(12,2)
- service_share numeric(12,2)
- tip_share numeric(12,2)
- total numeric(12,2)

**events / audit_log**
- id UUID PK
- bill_id UUID nullable
- actor_session varchar
- action varchar (e.g., 'claim_item','unclaim_item','finalize_bill')
- payload jsonb
- created_at timestamptz

Notes:
- Use `numeric(12,2)` to avoid floating point money inaccuracies; internal math may use integers (cents) instead.
- Consider storing all monetary values in cents (integer) for easier rounding.

---

## 5. System architecture & chosen tech stack
**Frontend**: Next.js (TypeScript) — React components, server-side rendering limited to marketing pages, but use client-side for bill interactions and a hybrid approach.

**Backend**: Node.js with **Fastify** or **NestJS** (NestJS recommended if you prefer structure/DI). Use TypeScript. Provide a REST API + WebSocket gateway.

**Database**: PostgreSQL (managed: Supabase / Neon / AWS RDS)

**ORM**: Prisma (Type-safe, developer-friendly)

**Realtime**: WebSocket server (Socket.IO or using Realtime in Supabase). If using Vercel/Serverless, consider using a dedicated realtime layer (e.g., Supabase Realtime or a Pusher-like service).

**File storage**: S3-compatible (AWS S3, or DigitalOcean Spaces, Supabase Storage) for receipts.

**OCR / AI**:
- OCR: Google Cloud Vision or AWS Textract (paid, higher accuracy) or Tesseract.js (free, client-side but less accurate). Use a server-side job for robust parsing.
- AI: OpenAI (GPT-4/GPT-4o or cheaper model) for translation & structured extraction cleanup and labeling.

**Cache / Jobs**: Redis for short-lived sessions, locks, and background queue (BullMQ). Use background workers for OCR and AI parsing.

**Payments**: Stripe (for global), and alternatives for region-specific e-wallets (Xendit, Midtrans, GoPay link generation). Minimal v1: just generate a payment link that payer can paste.

**Hosting / infra**: Frontend on Vercel, Backend on a Node host (Railway, Render, Fly.io) or serverless functions (but avoid long-running OCR tasks). DB on managed provider.

**Monitoring**: Sentry for errors, Prometheus + Grafana or NewRelic for metrics; Log aggregation (LogDNA / Datadog).

---

## 6. API design & endpoints (REST-style)
> Base: `POST /api` prefixed or `/v1` recommended.

### Auth: (MVP: no auth required for participants; use session tokens)
- `POST /api/sessions` → create anonymous session (returns session_id) — optional

### Bills
- `POST /api/bills` — create bill (body: title, currency, items[] optional, payer_display_name, auto_close, tax_percentage, service_percentage)
- `GET /api/bills/:billId` — read bill (shows items, participants, claims, status)
- `PATCH /api/bills/:billId` — update bill settings (payer only; body: tax_percentage, service_percentage, tip_amount)
- `POST /api/bills/:billId/upload` — attach receipt image (returns file location)
- `POST /api/bills/:billId/parse` — trigger OCR/AI parse (background job; returns job id)
- `POST /api/bills/:billId/share` — generate share link / short code
- `POST /api/bills/:billId/finalize` — finalize bill (payer only)
- `POST /api/bills/:billId/reopen` — reopen after finalize (payer only)
- `POST /api/bills/:billId/close` — archive or close

### Items
- `POST /api/bills/:billId/items` — add item manually
- `PATCH /api/bills/:billId/items/:itemId` — edit item
- `DELETE /api/bills/:billId/items/:itemId` — remove item

### Participants & claims
- `POST /api/bills/:billId/participants` — join bill (display_name, session_id)
- `GET /api/bills/:billId/participants` — list participants
- `POST /api/bills/:billId/items/:itemId/claim` — claim an item (participant_id)
- `POST /api/bills/:billId/items/:itemId/unclaim` — unclaim
- `GET /api/bills/:billId/claims` — list claims

### Final totals & export
- `GET /api/bills/:billId/totals` — provisional or final totals (depending on state)
- `GET /api/bills/:billId/export` — export summary as JSON / PDF

### Webhook / realtime
- `POST /api/webhooks/ocr` — OCR job callback (if using external provider)

**Payload notes**: prefer JSON with all IDs as UUIDs. For monetary values accept integer cents. For tax_percentage and service_percentage, accept decimal numbers (e.g., 10.5 for 10.5%, 0 for no tax/service charge).

---

## 7. Frontend structure (Next.js)
**Folder structure (example)**
```
/app
  /bills
    /[code]
      page.tsx          // Bill view (open + finalized states)
      client.tsx        // client components
  /create
    page.tsx            // Create new bill page
  /api                 // Next.js API routes (if using Next backend)
/components
  /BillItemCard
  /ParticipantsList
  /TotalsSummary
  /ClaimButton
/lib
  /apiClient.ts
  /useSocket.ts
/styles
/pages
  index.tsx

```

### Key pages & components
- **Create Page**: upload image or enter items; quick preview of parsed items; tax & service charge percentage inputs; share button.
- **Bill View (public)**: shows items, per-item claim controls, participant list, provisional totals, tax/service charge settings (editable by payer), finalize CTA (payer only).
- **Finalized View**: read-only summary, payment links, export.
- **History / Dashboard** (optional): list of bills created by session.

### UX details
- Use optimistic UI for claim/unclaim — update locally and reconcile with server.
- Show small non-blocking toasts for others’ actions.
- Provisional totals UI: show a small badge `Estimated` with tooltip explaining why it can change.

---

## 8. Backend structure — services, workers, cron
**Core services**
- API server (Fastify/NestJS) — handles requests, validation, sessions.
- Realtime server (Socket.IO or Realtime provider) — propagates claims in Open state.
- Worker queue (BullMQ) — processes OCR and AI parsing jobs and any heavy tasks.

**Background jobs**
- OCR job: extract raw text from receipt
- AI cleanup job: parse items, normalize prices, translate names
- Auto-close job: finalize bills after timeout
- Export job: generate PDF/PNG receipts on demand

**CRONs**
- Daily cleanups for abandoned draft bills older than X days
- Retry failed OCR jobs

---

## 9. AI & OCR integration plan
**Roles**:
- OCR: convert image -> text blocks with positions and line items.
- AI (LLM): convert OCR text to structured JSON items, prices, quantity, and currency; translate item labels when needed.

**Design**:
1. User uploads image -> stored in S3. API enqueues OCR job with file pointer.
2. Worker pulls job -> calls OCR provider (Vision API / Textract / Tesseract). Returns raw text + confidence.
3. Worker calls LLM (prompt) with raw text asking to extract items in strict JSON schema.
4. Save items to DB and mark bill status `open`.

**Prompt design (example)**
- Provide instructions: "Return JSON array of {name, quantity, unit_price, total_price, currency}".
- Provide heuristics: parse common patterns (e.g., `2x`, `x2`, currency symbols), strip VAT lines, detect totals.
- Always ask the model to also return `confidence` and a `summary` text for the payer to verify.

**Fallbacks**
- If OCR confidence < threshold, mark as `requires_manual_review` and show editable items to payer before sharing.

---

## 10. Real-time & collaboration
**Options**:
- Socket.IO (self-hosted) — easy to implement, fallback to polling.
- Supabase Realtime — if using Supabase, it’s integrated.
- Pusher/Ably — managed service, easier at scale.

**Live events**
- `participant_joined` — update participant list
- `item_claimed` / `item_unclaimed` — update item card and provisional totals
- `bill_finalized` — update all clients to final view

**Optimistic updates**
- For claim/unclaim: update UI immediately; send API call; reconcile if server rejects.

---

## 11. Security, auth, privacy, GDPR
**Minimal auth approach (MVP)**
- Anonymous session tokens per participant stored in cookie (httpOnly) and in DB `participants.session_id`.
- Share link contains bill code only (no PII). Avoid embedding session tokens in public link.

**Security controls**
- Signed URLs for receipt images with short TTL.
- Rate limiting on public endpoints to reduce scraping/abuse.
- Validation & sanitization of all inputs (avoid injection in OCR -> LLM flows).

**Privacy**
- Keep minimal PII (display name only). Optionally support authenticated accounts later.
- Data retention policy and “delete bill” feature.
- Offer explicit consent for storing uploaded receipts longer than X days.

**GDPR considerations**
- Provide endpoints to delete personal data (`DELETE /api/bills/:billId` and anonymize participants).
- Privacy policy explaining what is stored and why.

---

## 12. Infrastructure, deployment & scaling
**Suggested small-scale infra**
- Frontend on Vercel (Next.js). Use ISR for landing, client-side for bill interactions.
- Backend on Render or Railway (Node service + Worker service). Or use Fly.io for low latency.
- DB on Supabase / Neon (Postgres).
- Redis on Upstash or Cloud provider for queue & locks.
- S3 for receipts.
- Optional: Cloud CDN for exported images.

**Scaling notes**
- OCR/AI jobs are CPU/IO heavy: keep them in worker fleet with autoscaling.
- Realtime: when scale > thousands concurrent, consider managed realtime (Pusher/Ably) or scale websockets via cluster and sticky sessions / Redis pubsub.

---

## 13. Testing strategy & QA
- Unit tests: business logic (claims, splits, rounding, finalization). Jest + supertest for API.
- Integration tests: flow tests (upload -> OCR -> participants claim -> finalize). Use Playwright for e2e.
- Contract tests for AI parsing (feed sample OCR text -> expect canonical JSON schema).
- Load tests: simulate many participants claiming simultaneously (k6).

---

## 14. Monitoring, observability & backups
- Error tracking: Sentry.
- Metrics: Prometheus + Grafana or Datadog.
- Logs: structured logs shipped to LogDNA/Datadog.
- Daily DB backups + point-in-time recovery if supported.

---

## 15. Edge cases, conflicts & dispute flows
Edge cases to explicitly handle:
- **Two people claiming same single-serving item**: allow it (split) or show conflict toast ("this looks shared — split automatically?").
- **Unclaimed items**: highlight and require payer resolution on finalization.
- **Partial payments**: users can mark partial paid; remaining balance tracked.
- **Rounding errors**: distribute cents to payer or last claimant; show note on final summary.
- **Fraud/abuse**: user could generate many bills to spam. Rate limit and consider CAPTCHA on high usage.

Dispute flow:
- Participant clicks "Request Reopen" which triggers a payer notification. Payer can `Allow` or `Dismiss`.
- All actions logged in `audit_log`.

---

## 16. Performance & cost optimizations
- Run OCR/AI in background, not synchronous in request.
- For small receipts, allow client-side Tesseract parsing to save server cost as fallback.
- Cache parsed results for identical images (hash) to avoid repeated OCR.
- Use efficient DB queries and proper indexes (bill_id on items, participant_id on claims).

---

## 17. Roadmap, milestones & release checklist
### Phase 0 — Discovery & design
- Finalize UX flows, wireframes, and acceptance criteria.

### Phase 1 — MVP (2–4 sprints)
- Implement core create/claim/finalize flows (no login).
- OCR pipeline (basic) + manual edit UI.
- Share link and session management.
- Finalization flow and export.
- Testing: unit + integration + e2e.

### Phase 2 — Early enhancements
- Real-time sync
- Payment integration (payment links)
- Improved AI parsing and translation

### Phase 3 — Growth features
- Accounts and cross-bill balances
- Shared wallets
- Bank sync

Release checklist before public release:
- Security audit + penetration testing
- Privacy policy + TOS
- Monitoring + alerting
- Load testing

---

## 18. Appendix: algorithms
### Debt simplification / minimize number of transactions
Goal: given balances (positive = owed to payer(s), negative = owes), minimize number of transfers.

Simple greedy algorithm (works well):
1. Build list of (user, balance) for unsettled balances.
2. Repeatedly match largest creditor with largest debtor and settle min(|debtor|, creditor).
3. Subtract amount and repeat until all near-zero.

This yields O(n log n) with sorting and is easy to implement. For exact minimal number of transactions there are NP-hard cases but greedy is acceptable for small groups.

### Rounding rules
- Store money in cents (integers). Compute shares per item using integer division and remainder. Distribute remainder by assigning +1 cent to the earliest claimant(s) to ensure sum of shares == item total.
- When applying tax/service charge (percentage-based):
  1. Calculate participant's tax share: `(participant_subtotal * tax_percentage) / 100` using integer math (store percentage as integer basis points, e.g., 1000 = 10.00%).
  2. Calculate participant's service share: `(participant_subtotal * service_percentage) / 100` similarly.
  3. Distribute rounding remainder by assigning +1 cent to the earliest claimant(s) to ensure sum of tax/service shares == total tax/service amount.
  4. Example: If subtotal = $100, tax_percentage = 10%, then tax = $10.00. If participant has $30 subtotal, their tax share = ($30 * 10) / 100 = $3.00.

---

## Final notes & recommended next steps for your cursor
1. Start with a one-week spike: implement a simple create bill -> manual items -> share link -> claim flow (no OCR, no real-time). Use in-memory store or local Postgres.
2. Add background OCR job and LLM cleanup as a separate iteration.
3. Add finalization UI and tests.
4. After MVP, integrate realtime and payments.

---

If you want I can also:
- Produce an **API Postman collection** (JSON) ready for devs.
- Produce a **Next.js starter skeleton** (file list + example components).
- Produce **detailed acceptance test cases** for QA.

Tell me which of the three you want next and I will generate it.

