import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router";
import { ApiError, api, errorMessage, unwrap } from "../api/client.ts";
import type { Topic } from "../api/client.ts";
import { Icon } from "../components/Icon.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import type { JokeBackground } from "../data/types.ts";
import { useStore } from "../state/useStore.ts";
import {
  CheckRow,
  Chip,
  IconButton,
  Select,
  TONE,
  Textarea,
  button,
  cn,
  errorText,
  field,
  fieldset,
  help,
  label,
  segment,
  segmented,
} from "../components/ui/index.ts";

/** Label on the left, character count on the right. */
function FieldHead({ htmlFor, children, count }: { htmlFor: string; children: string; count: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <label htmlFor={htmlFor} className={label}>
        {children}
      </label>
      <span className={help}>{count}</span>
    </div>
  );
}

const BACKGROUNDS: { value: JokeBackground; label: string }[] = [
  { value: "red", label: "Name-tag red" },
  { value: "navy", label: "Polo navy" },
  { value: "yellow", label: "Highlighter yellow" },
  { value: "green", label: "Lawn green" },
  { value: "denim", label: "Denim" },
];

const REGIONS = [
  "Everywhere",
  "Kenya",
  "Nigeria",
  "South Africa",
  "United Kingdom",
  "United States",
];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SETUP_MAX = 140;
const PUNCH_MAX = 80;

export function Create() {
  const navigate = useNavigate();
  const { showToast } = useStore();
  const [topicList, setTopicList] = useState<Topic[]>([]);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState("");
  const [kind, setKind] = useState<"text" | "image">("text");
  const [setup, setSetup] = useState("");
  const [punchline, setPunchline] = useState("");
  const [background, setBackground] = useState<JokeBackground>("red");
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageKey, setImageKey] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [imageAlt, setImageAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [region, setRegion] = useState("Everywhere");
  const [tags, setTags] = useState<string[]>([]);
  const [original, setOriginal] = useState(false);
  const [showPunch, setShowPunch] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.GET("/v1/topics").then(({ data }) => {
      if (!cancelled) setTopicList(data?.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );

  const hasContent =
    kind === "text" ? setup.trim() && punchline.trim() : Boolean(imageKey) && imageAlt.trim().length >= 3;
  const ready = Boolean(hasContent) && original;

  /** Uploads straight to storage as soon as an image is picked, so submitting is instant. */
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
      setServerError("Use a PNG, JPG, GIF or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setServerError("That image is over 10 MB. Try a smaller one.");
      return;
    }
    setServerError("");
    setImageKey(undefined);
    setImageUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const target = unwrap(
        await api.POST("/v1/me/uploads", {
          body: { contentType: file.type as (typeof IMAGE_TYPES)[number], size: file.size },
        }),
      );
      const put = await fetch(target.url, { method: "PUT", headers: target.headers, body: file });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setImageKey(target.key);
    } catch (err) {
      setImageUrl(undefined);
      setServerError(err instanceof ApiError ? err.problem.title : "The upload didn't work. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const toggleTag = (t: string) =>
    setTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : prev.length < 3 ? [...prev, t] : prev,
    );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || sending) return;
    setSending(true);
    setServerError("");
    const common = { region: region === "Everywhere" ? null : region, topics: tags, original: true as const };
    try {
      unwrap(
        await api.POST("/v1/me/jokes", {
          body:
            kind === "text"
              ? { kind: "text", setup: setup.trim(), punchline: punchline.trim(), background, ...common }
              : { kind: "image", imageKey: imageKey!, imageAlt: imageAlt.trim(), caption: caption.trim() || undefined, ...common },
        }),
      );
      showToast("Sent to the curators");
      void navigate("/studio");
    } catch (err) {
      const fields = err instanceof ApiError ? Object.values(err.fieldErrors()) : [];
      setServerError(fields.length ? fields.join(" ") : errorMessage(err));
      setSending(false);
    }
  };

  const missing = !hasContent
    ? kind === "text"
      ? "Add a setup and a punchline to submit."
      : uploading
        ? "Uploading the image…"
        : imageKey
          ? "Describe the image to submit."
          : "Add an image to submit."
    : !original
      ? "Confirm the joke is your own to submit."
      : "";

  return (
    <form className="mx-auto grid max-w-wide gap-4 px-4 lg:px-8 lg:pt-7" onSubmit={(e) => void onSubmit(e)} aria-labelledby="create-title">
      <header className="-ml-2.5 flex items-center gap-2 pt-3 lg:pt-0">
        <IconButton onClick={() => void navigate(-1)} aria-label="Discard and close">
          <Icon name="close" />
        </IconButton>
        <h1 id="create-title" className="text-2xl">
          Write a joke
        </h1>
      </header>

      <p className="max-w-[62ch] text-ink-soft">
        Curators pick one joke each day from everyone's submissions. If yours is picked, every
        subscriber gets it at their delivery time, and you see the views, reactions and tips.
      </p>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <div className="grid min-w-0 gap-5.5">
          <fieldset className={segmented}>
            <legend className="sr-only">Joke format</legend>
            {(["text", "image"] as const).map((k) => (
              <label key={k} className={segment(kind === k)}>
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="sr-only"
                />
                <Icon name={k === "text" ? "comment" : "image"} size={20} />
                {k === "text" ? "Setup and punchline" : "Image or meme"}
              </label>
            ))}
          </fieldset>

          {kind === "text" ? (
            <>
              <div className={fieldset}>
                <FieldHead htmlFor="setup" count={`${setup.length}/${SETUP_MAX}`}>
                  Setup
                </FieldHead>
                <Textarea
                  id="setup"
                  className="text-xl font-bold"
                  rows={3}
                  maxLength={SETUP_MAX}
                  value={setup}
                  onChange={(e) => setSetup(e.target.value)}
                  placeholder="Why did the scarecrow win an award?"
                />
              </div>
              <div className={fieldset}>
                <FieldHead htmlFor="punchline" count={`${punchline.length}/${PUNCH_MAX}`}>
                  Punchline
                </FieldHead>
                <input
                  id="punchline"
                  className={field("md", "font-marker text-xl")}
                  maxLength={PUNCH_MAX}
                  value={punchline}
                  onChange={(e) => setPunchline(e.target.value)}
                  placeholder="He was outstanding in his field."
                  autoComplete="off"
                />
                <p className={help}>
                  Readers see the setup first. The punchline appears after a pause.
                </p>
              </div>
              <fieldset className={fieldset}>
                <legend className={label}>Background</legend>
                <div className="flex gap-2.5">
                  {BACKGROUNDS.map((b) => (
                    <label
                      key={b.value}
                      className={cn(
                        "grid size-11 cursor-pointer place-items-center rounded-full border-3 border-paper has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-denim",
                        TONE[b.value],
                        background === b.value ? "shadow-[0_0_0_3px_var(--color-ink)]" : "shadow-[0_0_0_1px_var(--color-line-strong)]",
                      )}
                    >
                      <input
                        type="radio"
                        name="background"
                        value={b.value}
                        checked={background === b.value}
                        onChange={() => setBackground(b.value)}
                        className="sr-only"
                      />
                      <span className="sr-only">{b.label}</span>
                      {background === b.value ? <Icon name="check" size={18} /> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <div className={fieldset}>
                <span className={label}>Image</span>
                <label className="grid cursor-pointer justify-items-center gap-1 rounded-2xl border-2 border-dashed border-line-strong bg-paper px-4 py-7 text-center font-bold hover:border-ink has-focus-visible:border-ink">
                  <input
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    onChange={(e) => void onFile(e)}
                    className="sr-only"
                    disabled={uploading}
                  />
                  <Icon name="image" size={28} />
                  <span>
                    {uploading ? "Uploading…" : imageKey ? "Choose a different image" : "Choose an image"}
                  </span>
                  <span className={help}>PNG, JPG, GIF or WebP, up to 10 MB</span>
                </label>
              </div>
              <div className={fieldset}>
                <FieldHead htmlFor="alt" count={`${imageAlt.length}/200`}>
                  Describe the image
                </FieldHead>
                <input
                  id="alt"
                  className={field()}
                  maxLength={200}
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  placeholder="A dad holding a fish, looking proud"
                  autoComplete="off"
                />
                <p className={help}>For people who use a screen reader. Required.</p>
              </div>
              <div className={fieldset}>
                <FieldHead htmlFor="caption" count={`${caption.length}/80`}>
                  Caption (optional)
                </FieldHead>
                <input
                  id="caption"
                  className={field()}
                  maxLength={80}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="When the kids ask what's for dinner"
                  autoComplete="off"
                />
              </div>
            </>
          )}

          <div className={fieldset}>
            <label htmlFor="region" className={label}>
              Who will get it?
            </label>
            <Select id="region" value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <p className={help}>Pick a country if the joke needs local knowledge to land.</p>
          </div>

          <fieldset className={fieldset}>
            <legend className={label}>Topics (up to 3)</legend>
            <div className="flex flex-wrap gap-2">
              {topicList.map((t) => (
                <Chip
                  key={t.slug}
                  on={tags.includes(t.slug)}
                  onClick={() => toggleTag(t.slug)}
                  disabled={!tags.includes(t.slug) && tags.length >= 3}
                >
                  {t.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <CheckRow checked={original} onChange={setOriginal} title="I wrote this joke myself.">
            Jokes copied from elsewhere are taken down and don't earn tips.
          </CheckRow>

          <div className="sticky bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom))] grid gap-2 bg-[linear-gradient(transparent,var(--color-fridge)_30%)] py-3 lg:bottom-0">
            <button
              type="submit"
              className={button({ block: true })}
              disabled={!ready || sending}
              aria-describedby="submit-hint"
            >
              {sending ? "Sending…" : "Submit for curation"}
            </button>
            <p
              id="submit-hint"
              className={serverError ? errorText : help}
              aria-live="polite"
            >
              {serverError || missing}
            </p>
          </div>
        </div>

        <aside className="-order-1 grid content-start gap-3 lg:sticky lg:top-7 lg:order-none" aria-label="Preview">
          <div className="flex items-center justify-between">
            <h2 className="text-base">Preview</h2>
            {kind === "text" ? (
              <button
                type="button"
                className={button({ variant: "quiet", size: "sm" })}
                onClick={() => setShowPunch((s) => !s)}
              >
                {showPunch ? "Show setup only" : "Show punchline"}
              </button>
            ) : null}
          </div>
          <div className="max-w-[170px] lg:max-w-none">
            <StoryCard
              face={
                kind === "text"
                  ? { kind, setup, punchline, background }
                  : { kind, imageUrl, caption, imageAlt }
              }
              revealed={kind === "image" || showPunch}
              variant="card"
            />
          </div>
        </aside>
      </div>
    </form>
  );
}
