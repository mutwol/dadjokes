# Daddy Jokes

One curated dad joke a day, delivered like a status. Anyone can read, write, or both.

| Package | What it is |
| --- | --- |
| `apps/web` | React app (Vite, React Router, Tailwind). See its README for screens and design. |
| `apps/api` | NestJS API and background worker, PostgreSQL, Redis |
| `packages/contracts` | OpenAPI spec and the typed API client the web app uses |
| `docs/backend-architecture.md` | How the backend is designed and what comes next |

## Getting started

Needs Node 22.12+, pnpm and Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm db:up   # Postgres, Redis and Mailpit in Docker, then migrations and test data
pnpm dev     # web on :5173, API on :3000, plus the worker
```

`pnpm db:up` (or plain `docker compose up -d`) runs a one-off `migrate` container after
Postgres is healthy. It applies migrations and seeds topics, five writers, sample readers
and about 30 test jokes: a fortnight of delivered jokes, one for today (plus a Kenya-only
one), a few scheduled ahead, and some in review. Joke days are relative to today, so
running it again moves them along. `SEED=false pnpm db:up` only migrates.

Open http://localhost:5173 and sign up. The sign-in code is printed in the API's log and
also lands in Mailpit at http://localhost:8025. API docs: http://localhost:3000/docs.

## Everyday commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Web, API and worker with reload |
| `pnpm db:up` · `pnpm db:down` | Start the Docker services (migrating and seeding) · stop them. `docker compose down -v` also wipes the data |
| `pnpm db:migrate` · `pnpm db:seed` | The same two steps from your machine, without Docker's `migrate` container |
| `pnpm test` | API end-to-end tests against the `daddy_jokes_test` database (`pnpm db:up` creates it) |
| `pnpm lint` | Type checks and lint for every package |
| `pnpm build` | Production builds |
| `pnpm contracts` | After changing an endpoint: re-export the OpenAPI spec and regenerate the client |
| `pnpm --filter api db:generate` | After changing `apps/api/src/db/schema.ts`: write a new SQL migration |
