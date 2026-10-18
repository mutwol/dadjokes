import { useState } from "react";
import { Link } from "react-router";
import { problemMessage, useHideCommentMutation, useListReportsQuery, useResolveReportsMutation, useUnhideCommentMutation } from "../../api/rtk/index.ts";
import type { ReportedItem } from "../../api/rtk/index.ts";
import { shortDate, timeAgo } from "../../data/dates.ts";
import { useStore } from "../../state/useStore.ts";
import { Pill } from "@/components/ui/badge.tsx";
import { button } from "@/components/ui/button.tsx";
import { Card, EmptyState } from "@/components/ui/card.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { field } from "@/components/ui/input.tsx";
import { segment, segmented } from "@/components/ui/segmented.tsx";
import { skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { cn } from "@/lib/utils.ts";

const REASON_LABEL: Record<string, string> = { copied: "copied", offensive: "offensive", spam: "spam", other: "other" };
const smallQuiet = button({ variant: "quiet", size: "sm" });

/**
 * Reported jokes and comments, combined per item. Everyone on staff sees them;
 * curators can hide or unhide comments; admins decide: take it down or leave it up.
 */
export function ReportsPanel() {
  const { hasRole } = useStore();
  const isAdmin = hasRole("admin");
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data, error, isLoading, refetch } = useListReportsQuery({ status });
  const [resolveReports] = useResolveReportsMutation();
  const [hide] = useHideCommentMutation();
  const [unhide] = useUnhideCommentMutation();
  const [pending, setPending] = useState<string | null>(null);
  const items = data?.data ?? null;

  const key = (i: ReportedItem) => `${i.jokeId}-${i.commentId ?? ""}`;

  const resolve = async (item: ReportedItem, action: "dismiss" | "remove") => {
    const target = item.commentId ? { commentId: item.commentId } : { jokeId: item.jokeId };
    const note = notes[key(item)]?.trim() || undefined;
    setPending(key(item));
    try {
      // Resolving invalidates the report lists; the item leaves "Open" on refetch.
      await resolveReports({ resolveReportsRequest: { ...target, action, note } }).unwrap();
      toast.success(action === "remove" ? `${item.target === "joke" ? "Joke" : "Comment"} taken down. Reporters were told.` : "Left up. Reports closed.");
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't resolve that. Try again."));
    } finally {
      setPending(null);
    }
  };

  const setHidden = async (item: ReportedItem, hidden: boolean) => {
    if (!item.commentId) return;
    setPending(key(item));
    try {
      await (hidden ? hide({ id: item.commentId }) : unhide({ id: item.commentId })).unwrap();
      toast.success(hidden ? "Comment hidden from readers." : "Comment visible again.");
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't change that comment."));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={cn(segmented, "w-auto")} role="tablist" aria-label="Report status">
          {(["open", "resolved"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} className={segment(status === s, "px-4")} onClick={() => setStatus(s)}>
              {s === "open" ? "Open" : "Decided (30 days)"}
            </button>
          ))}
        </div>
        {!isAdmin ? <p className="text-sm text-ink-soft">You can hide comments. Admins decide what gets taken down.</p> : null}
      </div>

      {error && !data ? (
        <EmptyState role="alert">
          <p>{problemMessage(error)}</p>
          <button type="button" className={smallQuiet} onClick={() => void refetch()}>
            Try again
          </button>
        </EmptyState>
      ) : isLoading ? (
        <div className="grid gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn(skeleton, "h-36 rounded-2xl")} />
          ))}
        </div>
      ) : items !== null && !items.length ? (
        <EmptyState>
          <p>{status === "open" ? "No open reports. Everyone's behaving, or at least groaning politely." : "Nothing decided in the last 30 days."}</p>
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {(items ?? []).map((item) => (
            <Card as="li" key={key(item)} className={cn("grid gap-3 p-3.5", item.hidden && status === "open" && "border-cream-edge bg-cream/40")}>
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                <Pill tone={item.target === "joke" ? "scheduled" : "muted"}>{item.target === "joke" ? "Joke" : "Comment"}</Pill>
                <span>
                  by @{item.authorHandle} · {item.reports} {item.reports === 1 ? "report" : "reports"} since {shortDate(item.firstReportedAt.slice(0, 10))}
                </span>
                {item.hidden && status === "open" ? (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-butter px-2 py-0.5 text-xs font-semibold text-butter-ink">
                    <Icon name="eyeOff" size={13} /> Hidden from readers
                  </span>
                ) : null}
              </div>
              <p className="font-semibold">
                <Link to={`/joke/${item.jokeId}`} className="text-ink">
                  “{item.preview}”
                </Link>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(item.reasons).map(([reason, n]) => (
                  <Pill key={reason} tone={reason === "offensive" ? "review" : "muted"} className="py-0.75">
                    {REASON_LABEL[reason] ?? reason} × {n}
                  </Pill>
                ))}
              </div>
              {item.notes.length ? (
                <ul className="m-0 grid gap-1 pl-4.5 text-sm text-ink-soft">
                  {item.notes.map((n, i) => (
                    <li key={i}>“{n}”</li>
                  ))}
                </ul>
              ) : null}

              {status === "resolved" ? (
                <p className="text-sm font-medium">
                  {item.resolution === "removed" ? "Taken down" : "Left up"}
                  {item.resolvedBy ? ` by @${item.resolvedBy}` : ""}
                  {item.resolvedAt ? `, ${timeAgo(item.resolvedAt)}` : ""}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {isAdmin ? (
                    <>
                      <input
                        className={field("sm", "min-w-0 flex-[1_1_200px]")}
                        placeholder="Why (for the audit log, optional)"
                        value={notes[key(item)] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [key(item)]: e.target.value }))}
                        aria-label="Reason for the decision"
                      />
                      <ConfirmDialog
                        trigger={
                          <button type="button" className={button({ variant: "danger", size: "sm" })} disabled={pending === key(item)}>
                            Take it down
                          </button>
                        }
                        title={`Take this ${item.target} down?`}
                        description={`It's removed for everyone and the reports are closed. Everyone who reported it is told${item.target === "joke" ? ", and the writer can appeal" : ""}.`}
                        confirmLabel="Take it down"
                        pendingLabel="Taking down…"
                        onConfirm={() => resolve(item, "remove")}
                      />
                      <button type="button" className={smallQuiet} disabled={pending === key(item)} onClick={() => void resolve(item, "dismiss")}>
                        Leave it up
                      </button>
                    </>
                  ) : null}
                  {item.commentId ? (
                    <button type="button" className={smallQuiet} disabled={pending === key(item)} onClick={() => void setHidden(item, !item.hidden)}>
                      <Icon name={item.hidden ? "eye" : "eyeOff"} size={16} />
                      {item.hidden ? "Unhide comment" : "Hide comment"}
                    </button>
                  ) : !isAdmin ? (
                    <p className="text-sm text-ink-soft">An admin will decide on this joke.</p>
                  ) : null}
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
