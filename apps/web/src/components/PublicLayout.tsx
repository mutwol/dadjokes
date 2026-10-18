import type { ReactNode } from "react";
import { Link } from "react-router";
import { useStore } from "../state/useStore.ts";
import { NameTag } from "./NameTag.tsx";
import { button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

const YEAR = new Date().getFullYear();

/** Header and footer for pages anyone can see: the landing page and the shop. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { account } = useStore();
  const signedIn = Boolean(account?.onboarded);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-fridge/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-wide items-center gap-3 px-4 py-3 lg:px-8">
          <Link to="/" className="mr-auto p-1 no-underline" aria-label="Daddy Jokes home">
            <NameTag name="Daddy Jokes" size="s" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-medium sm:flex" aria-label="Site">
            <a href="/#how" className="text-ink-soft no-underline hover:text-ink">
              How it works
            </a>
            <a href="/#writers" className="text-ink-soft no-underline hover:text-ink">
              For writers
            </a>
            <Link to="/shop" className="text-ink-soft no-underline hover:text-ink">
              Shop
            </Link>
          </nav>
          {signedIn ? (
            <Link to="/" className={button({ size: "sm" })}>
              Open the app
            </Link>
          ) : (
            <>
              <Link to="/welcome/email" className="text-sm font-medium text-ink no-underline">
                Sign in
              </Link>
              <Link to="/welcome" className={button({ size: "sm" })}>
                Get the daily joke
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-paper">
        <div className="mx-auto grid max-w-wide gap-6 px-4 py-10 sm:grid-cols-[1fr_auto] lg:px-8">
          <div className="grid justify-items-start gap-2">
            <NameTag name="Daddy Jokes" size="s" tilt={-2} />
            <p className="max-w-[22rem] text-sm text-ink-soft">One hand-picked dad joke a day. Made in Nairobi, groaned at everywhere.</p>
          </div>
          <nav className={cn("grid grid-cols-2 gap-x-10 gap-y-2 text-sm font-medium")} aria-label="Footer">
            <a href="/#how" className="text-ink-soft no-underline hover:text-ink">How it works</a>
            <Link to="/shop" className="text-ink-soft no-underline hover:text-ink">Shop</Link>
            <a href="/#faq" className="text-ink-soft no-underline hover:text-ink">Questions</a>
            <Link to="/welcome" className="text-ink-soft no-underline hover:text-ink">Sign up</Link>
            <a href="#terms" className="text-ink-soft no-underline hover:text-ink">Terms</a>
            <a href="#privacy" className="text-ink-soft no-underline hover:text-ink">Privacy</a>
          </nav>
          <p className="text-xs text-ink-faint sm:col-span-2">© {YEAR} Daddy Jokes. All puns intended.</p>
        </div>
      </footer>
    </div>
  );
}
