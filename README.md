# Daddy Jokes (web)

One curated dad joke a day, delivered like a status. Mobile-first UI prototype.

Stack: Vite, React 19 with the React Compiler, React Router, Tailwind v4, oxlint.

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm lint
pnpm build
```

## Screens

| Route | Screen |
| --- | --- |
| `/welcome` | Onboarding: email, 6-digit code, role (reader, writer or both), profile, then reader steps (topics, writers to subscribe to, delivery time and notifications) and writer steps (tip payouts, originality pledge). Steps adapt to the roles picked |
| `/` | Today: this week's status rings, today's joke (sealed until opened), streak, delivery time |
| `/view/:id` | Status viewer: setup, then the punchline after a pause. Tap right/left or use the arrow keys, hold to pause, Esc to close |
| `/joke/:id` | Joke detail: creator, subscribe, tip, reactions, groan meter, comments |
| `/create` | Write a joke: setup and punchline or an image, background, region, topics, originality check, live preview |
| `/studio` | Creator studio: your submissions and their curation status |
| `/me` | Profile: switch reading and writing on or off, delivery time, payouts, sign out |
| `/explore`, `/activity` | Placeholders for later steps |

## Trying the onboarding

The profile is saved in localStorage, so a reload keeps you signed in. Use **Sign out** on the
Profile page to go through onboarding again. In the code step any 6 digits work, except `000000`,
which shows the error state.

## How it's organised

- `src/data/` holds types and mock data (`mock.ts`). The shapes mirror what an API would return,
  so replacing the mock module with real fetches is a contained change.
- `src/state/` is the store: the profile and roles (saved in localStorage), plus in-memory
  reactions, comments, seen days and submissions.
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
