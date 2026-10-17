import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import { ApiError, api, errorMessage, unwrap } from "../../api/client.ts";
import type { Creator, Topic } from "../../api/client.ts";
import { Avatar } from "../../components/Avatar.tsx";
import { Icon } from "../../components/Icon.tsx";
import { NameTag } from "../../components/NameTag.tsx";
import { StoryCard } from "../../components/StoryCard.tsx";
import { formatHour } from "../../components/useCountdown.ts";
import { COUNTRIES, SAMPLE_JOKE } from "../../data/sample.ts";
import { compact } from "../../data/reactions.ts";
import type { Role } from "../../data/types.ts";
import { useStore } from "../../state/useStore.ts";
import { firstName, handleFromName, useFlow } from "./flow.ts";
import { enablePush } from "../../api/push.ts";
import { googleEnabled } from "../../config.ts";
import { GoogleSignIn } from "./GoogleSignIn.tsx";
import {
  Card,
  CheckRow,
  Chip,
  button,
  choice,
  cn,
  errorText,
  field,
  fieldset,
  help,
  label,
  textButton,
} from "../../components/ui/index.ts";

/* Shared by every step. */
const step = "grid gap-5";
const title = "text-3xl";
const lead = "-mt-2 text-ink-soft";
const small = "text-center text-sm text-ink-soft";
const fine = "text-center text-xs text-ink-faint";
const actions = "mt-1 grid gap-2.5";
const success = "text-sm font-bold text-forest";
const primary = button({ size: "lg", block: true });
const secondary = button({ variant: "quiet", size: "lg", block: true });

/** A field with a fixed prefix ("@", "+254") drawn inside its border. */
const prefixed =
  "flex items-center rounded-2xl border-2 border-line-strong bg-paper pl-3.5 focus-within:border-ink has-aria-invalid:border-tag-red";
const prefixedInput = "min-h-12 w-full border-0 bg-transparent pr-3.5 pl-1.5 text-base focus:outline-none";

/* ------------------------------------------------------------------ Welcome */

export function WelcomeStep() {
  const { goTo, update } = useFlow();
  const { setSession, showToast } = useStore();
  const sample = SAMPLE_JOKE;

  const onGoogle = async (idToken: string) => {
    try {
      const session = unwrap(await api.POST("/v1/auth/google", { body: { idToken } }));
      update({ email: session.user.email, name: session.user.name ?? "" });
      // The layout moves signed-in people on: to Today, or to the role step if new.
      setSession(session);
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  return (
    <section className={cn(step, "justify-items-start pt-10 lg:pt-[15dvh]")} aria-labelledby="welcome-title">
      <NameTag name="Daddy Jokes" size="l" tilt={-5} />
      <h1 id="welcome-title" className="text-4xl leading-[1.05] tracking-[-0.02em]">
        One dad joke a day, delivered like a status.
      </h1>
      <p className={cn(lead, "-mt-1.5")}>
        Read a hand-picked joke every morning, or write your own and get tipped when it lands. Or
        both.
      </p>
      {sample ? (
        <div className="w-full rotate-[1.5deg] lg:hidden" aria-hidden="true">
          <StoryCard face={sample} revealed variant="inline" />
        </div>
      ) : null}
      <div className={cn(actions, "w-full")}>
        <button type="button" className={primary} onClick={() => goTo("email")}>
          Continue with email
        </button>
        {googleEnabled ? <GoogleSignIn onToken={(t) => void onGoogle(t)} /> : null}
      </div>
      <p className={cn(small, "justify-self-stretch")}>New here or coming back, it's the same: we email you a code.</p>
      <p className={cn(fine, "justify-self-stretch")}>
        By continuing you agree to the <a href="#terms">Terms</a> and{" "}
        <a href="#privacy">Privacy Policy</a>.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------- Email */

export function EmailStep() {
  const { draft, update, next } = useFlow();
  const { showToast } = useStore();
  const [email, setEmail] = useState(draft.email);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter an email address like name@example.com.");
      return;
    }
    setSending(true);
    try {
      unwrap(await api.POST("/v1/auth/email/start", { body: { email: value } }));
      update({ email: value.toLowerCase() });
      next();
    } catch (err) {
      // A code sent moments ago is still valid, so carry on to entering it.
      if (err instanceof ApiError && err.code === "resend_too_soon") {
        update({ email: value.toLowerCase() });
        showToast("We already sent you a code. Check your inbox.");
        next();
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={step} onSubmit={(e) => void onSubmit(e)} aria-labelledby="email-title" noValidate>
      <h1 id="email-title" className={title}>What's your email?</h1>
      <p className={lead}>We'll send you a 6-digit code. No password to remember.</p>
      <div className={fieldset}>
        <label htmlFor="email" className={label}>Email</label>
        <input
          id="email"
          className={field("lg")}
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
          <p id="email-error" className={errorText} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className={actions}>
        <button type="submit" className={primary} disabled={!email.trim() || sending}>
          {sending ? "Sending…" : "Send code"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------- Verify */

const CODE_LENGTH = 6;

export function VerifyStep() {
  const { draft, goTo } = useFlow();
  const { setSession, showToast } = useStore();
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join("");

  const setAt = (i: number, value: string) => {
    setDigits((d) => d.map((x, j) => (j === i ? value : x)));
    setError("");
  };

  const fill = (v: string) => {
    const chars = v.slice(0, CODE_LENGTH).split("");
    setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => chars[i] ?? ""));
    refs.current[Math.min(chars.length, CODE_LENGTH - 1)]?.focus();
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setChecking(true);
    try {
      const session = unwrap(await api.POST("/v1/auth/email/verify", { body: { email: draft.email, code } }));
      // The layout moves signed-in people on: to Today, or to the role step if new.
      setSession(session);
    } catch (err) {
      setError(errorMessage(err));
      setDigits(Array(CODE_LENGTH).fill(""));
      refs.current[0]?.focus();
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    try {
      unwrap(await api.POST("/v1/auth/email/start", { body: { email: draft.email } }));
      setDigits(Array(CODE_LENGTH).fill(""));
      setError("");
      refs.current[0]?.focus();
      showToast(`New code sent to ${masked}`);
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const masked = draft.email.replace(
    /^(.)(.*)(@.*)$/,
    (_, a: string, b: string, c: string) => a + "*".repeat(b.length) + c,
  );

  if (!draft.email) {
    return (
      <section className={step}>
        <h1 className={title}>Start with your email</h1>
        <p className={lead}>We need your email address to send you a code.</p>
        <button type="button" className={button({ block: true })} onClick={() => goTo("email")}>
          Enter email
        </button>
      </section>
    );
  }

  return (
    <form className={step} onSubmit={(e) => void onSubmit(e)} aria-labelledby="verify-title">
      <h1 id="verify-title" className={title}>Check your email</h1>
      <p className={lead}>
        We sent a 6-digit code to <strong>{masked}</strong>. Enter it below.
      </p>
      <fieldset className="m-0 grid grid-cols-6 gap-2 border-0 p-0" onPaste={onPaste}>
        <legend className="sr-only">Verification code</legend>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="aspect-[4/5] max-h-18 w-full rounded-2xl border-2 border-line-strong bg-paper text-center text-2xl font-extrabold caret-tag-red focus:border-ink focus:shadow-[0_0_0_3px_rgb(28_35_64/0.12)] focus:outline-none aria-invalid:border-tag-red"
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
        <p className={errorText} role="alert">
          {error}
        </p>
      ) : null}
      <div className={actions}>
        <button type="submit" className={primary} disabled={code.length < CODE_LENGTH || checking}>
          {checking ? "Checking…" : "Continue"}
        </button>
        <button type="button" className={secondary} onClick={() => void resend()}>
          Send a new code
        </button>
      </div>
      <p className={small}>
        Wrong address?{" "}
        <button type="button" className={textButton} onClick={() => goTo("email")}>
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
      className={step}
      onSubmit={(e) => {
        e.preventDefault();
        if (roles.length) next();
      }}
      aria-labelledby="role-title"
    >
      <h1 id="role-title" className={title}>How will you use Daddy Jokes?</h1>
      <p className={lead}>Pick one or both. You can change this later in your profile.</p>
      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="sr-only">Ways to use Daddy Jokes</legend>
        {ROLE_OPTIONS.map((o) => {
          const on = roles.includes(o.role);
          return (
            <label
              key={o.role}
              className={choice(on, {
                className: cn(
                  "flex items-start gap-3.5 rounded-3xl p-4.5 transition-[border-color,background-color] duration-120",
                  !on && "hover:border-line-strong",
                ),
              })}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(o.role)}
                className="sr-only"
              />
              <span className="text-[2rem] leading-none" aria-hidden="true">
                {o.emoji}
              </span>
              <span className="grid flex-1 gap-1">
                <strong className="text-xl leading-[1.2]">{o.title}</strong>
                <span className="text-sm text-ink-soft">{o.body}</span>
              </span>
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg border-2",
                  on ? "border-ink bg-ink text-white" : "border-line-strong bg-paper",
                )}
                aria-hidden="true"
              >
                {on ? <Icon name="check" size={18} /> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className={small} aria-live="polite">
        {summary}
      </p>
      <div className={actions}>
        <button type="submit" className={primary} disabled={!roles.length}>
          Continue
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ Profile */

type HandleCheck =
  | { state: "idle" | "checking" }
  | { state: "done"; available: boolean; message: string };

const HANDLE_RULE = /^[a-z0-9_]{3,20}$/;

/** Asks the API whether a handle is free, 300ms after typing stops. */
function useHandleCheck(handle: string): HandleCheck {
  const [result, setResult] = useState<{ handle: string; available: boolean; message: string } | null>(null);
  const valid = HANDLE_RULE.test(handle);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void api.GET("/v1/handles/{handle}/availability", { params: { path: { handle } } }).then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          setResult({ handle, available: false, message: "Couldn't check that username. Try again." });
          return;
        }
        const hint = data.suggestion ? ` Try @${data.suggestion}.` : "";
        setResult({
          handle,
          available: data.available,
          message: data.available
            ? `@${handle} is available.`
            : data.reason === "reserved"
              ? `@${handle} is reserved.${hint}`
              : `@${handle} is taken.${hint}`,
        });
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [handle, valid]);

  // Everything that doesn't need the server is worked out here, during render.
  if (!handle) return { state: "idle" };
  if (!valid) return { state: "done", available: false, message: "Use 3 to 20 lowercase letters, numbers or underscores." };
  if (result?.handle !== handle) return { state: "checking" };
  return { state: "done", available: result.available, message: result.message };
}

export function ProfileStep() {
  const { draft, update, next, saveError, clearSaveError } = useFlow();
  const [handleTouched, setHandleTouched] = useState(Boolean(draft.handle));
  const writer = draft.roles.includes("writer");
  const handle = handleTouched ? draft.handle : handleFromName(draft.name);
  const check = useHandleCheck(handle);
  const serverError = saveError?.step === "profile" ? saveError.message : "";

  const handleOk = check.state === "done" && check.available;
  const valid = draft.name.trim().length > 1 && handleOk;
  const handleMessage =
    serverError || (check.state === "checking" ? "Checking…" : check.state === "done" ? check.message : "Letters, numbers and underscores.");
  const handleBad = Boolean(serverError) || (check.state === "done" && !check.available);

  return (
    <form
      className={step}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        update({ handle });
        next();
      }}
      aria-labelledby="profile-title"
    >
      <h1 id="profile-title" className={title}>Introduce yourself</h1>
      <p className={lead}>
        {writer
          ? "This is the name on your sticker when your joke goes out."
          : "This is how you show up when you comment or react."}
      </p>

      <div className="flex items-center gap-4" aria-hidden="true">
        <Avatar name={draft.name || "?"} tone="denim" size={56} />
        <NameTag name={firstName(draft.name) || "…"} size="m" tilt={-4} />
      </div>

      <div className={fieldset}>
        <label htmlFor="name" className={label}>Name</label>
        <input
          id="name"
          className={field("lg")}
          autoComplete="name"
          autoFocus
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Your name"
        />
      </div>

      <div className={fieldset}>
        <label htmlFor="handle" className={label}>Username</label>
        <div className={prefixed}>
          <span className="font-bold text-ink-soft" aria-hidden="true">@</span>
          <input
            id="handle"
            className={prefixedInput}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={handle}
            onChange={(e) => {
              setHandleTouched(true);
              clearSaveError();
              update({ handle: e.target.value.toLowerCase() });
            }}
            aria-invalid={handleBad}
            aria-describedby="handle-help"
          />
        </div>
        <p id="handle-help" className={handleBad ? errorText : help} aria-live="polite">
          {handleMessage}
        </p>
      </div>

      <div className={fieldset}>
        <label htmlFor="country" className={label}>Country</label>
        <select id="country" className={field("lg")} value={draft.country} onChange={(e) => update({ country: e.target.value })}>
          {COUNTRIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className={help}>Some jokes only land if you know the place. We use this to pick them.</p>
      </div>

      {writer ? (
        <div className={fieldset}>
          <div className="flex items-baseline justify-between">
            <label htmlFor="bio" className={label}>One-line bio</label>
            <span className={help}>{draft.bio.length}/80</span>
          </div>
          <input
            id="bio"
            className={field("lg")}
            maxLength={80}
            value={draft.bio}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder="Professional groan-maker. Amateur griller."
          />
        </div>
      ) : null}

      <div className={actions}>
        <button type="submit" className={primary} disabled={!valid}>
          Continue
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------- Topics */

/** Loads a list once when the step opens. */
function useLoad<T>(load: () => Promise<T>): { data?: T; error?: string } {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  const run = useRef(load);
  useEffect(() => {
    let cancelled = false;
    run
      .current()
      .then((data) => !cancelled && setState({ data }))
      .catch((e: unknown) => !cancelled && setState({ error: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function TopicsStep() {
  const { draft, update, next } = useFlow();
  const topics = useLoad(async () => unwrap(await api.GET("/v1/topics")).data);
  const toggle = (slug: string) =>
    update({
      topics: draft.topics.includes(slug) ? draft.topics.filter((x) => x !== slug) : [...draft.topics, slug],
    });
  const local = draft.country !== "Somewhere else" ? draft.country : "your country";

  return (
    <form
      className={step}
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      aria-labelledby="topics-title"
    >
      <h1 id="topics-title" className={title}>What makes you groan?</h1>
      <p className={lead}>Pick a few topics. Curators use them to choose your daily joke.</p>
      <fieldset className={fieldset}>
        <legend className="sr-only">Topics</legend>
        {topics.error ? <p className={errorText}>{topics.error}</p> : null}
        <div className="flex flex-wrap gap-2" aria-busy={!topics.data && !topics.error}>
          {(topics.data ?? []).map((t: Topic) => (
            <Chip key={t.slug} size="lg" on={draft.topics.includes(t.slug)} onClick={() => toggle(t.slug)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={label}>Where should jokes come from?</legend>
        <div className="grid gap-2.5">
          {(
            [
              ["everywhere", "Everywhere", "Jokes that work for anyone."],
              ["local", `Mostly ${local}`, "Include jokes that need local knowledge to land."],
            ] as const
          ).map(([value, title, body]) => (
            <label key={value} className={choice(draft.jokeOrigin === value, { tint: false, className: "flex items-start gap-3 rounded-2xl px-4 py-3.5 has-focus-visible:shadow-none" })}>
              <input
                className="mt-0.5 size-5 shrink-0 accent-ink" 
                type="radio"
                name="origin"
                checked={draft.jokeOrigin === value}
                onChange={() => update({ jokeOrigin: value })}
              />
              <span className="grid gap-0.5">
                <strong>{title}</strong>
                <span className="text-sm text-ink-soft">{body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={actions}>
        <button type="submit" className={primary}>
          {draft.topics.length ? "Continue" : "Skip for now"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------- Follow */

export function FollowStep() {
  const { draft, update, next } = useFlow();
  const writers = useLoad(async () => unwrap(await api.GET("/v1/creators", { params: { query: { limit: 20 } } })).data);
  const toggle = (id: string) =>
    update({
      following: draft.following.includes(id)
        ? draft.following.filter((x) => x !== id)
        : [...draft.following, id],
    });
  const count = draft.following.length;

  return (
    <form
      className={step}
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      aria-labelledby="follow-title"
    >
      <h1 id="follow-title" className={title}>Subscribe to writers</h1>
      <p className={lead}>
        Their jokes are more likely to be your daily pick, and you hear when one of theirs goes out.
      </p>
      {writers.error ? <p className={errorText}>{writers.error}</p> : null}
      {writers.data && !writers.data.length ? <p className={help}>No writers yet. You can subscribe later.</p> : null}
      <ul className="m-0 grid list-none p-0" aria-busy={!writers.data && !writers.error}>
        {(writers.data ?? []).map((c: Creator) => {
          const on = draft.following.includes(c.id);
          return (
            <li key={c.id} className="flex items-center gap-3 border-t border-line py-3.5">
              <Avatar name={c.name} tone={c.tone} size={44} />
              <div className="min-w-0 flex-1">
                <p className="leading-[1.25] font-extrabold">{c.name}</p>
                {c.bio ? <p className="my-0.5 text-sm">{c.bio}</p> : null}
                <p className="text-sm text-ink-soft">
                  {c.country ? `${c.country}, ` : ""}
                  {compact(c.subscriberCount)} {c.subscriberCount === 1 ? "subscriber" : "subscribers"}
                </p>
              </div>
              <button
                type="button"
                className={button({ variant: on ? "quiet" : "primary", size: "sm" })}
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
      <div className={cn(actions, "sticky bottom-0 bg-[linear-gradient(transparent,var(--color-fridge)_28%)] pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]")}>
        <button type="submit" className={primary}>
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
    update({ notifications: await enablePush().catch(() => "off" as const) });
  };

  const status = {
    on: "Notifications are on. We'll tell you when your joke arrives.",
    off: "",
    denied: "Notifications are blocked for this site. Turn them on in your browser settings, then come back.",
    unsupported: "This browser can't show notifications. You'll still find your joke here every day.",
  }[draft.notifications];

  return (
    <form
      className={step}
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      aria-labelledby="delivery-title"
    >
      <h1 id="delivery-title" className={title}>When should your joke arrive?</h1>
      <p className={lead}>One joke a day at this time. It stays up for 24 hours.</p>

      <fieldset className={fieldset}>
        <legend className="sr-only">Delivery time</legend>
        <div className="grid grid-cols-3 gap-2">
          {HOURS.map((h) => (
            <label
              key={h}
              className={choice(draft.deliveryHour === h, {
                className: "grid justify-items-center gap-0.5 rounded-2xl px-1.5 py-3 text-center",
              })}
            >
              <input
                type="radio"
                name="hour"
                checked={draft.deliveryHour === h}
                onChange={() => update({ deliveryHour: h })}
                className="sr-only"
              />
              <strong className="text-xl">{formatHour(h)}</strong>
              <span className="text-xs text-ink-soft">{h < 12 ? "with breakfast" : h < 15 ? "at lunch" : h < 19 ? "after work" : "before bed"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Card className="flex items-start gap-3 p-4">
        <Icon name="bell" />
        <div className="grid flex-1 gap-1">
          <strong>Get a notification when it lands</strong>
          <p className="text-sm text-ink-soft">We send one a day, nothing else unless you ask for it.</p>
          {ios && draft.notifications !== "on" ? (
            <p className={help}>
              On iPhone, add Daddy Jokes to your Home Screen first (Share, then Add to Home Screen).
              Notifications only work from there.
            </p>
          ) : null}
          {status ? (
            <p className={draft.notifications === "on" ? success : help} role="status">
              {status}
            </p>
          ) : null}
        </div>
        {draft.notifications === "on" ? null : (
          <button
            type="button"
            className={button({ variant: "quiet", size: "sm" })}
            onClick={() => void enable()}
            disabled={draft.notifications === "unsupported"}
          >
            Turn on
          </button>
        )}
      </Card>

      <div className={actions}>
        <button type="submit" className={primary}>
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
      className={step}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        update({ payout: method === "mpesa" ? { method, phone: digits } : { method } });
        next();
      }}
      aria-labelledby="payouts-title"
    >
      <h1 id="payouts-title" className={title}>Get paid for your jokes</h1>
      <p className={lead}>
        Readers can tip you when your joke goes out. Later, writers will also earn a share based on
        views.
      </p>

      <fieldset className={fieldset}>
        <legend className={label}>Where should tips go?</legend>
        <div className="grid gap-2.5">
          <label className={choice(method === "mpesa", { tint: false, className: "flex items-start gap-3 rounded-2xl px-4 py-3.5 has-focus-visible:shadow-none" })}>
            <input className="mt-0.5 size-5 shrink-0 accent-ink" type="radio" name="payout" checked={method === "mpesa"} onChange={() => setMethod("mpesa")} />
            <span className="grid gap-0.5">
              <strong>M-Pesa</strong>
              <span className="text-sm text-ink-soft">Tips arrive on your phone within a day.</span>
            </span>
          </label>
          <label className={choice(method === "later", { tint: false, className: "flex items-start gap-3 rounded-2xl px-4 py-3.5 has-focus-visible:shadow-none" })}>
            <input className="mt-0.5 size-5 shrink-0 accent-ink" type="radio" name="payout" checked={method === "later"} onChange={() => setMethod("later")} />
            <span className="grid gap-0.5">
              <strong>Set up later</strong>
              <span className="text-sm text-ink-soft">Tips wait in your account until you add a payout method.</span>
            </span>
          </label>
        </div>
      </fieldset>

      {method === "mpesa" ? (
        <div className={fieldset}>
          <label htmlFor="phone" className={label}>M-Pesa phone number</label>
          <div className={prefixed}>
            <span className="font-bold text-ink-soft" aria-hidden="true">+254</span>
            <input
              id="phone"
              className={prefixedInput}
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
          <p id="phone-help" className={phone && !phoneOk ? errorText : help}>
            {phone && !phoneOk ? "Enter a Kenyan mobile number, like 712 345 678." : "We'll send a test payment of KES 1 to confirm it."}
          </p>
        </div>
      ) : null}

      <CheckRow checked={pledge} onChange={setPledge} title="I'll only submit jokes I wrote myself.">
        Copied jokes are taken down and their tips are returned.
      </CheckRow>

      <div className={actions}>
        <button type="submit" className={primary} disabled={!valid}>
          Continue
        </button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------------- Done */

export function DoneStep() {
  const { draft, finish, saving, saveError } = useFlow();
  const reader = draft.roles.includes("reader");
  const writer = draft.roles.includes("writer");
  const name = firstName(draft.name) || "friend";
  const error = saveError?.step === "done" ? saveError.message : "";

  return (
    <section className={cn(step, "justify-items-start pt-12")} aria-labelledby="done-title">
      <NameTag name={name} size="l" tilt={-6} />
      <h1 id="done-title" className={title}>You're nearly in, {name}.</h1>
      <ul className="m-0 grid list-none gap-3 p-0">
        {reader ? (
          <li className="flex items-start gap-2.5">
            <Icon name="clock" size={20} className="mt-0.5 shrink-0 text-tag-red" />
            <span>
              Your joke arrives every day at <strong>{formatHour(draft.deliveryHour)}</strong>.
              Today's is already waiting.
            </span>
          </li>
        ) : null}
        {reader && draft.following.length ? (
          <li className="flex items-start gap-2.5">
            <Icon name="user" size={20} className="mt-0.5 shrink-0 text-tag-red" />
            <span>
              Subscribing to {draft.following.length}{" "}
              {draft.following.length === 1 ? "writer" : "writers"}.
            </span>
          </li>
        ) : null}
        {writer ? (
          <li className="flex items-start gap-2.5">
            <Icon name="studio" size={20} className="mt-0.5 shrink-0 text-tag-red" />
            <span>
              Your Studio is ready.{" "}
              {draft.payout.method === "mpesa"
                ? "Tips go to your M-Pesa."
                : "Add a payout method before your first tip arrives."}
            </span>
          </li>
        ) : null}
      </ul>
      {error ? (
        <p className={errorText} role="alert">
          {error}
        </p>
      ) : null}
      <div className={cn(actions, "w-full")}>
        {reader ? (
          <button type="button" className={primary} disabled={saving} onClick={() => void finish("/")}>
            {saving ? "Saving…" : "See today's joke"}
          </button>
        ) : null}
        {writer ? (
          <button
            type="button"
            className={reader ? secondary : primary}
            disabled={saving}
            onClick={() => void finish("/create")}
          >
            {saving && !reader ? "Saving…" : "Write your first joke"}
          </button>
        ) : null}
      </div>
      <p className={small}>You can switch between reading and writing any time in your profile.</p>
    </section>
  );
}
