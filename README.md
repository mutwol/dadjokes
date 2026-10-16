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
| `/` | Today: this week's status rings, today's joke (sealed until opened), streak, delivery time |
| `/view/:id` | Status viewer: setup, then the punchline after a pause. Tap right/left or use the arrow keys, hold to pause, Esc to close |
| `/joke/:id` | Joke detail: creator, subscribe, tip, reactions, groan meter, comments |
| `/create` | Write a joke: setup and punchline or an image, background, region, topics, originality check, live preview |
| `/studio` | Creator studio: your submissions and their curation status |
| `/explore`, `/activity`, `/me` | Placeholders for later steps |

## How it's organised

- `src/data/` holds types and mock data (`mock.ts`). The shapes mirror what an API would return,
  so replacing the mock module with real fetches is a contained change.
- `src/state/` is an in-memory store (reactions, comments, seen days, submissions, delivery time).
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
