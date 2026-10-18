import { useState } from "react";
import { problemMessage, useListAppealsQuery, useResolveAppealMutation } from "../../api/rtk/index.ts";
import type { Appeal } from "../../api/rtk/index.ts";
import { timeAgo } from "../../data/dates.ts";
import { useStore } from "../../state/useStore.ts";
import { Pill } from "@/components/ui/badge.tsx";
import { button } from "@/components/ui/button.tsx";
import { Card, EmptyState } from "@/components/ui/card.tsx";
import { field } from "@/components/ui/input.tsx";
import { segment, segmented } from "@/components/ui/segmented.tsx";
import { skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { cn } from "@/lib/utils.ts";

const STATUS: Record<Appeal["status"], { label: string; tone: "review" | "delivered" | "muted" }> = {
  open: { label: "Waiting", tone: "review" },
  overturned: { label: "Put back up", tone: "delivered" },
  upheld: { label: "Kept down", tone: "muted" },
};

/** Writers asking for a takedown to be looked at again. Admins decide; curators can read. */
export function AppealsPanel() {
  const { hasRole } = useStore();
  const isAdmin = hasRole("admin");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data, error, isLoading, refetch } = useListAppealsQuery(filter === "open" ? { status: "open" } : {});
  const [resolve, resolving] = useResolveAppealMutation();
  const items = data?.data ?? null;

  const decide = async (a: Appeal, decision: "uphold" | "overturn") => {
    try {
      // Resolving invalidates the appeal lists, so this one drops out of "Waiting" on its own.
      await resolve({ id: a.id, resolveAppealRequest: { decision, note: notes[a.id]?.trim() || undefined } }).unwrap();
      toast.success(decision === "overturn" ? "The joke is back up. The writer was told." : "Kept down. The writer was told.");
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't decide that appeal. Try again."));
    }
  };
  const busy = resolving.isLoading ? resolving.originalArgs?.id : undefined;

  return (
    <div className="grid gap-4">
      <div className={cn(segmented, "w-auto justify-self-start")} role="tablist" aria-label="Appeal status">
        {(["open", "all"] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={filter === s} className={segment(filter === s, "px-4")} onClick={() => setFilter(s)}>
            {s === "open" ? "Waiting" : "All"}
          </button>
        ))}
      </div>
      {error && !data ? (
        <EmptyState role="alert">
          <p>{problemMessage(error)}</p>
          <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={() => void refetch()}>
            Try again
          </button>
        </EmptyState>
      ) : isLoading ? (
        <div className="grid gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className={cn(skeleton, "h-40 rounded-2xl")} />
          ))}
        </div>
      ) : items !== null && !items.length ? (
        <EmptyState>
          <p>{filter === "open" ? "No appeals waiting." : "No appeals yet."}</p>
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {(items ?? []).map((a) => (
            <Card as="li" key={a.id} className="grid gap-3 p-3.5">
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                <Pill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Pill>
                <span>
                  @{a.authorHandle} · {timeAgo(a.createdAt)}
                </span>
              </div>
              <p className="font-semibold">“{a.preview}”</p>
              <blockquote className="m-0 rounded-lg border-l-2 border-line-strong bg-fridge px-3.5 py-2.5 text-ink">{a.message}</blockquote>
              {a.status !== "open" ? (
                <p className="text-sm text-ink-soft">
                  Decided{a.resolvedBy ? ` by @${a.resolvedBy}` : ""}
                  {a.resolvedAt ? `, ${timeAgo(a.resolvedAt)}` : ""}
                  {a.resolutionNote ? `: “${a.resolutionNote}”` : ""}
                </p>
              ) : isAdmin ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <input
                    className={field("sm", "min-w-0 flex-[1_1_220px]")}
                    placeholder="A note for the writer (optional)"
                    value={notes[a.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                    aria-label="Note for the writer"
                  />
                  <button type="button" className={button({ size: "sm" })} disabled={busy === a.id} onClick={() => void decide(a, "overturn")}>
                    Put it back up
                  </button>
                  <button type="button" className={button({ variant: "quiet", size: "sm" })} disabled={busy === a.id} onClick={() => void decide(a, "uphold")}>
                    Keep it down
                  </button>
                </div>
              ) : (
                <p className="text-sm text-ink-soft">An admin will decide.</p>
              )}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
