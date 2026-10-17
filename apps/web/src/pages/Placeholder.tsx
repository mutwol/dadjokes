import { Link } from "react-router";
import { button } from "../components/ui/index.ts";

/** Stand-in for screens planned in later steps. */
export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto grid max-w-[560px] gap-3 px-4 py-12">
      <h1 className="text-3xl">{title}</h1>
      <p className="text-ink-soft">{body}</p>
      <Link to="/" className={button({ variant: "quiet", className: "justify-self-start" })}>
        Back to today's joke
      </Link>
    </div>
  );
}
