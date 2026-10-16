import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Icon } from "../components/Icon.tsx";
import { NameTag } from "../components/NameTag.tsx";
import { ReactionBar } from "../components/Reactions.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { formatHour } from "../components/useCountdown.ts";
import { creatorById, jokeById } from "../data/mock.ts";
import { useStore } from "../state/useStore.ts";
import "./StoryViewer.css";

/** How long each part stays up before moving on, in ms. */
const SETUP_MS = 5000;
const PUNCHLINE_MS = 6000;
const HOLD_MS = 220;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function StoryViewer() {
  const { id = "" } = useParams();
  const joke = jokeById(id);
  if (!joke) return <Navigate to="/" replace />;
  return <Viewer key={joke.id} jokeId={joke.id} />;
}

function Viewer({ jokeId }: { jokeId: string }) {
  const joke = jokeById(jokeId)!;
  const creator = creatorById(joke.creatorId);
  const navigate = useNavigate();
  const { markSeen, react, myReaction, addComment, showToast, deliveryHour } = useStore();

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

  useEffect(() => {
    if (revealed) markSeen(joke.deliverOn);
  }, [revealed, markSeen, joke.deliverOn]);

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

  const sendReply = (e: FormEvent) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body) return;
    addComment(joke.id, body);
    setReply("");
    showToast(`Reply sent to ${creator.name.split(" ")[0]}`);
  };

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Today's joke from ${creator.name}`}
    >
      <div className="viewer-frame">
        <StoryCard face={joke} revealed={revealed} variant="full" animate={!reduced} />

        <div className="viewer-top">
          <div className="progress" aria-hidden="true">
            {Array.from({ length: steps }, (_, i) => {
              const state = i < step ? "done" : i === step ? "active" : "todo";
              const ms = i === 0 && steps === 2 ? SETUP_MS : PUNCHLINE_MS;
              return (
                <span key={i} className="progress-track">
                  <span
                    className={`progress-fill is-${state}${reduced ? " is-static" : ""}`}
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
          <div className="viewer-byline">
            <NameTag name={creator.name.split(" ")[0]} size="s" tilt={-4} />
            <p className="viewer-when">
              Today at {formatHour(deliveryHour)}
              <span className="visually-hidden">, from {creator.name}</span>
            </p>
            <button type="button" className="viewer-close" onClick={close} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div
          className="viewer-tap"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            window.clearTimeout(holdTimer.current);
            setHeld(false);
          }}
          onContextMenu={(e) => e.preventDefault()}
        />

        <p className="visually-hidden" aria-live="polite">
          {joke.kind === "text"
            ? revealed
              ? `Punchline: ${joke.punchline}`
              : `Setup: ${joke.setup}`
            : joke.caption}
        </p>

        <div className="viewer-bottom">
          {!revealed ? (
            <button type="button" className="viewer-hint" onClick={next}>
              {reduced ? "Tap for the punchline" : "Wait for it…"}
            </button>
          ) : (
            <>
              <ReactionBar
                tone="dark"
                selected={myReaction(joke.id)}
                onReact={(k) => react(joke.id, k)}
              />
              <div className="viewer-reply-row">
                <form className="viewer-reply" onSubmit={sendReply}>
                  <label className="visually-hidden" htmlFor="reply">
                    Reply to {creator.name}
                  </label>
                  <input
                    id="reply"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onFocus={() => setTyping(true)}
                    onBlur={() => setTyping(false)}
                    placeholder={`Reply to ${creator.name.split(" ")[0]}`}
                    autoComplete="off"
                  />
                  <button type="submit" aria-label="Send reply" disabled={!reply.trim()}>
                    <Icon name="send" size={20} />
                  </button>
                </form>
                <Link to={`/joke/${joke.id}`} className="viewer-more" aria-label="Comments">
                  <Icon name="comment" size={20} />
                  <span>Comments</span>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
