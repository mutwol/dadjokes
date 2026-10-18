# Backend architecture

How the Daddy Jokes API is built, why, and what comes next. The product: every reader gets
**one curated dad joke a day**, opened like a status; anyone can also write jokes and get tipped.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| API style | REST + OpenAPI, typed client generated for the web app | Few, fixed screens and one client. The hard parts (open-once, webhooks, uploads, live counts) are commands and streams that REST and SSE handle well. GraphQL can be added later as another layer over the same services, if native or partner clients appear. |
| Shape | Modular monolith: one NestJS codebase, two processes | `api` serves HTTP; `worker` runs queues and scheduled jobs. No microservice overhead; modules talk through services, so one can be split out later. |
| Framework | NestJS 12 | Modules, DI and guards fit the domain. `nestjs-zod` doesn't support Nest 12 yet, so `src/common/zod.ts` provides a small validation pipe and OpenAPI decorators. |
| Validation | Zod 4 | One schema gives runtime validation, TypeScript types and the OpenAPI document. |
| Database | PostgreSQL 16 with Drizzle ORM | SQL-first, so constraints, `pg_trgm`, partitioning and upserts stay explicit. Migrations are plain SQL files. No native engine binaries (Prisma's migration engine is one). |
| Queues | Redis + BullMQ | Email now. Later: hourly delivery, push fan-out, stats rollups, payouts. |
| Errors | RFC 9457 problem details with a stable `code` | The web app shows the `title` or maps the `code` to its own copy. |

## Layout

```
apps/web               React app (Vite)
apps/api               NestJS: src/main.ts (HTTP), src/worker.ts (queues), src/openapi.ts (spec export)
  src/common           zod pipe + OpenAPI decorators, problem-details filter
  src/config           validated environment
  src/db               Drizzle schema, SQL migrations, migrate + seed scripts
  src/auth             email codes, Google sign-in, sessions, guards
  src/users            /me, onboarding, roles, preferences, handles, topics
  src/creators         writer lists and subscriptions
  src/mail             queue producer (api) and SMTP processor (worker)
  src/platform         audit log and the domain-event outbox, used by every module
  src/moderation       appeals against takedowns
  src/rules            rule sets: model, evaluator, versions, system rule sets
  src/automation       workflows: admin API (api) and the engine (worker)
  src/admin            admin console read models, people management, landing data
  test                 end-to-end tests against real Postgres and Redis
packages/contracts     openapi.json + generated types + typed client
```

## API conventions

- **Paths:** URI versioning (`/v1/...`), plural nouns, sub-resources only for real commands (`/onboarding`, later `/open`, `/decision`).
- **Auth:** every route needs a bearer access token unless marked `@Public()`. `@Roles("writer")` guards writer-only routes. Roles are read from the database on each request, so switching reading/writing applies immediately.
- **Sessions:** 15-minute JWT access token in memory on the client; 30-day refresh token in an httpOnly cookie scoped to `/v1/auth`, rotated on every use. Replaying an old refresh token revokes the session.
- **Sign-in codes:** 6 digits, HMAC-hashed, 10 minutes, single use, 5 attempts, 30 seconds between sends, 5 per hour per email. The response is the same whether or not the email has an account.
- **Validation errors:** 422 with `errors: [{ path, message }]`.
- **Pagination:** opaque `cursor` and `nextCursor` (`{ data, nextCursor }`).
- **Rate limits:** 120 requests/minute by default; stricter on sign-in routes.
- **Screen-shaped writes:** `POST /v1/me/onboarding` saves everything from onboarding in one transaction, so a half-finished sign-up never leaves partial data.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/auth/email/start` | Email a sign-in code |
| POST | `/v1/auth/email/verify` | Exchange the code for a session (`isNew` tells the app to onboard) |
| POST | `/v1/auth/google` | Sign in with a Google ID token (needs `GOOGLE_CLIENT_ID`) |
| POST | `/v1/auth/refresh` · `/v1/auth/logout` | Rotate or end the session |
| GET · PATCH | `/v1/me` | The signed-in person; edit profile |
| POST | `/v1/me/onboarding` | Profile, roles, preferences, subscriptions and payout in one call |
| PUT | `/v1/me/roles` | Turn reading/writing on or off (at least one stays on) |
| PATCH | `/v1/me/preferences` | Delivery hour, joke origin, topics |
| PUT · DELETE | `/v1/me/payout-method` | M-Pesa number for tips (writers) |
| GET | `/v1/handles/{handle}/availability` | Username check with a suggestion |
| GET | `/v1/topics` | Topics for onboarding |
| GET | `/v1/creators` · `/v1/creators/{handle}` | Writers, most subscribed first |
| GET · PUT · DELETE | `/v1/me/subscriptions[/{creatorId}]` | Subscribe to writers |
| POST · GET | `/v1/me/jokes` | Submit a joke (text or image) · list mine (writers) |
| GET · POST | `/v1/me/jokes/{id}` · `/{id}/withdraw` | One of mine · withdraw before its day starts |
| POST | `/v1/me/uploads` | Signed URL to upload a joke image to (writers) |
| GET | `/v1/me/studio` | Reach, picks and tips for my jokes |
| GET | `/v1/me/today` | Today's joke (sealed until opened), this week, next delivery, streak |
| POST | `/v1/me/deliveries/{date}/open` | Open the joke for one of my days ("open once") |
| GET | `/v1/jokes/{id}` | A joke I've opened (or wrote, or any for curators) |
| GET | `/v1/curation/queue` | Jokes waiting for review with possible copies (curators) |
| GET | `/v1/curation/calendar` | Which days have a joke, everywhere and per region |
| POST | `/v1/curation/jokes/{id}/schedule` · `/decline` | Pick a day · decline with a reason |
| PUT · DELETE | `/v1/jokes/{id}/reaction` | React (one per reader, replaceable) · take it back |
| GET · POST | `/v1/jokes/{id}/comments` | Comments, newest first · add one |
| DELETE | `/v1/comments/{id}` | Delete my comment (curators: any) |
| GET | `/v1/jokes/{id}/live` | Server-sent events with live counts |
| POST | `/v1/reports` | Flag a joke or comment |
| POST | `/v1/events` | Batched replays and shares |
| GET | `/v1/me/studio/daily` | Opens, reactions, comments per day (14 days) |
| GET · POST | `/v1/curation/reports` · `/resolve` | Open reports grouped by target · dismiss or take down |
| GET · POST | `/v1/me/activity` · `/read` | Activity feed with unread count · mark read |
| GET | `/v1/push/config` | Whether push is on, and the VAPID public key |
| PUT · DELETE | `/v1/me/push-subscriptions` | Push to this browser · stop |
| POST | `/v1/jokes/{id}/tips` | Tip with an M-Pesa STK push |
| GET | `/v1/tips/{id}` | How my tip is going |
| GET | `/v1/me/balance` | Tips available to withdraw (writers) |
| GET · POST | `/v1/me/payouts` | Withdrawals · withdraw to M-Pesa (B2C) |
| GET | `/health` | Postgres and Redis status |

v1 added the public landing data, appeals, comment hiding, the admin console, rule sets and
workflows: see [v1-implementation.md](./v1-implementation.md) for those endpoints.

Interactive docs run at `http://localhost:3000/docs` in development.

## Adding an endpoint

1. Define request and response schemas with `named("Name", z.object({...}))` in the module's `schemas.ts`.
2. In the controller: `@Body(zod(Schema))` to validate, `@ApiZodBody(Schema)` and `@ApiZodResponse(200, ResponseSchema)` to document, and an `operationId`.
3. Throw `new AppError(status, "stable_code", "User-facing title.")` for expected failures.
4. Add an e2e test in `apps/api/test`.
5. Run `pnpm contracts` from the root to regenerate the client types the web app uses.

Schema changes: edit `src/db/schema.ts`, run `pnpm --filter api db:generate`, review the SQL in `src/db/migrations`, then `pnpm db:migrate` (or `pnpm db:up`, which rebuilds the `migrate` container and applies it).

## Local data

`docker compose up` runs the `migrate` service (built from `apps/api/Dockerfile`) once Postgres
is healthy: `node dist/db/migrate.js`, then `node dist/db/seed.js` unless `SEED=false`. The seed
is idempotent and refuses to run with `NODE_ENV=production` unless `ALLOW_SEED=true`.

Test jokes live in `src/db/seed-jokes.ts`, each with a day relative to today. Their ids are
derived from a fixed key, so re-seeding moves the same rows to new days instead of adding rows;
a day already taken by a real (non-seed) joke is left alone and the test joke goes back to review.

## What comes next

**Phase 2: the daily joke (done)**
- `jokes` move through in_review → scheduled → delivered, or declined / withdrawn. The database
  allows one joke per day everywhere plus one per day per region.
- Curators see possible copies: other jokes with trigram similarity of 0.5 or more (`pg_trgm`).
- A day can be scheduled only before it has started anywhere on Earth (UTC+14), so nobody
  misses a joke that was added after their delivery.
- `deliveries (user_id, local_date, joke_id, delivered_at, expires_at, opened_at)`. The worker runs
  delivery every 5 minutes: each reader whose local hour has come gets that day's joke (their
  country's when they chose local jokes), once, thanks to the primary key. Today's screen also
  delivers on the spot if the job hasn't run yet.
- A delivered joke is sealed until opened and can be opened for 24 hours; after that it's missed.
  Opened jokes stay readable.
- Images upload straight from the browser to storage with a signed PUT URL pinned to the exact
  type and size. On submit the API checks the file exists, is the writer's own, and that its
  first bytes match the type. `STORAGE_DRIVER=local` (disk, served at `/media`) or `s3` (S3, R2,
  MinIO). Orphaned uploads (never submitted) can be cleaned up with a bucket lifecycle rule on `jokes/`.

**Phase 3: engagement and stats (done)**
- `reactions` (one per reader per joke), `comments` (soft-deleted), `reports` (one per person per
  joke or comment), `joke_events` (replays, shares). Only people who can see a joke (opened it,
  wrote it, or curate) can react, comment or report; writers can't react to their own jokes.
- Live counts: `GET /v1/jokes/:id/live` is a server-sent events stream. Any change publishes a
  tiny "changed" message on Redis (`dj:joke:<id>`), so it works across several API processes;
  each stream then reloads the counts, folding bursts into one update. The web app reads it with
  fetch, since EventSource can't send the Authorization header.
- Curators see open reports grouped by what was reported and can dismiss them or take the joke
  or comment down. A taken-down joke (`removed_at`) disappears for readers and stops being delivered.
- The worker rebuilds `joke_stats_daily` every 15 minutes (and at start) for the last two days,
  recomputing rather than incrementing, so reruns are harmless. Studio's chart reads it.

**Phase 4: notifications and money (done)**
- `notifications` feed the Activity screen: picks, declines, a joke going out or being taken down,
  new subscribers (once each), comments, tips and payouts. Each also goes out as Web Push to the
  person's browsers (`push_subscriptions`); readers also get "today's joke is here". The worker
  sends push and drops subscriptions the push service says are gone. Push is off until the
  VAPID keys are set.
- Tips: `POST /v1/jokes/:id/tips` sends an STK push to the tipper's phone. Safaricom's callback
  (on a secret path) only records the receipt; a status query decides the result, and a
  minute-by-minute sweep settles any tip whose callback never came. Settling happens once.
- Ledger: `ledger_entries` is double-entry in cents. Every transaction balances, enforced by a
  deferred trigger at commit; entries can't be changed or deleted. A paid tip of 100 posts
  +10000 to `mpesa:clearing`, −9000 to `creator:<id>:pending` and −1000 to `platform:fees`
  (at the writer's fee policy). A writer's withdrawable balance is what `creator:<id>` is owed.
- Payouts: the balance is debited when the writer asks (under a per-writer lock, so it can't be
  overdrawn), then the worker sends a B2C payment. A failed payout posts a reversal, so the money
  is back in the balance.
- `MPESA_MODE=fake` (default) needs no Safaricom account; `sandbox` and `production` use Daraja.
  In fake mode `MPESA_FAKE_SETTLE=prompt` (default) shows the tipper a simulated M-Pesa PIN prompt
  in the app; their answer goes to `POST /v1/tips/:id/simulate` and is fed through the STK callback
  handler, so the tip settles through the real path (receipts start with `SIM`). `auto` settles by
  itself after ~3s (phones ending 0000 fail, 1111 cancel); the tests use `auto`.

**Money v2 (built)**
- Fee policies: the platform's cut lives in `fee_policies` (basis points, per country, optional
  per-writer override, effective from a moment; never edited or backdated). When a tip is paid
  the rate in force is resolved and stamped on the tip (`fee_policy_id`, `fee_bps`, `fee_cents`,
  `writer_cents`). `TIP_FEE_PERCENT` seeds the default the first time it's needed.
- Holds: a paid tip credits `creator:<id>:pending`; after `TIP_HOLD_HOURS` (default 72) the
  minute sweep posts pending → `creator:<id>` (available). Only available money can be withdrawn.
  `GET /v1/me/balance` returns `availableKes`, `pendingKes` and `nextReleaseAt`.
- Providers: tips and payouts go through `PaymentProvider` (`providers.ts`); Kenya routes to
  `DarajaProvider` (STK push in, B2C out). Tips and payouts store their `provider`, so adding
  e.g. Paystack is an adapter plus a registry entry.
- Books check: `reconciliation_runs`, daily at 00:10 Nairobi and on demand
  (`POST /v1/admin/finance/reconciliations`): balanced transactions, no overdrawn writer, every
  paid tip posted exactly as charged, clearing = tips in − payouts out, holds match, nothing stuck.
  Comparing against Safaricom's own statement comes with the production account.
- Creator fund: `POST /v1/admin/finance/creator-fund` splits a pool by qualified views (opens by
  other readers, jokes still up, writers not suspended) with largest-remainder rounding. Each
  allocation posts `platform:creator_fund` → `creator:<id>:pending` and is held like a tip.
  Periods can't overlap.
- Tip messages: a tip can carry a 140-character `note` and be `anonymous`. `GET /v1/jokes/:id/tips`
  lists paid tips with messages (the tip wall); the writer or a curator can hide a message
  (`PUT /v1/tips/:id/note-hidden`, audited for curators). The writer's notification reads
  "You've received a KSh 220 tip from James" with the message as the body.

**Phase 5: v1 (built)**
- Landing page, moderation (auto-hide by rule set, curator hide, admin decisions, appeals,
  audit log), the admin console, rule sets and workflows. The shop is a placeholder for now.
  Details, role matrix and open questions: [v1-implementation.md](./v1-implementation.md).
