import { useEffect } from "react";
import { useLocation } from "react-router";
import { problemMessage, useListJokeTipsQuery, useSetTipNoteHiddenMutation } from "../api/rtk/index.ts";
import type { TipWallItem } from "../api/rtk/index.ts";
import { timeAgo } from "../data/dates.ts";
import type { JokeBackground } from "../data/types.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { cn } from "@/lib/utils.ts";
import { ksh, tipTier } from "./tipTiers.ts";


/** Paid tips on a joke, newest first, each with its message. Renders nothing until someone tips. */
export function TipWall({ jokeId }: { jokeId: string }) {
  const { data } = useListJokeTipsQuery({ id: jokeId });
  const [setHidden, { isLoading }] = useSetTipNoteHiddenMutation();
  const { hash } = useLocation();
  const ready = Boolean(data?.count);
  // Opened from a "You've received a tip" notification (…#tips): bring the wall into view.
  useEffect(() => {
    if (ready && hash === "#tips") document.getElementById("tips")?.scrollIntoView({ block: "start" });
  }, [ready, hash]);
  if (!data || data.count === 0) return null;

  const toggle = async (t: TipWallItem) => {
    const hidden = !t.noteHidden;
    try {
      await setHidden({ id: t.id, hideTipNoteRequest: { hidden } }).unwrap();
      toast.success(hidden ? "Message hidden. The tip still counts." : "Message visible again.");
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't change that message. Try again."));
    }
  };

  return (
    <section id="tips" className="grid scroll-mt-20 gap-3" aria-labelledby="tips-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="tips-title" className="text-xl">
          Tips
        </h2>
        <p className="text-sm text-ink-soft">
          {ksh(data.totalKes)} from {data.count} {data.count === 1 ? "tip" : "tips"}
        </p>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {data.data.map((t) => (
          <TipCard key={t.id} tip={t} canModerate={data.canModerate} busy={isLoading} onToggle={() => void toggle(t)} />
        ))}
      </ul>
    </section>
  );
}

function TipCard({ tip, canModerate, busy, onToggle }: { tip: TipWallItem; canModerate: boolean; busy: boolean; onToggle: () => void }) {
  const tier = tipTier(tip.amountKes);
  const name = tip.from?.name ?? "Anonymous";
  const hasNote = Boolean(tip.note);
  return (
    <li className="overflow-hidden rounded-lg shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
      <div className={cn("flex items-center gap-2.5 px-3 py-2", tier.head)}>
        {tip.from ? (
          <Avatar name={name} tone={tip.from.tone as JokeBackground} size={30} />
        ) : (
          <span aria-hidden="true" className="inline-grid size-[30px] shrink-0 place-items-center rounded-full bg-black/20">
            <Icon name="eyeOff" size={16} />
          </span>
        )}
        <div className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-medium opacity-90">
            {name}
            {tip.isMine ? <span className="font-normal opacity-80"> (you{tip.anonymous ? ", hidden from others" : ""})</span> : null}
          </span>
          <span className="text-base font-semibold tabular-nums">{ksh(tip.amountKes)}</span>
        </div>
        <time className="shrink-0 text-xs opacity-80" dateTime={tip.paidAt}>
          {timeAgo(tip.paidAt)}
        </time>
      </div>
      {hasNote || tip.noteHidden ? (
        <div className={cn("grid gap-1 px-3 py-2.5", tier.body)}>
          {hasNote ? (
            <p className="break-words">{tip.note}</p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm italic opacity-85">
              <Icon name="eyeOff" size={14} /> Message hidden
            </p>
          )}
          {canModerate ? (
            <button
              type="button"
              className="justify-self-start text-sm font-medium underline decoration-current/40 underline-offset-2 opacity-90 hover:opacity-100 disabled:opacity-50"
              onClick={onToggle}
              disabled={busy}
            >
              {tip.noteHidden ? "Show message" : "Hide message"}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
