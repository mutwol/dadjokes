import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, api, unwrap } from "../api/client.ts";
import type { Joke } from "../api/client.ts";
import { Icon } from "../components/Icon.tsx";
import { NameTag } from "../components/NameTag.tsx";
import { ReactionBar } from "../components/Reactions.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { shortDate } from "../data/dates.ts";
import { faceOf } from "../data/face.ts";
import { useStore } from "../state/useStore.ts";
import "./StoryViewer.css";

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
  const { showToast } = useStore();
  const [joke, setJoke] = useState<Joke | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = IS_DATE.test(id)
      ? api.POST("/v1/me/deliveries/{date}/open", { params: { path: { date: id } } })
      : api.GET("/v1/jokes/{id}", { params: { path: { id } } });
    load.then(unwrap).then(
      (j) => {
        if (!cancelled) setJoke(j);
      },
      (e: unknown) => {
        if (cancelled) return;
        showToast(e instanceof ApiError && e.status === 410 ? e.problem.title : "That joke isn't available.");
        void navigate("/", { replace: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, navigate, showToast]);

  if (!joke) return <div className="viewer" role="dialog" aria-modal="true" aria-label="Opening the joke" aria-busy="true" />;
  return <Viewer key={joke.id} joke={joke} />;
}

function Viewer({ joke }: { joke: Joke }) {
  const creator = joke.creator;
  const navigate = useNavigate();
  const { react, myReaction, addComment, showToast } = useStore();

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
        <StoryCard face={faceOf(joke)} revealed={revealed} variant="full" animate={!reduced} />

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
              {joke.deliverOn ? shortDate(joke.deliverOn) : "Preview"}
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
