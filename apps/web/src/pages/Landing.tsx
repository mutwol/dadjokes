import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useGetLandingQuery } from "../api/rtk/index.ts";
import type { Landing as LandingData } from "../api/rtk/index.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { button } from "@/components/ui/button.tsx";
import { card } from "@/components/ui/card.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import type { IconName } from "@/components/ui/icon.tsx";
import { cn } from "@/lib/utils.ts";
import { NameTag } from "../components/NameTag.tsx";
import { PublicLayout } from "../components/PublicLayout.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import type { StoryFace } from "../components/StoryCard.tsx";
import { SAMPLE_JOKE } from "../data/sample.ts";

const section = "mx-auto grid max-w-wide gap-8 px-4 py-16 lg:px-8 lg:py-24";
const eyebrow = "text-sm font-semibold tracking-[0.08em] text-tag-red uppercase";
const h2 = "text-3xl leading-[1.1] tracking-[-0.02em] lg:text-4xl";
const lead = "max-w-[38rem] text-lg text-ink-soft";

/** Big numbers read better rounded: 12,400 → 12.4k. */
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/**
 * The page signed-out visitors see at /. It explains the product by letting
 * them do the one thing it's about: open today's sealed joke.
 */
export function Landing() {
  // Public and cached for 10 minutes (endpoints.ts); the built-in sample shows until it arrives.
  const { data } = useGetLandingQuery();

  const face: StoryFace = data?.sample
    ? { kind: "text", setup: data.sample.setup, punchline: data.sample.punchline, background: data.sample.background }
    : SAMPLE_JOKE;
  const writer = data?.sample?.writer;

  return (
    <PublicLayout>
      <Hero face={face} writer={writer} />
      {data && data.stats.jokesDelivered > 0 ? <Numbers stats={data.stats} /> : null}
      <HowItWorks />
      <Why />
      <Audiences writers={data?.writers ?? []} />
      <ShopTeaser />
      <Faq />
      <FinalCta />
    </PublicLayout>
  );
}

/* --------------------------------------------------------------------- Hero */

function Hero({ face, writer }: { face: StoryFace; writer?: string }) {
  return (
    <section className="mx-auto grid max-w-wide items-center gap-10 px-4 pt-10 pb-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-8 lg:pt-20 lg:pb-24">
      <div className="grid justify-items-start gap-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-sm font-medium shadow-tag">
          <span className="size-2 rounded-full bg-lawn" aria-hidden="true" />
          Today's joke is ready
        </p>
        <h1 className="text-[clamp(2.5rem,7vw,4.25rem)] leading-[1.02] tracking-[-0.03em]">
          One dad joke a day.{" "}
          <span className="box-decoration-clone bg-[linear-gradient(var(--color-highlighter),var(--color-highlighter))] bg-size-[100%_42%] bg-position-[0_85%] bg-no-repeat px-1 dark:bg-size-[100%_12%] dark:bg-position-[0_96%]">
            Sealed
          </span>{" "}
          until you open it.
        </h1>
        <p className={lead}>
          Every morning a hand-picked joke lands in your app like a status. Open it within a day, groan, react, and
          keep your streak alive. Or write your own: if the curators pick it, everyone gets it, and you get tipped.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/welcome" className={button({ size: "lg", className: "px-6" })}>
            Get tomorrow's joke
          </Link>
          <a href="#how" className={button({ variant: "quiet", size: "lg" })}>
            How it works
          </a>
        </div>
        <p className="text-sm text-ink-soft">Free. No feed, no ads. One email code to sign in.</p>
      </div>
      <SealedDemo face={face} writer={writer} />
    </section>
  );
}

/** The product in one tap: a sealed card that opens like the real thing. */
function SealedDemo({ face, writer }: { face: StoryFace; writer?: string }) {
  const [stage, setStage] = useState<"sealed" | "setup" | "punchline">("sealed");
  useEffect(() => {
    if (stage !== "setup") return;
    const t = window.setTimeout(() => setStage("punchline"), 1600);
    return () => window.clearTimeout(t);
  }, [stage]);

  return (
    <div className="relative mx-auto w-full max-w-[22rem]">
      <div className="absolute -top-5 -left-4 z-10 rotate-[-8deg]">
        <NameTag name={writer?.split(" ")[0] ?? "Dad"} size="m" tilt={0} />
      </div>
      <div className="rotate-[2deg] rounded-3xl shadow-lift transition-[rotate] duration-300 hover:rotate-0">
        {stage === "sealed" ? (
          <button
            type="button"
            onClick={() => setStage("setup")}
            className="grid aspect-[9/14] w-full place-items-center rounded-3xl border-0 bg-navy p-8 text-white"
            aria-label="Open today's joke"
          >
            <span className="grid justify-items-center gap-4">
              <span className="grid size-18 place-items-center rounded-full bg-white/12">
                <Icon name="lock" size={34} />
              </span>
              <span className="text-2xl font-bold">Today's joke</span>
              <span className="text-white/75">Sealed. Tap to open.</span>
              <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-tag-red px-4 py-2 font-medium">
                Open it
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStage(stage === "setup" ? "punchline" : "sealed")}
            className="block w-full rounded-3xl border-0 bg-transparent p-0 text-left"
            aria-label={stage === "setup" ? "Show the punchline" : "Seal it again"}
          >
            <StoryCard face={face} revealed={stage === "punchline"} variant="card" />
          </button>
        )}
      </div>
      <p className="mt-5 text-center text-sm text-ink-soft" aria-live="polite">
        {stage === "sealed" ? "Go on, open it." : stage === "setup" ? "Wait for it…" : "That's the whole idea. Tap to seal it again."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ Numbers */

function Numbers({ stats }: { stats: LandingData["stats"] }) {
  const items = [
    { n: stats.readers, label: "readers groaning daily" },
    { n: stats.jokesDelivered, label: "jokes delivered" },
    { n: stats.reactions, label: "groans, laughs and facepalms" },
    { n: stats.writers, label: "writers submitting" },
  ];
  return (
    <section aria-label="Daddy Jokes in numbers" className="border-y border-line bg-paper">
      <dl className="mx-auto grid max-w-wide grid-cols-2 gap-6 px-4 py-8 lg:grid-cols-4 lg:px-8">
        {items.map((i) => (
          <div key={i.label} className="grid gap-0.5">
            <dt className="order-2 text-sm text-ink-soft">{i.label}</dt>
            <dd className="order-1 m-0 font-marker text-3xl text-ink">{compact(i.n)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* -------------------------------------------------------------- How it works */

const STEPS: { icon: IconName; title: string; body: string; visual: ReactNode }[] = [
  {
    icon: "clock",
    title: "Pick your hour",
    body: "Tell us when you want it: with your morning tea, at lunch, or after the kids are asleep. It arrives at that hour in your time zone.",
    visual: <HourPicker />,
  },
  {
    icon: "lock",
    title: "It arrives sealed",
    body: "No previews, no spoilers. The joke waits behind a seal like a status. You have 24 hours to open it, then it's gone.",
    visual: <SealedChip />,
  },
  {
    icon: "check",
    title: "Open, groan, keep the streak",
    body: "React with a laugh, a groan or a facepalm, comment, share it with someone who deserves it. Open one every day and your streak grows.",
    visual: <StreakRings />,
  },
];

function HowItWorks() {
  return (
    <section id="how" className={cn(section, "scroll-mt-16")} aria-labelledby="how-title">
      <div className="grid gap-3">
        <p className={eyebrow}>How it works</p>
        <h2 id="how-title" className={h2}>
          Three steps. The third one is groaning.
        </h2>
      </div>
      <ol className="m-0 grid list-none gap-4 p-0 lg:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className={cn(card, "grid content-start gap-4 p-5")}>
            <div className="flex items-center gap-3">
              <span className="grid size-9 -rotate-6 place-items-center rounded-lg bg-tag-red font-marker text-lg text-white shadow-tag">
                {i + 1}
              </span>
              <h3 className="text-xl">{s.title}</h3>
            </div>
            <div className="grid h-28 place-items-center rounded-2xl bg-fridge" aria-hidden="true">
              {s.visual}
            </div>
            <p className="text-ink-soft">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HourPicker() {
  return (
    <div className="flex gap-1.5">
      {["6am", "7am", "8am", "12pm", "9pm"].map((h) => (
        <span
          key={h}
          className={cn(
            "rounded-lg border-2 px-2.5 py-1.5 text-sm font-medium",
            h === "8am" ? "border-ink bg-cream" : "border-line bg-paper text-ink-soft",
          )}
        >
          {h}
        </span>
      ))}
    </div>
  );
}

function SealedChip() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-navy px-4 py-3 text-white">
      <Icon name="lock" size={22} />
      <div className="grid text-sm leading-tight">
        <strong>Today's joke</strong>
        <span className="text-white/70">23h left to open</span>
      </div>
    </div>
  );
}

function StreakRings() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex items-end gap-2">
      {days.map((d, i) => (
        <span key={i} className="grid justify-items-center gap-1">
          <span
            className={cn(
              "size-8 rounded-full border-[3px]",
              i < 5 ? "border-tag-red bg-tag-red/15" : i === 5 ? "border-highlighter bg-cream" : "border-line bg-paper",
            )}
          />
          <span className="text-xs font-medium text-ink-soft">{d}</span>
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- Why */

function Why() {
  return (
    <section className="bg-navy text-white" aria-labelledby="why-title">
      <div className={cn(section, "lg:grid-cols-[1fr_1.2fr] lg:items-center")}>
        <div className="grid gap-3">
          <p className="text-sm font-semibold tracking-[0.08em] text-highlighter uppercase">Why it exists</p>
          <h2 id="why-title" className={cn(h2, "text-white")}>
            Your feed never ends. A dad joke takes eight seconds.
          </h2>
        </div>
        <div className="grid gap-5 text-lg text-white/80">
          <p>
            We built Daddy Jokes for the moment you reach for your phone and want something small and good, not another
            hour of scrolling. One joke, picked by a person, the same for everyone that day. Then you're done.
          </p>
          <p>
            It's also a stage. Anyone can write. Curators read every submission, check it isn't copied, and pick one a
            day. The writer's name goes on it, readers react and tip, and the money goes to their M-Pesa.
          </p>
          <ul className="m-0 grid list-none gap-2 p-0 text-base text-white">
            {["Hand-picked, never an algorithm", "One a day, then it's done", "Writers keep 90% of every tip"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded-full bg-lawn">
                  <Icon name="check" size={16} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Audiences */

function Audiences({ writers }: { writers: LandingData["writers"] }) {
  return (
    <section id="writers" className={cn(section, "scroll-mt-16")} aria-labelledby="who-title">
      <div className="grid gap-3">
        <p className={eyebrow}>Read, write, or both</p>
        <h2 id="who-title" className={h2}>
          Made for people who groan, and people who make them groan
        </h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className={cn(card, "grid content-start gap-4 p-6")}>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-sky text-sky-ink">
              <Icon name="today" />
            </span>
            <h3 className="text-2xl">For readers</h3>
          </div>
          <Benefits
            items={[
              ["Streaks", "Rings for every day you opened. Miss one and it starts over, so it's worth a tap."],
              ["The groan meter", "See how everyone else reacted: laughs, groans, facepalms, drum rolls."],
              ["Local jokes", "Prefer jokes only people from your country would get? Turn on local jokes."],
              ["Subscribe to writers", "Follow the people whose puns hit hardest and see when theirs go out."],
            ]}
          />
        </article>
        <article className={cn(card, "grid content-start gap-4 p-6")}>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-mint text-forest">
              <Icon name="studio" />
            </span>
            <h3 className="text-2xl">For writers</h3>
          </div>
          <Benefits
            items={[
              ["Submit anytime", "Text or an image. Curators read every one and tell you if it wasn't picked, and why."],
              ["Your day", "When yours is picked, every reader gets it that day, with your name on it."],
              ["Studio", "Watch opens, reactions and comments come in, day by day."],
              ["Tips to M-Pesa", "Readers tip what they like. You keep 90% and withdraw to your phone."],
            ]}
          />
          {writers.length ? (
            <div className="grid gap-2 border-t border-line pt-4">
              <p className="text-sm font-medium text-ink-soft">Some of the writers already here</p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {writers.map((w) => (
                  <li key={w.handle} className="flex items-center gap-2 rounded-full bg-fridge py-1 pr-3 pl-1">
                    <Avatar name={w.name} tone={w.tone} size={28} />
                    <span className="text-sm font-medium">@{w.handle}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function Benefits({ items }: { items: [string, string][] }) {
  return (
    <dl className="m-0 grid gap-3.5">
      {items.map(([t, d]) => (
        <div key={t} className="grid gap-0.5">
          <dt className="font-semibold">{t}</dt>
          <dd className="m-0 text-ink-soft">{d}</dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------------------------------------------- Shop */

function ShopTeaser() {
  return (
    <section className="mx-auto max-w-wide px-4 lg:px-8" aria-labelledby="shop-title">
      <div className="grid items-center gap-6 theme-light overflow-hidden rounded-3xl bg-highlighter p-6 lg:grid-cols-[1.3fr_1fr] lg:p-10">
        <div className="grid justify-items-start gap-3">
          <p className="rounded-full bg-ink px-3 py-1 text-xs font-semibold tracking-[0.08em] text-on-ink uppercase">Coming soon</p>
          <h2 id="shop-title" className={h2}>
            Wear the groan
          </h2>
          <p className="max-w-[30rem] text-lg text-ink">
            Tees and mugs printed with the jokes readers loved most, with a share for the writer who wrote them.
          </p>
          <Link to="/shop" className={button({ variant: "dark" })}>
            See what's coming
          </Link>
        </div>
        <div className="flex justify-center gap-4" aria-hidden="true">
          <TeeMock />
          <MugMock />
        </div>
      </div>
    </section>
  );
}

/** A simple tee silhouette with a joke on it. Drawn, not a photo, so it's clearly a preview. */
export function TeeMock({ line = "I'm reading a book on anti-gravity.", tone = "bg-navy" }: { line?: string; tone?: string }) {
  return (
    <div className="relative w-36 rotate-[-4deg] lg:w-44">
      <svg viewBox="0 0 120 120" className="w-full drop-shadow-[0_10px_14px_rgb(28_35_64/0.25)]">
        <path d="M38 10 22 18 6 36l14 12 8-6v66h64V42l8 6 14-12-16-18-16-8c-2 8-10 13-22 13S40 18 38 10Z" className="fill-paper stroke-ink" strokeWidth="2" />
      </svg>
      <div className={cn("absolute top-[38%] left-1/2 w-[46%] -translate-x-1/2 rounded-md p-1.5 text-center text-[0.5rem] leading-tight font-semibold text-white lg:text-[0.6rem]", tone)}>
        {line}
      </div>
    </div>
  );
}

export function MugMock({ line = "I don't know y." }: { line?: string }) {
  return (
    <div className="relative mt-8 w-24 rotate-[5deg] lg:w-28">
      <svg viewBox="0 0 100 100" className="w-full drop-shadow-[0_10px_14px_rgb(28_35_64/0.25)]">
        <path d="M78 34h6a10 10 0 0 1 0 20h-6" className="fill-none stroke-ink" strokeWidth="5" />
        <rect x="14" y="20" width="64" height="72" rx="8" className="fill-paper stroke-ink" strokeWidth="2" />
      </svg>
      <div className="absolute top-[42%] left-[16%] w-[56%] -rotate-3 text-center font-marker text-[0.6rem] leading-tight text-tag-red lg:text-xs">
        {line}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- FAQ */

const FAQ: [string, string][] = [
  ["Is it free?", "Yes. Reading and writing are free. Tipping is optional, and only if a joke earned it."],
  [
    "What happens if I miss a day?",
    "Each joke can be opened for 24 hours after it arrives. After that it's gone for you, and your streak starts again. You can always read jokes you've already opened.",
  ],
  ["Who picks the jokes?", "People. Our curators read every submission, check for copies and pick one joke a day for everyone, plus local picks for some countries."],
  [
    "How do tips work?",
    "Tap Tip on a joke, choose an amount and confirm with your M-Pesa PIN. The writer gets 90%; the rest keeps the lights on. Writers withdraw to M-Pesa from their Studio.",
  ],
  ["Can I choose when it arrives?", "Yes, any hour of the day, in your own time zone. Change it whenever you like in your profile."],
  [
    "What if a joke is offensive?",
    "Report it. If enough people do, it's hidden straight away until a curator looks at it, and you'll hear what was decided.",
  ],
];

function Faq() {
  return (
    <section id="faq" className={cn(section, "scroll-mt-16 lg:grid-cols-[1fr_1.6fr]")} aria-labelledby="faq-title">
      <div className="grid content-start gap-3">
        <p className={eyebrow}>Questions</p>
        <h2 id="faq-title" className={h2}>
          Asked by dads, answered by dads
        </h2>
      </div>
      <div className="grid gap-2.5">
        {FAQ.map(([q, a]) => (
          <details key={q} className={cn(card, "group px-5 py-4 open:pb-5")}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              {q}
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-fridge transition-[rotate] duration-160 group-open:rotate-45">
                <Icon name="plus" size={16} />
              </span>
            </summary>
            <p className="mt-2.5 text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Final CTA */

function FinalCta() {
  return (
    <section className="px-4 pb-16 lg:px-8 lg:pb-24">
      <div className="mx-auto grid max-w-wide justify-items-center gap-5 rounded-3xl bg-tag-red px-6 py-14 text-center text-white">
        <NameTag name="You?" size="l" tilt={-4} />
        <h2 className="max-w-[34rem] text-3xl leading-[1.1] text-white lg:text-4xl">Tomorrow's joke is already picked. Want it?</h2>
        <p className="max-w-[30rem] text-white/85">Sign up with your email in under a minute. Pick your hour, and we'll seal one for you.</p>
        <Link to="/welcome" className={button({ variant: "light", size: "lg", className: "px-7" })}>
          Get the daily joke
        </Link>
      </div>
    </section>
  );
}
