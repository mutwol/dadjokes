# Deploying Daddy Jokes

Everything runs on one Linux server with Docker: Caddy (the web app, the API proxy and HTTPS),
the API, the worker, PostgreSQL, Redis and a nightly backup. It comfortably handles tens of
thousands of readers on a 2 vCPU / 4 GB machine. When you outgrow it, move PostgreSQL and Redis
to managed services and run more API containers; nothing in the app assumes a single server.

## 1. Before you start

You need:

- A server with Docker Engine and the Compose plugin (Ubuntu 24.04 works well), ports 80 and 443 open.
- A domain, with an `A` (and `AAAA` if you have IPv6) record pointing at the server.
- An email provider that speaks SMTP, for sign-in codes. Postmark, Amazon SES, Mailgun and
  Brevo all work. Set up SPF and DKIM for your sending domain, or codes will land in spam.

Optional, each can be added later:

- A Google OAuth client, for "Continue with Google".
- A Safaricom Daraja app, for real M-Pesa tips and payouts (step 6).
- An S3-compatible bucket (Cloudflare R2, AWS S3), if you'd rather not keep images on the server.

## 2. Configure

```bash
git clone <your repo> daddy-jokes && cd daddy-jokes
cp .env.production.example .env.production
```

Fill in `.env.production`:

| Setting | How to get it |
| --- | --- |
| `DOMAIN` | Your hostname, e.g. `daddyjokes.co.ke` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `JWT_SECRET`, `CODE_SECRET` | `openssl rand -base64 48`, a different one each |
| `SMTP_URL`, `MAIL_FROM` | From your email provider, e.g. `smtps://USER:PASS@smtp.postmarkapp.com:465` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `pnpm --filter api push:keys` (on any machine with the repo) |
| `GOOGLE_CLIENT_ID` | Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web). Add `https://<DOMAIN>` as an authorised JavaScript origin |
| `MPESA_*` | Leave `MPESA_MODE=fake` until step 6 |

Keep `.env.production` out of git (it's ignored) and back it up somewhere safe: without
`POSTGRES_PASSWORD` and the secrets, backups are hard to use and everyone gets signed out.

**Keep the VAPID keys once you've set them.** Changing them breaks push for every browser
until people turn notifications on again.

## 3. Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

This builds the images, applies database migrations (the `migrate` service), then starts
the API, the worker and Caddy. Caddy fetches the HTTPS certificate on the first request.
Check it:

```bash
curl https://<DOMAIN>/health        # {"status":"ok","db":"ok","redis":"ok"}
docker compose -f docker-compose.prod.yml logs -f api worker
```

Production never seeds test data. Topics are created by the migration step.

## 4. Make yourself a curator

Sign up in the app first, then:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/set-role.js you@example.com curator
```

The review queue is at `https://<DOMAIN>/curate`. Schedule jokes at least a day ahead: a day
can only be scheduled before it has started anywhere in the world.

## 5. Updating

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run before the new API starts. They only ever add to the schema, so a failed
deploy can be rolled back by checking out the previous commit and running the same command.

## 6. Going live with M-Pesa

1. Create an app on [developer.safaricom.co.ke](https://developer.safaricom.co.ke) with the
   M-Pesa Express (STK push) and B2C products. Try it in the sandbox first: set `MPESA_MODE=sandbox`,
   the sandbox keys, shortcode `174379` and its test passkey, and `MPESA_CALLBACK_BASE_URL=https://<DOMAIN>`.
2. Apply to go live with your Paybill or Till (for tips) and a B2C shortcode (for payouts).
   Safaricom gives you production keys, the passkey, an initiator name and password.
3. Encrypt the initiator password with Safaricom's production certificate to get
   `MPESA_B2C_SECURITY_CREDENTIAL` (the Daraja portal has a tool for this).
4. Set `MPESA_MODE=production` and the production values, then restart:
   `docker compose -f docker-compose.prod.yml --env-file .env.production up -d`.

Callbacks arrive at `/v1/payments/mpesa/...` on a secret path derived from `JWT_SECRET`, so
changing `JWT_SECRET` while payments are in flight loses their callbacks. The worker still
settles those tips with a status query within a few minutes. Payouts that fail after you send
them post a reversal, so the money goes back to the writer's balance.

Fund the B2C account from the tips account regularly: payouts fail when it runs dry, and
writers see the money return to their balance.

## 7. Images in a bucket (optional)

By default images live in the `uploads` Docker volume and are served by the API at `/media`,
so they're included in server snapshots but not in the database backup. To use Cloudflare R2:

1. Create a bucket and an API token with read and write access to it.
2. Give the bucket a public URL (a custom domain like `media.<DOMAIN>`, or the r2.dev URL).
3. Allow uploads from the app with a CORS rule on the bucket: origin `https://<DOMAIN>`,
   methods `PUT`, headers `Content-Type`.
4. In `.env.production`: `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`,
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`, `MEDIA_BASE_URL=https://media.<DOMAIN>`.
5. Add a lifecycle rule deleting objects under `jokes/` that are older than a day *and* were never
   used, or simply accept the few abandoned uploads.

## 8. Backups and restore

The `backup` service writes a compressed dump to `./backups` every night at 02:00 UTC and
keeps 14. Copy that folder off the server (e.g. a nightly `rclone copy ./backups r2:backups`).

To restore into a fresh server:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres
gunzip -c backups/daddy_jokes-YYYYMMDD-0200.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U daddy -d daddy_jokes
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

## 9. Checklist before inviting people

- [ ] Sign-in email arrives within a minute and isn't in spam.
- [ ] You've scheduled jokes for the next week (`/curate` shows the gaps).
- [ ] Notifications work: turn them on in Profile on your phone, and get "today's joke is here".
  On iPhone, push only works after adding the site to the Home Screen.
- [ ] A KES 10 tip in production arrives in a writer's balance, and a withdrawal reaches their phone.
- [ ] Backups appear in `./backups` the morning after, and you've tried a restore once.
- [ ] Terms and Privacy pages exist (the welcome screen links to them).

## Not done yet

- **Confirming writers' M-Pesa numbers.** Payouts go to the number a writer typed. Before
  real money flows, decide how to confirm it: e.g. show the M-Pesa registered name from the
  first B2C result and ask the writer to confirm, or send a KES 1 test payout.
- **Error reporting and uptime checks.** Point an uptime monitor at `/health` and consider
  Sentry (or similar) for the API and web app.
