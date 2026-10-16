import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, api, errorMessage, unwrap } from "../api/client.ts";
import type { Comment, Joke, Tip } from "../api/client.ts";
import { shareJoke, toggleReaction } from "../api/engagement.ts";
import { useLiveStats } from "../api/useLiveStats.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { GroanMeter, ReactionBar } from "../components/Reactions.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { longDate, timeAgo } from "../data/dates.ts";
import { faceOf } from "../data/face.ts";
import { compact, totalReactions } from "../data/reactions.ts";
import { useStore } from "../state/useStore.ts";
import "./JokeDetail.css";

const TIP_AMOUNTS = [20, 50, 100, 250];
/** The platform's share, as configured on the API (TIP_FEE_PERCENT). */
const TIP_FEE = 10;
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
  const { showToast } = useStore();
  const [joke, setJoke] = useState<Joke | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .GET("/v1/jokes/{id}", { params: { path: { id } } })
      .then(unwrap)
      .then(
        (j) => {
          if (!cancelled) setJoke(j);
        },
        () => {
          if (cancelled) return;
          showToast("That joke isn't available.");
          void navigate("/", { replace: true });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [id, navigate, showToast]);

  if (!joke) return <div className="detail" aria-busy="true" />;
  return <Detail key={joke.id} joke={joke} />;
}

function Detail({ joke }: { joke: Joke }) {
  const navigate = useNavigate();
  const { showToast, account } = useStore();
  const [stats, setStats] = useLiveStats(joke.id, { ...joke.stats, myReaction: joke.myReaction });
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [moreCursor, setMoreCursor] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [tip, setTip] = useState(50);
  const [subscribed, setSubscribed] = useState(joke.creator.isSubscribed);
  const [tipPhone, setTipPhone] = useState(savedPhone);
  const [tipState, setTipState] = useState<Tip | null>(null);

  // Follow a pending tip until M-Pesa says how it went (the PIN prompt takes a few seconds).
  useEffect(() => {
    if (tipState?.status !== "pending") return;
    const id = tipState.id;
    const t = window.setTimeout(async () => {
      const { data } = await api.GET("/v1/tips/{id}", { params: { path: { id } } });
      if (!data) return;
      setTipState(data);
      if (data.status === "paid") showToast(`Tip sent to ${joke.creator.name.split(" ")[0]}. Thank you!`);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [tipState, showToast, joke.creator.name]);

  const sendTip = async (e: FormEvent) => {
    e.preventDefault();
    try {
      window.localStorage.setItem(PHONE_KEY, tipPhone);
    } catch {
      // Not remembered on this device; that's fine.
    }
    try {
      setTipState(
        unwrap(await api.POST("/v1/jokes/{id}/tips", { params: { path: { id: joke.id } }, body: { amountKes: tip, phone: tipPhone } })),
      );
    } catch (err) {
      const fields = err instanceof ApiError ? Object.values(err.fieldErrors()) : [];
      showToast(fields[0] ?? errorMessage(err));
    }
  };

  const creator = joke.creator;
  const counts = stats.reactions;
  const first = creator.name.split(" ")[0];

  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/v1/jokes/{id}/comments", { params: { path: { id: joke.id }, query: { limit: 20 } } })
      .then(unwrap)
      .then((page) => {
        if (cancelled) return;
        setComments(page.data);
        setMoreCursor(page.nextCursor);
      }, () => undefined);
    return () => {
      cancelled = true;
    };
    // Reload when the live count changes, so other people's comments show up.
  }, [joke.id, stats.comments]);

  const loadMore = async () => {
    if (!moreCursor) return;
    const page = unwrap(
      await api.GET("/v1/jokes/{id}/comments", { params: { path: { id: joke.id }, query: { limit: 20, cursor: moreCursor } } }),
    );
    setComments((prev) => [...(prev ?? []), ...page.data.filter((c) => !prev?.some((p) => p.id === c.id))]);
    setMoreCursor(page.nextCursor);
  };

  const react = async (kind: NonNullable<Joke["myReaction"]>) => {
    try {
      setStats(await toggleReaction(joke.id, stats.myReaction, kind));
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const post = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const c = unwrap(await api.POST("/v1/jokes/{id}/comments", { params: { path: { id: joke.id } }, body: { body } }));
      setComments((prev) => [c, ...(prev ?? [])]);
      setStats((s) => ({ ...s, comments: s.comments + 1 }));
      setDraft("");
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const remove = async (c: Comment) => {
    const { response } = await api.DELETE("/v1/comments/{id}", { params: { path: { id: c.id } } });
    if (!response.ok) return showToast("Couldn't delete that comment.");
    setComments((prev) => prev?.filter((x) => x.id !== c.id) ?? null);
    setStats((s) => ({ ...s, comments: Math.max(0, s.comments - 1) }));
  };

  const report = async (target: { jokeId: string } | { commentId: string }, what: string) => {
    const { response } = await api.POST("/v1/reports", {
      body: { ...target, reason: "jokeId" in target ? "copied" : "offensive" },
    });
    showToast(response.ok ? `Thanks. The curators will look at this ${what}.` : "Couldn't send the report. Try again.");
  };

  const share = async () => {
    const result = await shareJoke(joke);
    if (result === "copied") showToast("Copied. Go spread the groans.");
  };

  const toggleSubscribe = async () => {
    const on = subscribed;
    setSubscribed(!on);
    const params = { path: { creatorId: creator.id } };
    const { response } = on
      ? await api.DELETE("/v1/me/subscriptions/{creatorId}", { params })
      : await api.PUT("/v1/me/subscriptions/{creatorId}", { params });
    if (response.ok) showToast(on ? `Unsubscribed from ${first}` : `Subscribed to ${first}`);
    else {
      setSubscribed(on);
      showToast("Couldn't update your subscription. Try again.");
    }
  };

  return (
    <div className="detail">
      <header className="detail-head">
        <button
          type="button"
          className="icon-btn"
          onClick={() => void navigate("/")}
          aria-label="Back to today"
        >
          <Icon name="back" />
        </button>
        <h1 className="detail-date">{joke.deliverOn ? longDate(joke.deliverOn) : "Your joke"}</h1>
      </header>

      <div className="detail-grid">
        <div className="detail-joke">
          <StoryCard face={faceOf(joke)} revealed variant="inline" animate={false} />
          <div className="detail-joke-actions">
            <Link to={`/view/${joke.id}`} className="btn btn-quiet detail-replay">
              <Icon name="replay" size={20} />
              Replay as a status
            </Link>
            <button type="button" className="btn btn-quiet" onClick={() => void share()}>
              <Icon name="send" size={20} />
              Share
            </button>
          </div>
          {joke.isMine ? null : (
            <button type="button" className="link-btn detail-report" onClick={() => void report({ jokeId: joke.id }, "joke")}>
              Report this joke as copied
            </button>
          )}
        </div>

        <div className="detail-side">
          <section className="detail-creator" aria-label="About the creator">
            <div className="byline">
              <Avatar name={creator.name} tone={creator.tone} size={48} />
              <div>
                <p className="byline-name">{creator.name}</p>
                <p className="byline-sub">
                  @{creator.handle}
                  {creator.country ? `, ${creator.country}` : ""}
                </p>
              </div>
            </div>
            <p className="detail-bio">{creator.bio}</p>
            <div className="detail-creator-actions">
              {joke.isMine ? null : (
              <button
                type="button"
                className={`btn ${subscribed ? "btn-quiet" : "btn-primary"}`}
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
                className="btn btn-quiet"
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
              <div id="tip-panel" className="tip">
                <p className="tip-title">Send {first} a tip for this one</p>
                <div className="tip-amounts" role="radiogroup" aria-label="Tip amount">
                  {TIP_AMOUNTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={tip === a}
                      className={`tip-amount${tip === a ? " is-on" : ""}`}
                      onClick={() => setTip(a)}
                    >
                      KES {a}
                    </button>
                  ))}
                </div>
                <form className="tip-form" onSubmit={(e) => void sendTip(e)}>
                  <label className="tip-phone">
                    <span>M-Pesa number</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="0712 345 678"
                      value={tipPhone}
                      onChange={(e) => setTipPhone(e.target.value)}
                      disabled={tipState !== null && tipState.status === "pending"}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn-primary btn-block"
                    disabled={!tipPhone.trim() || (tipState !== null && tipState.status === "pending")}
                  >
                    {tipState?.status === "pending" ? "Waiting for your PIN…" : `Tip KES ${tip} with M-Pesa`}
                  </button>
                </form>
                {tipState ? (
                  <p className={`tip-status tip-${tipState.status}`} role="status">
                    {tipState.message}
                  </p>
                ) : (
                  <p className="field-help">You'll get a prompt on your phone. {first} gets {100 - TIP_FEE}% of it.</p>
                )}
              </div>
            ) : null}
          </section>

          <section className="detail-section" aria-labelledby="react-title">
            <div className="detail-section-head">
              <h2 id="react-title">How did it land?</h2>
              <p className="detail-counts">
                <Icon name="eye" size={18} /> {compact(stats.views)} views,{" "}
                {compact(totalReactions(counts))} reactions
              </p>
            </div>
            {joke.isMine ? (
              <p className="detail-mine-note">It's your joke, so you can't react, but you can watch the groans come in.</p>
            ) : (
              <ReactionBar selected={stats.myReaction ?? undefined} counts={counts} onReact={(k) => void react(k)} />
            )}
            <GroanMeter counts={counts} />
          </section>
        </div>

        <section className="detail-section detail-comments" aria-labelledby="comments-title">
          <h2 id="comments-title">Comments ({stats.comments})</h2>
          <form className="comment-form" onSubmit={(e) => void post(e)}>
            <Avatar name={account?.name ?? "You"} tone={account?.tone ?? "navy"} size={36} />
            <label className="visually-hidden" htmlFor="comment">
              Add a comment
            </label>
            <input
              id="comment"
              value={draft}
              maxLength={280}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a groan of your own"
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={!draft.trim() || posting}>
              Post
            </button>
          </form>
          {comments !== null && comments.length === 0 ? (
            <p className="comments-empty">No comments yet. Be the first to groan in writing.</p>
          ) : (
            <ul className="comments" aria-busy={comments === null}>
              {(comments ?? []).map((c) => (
                <li key={c.id} className="comment">
                  <Avatar name={c.author.name} tone={c.author.tone} size={36} />
                  <div className="comment-main">
                    <p className="comment-head">
                      <strong>{c.author.name}</strong>
                      <span>{timeAgo(c.createdAt)}</span>
                    </p>
                    <p>{c.body}</p>
                    <div className="comment-actions">
                      {c.canDelete ? (
                        <button type="button" className="link-btn" onClick={() => void remove(c)}>
                          Delete
                        </button>
                      ) : null}
                      {c.isMine ? null : (
                        <button type="button" className="link-btn" onClick={() => void report({ commentId: c.id }, "comment")}>
                          Report
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {moreCursor ? (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => void loadMore()}>
              Older comments
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
