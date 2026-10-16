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
| GET | `/health` | Postgres and Redis status |

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

**Phase 4: notifications and money**
- Web push subscriptions and the activity feed.
- Tips through M-Pesa (STK push, callbacks confirmed by status query), payouts, a double-entry `ledger_entries` table that later also carries revenue share.
