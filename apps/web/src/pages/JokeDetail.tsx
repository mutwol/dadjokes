import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, unwrap } from "../api/client.ts";
import type { Joke } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { GroanMeter, ReactionBar } from "../components/Reactions.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { longDate } from "../data/dates.ts";
import { faceOf } from "../data/face.ts";
import { compact, totalReactions } from "../data/reactions.ts";
import { useStore } from "../state/useStore.ts";
import "./JokeDetail.css";

const TIP_AMOUNTS = [20, 50, 100, 250];

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
  const { reactionsFor, myReaction, react, commentsFor, addComment, showToast, account } = useStore();
  const [draft, setDraft] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [tip, setTip] = useState(50);
  const [subscribed, setSubscribed] = useState(joke.creator.isSubscribed);

  const creator = joke.creator;
  const counts = reactionsFor(joke);
  const comments = commentsFor(joke);
  const first = creator.name.split(" ")[0];

  const post = (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    addComment(joke.id, body);
    setDraft("");
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
          <Link to={`/view/${joke.id}`} className="btn btn-quiet detail-replay">
            <Icon name="replay" size={20} />
            Replay as a status
          </Link>
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
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    setTipOpen(false);
                    showToast(`Tipping isn't connected yet. KES ${tip} not sent.`);
                  }}
                >
                  Tip KES {tip} with M-Pesa
                </button>
              </div>
            ) : null}
          </section>

          <section className="detail-section" aria-labelledby="react-title">
            <div className="detail-section-head">
              <h2 id="react-title">How did it land?</h2>
              <p className="detail-counts">
                <Icon name="eye" size={18} /> {compact(joke.stats.views)} views,{" "}
                {compact(totalReactions(counts))} reactions
              </p>
            </div>
            <ReactionBar
              selected={myReaction(joke.id)}
              counts={counts}
              onReact={(k) => react(joke.id, k)}
            />
            <GroanMeter counts={counts} />
          </section>
        </div>

        <section className="detail-section detail-comments" aria-labelledby="comments-title">
          <h2 id="comments-title">Comments ({comments.length})</h2>
          <form className="comment-form" onSubmit={post}>
            <Avatar name={account?.name ?? "You"} tone={account?.tone ?? "navy"} size={36} />
            <label className="visually-hidden" htmlFor="comment">
              Add a comment
            </label>
            <input
              id="comment"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a groan of your own"
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={!draft.trim()}>
              Post
            </button>
          </form>
          {comments.length === 0 ? (
            <p className="comments-empty">No comments yet. Be the first to groan in writing.</p>
          ) : (
            <ul className="comments">
              {comments.map((c) => (
                <li key={c.id} className="comment">
                  <Avatar name={c.author} tone={c.tone} size={36} />
                  <div>
                    <p className="comment-head">
                      <strong>{c.author}</strong>
                      <span>{c.postedAt === "now" ? "just now" : `${c.postedAt} ago`}</span>
                    </p>
                    <p>{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
