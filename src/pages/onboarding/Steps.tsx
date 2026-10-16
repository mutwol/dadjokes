import { useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import { Avatar } from "../../components/Avatar.tsx";
import { Icon } from "../../components/Icon.tsx";
import { NameTag } from "../../components/NameTag.tsx";
import { StoryCard } from "../../components/StoryCard.tsx";
import { formatHour } from "../../components/useCountdown.ts";
import { COUNTRIES, creators, jokeForDay, TAKEN_HANDLES, TODAY, TOPICS } from "../../data/mock.ts";
import { compact } from "../../data/reactions.ts";
import type { Role } from "../../data/types.ts";
import { useStore } from "../../state/useStore.ts";
import { firstName, handleFromName, useFlow } from "./flow.ts";

/* ------------------------------------------------------------------ Welcome */

export function WelcomeStep() {
  const { update, goTo } = useFlow();
  const { showToast } = useStore();
  const sample = jokeForDay(TODAY);

  return (
    <section className="ob-step ob-welcome" aria-labelledby="welcome-title">
      <NameTag name="Daddy Jokes" size="l" tilt={-5} />
      <h1 id="welcome-title" className="ob-hero">
        One dad joke a day, delivered like a status.
      </h1>
      <p className="ob-lead">
        Read a hand-picked joke every morning, or write your own and get tipped when it lands. Or
        both.
      </p>
      {sample ? (
        <div className="ob-welcome-sample" aria-hidden="true">
          <StoryCard face={sample} revealed variant="inline" />
        </div>
      ) : null}
      <div className="ob-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={() => goTo("email")}>
          Sign up with email
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-block"
          onClick={() => {
            // Prototype: pretend Google returned a verified email.
            update({ email: "cyrus@gmail.com", name: "Cyrus Mutwol" });
            showToast("Signed in with Google (demo)");
            goTo("role");
          }}
        >
          <GoogleMark />
          Continue with Google
        </button>
      </div>
      <p className="ob-small">
        Already have an account?{" "}
        <button type="button" className="link-btn" onClick={() => goTo("email")}>
          Sign in
        </button>
      </p>
      <p className="ob-fine">
        By continuing you agree to the <a href="#terms">Terms</a> and{" "}
        <a href="#privacy">Privacy Policy</a>.
      </p>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/* -------------------------------------------------------------------- Email */

export function EmailStep() {
  const { draft, update, next } = useFlow();
  const [email, setEmail] = useState(draft.email);
  const [error, setError] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter an email address like name@example.com.");
      return;
    }
    update({ email: value });
    next();
  };

  return (
    <form className="ob-step" onSubmit={onSubmit} aria-labelledby="email-title" noValidate>
      <h1 id="email-title">What's your email?</h1>
      <p className="ob-lead">We'll send you a 6-digit code. No password to remember.</p>
      <div className="ob-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "email-error" : undefined}
          placeholder="name@example.com"
        />
        {error ? (
          <p id="email-error" className="ob-error">
            {error}
          </p>
        ) : null}
      </div>
      <div className="ob-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={!email.trim()}>
          Send code
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------- Verify */

const CODE_LENGTH = 6;

export function VerifyStep() {
  const { draft, next, goTo } = useFlow();
  const { showToast } = useStore();
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join("");

  const setAt = (i: number, value: string) => {
    setDigits((d) => d.map((x, j) => (j === i ? value : x)));
    setError("");
  };

  const onChange = (i: number, raw: string) => {
    let v = raw.replace(/\D/g, "");
    const prev = digits[i];
    // Typing into a filled box: keep the new digit, not the old one.
    if (v.length === 2 && prev) v = v[0] === prev ? v[1] : v[0];
    if (v.length > 1) {
      fill(v);
      return;
    }
    setAt(i, v);
    if (v && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const fill = (v: string) => {
    const chars = v.slice(0, CODE_LENGTH).split("");
    setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => chars[i] ?? ""));
    refs.current[Math.min(chars.length, CODE_LENGTH - 1)]?.focus();
    setError("");
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (text) {
      e.preventDefault();
      fill(text);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Prototype: any code works except 000000, which shows the error state.
    if (code === "000000") {
      setError("That code didn't work. Check the latest email from us, or send a new code.");
      return;
    }
    next();
  };

  const masked = draft.email.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, c: string) => a + "*".repeat(b.length) + c);

  return (
    <form className="ob-step" onSubmit={onSubmit} aria-labelledby="verify-title">
      <h1 id="verify-title">Check your email</h1>
      <p className="ob-lead">
        We sent a 6-digit code to <strong>{masked || "your email"}</strong>. Enter it below.
      </p>
      <fieldset className="otp" onPaste={onPaste}>
        <legend className="visually-hidden">Verification code</legend>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={CODE_LENGTH}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
            aria-invalid={Boolean(error)}
          />
        ))}
      </fieldset>
      {error ? (
        <p className="ob-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ob-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={code.length < CODE_LENGTH}>
          Continue
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-block"
          onClick={() => {
            setDigits(Array(CODE_LENGTH).fill(""));
            refs.current[0]?.focus();
            showToast(`New code sent to ${masked}`);
          }}
        >
          Send a new code
        </button>
      </div>
      <p className="ob-small">
        Wrong address?{" "}
        <button type="button" className="link-btn" onClick={() => goTo("email")}>
          Use a different email
        </button>
      </p>
    </form>
  );
}

/* --------------------------------------------------------------------- Role */

const ROLE_OPTIONS: { role: Role; title: string; body: string; emoji: string }[] = [
  {
    role: "reader",
    title: "Get a joke every day",
    body: "One hand-picked dad joke at a time you choose. React, comment and tip the writer.",
    emoji: "🙄",
  },
  {
    role: "writer",
    title: "Write jokes",
    body: "Submit jokes for curation. If yours is picked, everyone gets it and you see the views, reactions and tips.",
    emoji: "✍️",
  },
];

export function RoleStep() {
  const { draft, update, next } = useFlow();
  const roles = draft.roles;

  const toggle = (r: Role) =>
    update({ roles: roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r] });

  const summary =
    roles.length === 2
      ? "You'll read and write. Good choice."
      : roles[0] === "reader"
        ? "You'll get a joke every day. You can start writing any time."
        : roles[0] === "writer"
          ? "You'll write jokes. You can get the daily joke too, any time."
          : "Pick at least one to continue.";

  return (
    <form
      className="ob-step"
      onSubmit={(e) => {
        e.preventDefault();
        if (roles.length) next();
      }}
      aria-labelledby="role-title"
    >
      <h1 id="role-title">How will you use Daddy Jokes?</h1>
      <p className="ob-lead">Pick one or both. You can change this later in your profile.</p>
      <fieldset className="role-cards">
        <legend className="visually-hidden">Ways to use Daddy Jokes</legend>
        {ROLE_OPTIONS.map((o) => {
          const on = roles.includes(o.role);
          return (
            <label key={o.role} className={`role-card${on ? " is-on" : ""}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(o.role)}
                className="visually-hidden"
              />
              <span className="role-emoji" aria-hidden="true">
                {o.emoji}
              </span>
              <span className="role-text">
                <strong>{o.title}</strong>
                <span>{o.body}</span>
              </span>
              <span className="role-check" aria-hidden="true">
                {on ? <Icon name="check" size={18} /> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="ob-small" aria-live="polite">
        {summary}
      </p>
      <div className="ob-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={!roles.length}>
          Continue
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ Profile */

export function ProfileStep() {
  const { draft, update, next } = useFlow();
  const [handleTouched, setHandleTouched] = useState(Boolean(draft.handle));
  const writer = draft.roles.includes("writer");
  const handle = handleTouched ? draft.handle : handleFromName(draft.name);

  const handleError = !handle
    ? ""
    : !/^[a-z0-9_]{3,20}$/.test(handle)
      ? "Use 3 to 20 lowercase letters, numbers or underscores."
      : TAKEN_HANDLES.has(handle)
        ? `@${handle} is taken. Try @${handle}_jokes.`
        : "";
  const valid = draft.name.trim().length > 1 && handle && !handleError;

  return (
    <form
      className="ob-step"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        update({ handle });
        next();
      }}
      aria-labelledby="profile-title"
    >
      <h1 id="profile-title">Introduce yourself</h1>
      <p className="ob-lead">
        {writer
          ? "This is the name on your sticker when your joke goes out."
          : "This is how you show up when you comment or react."}
      </p>

      <div className="ob-profile-preview" aria-hidden="true">
        <Avatar name={draft.name || "?"} tone="denim" size={56} />
        <NameTag name={firstName(draft.name) || "…"} size="m" tilt={-4} />
      </div>

      <div className="ob-field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          autoComplete="name"
          autoFocus
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Your name"
        />
      </div>

      <div className="ob-field">
        <label htmlFor="handle">Username</label>
        <div className="ob-prefix">
          <span aria-hidden="true">@</span>
          <input
            id="handle"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={handle}
            onChange={(e) => {
              setHandleTouched(true);
              update({ handle: e.target.value.toLowerCase() });
            }}
            aria-invalid={Boolean(handleError)}
            aria-describedby="handle-help"
          />
        </div>
        <p id="handle-help" className={handleError ? "ob-error" : "ob-help"}>
          {handleError || (handle ? `@${handle} is available.` : "Letters, numbers and underscores.")}
        </p>
      </div>

      <div className="ob-field">
        <label htmlFor="country">Country</label>
        <select id="country" value={draft.country} onChange={(e) => update({ country: e.target.value })}>
          {COUNTRIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="ob-help">Some jokes only land if you know the place. We use this to pick them.</p>
      </div>

      {writer ? (
        <div className="ob-field">
          <div className="ob-label-row">
            <label htmlFor="bio">One-line bio</label>
            <span className="ob-help">{draft.bio.length}/80</span>
          </div>
          <input
            id="bio"
            maxLength={80}
            value={draft.bio}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder="Professional groan-maker. Amateur griller."
          />
        </div>
      ) : null}

      <div className="ob-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={!valid}>
          Continue
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------- Topics */

export function TopicsStep() {
  const { draft, update, next } = useFlow();
  const toggle = (t: string) =>
    update({
      topics: draft.topics.includes(t) ? draft.topics.filter((x) => x !== t) : [...draft.topics, t],
    });
  const local = draft.country !== "Somewhere else" ? draft.country : "your country";

  return (
    <form
      className="ob-step"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      aria-labelledby="topics-title"
    >
      <h1 id="topics-title">What makes you groan?</h1>
      <p className="ob-lead">Pick a few topics. Curators use them to choose your daily joke.</p>
      <fieldset className="ob-field">
        <legend className="visually-hidden">Topics</legend>
        <div className="chips chips-lg">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${draft.topics.includes(t) ? " is-on" : ""}`}
              aria-pressed={draft.topics.includes(t)}
              onClick={() => toggle(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ob-field">
        <legend className="ob-legend">Where should jokes come from?</legend>
        <div className="radio-list">
          {(
            [
              ["everywhere", "Everywhere", "Jokes that work for anyone."],
              ["local", `Mostly ${local}`, "Include jokes that need local knowledge to land."],
            ] as const
          ).map(([value, title, body]) => (
            <label key={value} className={`radio-row${draft.jokeOrigin === value ? " is-on" : ""}`}>
              <input
                type="radio"
                name="origin"
                checked={draft.jokeOrigin === value}
                onChange={() => update({ jokeOrigin: value })}
              />
              <span>
                <strong>{title}</strong>
                <span>{body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="ob-actions">
        <button type="submit" className="btn btn-primary btn-block">
          {draft.topics.length ? "Continue" : "Skip for now"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------- Follow */

export function FollowStep() {
  const { draft, update, next } = useFlow();
  const toggle = (id: string) =>
    update({
      following: draft.following.includes(id)
        ? draft.following.filter((x) => x !== id)
        : [...draft.following, id],
    });
  const count = draft.following.length;

  return (
    <form
      className="ob-step"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      aria-labelledby="follow-title"
    >
      <h1 id="follow-title">Subscribe to writers</h1>
      <p className="ob-lead">
        Their jokes are more likely to be your daily pick, and you hear when one of theirs goes out.
      </p>
      <ul className="follow-list">
        {[...creators]
          .sort((a, b) => b.subscribers - a.subscribers)
          .map((c) => {
            const on = draft.following.includes(c.id);
            return (
              <li key={c.id} className="follow-row">
                <Avatar name={c.name} tone={c.tone} size={44} />
                <div className="follow-text">
                  <p className="byline-name">{c.name}</p>
                  <p className="follow-bio">{c.bio}</p>
                  <p className="byline-sub">
                    {c.region}, {compact(c.subscribers)} subscribers
                  </p>
                </div>
                <button
                  type="button"
                  className={`btn btn-small ${on ? "btn-quiet" : "btn-primary"}`}
                  aria-pressed={on}
                  aria-label={`${on ? "Unsubscribe from" : "Subscribe to"} ${c.name}`}
                  onClick={() => toggle(c.id)}
                >
                  {on ? <Icon name="check" size={16} /> : null}
                  {on ? "Subscribed" : "Subscribe"}
                </button>
              </li>
            );
          })}
      </ul>
      <div className="ob-actions ob-actions-sticky">
        <button type="submit" className="btn btn-primary btn-block">
          {count ? `Continue with ${count} ${count === 1 ? "writer" : "writers"}` : "Skip for now"}
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- Delivery */

const HOURS = [6, 7, 8, 12, 17, 20];

function isIosBrowser(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !nav.standalone;
}

export function DeliveryStep() {
  const { draft, update, next } = useFlow();
  const [ios] = useState(isIosBrowser);

  const enable = async () => {
    if (!("Notification" in window)) {
      update({ notifications: "unsupported" });
      return;
    }
    const result = await Notification.requestPermission();
    update({ notifications: result === "granted" ? "on" : result === "denied" ? "denied" : "off" });
  };

  const status = {
    on: "Notifications are on. We'll tell you when your joke arrives.",
    off: "",
    denied: "Notifications are blocked for this site. Turn them on in your browser settings, then come back.",
    unsupported: "This browser can't show notifications. You'll still find your joke here every day.",
  }[draft.notifications];

  return (
    <form
      className="ob-step"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      aria-labelledby="delivery-title"
    >
      <h1 id="delivery-title">When should your joke arrive?</h1>
      <p className="ob-lead">One joke a day at this time. It stays up for 24 hours.</p>

      <fieldset className="ob-field">
        <legend className="visually-hidden">Delivery time</legend>
        <div className="time-grid">
          {HOURS.map((h) => (
            <label key={h} className={`time-opt${draft.deliveryHour === h ? " is-on" : ""}`}>
              <input
                type="radio"
                name="hour"
                checked={draft.deliveryHour === h}
                onChange={() => update({ deliveryHour: h })}
                className="visually-hidden"
              />
              <strong>{formatHour(h)}</strong>
              <span>{h < 12 ? "with breakfast" : h < 15 ? "at lunch" : h < 19 ? "after work" : "before bed"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="notify-card">
        <Icon name="bell" />
        <div>
          <strong>Get a notification when it lands</strong>
          <p>We send one a day, nothing else unless you ask for it.</p>
          {ios && draft.notifications !== "on" ? (
            <p className="ob-help">
              On iPhone, add Daddy Jokes to your Home Screen first (Share, then Add to Home Screen).
              Notifications only work from there.
            </p>
          ) : null}
          {status ? (
            <p className={draft.notifications === "on" ? "ob-success" : "ob-help"} role="status">
              {status}
            </p>
          ) : null}
        </div>
        {draft.notifications === "on" ? null : (
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => void enable()}
            disabled={draft.notifications === "unsupported"}
          >
            Turn on
          </button>
        )}
      </div>

      <div className="ob-actions">
        <button type="submit" className="btn btn-primary btn-block">
          Continue
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ Payouts */

export function PayoutsStep() {
  const { draft, update, next } = useFlow();
  const [method, setMethod] = useState<"mpesa" | "later">(draft.payout.method);
  const [phone, setPhone] = useState(draft.payout.method === "mpesa" ? draft.payout.phone : "");
  const [pledge, setPledge] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const phoneOk = /^(?:254|0)?(7|1)\d{8}$/.test(digits);
  const valid = pledge && (method === "later" || phoneOk);

  return (
    <form
      className="ob-step"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        update({ payout: method === "mpesa" ? { method, phone: digits } : { method } });
        next();
      }}
      aria-labelledby="payouts-title"
    >
      <h1 id="payouts-title">Get paid for your jokes</h1>
      <p className="ob-lead">
        Readers can tip you when your joke goes out. Later, writers will also earn a share based on
        views.
      </p>

      <fieldset className="ob-field">
        <legend className="ob-legend">Where should tips go?</legend>
        <div className="radio-list">
          <label className={`radio-row${method === "mpesa" ? " is-on" : ""}`}>
            <input type="radio" name="payout" checked={method === "mpesa"} onChange={() => setMethod("mpesa")} />
            <span>
              <strong>M-Pesa</strong>
              <span>Tips arrive on your phone within a day.</span>
            </span>
          </label>
          <label className={`radio-row${method === "later" ? " is-on" : ""}`}>
            <input type="radio" name="payout" checked={method === "later"} onChange={() => setMethod("later")} />
            <span>
              <strong>Set up later</strong>
              <span>Tips wait in your account until you add a payout method.</span>
            </span>
          </label>
        </div>
      </fieldset>

      {method === "mpesa" ? (
        <div className="ob-field">
          <label htmlFor="phone">M-Pesa phone number</label>
          <div className="ob-prefix">
            <span aria-hidden="true">+254</span>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="712 345 678"
              aria-invalid={Boolean(phone) && !phoneOk}
              aria-describedby="phone-help"
            />
          </div>
          <p id="phone-help" className={phone && !phoneOk ? "ob-error" : "ob-help"}>
            {phone && !phoneOk ? "Enter a Kenyan mobile number, like 712 345 678." : "We'll send a test payment of KES 1 to confirm it."}
          </p>
        </div>
      ) : null}

      <label className="original">
        <input type="checkbox" checked={pledge} onChange={(e) => setPledge(e.target.checked)} />
        <span>
          <strong>I'll only submit jokes I wrote myself.</strong>
          <span className="field-help">Copied jokes are taken down and their tips are returned.</span>
        </span>
      </label>

      <div className="ob-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={!valid}>
          Continue
        </button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------------- Done */

export function DoneStep() {
  const { draft, finish } = useFlow();
  const reader = draft.roles.includes("reader");
  const writer = draft.roles.includes("writer");
  const name = firstName(draft.name) || "friend";

  return (
    <section className="ob-step ob-done" aria-labelledby="done-title">
      <NameTag name={name} size="l" tilt={-6} />
      <h1 id="done-title">You're in, {name}.</h1>
      <ul className="done-list">
        {reader ? (
          <li>
            <Icon name="clock" size={20} />
            <span>
              Your joke arrives every day at <strong>{formatHour(draft.deliveryHour)}</strong>.
              Today's is already waiting.
            </span>
          </li>
        ) : null}
        {reader && draft.following.length ? (
          <li>
            <Icon name="user" size={20} />
            <span>
              Subscribed to {draft.following.length}{" "}
              {draft.following.length === 1 ? "writer" : "writers"}.
            </span>
          </li>
        ) : null}
        {writer ? (
          <li>
            <Icon name="studio" size={20} />
            <span>
              Your Studio is ready.{" "}
              {draft.payout.method === "mpesa"
                ? "Tips go to your M-Pesa."
                : "Add a payout method before your first tip arrives."}
            </span>
          </li>
        ) : null}
      </ul>
      <div className="ob-actions">
        {reader ? (
          <button type="button" className="btn btn-primary btn-block" onClick={() => finish("/")}>
            See today's joke
          </button>
        ) : null}
        {writer ? (
          <button
            type="button"
            className={`btn btn-block ${reader ? "btn-quiet" : "btn-primary"}`}
            onClick={() => finish("/create")}
          >
            Write your first joke
          </button>
        ) : null}
      </div>
      <p className="ob-small">
        You can switch between reading and writing any time in your profile.
      </p>
    </section>
  );
}
