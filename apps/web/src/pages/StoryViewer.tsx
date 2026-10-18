import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { is, problemMessage, useAddCommentMutation, useGetJokeQuery, useOpenDeliveryMutation } from "../api/rtk/index.ts";
import type { Joke } from "../api/rtk/index.ts";
import { recordEvent, useToggleReaction } from "../api/engagement.ts";
import { IconButton } from "@/components/ui/button.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { cn } from "@/lib/utils.ts";
import { NameTag } from "../components/NameTag.tsx";
import { ReactionBar } from "../components/Reactions.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { shortDate } from "../data/dates.ts";
import { faceOf } from "../data/face.ts";

const viewer = "fixed inset-0 z-50 grid animate-viewer-in place-items-center bg-navy";

/** How long each part stays up before moving on, in ms. */
const SETUP_MS = 5000;
const PUNCHLINE_MS = 6000;
const HOLD_MS = 220;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

const IS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `/view/2026-10-16` opens that day's delivered joke (the "open once" moment);
 * `/view/<joke id>` replays a joke that's already been opened.
 */
export function StoryViewer() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const isDate = IS_DATE.test(id);
  // A date opens that day's delivery (a write: it marks it opened); an id replays a joke.
  const replay = useGetJokeQuery({ id }, { skip: isDate || !id });
  const [openDelivery, delivery] = useOpenDeliveryMutation();
  useEffect(() => {
    if (isDate) void openDelivery({ date: id });
  }, [isDate, id, openDelivery]);
  const joke = isDate ? delivery.data : replay.data;
  const error = isDate ? delivery.error : replay.error;

  useEffect(() => {
    if (!error) return;
    toast.error(is(error, 410) ? problemMessage(error) : "That joke isn't available.");
    void navigate("/", { replace: true });
  }, [error, navigate]);

  const replayId = isDate ? undefined : replay.data?.id;
  useEffect(() => {
    if (replayId) recordEvent(replayId, "replay");
  }, [replayId]);

  if (!joke) return <div className={viewer} role="dialog" aria-modal="true" aria-label="Opening the joke" aria-busy="true" />;
  return <Viewer key={joke.id} joke={joke} />;
}

function Viewer({ joke }: { joke: Joke }) {
  const creator = joke.creator;
  const navigate = useNavigate();
  const [myReaction, setMyReaction] = useState(joke.myReaction);
  const toggleReaction = useToggleReaction();
  const [addComment, replying] = useAddCommentMutation();

  // Image jokes are a single slide; text jokes are setup, then punchline.
  const steps = joke.kind === "text" ? 2 : 1;
  const [step, setStep] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState("");
  const [reduced] = useState(prefersReducedMotion);
  const pressStart = useRef(0);
  const holdTimer = useRef<number | undefined>(undefined);

  const revealed = joke.kind === "image" || step >= 1;
  const paused = held || typing;
  const isLast = step === steps - 1;

  const close = () => {
    void navigate("/");
  };
  const next = () => {
    if (isLast) void navigate(`/joke/${joke.id}`);
    else setStep((s) => s + 1);
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  // Keyboard: arrows move between setup and punchline, Escape closes.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (typing) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") prev();
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pressStart.current = e.timeStamp;
    holdTimer.current = window.setTimeout(() => setHeld(true), HOLD_MS);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    window.clearTimeout(holdTimer.current);
    const wasHold = e.timeStamp - pressStart.current >= HOLD_MS;
    setHeld(false);
    if (wasHold) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 3) prev();
    else next();
  };

  const onSegmentEnd = (i: number) => {
    // Advance from the setup to the punchline; stay on the punchline once it's up.
    if (i === step && !isLast) setStep(i + 1);
  };

  const react = async (kind: NonNullable<Joke["myReaction"]>) => {
    try {
      setMyReaction((await toggleReaction(joke.id, myReaction, kind)).myReaction);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  /** A reply is a comment on the joke, which its writer sees. */
  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body || replying.isLoading) return;
    try {
      await addComment({ id: joke.id, createCommentRequest: { body } }).unwrap();
      setReply("");
      toast.success(`Reply sent to ${creator.name.split(" ")[0]}`);
    } catch (err) {
      toast.error(problemMessage(err));
    }
  };

  return (
    <div
      className={viewer}
      role="dialog"
      aria-modal="true"
      aria-label={`Today's joke from ${creator.name}`}
    >
      <div className="relative h-dvh w-full overflow-hidden select-none sm:aspect-[9/16] sm:h-[min(92dvh,860px)] sm:w-auto sm:rounded-3xl sm:shadow-frame">
        <StoryCard face={faceOf(joke)} revealed={revealed} variant="full" animate={!reduced} />

        <div className="absolute inset-x-0 top-0 z-3 grid gap-3 bg-linear-to-b from-black/22 to-transparent px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-3 text-white">
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: steps }, (_, i) => {
              const state = i < step ? "done" : i === step ? "active" : "todo";
              const ms = i === 0 && steps === 2 ? SETUP_MS : PUNCHLINE_MS;
              return (
                <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-[3px] bg-white/40">
                  <span
                    className={cn(
                      "block size-full origin-left bg-white [transform:scaleX(0)]",
                      state === "done" && "[transform:scaleX(1)]",
                      state === "active" && (reduced ? "[transform:scaleX(1)]" : "animate-progress"),
                    )}
                    style={{
                      animationDuration: `${ms}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                    onAnimationEnd={() => onSegmentEnd(i)}
                  />
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <NameTag name={creator.name.split(" ")[0]} size="s" tilt={-4} />
            <p className="flex-1 text-sm font-medium [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]">
              {joke.deliverOn ? shortDate(joke.deliverOn) : "Preview"}
              <span className="sr-only">, from {creator.name}</span>
            </p>
            <IconButton tone="white" onClick={close} aria-label="Close">
              <Icon name="close" />
            </IconButton>
          </div>
        </div>

        <div
          className="absolute inset-0 z-2 cursor-pointer touch-manipulation"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            window.clearTimeout(holdTimer.current);
            setHeld(false);
          }}
          onContextMenu={(e) => e.preventDefault()}
        />

        <p className="sr-only" aria-live="polite">
          {joke.kind === "text"
            ? revealed
              ? `Punchline: ${joke.punchline}`
              : `Setup: ${joke.setup}`
            : joke.caption}
        </p>

        <div className="@container absolute inset-x-0 bottom-0 z-3 grid grid-cols-[minmax(0,1fr)] gap-2 bg-linear-to-b from-transparent to-black/28 px-3 pt-10 pb-[calc(14px+env(safe-area-inset-bottom))]">
          {!revealed ? (
            <button
              type="button"
              className="min-h-11 justify-self-center rounded-full border-0 bg-white/18 px-5 font-medium text-white backdrop-blur-sm"
              onClick={next}
            >
              {reduced ? "Tap for the punchline" : "Wait for it…"}
            </button>
          ) : (
            <>
              {joke.isMine ? null : (
                <ReactionBar tone="dark" selected={myReaction ?? undefined} onReact={(k) => void react(k)} />
              )}
              <div className="flex min-w-0 gap-2">
                <form className="flex min-h-11 min-w-0 flex-1 items-center rounded-full border-2 border-white/55 bg-black/12 pr-1 pl-4 text-white focus-within:border-white" onSubmit={(e) => void sendReply(e)}>
                  <label className="sr-only" htmlFor="reply">
                    Reply to {creator.name}
                  </label>
                  <input
                    id="reply"
                    className="min-w-0 flex-1 border-0 bg-transparent text-white outline-none placeholder:text-white/85"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onFocus={() => setTyping(true)}
                    onBlur={() => setTyping(false)}
                    placeholder={`Reply to ${creator.name.split(" ")[0]}`}
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="grid size-9 shrink-0 place-items-center theme-light rounded-full border-0 bg-white text-ink disabled:cursor-default disabled:bg-transparent disabled:text-white/60"
                    aria-label="Send reply"
                    disabled={!reply.trim() || replying.isLoading}
                  >
                    <Icon name="send" size={20} />
                  </button>
                </form>
                <Link to={`/joke/${joke.id}`} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 theme-light rounded-full bg-white px-3 font-medium text-ink no-underline @max-[22rem]:px-0"
                  aria-label="Comments"
                >
                  <Icon name="comment" size={20} />
                  <span className="@max-[22rem]:sr-only">Comments</span>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
