import { useEffect, useRef, useState } from "react";
import { useFormState, useWatch } from "react-hook-form";
import type { ClipboardEvent, FormEvent, InputHTMLAttributes, KeyboardEvent, Ref } from "react";
import { z } from "zod";
import {
  is,
  problemMessage,
  useCheckHandleQuery,
  useGoogleSignInMutation,
  useListCreatorsQuery,
  useListTopicsQuery,
  useStartEmailSignInMutation,
  useVerifyEmailSignInMutation,
} from "../../api/rtk/index.ts";
import type { Creator, Topic } from "../../api/rtk/index.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { button, textButton } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { CheckRow } from "@/components/ui/check-row.tsx";
import { Chip } from "@/components/ui/chip.tsx";
import { choice } from "@/components/ui/choice.tsx";
import { Form, FormError, FormField, SelectField, SubmitButton, TextField, useFieldIds } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { errorText, fieldset, help, label } from "@/components/ui/label.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { cn } from "@/lib/utils.ts";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.ts";
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

/* Shared by every step. */
const step = "grid gap-5";
const title = "text-3xl";
const lead = "-mt-2 text-ink-soft";
const small = "text-center text-sm text-ink-soft";
const fine = "text-center text-xs text-ink-faint";
const actions = "mt-1 grid gap-2.5";
const success = "text-sm font-medium text-forest";
const primary = button({ size: "lg", block: true });
const secondary = button({ variant: "quiet", size: "lg", block: true });

/** A field with a fixed prefix ("@", "+254") drawn inside its border. */
const prefixed =
  "flex min-h-12 items-center rounded-md border border-line-strong bg-paper pl-3.5 transition-[border-color,box-shadow] duration-120 focus-within:border-focus focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-focus)_22%,transparent)] has-aria-invalid:border-tag-red";
const prefixedInput = "min-h-12 w-full border-0 bg-transparent pr-3.5 pl-1.5 text-base focus:outline-none";

/* ------------------------------------------------------------------ Welcome */

export function WelcomeStep() {
  const { goTo, update } = useFlow();
  const { setSession } = useStore();
  const [googleSignIn] = useGoogleSignInMutation();
  const sample = SAMPLE_JOKE;

  const onGoogle = async (idToken: string) => {
    try {
      const session = await googleSignIn({ googleSignInRequest: { idToken } }).unwrap();
      update({ email: session.user.email, name: session.user.name ?? "" });
      // The layout moves signed-in people on: to Today, or to the role step if new.
      setSession(session);
    } catch (e) {
      toast.error(problemMessage(e));
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

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email address.").email("Enter an email address like name@example.com."),
});

export function EmailStep() {
  const { draft, update, next } = useFlow();
  const [start] = useStartEmailSignInMutation();
  const form = useZodForm(emailSchema, { defaultValues: { email: draft.email } });

  return (
    <Form
      form={form}
      className={step}
      aria-labelledby="email-title"
      onSubmit={async ({ email }) => {
        try {
          await start({ startEmailRequest: { email } }).unwrap();
        } catch (err) {
          // A code sent moments ago is still valid, so carry on to entering it.
          if (!is(err, "resend_too_soon")) throw err;
          toast.info("We already sent you a code. Check your inbox.");
        }
        update({ email });
        next();
      }}
    >
      <h1 id="email-title" className={title}>What's your email?</h1>
      <p className={lead}>We'll send you a 6-digit code. No password to remember.</p>
      <TextField name="email" label="Email" fieldSize="lg" type="email" inputMode="email" autoComplete="email" autoFocus placeholder="name@example.com" />
      <FormError />
      <div className={actions}>
        <SubmitButton size="lg" block pendingLabel="Sending…">
          Send code
        </SubmitButton>
      </div>
    </Form>
  );
}

/* ------------------------------------------------------------------- Verify */

const CODE_LENGTH = 6;

export function VerifyStep() {
  const { draft, goTo } = useFlow();
  const { setSession } = useStore();
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [verify] = useVerifyEmailSignInMutation();
  const [startAgain] = useStartEmailSignInMutation();
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
      const session = await verify({ verifyEmailRequest: { email: draft.email, code } }).unwrap();
      // The layout moves signed-in people on: to Today, or to the role step if new.
      setSession(session);
    } catch (err) {
      setError(problemMessage(err));
      setDigits(Array(CODE_LENGTH).fill(""));
      refs.current[0]?.focus();
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    try {
      await startAgain({ startEmailRequest: { email: draft.email } }).unwrap();
      setDigits(Array(CODE_LENGTH).fill(""));
      setError("");
      refs.current[0]?.focus();
      toast.success(`New code sent to ${masked}`);
    } catch (err) {
      toast.error(problemMessage(err));
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
            className="aspect-[4/5] max-h-18 w-full rounded-md border border-line-strong bg-paper text-center text-2xl font-bold caret-tag-red focus:border-ink focus:shadow-[0_0_0_3px_rgb(28_35_64/0.12)] focus:outline-none aria-invalid:border-tag-red"
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
                  on ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-paper",
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

/** Asks the API whether a handle is free, 300ms after typing stops (cached per handle). */
function useHandleCheck(handle: string): HandleCheck {
  const settled = useDebouncedValue(handle, 300);
  const valid = HANDLE_RULE.test(handle);
  const { data, isError, isFetching } = useCheckHandleQuery({ handle: settled }, { skip: !HANDLE_RULE.test(settled) });

  if (!handle) return { state: "idle" };
  if (!valid) return { state: "done", available: false, message: "Use 3 to 20 lowercase letters, numbers or underscores." };
  if (settled !== handle || isFetching) return { state: "checking" };
  if (isError || !data) return { state: "done", available: false, message: "Couldn't check that username. Try again." };
  const hint = data.suggestion ? ` Try @${data.suggestion}.` : "";
  return {
    state: "done",
    available: data.available,
    message: data.available ? `@${handle} is available.` : data.reason === "reserved" ? `@${handle} is reserved.${hint}` : `@${handle} is taken.${hint}`,
  };
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Add your name, at least two letters.").max(60, "Keep it under 60 characters."),
  handle: z.string().trim().toLowerCase().regex(HANDLE_RULE, "Use 3 to 20 lowercase letters, numbers or underscores."),
  country: z.string(),
  bio: z.string().trim().max(80, "Keep it to one line, 80 characters."),
});

export function ProfileStep() {
  const { draft, update, next, saveError, clearSaveError } = useFlow();
  const writer = draft.roles.includes("writer");
  const form = useZodForm(profileSchema, {
    defaultValues: { name: draft.name, handle: draft.handle || handleFromName(draft.name), country: draft.country, bio: draft.bio },
  });
  const [name, handle, bio] = useWatch({ control: form.control, name: ["name", "handle", "bio"] });
  const check = useHandleCheck((handle ?? "").toLowerCase());

  // The username follows the name until the person edits it themselves.
  useEffect(() => {
    if (!form.getFieldState("handle").isDirty && !draft.handle) form.setValue("handle", handleFromName(name ?? ""), { shouldValidate: false });
  }, [name, form, draft.handle]);

  // Saving the whole profile failed on the username (taken since we checked): show it there.
  useEffect(() => {
    if (saveError?.step === "profile") form.setError("handle", { type: "server", message: saveError.message }, { shouldFocus: true });
  }, [saveError, form]);

  const handleStatus =
    check.state === "checking" ? (
      "Checking…"
    ) : check.state === "done" ? (
      <span className={check.available ? "text-forest" : "text-tag-red-deep"}>{check.message}</span>
    ) : (
      "Letters, numbers and underscores."
    );

  return (
    <Form
      form={form}
      className={step}
      aria-labelledby="profile-title"
      onSubmit={(v) => {
        if (check.state !== "done" || !check.available) {
          form.setError("handle", { type: "availability", message: check.state === "done" ? check.message : "Still checking that username. Try again in a moment." });
          return;
        }
        update({ name: v.name, handle: v.handle, country: v.country, bio: v.bio });
        next();
      }}
    >
      <h1 id="profile-title" className={title}>Introduce yourself</h1>
      <p className={lead}>
        {writer ? "This is the name on your sticker when your joke goes out." : "This is how you show up when you comment or react."}
      </p>

      <div className="flex items-center gap-4" aria-hidden="true">
        <Avatar name={name || "?"} tone="denim" size={56} />
        <NameTag name={firstName(name ?? "") || "…"} size="m" tilt={-4} />
      </div>

      <TextField name="name" label="Name" fieldSize="lg" autoComplete="name" autoFocus placeholder="Your name" />

      <FormField name="handle" label="Username" help={<span aria-live="polite">{handleStatus}</span>}>
        <PrefixedInput
          prefix="@"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          {...form.register("handle", {
            setValueAs: (x: string) => x.toLowerCase(),
            onChange: () => clearSaveError(),
          })}
        />
      </FormField>

      <SelectField name="country" label="Country" fieldSize="lg" options={COUNTRIES.map((c) => ({ value: c, label: c }))} help="Some jokes only land if you know the place. We use this to pick them." />

      {writer ? (
        <TextField
          name="bio"
          label={<span className="flex w-full justify-between">One-line bio <span className={cn(help, "tabular-nums")}>{(bio ?? "").length}/80</span></span>}
          optional
          fieldSize="lg"
          maxLength={80}
          placeholder="Professional groan-maker. Amateur griller."
        />
      ) : null}

      <FormError />
      <div className={actions}>
        <SubmitButton size="lg" block>
          Continue
        </SubmitButton>
      </div>
    </Form>
  );
}

/* ------------------------------------------------------------------- Topics */

export function TopicsStep() {
  const { draft, update, next } = useFlow();
  const { data: topicList, error: topicsError, isLoading: topicsLoading } = useListTopicsQuery();
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
        {topicsError ? <p className={errorText}>{problemMessage(topicsError)}</p> : null}
        <div className="flex flex-wrap gap-2" aria-busy={topicsLoading || undefined}>
          {(topicList?.data ?? []).map((t: Topic) => (
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
            <label key={value} className={choice(draft.jokeOrigin === value, { tint: false, className: "flex items-start gap-3 rounded-lg px-4 py-3.5 has-focus-visible:shadow-none" })}>
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
  const { data: creators, error: writersError, isLoading: writersLoading } = useListCreatorsQuery({ limit: 20 });
  const writerList = creators?.data;
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
      {writersError ? <p className={errorText}>{problemMessage(writersError)}</p> : null}
      {writerList && !writerList.length ? <p className={help}>No writers yet. You can subscribe later.</p> : null}
      <ul className="m-0 grid list-none p-0" aria-busy={writersLoading || undefined}>
        {(writerList ?? []).map((c: Creator) => {
          const on = draft.following.includes(c.id);
          return (
            <li key={c.id} className="flex items-center gap-3 border-t border-line py-3.5">
              <Avatar name={c.name} tone={c.tone} size={44} />
              <div className="min-w-0 flex-1">
                <p className="leading-[1.25] font-semibold">{c.name}</p>
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

const KENYAN_MOBILE = /^(?:254|0)?(7|1)\d{8}$/;

const payoutSchema = z
  .object({
    method: z.enum(["mpesa", "later"]),
    phone: z.string().transform((x) => x.replace(/\D/g, "")),
    pledge: z.boolean().refine((x) => x, "Confirm you'll only submit your own jokes."),
  })
  .superRefine((v, ctx) => {
    if (v.method === "mpesa" && !KENYAN_MOBILE.test(v.phone)) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a Kenyan mobile number, like 712 345 678." });
  });

export function PayoutsStep() {
  const { draft, update, next } = useFlow();
  const form = useZodForm(payoutSchema, {
    defaultValues: { method: draft.payout.method, phone: draft.payout.method === "mpesa" ? draft.payout.phone : "", pledge: false },
  });
  const [method, pledge] = useWatch({ control: form.control, name: ["method", "pledge"] });
  const formState = useFormState({ control: form.control });
  const pledgeError = formState.errors.pledge?.message;

  return (
    <Form
      form={form}
      className={step}
      aria-labelledby="payouts-title"
      onSubmit={(v) => {
        update({ payout: v.method === "mpesa" ? { method: "mpesa", phone: v.phone } : { method: "later" } });
        next();
      }}
    >
      <h1 id="payouts-title" className={title}>Get paid for your jokes</h1>
      <p className={lead}>Readers can tip you when your joke goes out. Later, writers will also earn a share based on views.</p>

      <fieldset className={fieldset}>
        <legend className={label}>Where should tips go?</legend>
        <div className="grid gap-2.5">
          {(
            [
              ["mpesa", "M-Pesa", "Tips arrive on your phone within a day."],
              ["later", "Set up later", "Tips wait in your account until you add a payout method."],
            ] as const
          ).map(([value, name, body]) => (
            <label key={value} className={choice(method === value, { tint: false, className: "flex items-start gap-3 rounded-lg px-4 py-3.5 has-focus-visible:shadow-none" })}>
              <input className="mt-0.5 size-5 shrink-0 accent-ink" type="radio" value={value} {...form.register("method")} />
              <span className="grid gap-0.5">
                <strong>{name}</strong>
                <span className="text-sm text-ink-soft">{body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {method === "mpesa" ? (
        <FormField name="phone" label="M-Pesa phone number" help="We'll send a test payment of KES 1 to confirm it.">
          <PrefixedInput prefix="+254" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="712 345 678" {...form.register("phone")} />
        </FormField>
      ) : null}

      <div className="grid gap-1.5">
        <CheckRow checked={pledge} onChange={(on) => form.setValue("pledge", on, { shouldDirty: true, shouldValidate: formState.isSubmitted })} title="I'll only submit jokes I wrote myself.">
          Copied jokes are taken down and their tips are returned.
        </CheckRow>
        {pledgeError ? (
          <p className={errorText} role="alert">
            {pledgeError}
          </p>
        ) : null}
      </div>

      <div className={actions}>
        <SubmitButton size="lg" block>
          Continue
        </SubmitButton>
      </div>
    </Form>
  );
}

/** An input with a fixed prefix ("+254") inside its border, wired to its <FormField>. */
function PrefixedInput({ prefix, ...props }: { prefix: string } & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const ids = useFieldIds();
  return (
    <div className={prefixed}>
      <span className="font-medium text-ink-soft" aria-hidden="true">{prefix}</span>
      <input {...ids} {...props} className={prefixedInput} />
    </div>
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
