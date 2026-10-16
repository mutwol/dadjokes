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

## Endpoints built (phase 1)

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
| GET | `/health` | Postgres and Redis status |

Interactive docs run at `http://localhost:3000/docs` in development.

## Adding an endpoint

1. Define request and response schemas with `named("Name", z.object({...}))` in the module's `schemas.ts`.
2. In the controller: `@Body(zod(Schema))` to validate, `@ApiZodBody(Schema)` and `@ApiZodResponse(200, ResponseSchema)` to document, and an `operationId`.
3. Throw `new AppError(status, "stable_code", "User-facing title.")` for expected failures.
4. Add an e2e test in `apps/api/test`.
5. Run `pnpm contracts` from the root to regenerate the client types the web app uses.

Schema changes: edit `src/db/schema.ts`, run `pnpm --filter api db:generate`, review the SQL in `src/db/migrations`, then `pnpm db:migrate`.

## What comes next

**Phase 2: the daily joke**
- `submissions` (in_review → scheduled → delivered | declined | withdrawn), image uploads via presigned URLs.
- `curation`: review queue, possible copies via `pg_trgm`, `daily_picks` per date (global plus regional).
- `deliveries (user_id, local_date, joke_id, delivered_at, opened_at, expires_at)`, unique on `(user_id, local_date)`. The hourly worker job assigns jokes to readers whose local delivery hour just arrived, then queues push notifications. Retries are safe because of the unique key.
- `GET /v1/me/today` returns sealed jokes without content; `POST /v1/me/deliveries/{date}/open` returns the joke and records the view, so "open once" is enforced on the server.

**Phase 3: engagement and stats**
- Reactions (one per person per joke), comments, reports, an SSE stream for live counts.
- `POST /v1/events` for batched view events, rolled up into `joke_stats_daily` for Studio.

**Phase 4: notifications and money**
- Web push subscriptions and the activity feed.
- Tips through M-Pesa (STK push, callbacks confirmed by status query), payouts, a double-entry `ledger_entries` table that later also carries revenue share.
