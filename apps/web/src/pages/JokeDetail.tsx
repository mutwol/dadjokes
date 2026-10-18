import { useEffect, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { z } from "zod";
import {
  api,
  problemMessage,
  useAddCommentMutation,
  useDeleteCommentMutation,
  useGetJokeQuery,
  useGetTipQuery,
  useHideCommentMutation,
  useListCommentsQuery,
  useSubscribeMutation,
  useTipJokeMutation,
  useUnhideCommentMutation,
  useUnsubscribeMutation,
} from "../api/rtk/index.ts";
import type { Comment, Joke, Tip } from "../api/rtk/index.ts";
import { shareJoke, useToggleReaction } from "../api/engagement.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { button, IconButton, TextButton } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { CheckRow } from "@/components/ui/check-row.tsx";
import { choice } from "@/components/ui/choice.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { Form, FormError, SubmitButton, TextareaField, TextField } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { help } from "@/components/ui/label.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { cn } from "@/lib/utils.ts";
import { useLiveStats } from "../api/useLiveStats.ts";
import { GroanMeter, ReactionBar } from "../components/Reactions.tsx";
import { ReportDialog } from "../components/ReportDialog.tsx";
import { reportToast } from "../components/reportToast.ts";
import type { ReportTarget } from "../components/ReportDialog.tsx";
import { SimulatedMpesaPrompt } from "../components/SimulatedMpesaPrompt.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { TipWall } from "../components/TipWall.tsx";
import { ksh, tipTier } from "../components/tipTiers.ts";
import { longDate, timeAgo } from "../data/dates.ts";
import { faceOf } from "../data/face.ts";
import { compact, totalReactions } from "../data/reactions.ts";
import { useAppDispatch } from "../state/redux.ts";
import { useStore } from "../state/useStore.ts";

const TIP_STATUS: Record<string, string> = {
  pending: "text-ink",
  paid: "text-forest",
  failed: "text-tag-red-deep",
  cancelled: "text-tag-red-deep",
  expired: "text-tag-red-deep",
};

const TIP_AMOUNTS = [20, 50, 100, 250];
const PHONE_KEY = "daddyjokes.tipPhone";

function savedPhone(): string {
  try {
    return window.localStorage.getItem(PHONE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function JokeDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: joke, isError } = useGetJokeQuery({ id }, { skip: !id });

  // Gone, removed or not yours to see: say so and go home.
  useEffect(() => {
    if (!isError) return;
    toast.error("That joke isn't available.");
    void navigate("/", { replace: true });
  }, [isError, navigate]);

  if (!joke) return <div className="mx-auto max-w-wide px-4 lg:px-8" aria-busy="true" />;
  return <Detail key={joke.id} joke={joke} />;
}

function Detail({ joke }: { joke: Joke }) {
  const navigate = useNavigate();
  const { account } = useStore();
  const dispatch = useAppDispatch();
  const [stats, setStats] = useLiveStats(joke.id, { ...joke.stats, myReaction: joke.myReaction });
  const [tipOpen, setTipOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(joke.creator.isSubscribed);
  const [tipId, setTipId] = useState<string | null>(null);
  // Test mode (fake M-Pesa): the tip waits for an answer on this simulated phone prompt.
  const [prompt, setPrompt] = useState<Tip | null>(null);
  const toggleReaction = useToggleReaction();
  const [tipJoke] = useTipJokeMutation();
  const [addComment] = useAddCommentMutation();
  const [deleteComment] = useDeleteCommentMutation();
  const [hideComment] = useHideCommentMutation();
  const [unhideComment] = useUnhideCommentMutation();
  const [subscribe] = useSubscribeMutation();
  const [unsubscribe] = useUnsubscribeMutation();

  // Follow a pending tip until M-Pesa says how it went (the PIN prompt takes a few seconds).
  // Poll every 2s while the tip is pending; stop as soon as it settles.
  const tipArg = { id: tipId ?? "" };
  const lastTip = api.endpoints.getTip.useQueryState(tipArg, { skip: !tipId }).data;
  const { data: tipState } = useGetTipQuery(tipArg, { skip: !tipId, pollingInterval: !lastTip || lastTip.status === "pending" ? 2000 : 0 });
  const pending = tipState?.status === "pending";
  const creator = joke.creator;
  const counts = stats.reactions;
  const first = creator.name.split(" ")[0];
  useEffect(() => {
    if (tipState?.status !== "paid") return;
    toast.success(`Tip sent to ${first}. Thank you!`);
    // Put it on the tip wall straight away.
    dispatch(api.util.invalidateTags([{ type: "TipWall", id: joke.id }]));
  }, [tipState?.status, first, dispatch, joke.id]);

  // Comments: pages accumulate in one cache entry ("Older comments" appends; see endpoints.ts).
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const commentsQuery = useListCommentsQuery({ id: joke.id, limit: 20, cursor });
  const comments = commentsQuery.data?.data ?? null;
  const moreCursor = commentsQuery.data?.nextCursor ?? null;
  const { refetch: refetchComments } = commentsQuery;
  // The live count moved (someone else commented): fetch the first page again.
  const seenCount = useRef(stats.comments);
  useEffect(() => {
    if (stats.comments === seenCount.current) return;
    seenCount.current = stats.comments;
    if (!cursor && commentsQuery.isSuccess) void refetchComments();
  }, [stats.comments, cursor, refetchComments, commentsQuery.isSuccess]);
  const loadMore = () => moreCursor && setCursor(moreCursor);

  const react = async (kind: NonNullable<Joke["myReaction"]>) => {
    try {
      setStats(await toggleReaction(joke.id, stats.myReaction, kind));
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const remove = async (c: Comment) => {
    try {
      await deleteComment({ id: c.id }).unwrap();
      setStats((s) => ({ ...s, comments: Math.max(0, s.comments - 1) }));
      toast.success("Comment deleted.");
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't delete that comment."));
    }
  };

  const [reporting, setReporting] = useState<ReportTarget | null>(null);

  /** Curators and admins can hide a comment from readers (or show it again). */
  const setHidden = async (c: Comment, hidden: boolean) => {
    try {
      await (hidden ? hideComment({ id: c.id }) : unhideComment({ id: c.id })).unwrap();
      toast.success(hidden ? "Comment hidden from readers." : "Comment visible again.");
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't change that comment. Try again."));
    }
  };

  const share = async () => {
    const result = await shareJoke(joke);
    if (result === "copied") toast.success("Copied. Go spread the groans.");
  };

  const toggleSubscribe = async () => {
    const on = subscribed;
    setSubscribed(!on);
    try {
      await (on ? unsubscribe({ creatorId: creator.id }) : subscribe({ creatorId: creator.id })).unwrap();
      toast.success(on ? `Unsubscribed from ${first}` : `Subscribed to ${first}`);
    } catch (e) {
      setSubscribed(on);
      toast.error(problemMessage(e, "Couldn't update your subscription. Try again."));
    }
  };

  return (
    <div className="mx-auto max-w-wide px-4 lg:px-8">
      <header className="-ml-2.5 flex items-center gap-2 py-3 lg:pt-7">
        <IconButton onClick={() => void navigate("/")} aria-label="Back to today">
          <Icon name="back" />
        </IconButton>
        <h1 className="text-xl">{joke.deliverOn ? longDate(joke.deliverOn) : "Your joke"}</h1>
      </header>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-x-10">
        <div className="grid content-start gap-3">
          <StoryCard face={faceOf(joke)} revealed variant="inline" animate={false} />
          <div className="flex flex-wrap gap-2">
            <Link to={`/view/${joke.id}`} className={button({ variant: "quiet" })}>
              <Icon name="replay" size={20} />
              Replay as a status
            </Link>
            <button type="button" className={button({ variant: "quiet" })} onClick={() => void share()}>
              <Icon name="send" size={20} />
              Share
            </button>
          </div>
          {joke.isMine ? null : (
            <TextButton onClick={() => setReporting({ jokeId: joke.id, what: "joke" })}>Report this joke</TextButton>
          )}
        </div>

        <div className="grid content-start gap-7 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Card as="section" className="grid gap-3 p-4.5" aria-label="About the creator">
            <div className="flex items-center gap-2.5">
              <Avatar name={creator.name} tone={creator.tone} size={48} />
              <div>
                <p className="leading-[1.25] font-semibold">{creator.name}</p>
                <p className="text-sm text-ink-soft">
                  @{creator.handle}
                  {creator.country ? `, ${creator.country}` : ""}
                </p>
              </div>
            </div>
            <p className="text-ink-soft">{creator.bio}</p>
            <div className="flex flex-wrap gap-2.5">
              {joke.isMine ? null : (
              <button
                type="button"
                className={button({ variant: subscribed ? "quiet" : "primary" })}
                aria-pressed={subscribed}
                onClick={() => void toggleSubscribe()}
              >
                {subscribed ? (
                  <>
                    <Icon name="check" size={20} />
                    Subscribed
                  </>
                ) : (
                  "Subscribe"
                )}
              </button>
              )}
              {joke.isMine ? null : (
              <button
                type="button"
                className={button({ variant: "quiet" })}
                aria-expanded={tipOpen}
                aria-controls="tip-panel"
                onClick={() => setTipOpen((o) => !o)}
              >
                <Icon name="coin" size={20} />
                Tip {first}
              </button>
              )}
            </div>

            {tipOpen ? (
              <div id="tip-panel" className="grid gap-3 border-t border-line pt-3.5">
                <p className="font-semibold">Send {first} a tip for this one</p>
                <TipForm
                  first={first}
                  disabled={pending}
                  onSubmit={async (v) => {
                    try {
                      window.localStorage.setItem(PHONE_KEY, v.phone);
                    } catch {
                      // Not remembered on this device; that's fine.
                    }
                    const t = await tipJoke({
                      id: joke.id,
                      createTipRequest: { amountKes: v.amount, phone: v.phone, note: v.note || undefined, anonymous: v.anonymous },
                    }).unwrap();
                    setTipId(t.id);
                    if (t.simulated && t.status === "pending") setPrompt(t);
                  }}
                />
                {tipState && tipId ? (
                  <p className={cn("text-sm font-medium", TIP_STATUS[tipState.status])} role="status">
                    {tipState.message}
                    {tipState.simulated && pending && !prompt ? (
                      <>
                        {" "}
                        <button type="button" className="border-0 bg-transparent p-0 font-medium text-ink underline underline-offset-2" onClick={() => setPrompt(tipState)}>
                          Open the test prompt
                        </button>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className={help}>You'll get a prompt on your phone. Your tip and message show under the joke.</p>
                )}
              </div>
            ) : null}
          </Card>

          <section className="grid gap-4" aria-labelledby="react-title">
            <div className="grid gap-1">
              <h2 id="react-title" className="text-xl">How did it land?</h2>
              <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                <Icon name="eye" size={18} /> {compact(stats.views)} views,{" "}
                {compact(totalReactions(counts))} reactions
              </p>
            </div>
            {joke.isMine ? (
              <p className="text-sm text-ink-soft">It's your joke, so you can't react, but you can watch the groans come in.</p>
            ) : (
              <ReactionBar selected={stats.myReaction ?? undefined} counts={counts} onReact={(k) => void react(k)} />
            )}
            <GroanMeter counts={counts} />
          </section>
        </div>

        <div className="grid content-start gap-8 lg:col-start-1 lg:row-start-2 lg:max-w-[640px]">
        <TipWall jokeId={joke.id} />
        <section className="grid gap-4" aria-labelledby="comments-title">
          <h2 id="comments-title" className="text-xl">Comments ({stats.comments})</h2>
          <CommentForm
            name={account?.name ?? "You"}
            tone={account?.tone ?? "navy"}
            onSubmit={async (body) => {
              await addComment({ id: joke.id, createCommentRequest: { body } }).unwrap();
              setStats((x) => ({ ...x, comments: x.comments + 1 }));
            }}
          />
          {comments !== null && comments.length === 0 ? (
            <p className="py-4.5 text-ink-soft">No comments yet. Be the first to groan in writing.</p>
          ) : (
            <ul className="m-0 grid list-none p-0" aria-busy={comments === null}>
              {(comments ?? []).map((c) => (
                <li key={c.id} className="flex gap-3 border-t border-line py-3.5">
                  <Avatar name={c.author.name} tone={c.author.tone} size={36} />
                  <div className="grid min-w-0 gap-0.5">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <strong>{c.author.name}</strong>
                      <span className="text-sm text-ink-faint">{timeAgo(c.createdAt)}</span>
                      {c.hidden ? (
                        <span className="inline-flex items-center gap-1 rounded-sm bg-butter px-1.5 py-px text-xs font-medium text-butter-ink">
                          <Icon name="eyeOff" size={13} /> Hidden from readers
                        </span>
                      ) : null}
                    </p>
                    <p className={c.hidden ? "text-ink-soft" : undefined}>{c.body}</p>
                    <div className="flex gap-3.5">
                      {c.canDelete ? (
                        <ConfirmDialog
                          trigger={<TextButton>Delete</TextButton>}
                          title="Delete this comment?"
                          description={c.isMine ? "It's removed for everyone. You can't undo this." : `${c.author.name}'s comment is removed for everyone. You can't undo this.`}
                          confirmLabel="Delete comment"
                          pendingLabel="Deleting…"
                          onConfirm={() => remove(c)}
                        />
                      ) : null}
                      {c.isMine ? null : (
                        <TextButton onClick={() => setReporting({ commentId: c.id, what: "comment" })}>Report</TextButton>
                      )}
                      {c.canHide && !c.isMine ? (
                        <TextButton onClick={() => void setHidden(c, !c.hidden)}>{c.hidden ? "Unhide" : "Hide"}</TextButton>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {moreCursor ? (
            <button
              type="button"
              className={button({ variant: "quiet", size: "sm" })}
              onClick={loadMore}
              disabled={commentsQuery.isFetching}
              aria-busy={commentsQuery.isFetching || undefined}
            >
              {commentsQuery.isFetching && cursor ? "Loading…" : "Older comments"}
            </button>
          ) : null}
        </section>
        </div>
      </div>
      <SimulatedMpesaPrompt tip={prompt} onClose={() => setPrompt(null)} />
      <ReportDialog
        target={reporting}
        onClose={() => setReporting(null)}
        onDone={(receipt, target) => {
          setReporting(null);
          toast.success(reportToast(receipt, target.what));
          // Enough reports hid it straight away: drop it from the list.
          if (receipt.hidden && "commentId" in target && commentsQuery.isSuccess) void refetchComments();
        }}
      />
    </div>
  );
}

const KENYAN_MOBILE = /^(?:\+?254|0)?(7|1)\d{8}$/;
const tipSchema = z.object({
  amount: z.number().int().min(10, "Tips start at KES 10.").max(10000, "Tips go up to KES 10,000."),
  phone: z
    .string()
    .trim()
    .transform((x) => x.replace(/[\s-]/g, ""))
    .refine((x) => KENYAN_MOBILE.test(x), "Enter a Kenyan M-Pesa number, like 0712 345 678."),
  note: z.string().trim().max(140, "Keep the message to 140 characters."),
  anonymous: z.boolean(),
});
type TipValues = z.output<typeof tipSchema>;

/**
 * Amount chips, an optional public message (shown like a Super Chat, in the
 * colour of the amount), and the M-Pesa number, remembered on this device.
 */
function TipForm({ first, disabled, onSubmit }: { first: string; disabled: boolean; onSubmit: (v: TipValues) => Promise<void> }) {
  const form = useZodForm(tipSchema, { defaultValues: { amount: 50, phone: savedPhone(), note: "", anonymous: false } });
  // useWatch, not form.watch: the React Compiler would memoize watch() and miss changes.
  const [amount, note, anonymous] = useWatch({ control: form.control, name: ["amount", "note", "anonymous"] });
  const tier = tipTier(amount);
  return (
    <Form form={form} onSubmit={onSubmit} className="gap-3">
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={`Tip amount for ${first}`}>
        {TIP_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={amount === a}
            className={choice(amount === a, { className: "min-h-10 rounded-md text-sm font-medium" })}
            onClick={() => form.setValue("amount", a, { shouldDirty: true })}
          >
            {ksh(a)}
          </button>
        ))}
      </div>
      <TextareaField
        name="note"
        label="Message"
        optional
        rows={2}
        maxLength={140}
        placeholder={`Say something to ${first}`}
        disabled={disabled}
        help={`${note.length}/140 · Shows with your tip under the joke.`}
      />
      {note.trim() ? (
        <div className="overflow-hidden rounded-lg text-sm" aria-label="Preview">
          <p className={cn("px-3 py-1.5 font-semibold", tier.head)}>{ksh(amount)}</p>
          <p className={cn("px-3 py-2 break-words", tier.body)}>{note.trim()}</p>
        </div>
      ) : null}
      <CheckRow checked={anonymous} onChange={(v) => form.setValue("anonymous", v, { shouldDirty: true })} title="Tip anonymously">
        Your name is hidden on the joke and from {first}.
      </CheckRow>
      <TextField name="phone" label="M-Pesa number" fieldSize="sm" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" disabled={disabled} />
      <FormError />
      <SubmitButton block disabled={disabled} pendingLabel="Sending the prompt…">
        {disabled ? "Waiting for your PIN…" : `Tip ${ksh(amount)} with M-Pesa`}
      </SubmitButton>
    </Form>
  );
}

const commentSchema = z.object({ body: z.string().trim().min(1, "Write something first.").max(280, "Keep it under 280 characters.") });

function CommentForm({ name, tone, onSubmit }: { name: string; tone: Joke["background"]; onSubmit: (body: string) => Promise<void> }) {
  const form = useZodForm(commentSchema, { defaultValues: { body: "" }, mode: "onSubmit" });
  return (
    <Form form={form} resetOnSuccess onSubmit={({ body }) => onSubmit(body)} className="grid-cols-[auto_1fr_auto] items-start gap-2.5">
      <Avatar name={name} tone={tone} size={36} />
      <TextField name="body" label="Add a comment" hideLabel className="min-w-0" maxLength={280} placeholder="Add a groan of your own" autoComplete="off" />
      <SubmitButton size="md" variant="primary">
        Post
      </SubmitButton>
      <FormError className="col-span-3" />
    </Form>
  );
}
