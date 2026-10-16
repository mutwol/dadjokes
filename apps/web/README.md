# Daddy Jokes (web)

One curated dad joke a day, delivered like a status. Mobile-first UI prototype.

Stack: Vite, React 19 with the React Compiler, React Router, Tailwind v4, oxlint.

Run it from the repo root with `pnpm dev` (see the root README): that starts this app, the API
and the worker. Vite proxies `/v1` to the API on port 3000, so no CORS setup is needed locally.

## Screens

| Route | Screen |
| --- | --- |
| `/welcome` | Onboarding: email, 6-digit code, role (reader, writer or both), profile, then reader steps (topics, writers to subscribe to, delivery time and notifications) and writer steps (tip payouts, originality pledge). Steps adapt to the roles picked |
| `/` | Today: this week's status rings, today's joke (sealed until opened), streak, delivery time |
| `/view/:day` · `/view/:jokeId` | Opens that day's joke (once), or replays an opened one. Status viewer: setup, then the punchline after a pause. Tap right/left or use the arrow keys, hold to pause, Esc to close |
| `/joke/:id` | Joke detail: creator, subscribe, tip, reactions, groan meter, comments |
| `/create` | Write a joke: setup and punchline or an image, background, region, topics, originality check, live preview |
| `/studio` | Creator studio: reach, your submissions, their curation status, withdraw |
| `/curate` | Curators: review queue with possible copies, calendar of picks, schedule or decline |
| `/me` | Profile: switch reading and writing on or off, delivery time, payouts, sign out |
| `/explore`, `/activity` | Placeholders for later steps |

## What's real and what's still mock

Real, through the API: sign-in, onboarding, the account, roles, preferences, writers and
subscriptions, submitting jokes (text or image) and Studio, curation (`/curate`, for curators),
Today, opening the daily joke and joke detail. Reactions and comments are still kept in the
browser until the engagement API is built; tips are not connected yet.

To try curation, sign in as `curator@daddyjokes.local` (seeded; the code is in the API log).

The session is restored from an httpOnly refresh cookie on page load; the access token is only
kept in memory. To see onboarding again, use **Sign out** on the Profile page and sign up with
another email. In development the sign-in code is also printed in the API's log.

## How it's organised

- `src/api/client.ts` is the API client (typed from `@daddy-jokes/contracts`), with the
  in-memory access token and single-flight refresh.
- `src/data/` holds types and the remaining mock data (`mock.ts`).
- `src/state/` is the store: the signed-in account from the API, plus in-memory mock state
  (reactions, comments, seen days, submissions).
- `src/pages/onboarding/` holds the sign-up flow. `flow.ts` decides the step order from the roles
  picked; `components/RoleGate.tsx` guards signed-in and writer-only screens.
- `src/components/` holds shared pieces: `StoryCard` (the joke face used everywhere), `NameTag`
  (the "Hello, my name is" sticker used as logo and byline), `Reactions` (reaction bar and groan
  meter) and `AppShell` (bottom tab bar on mobile, left rail on desktop).
- `src/styles/tokens.css` defines the palette, type and radii. `src/index.css` exposes the
  colours to Tailwind (`bg-tag-red`, `text-ink-soft`, `font-marker` and so on), so new UI can use
  utilities while the existing screens use plain CSS next to each component.

## Design direction

- Palette: fridge white, polo navy, name-tag red, highlighter yellow, lawn green, denim.
- Type: Atkinson Hyperlegible Next for the interface and setups; Permanent Marker only for
  punchlines and names on stickers.
- The one memorable moment is the punchline reveal: a highlighter swipe after the setup.
  Reduced-motion users get no auto-advance and tap to reveal instead.
