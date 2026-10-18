import { Link } from "react-router";
import { button } from "@/components/ui/button.tsx";
import { card } from "@/components/ui/card.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { cn } from "@/lib/utils.ts";
import { PublicLayout } from "../components/PublicLayout.tsx";
import { useStore } from "../state/useStore.ts";
import { MugMock, TeeMock } from "./Landing.tsx";

const PREVIEWS = [
  { kind: "tee" as const, name: "The anti-gravity tee", line: "I'm reading a book on anti-gravity. Can't put it down.", tone: "bg-navy" },
  { kind: "mug" as const, name: "The y mug", line: "I don't know y." },
  { kind: "tee" as const, name: "The decaf tee", line: "Decaf? No thanks. I'm already depresso.", tone: "bg-tag-red" },
];

/** A placeholder until the shop opens: what's coming and why, with no checkout. */
export function Shop() {
  const { account } = useStore();
  return (
    <PublicLayout>
      <section className="mx-auto grid max-w-wide gap-10 px-4 pt-12 pb-20 lg:px-8 lg:pt-20">
        <div className="grid max-w-[40rem] justify-items-start gap-4">
          <p className="rounded-full bg-ink px-3 py-1 text-xs font-semibold tracking-[0.08em] text-on-ink uppercase">Coming soon</p>
          <h1 className="text-[clamp(2.25rem,6vw,3.5rem)] leading-[1.05] tracking-[-0.03em]">The Daddy Jokes shop is almost ready</h1>
          <p className="text-lg text-ink-soft">
            Tees, mugs and totes printed with the jokes readers groaned at the most. Each one credits the writer behind
            the joke. Payment with M-Pesa, delivered to your door.
          </p>
          <div className="flex flex-wrap gap-3">
            {account?.onboarded ? (
              <Link to="/" className={button()}>
                Back to today's joke
              </Link>
            ) : (
              <Link to="/welcome" className={button()}>
                Sign up to hear when it opens
              </Link>
            )}
            <Link to="/" className={button({ variant: "quiet" })}>
              What's Daddy Jokes?
            </Link>
          </div>
          {account?.onboarded ? (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <Icon name="bell" size={18} /> You'll get a note in Activity the day it opens.
            </p>
          ) : null}
        </div>

        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3" aria-label="A preview of what's coming">
          {PREVIEWS.map((p) => (
            <li key={p.name} className={cn(card, "grid gap-4 p-5")}>
              <div className="grid h-52 place-items-center rounded-2xl bg-fridge" aria-hidden="true">
                {p.kind === "tee" ? <TeeMock line={p.line} tone={p.tone} /> : <MugMock line={p.line} />}
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{p.name}</p>
                <span className="rounded-sm bg-butter px-2.5 py-0.5 text-xs font-semibold text-butter-ink">Preview</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </PublicLayout>
  );
}
