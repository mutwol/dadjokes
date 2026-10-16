import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../components/Icon.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import type { JokeBackground } from "../data/types.ts";
import { useStore } from "../state/useStore.ts";
import "./Create.css";

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
const TAGS = ["Wordplay", "Food", "School", "Work", "Animals", "Kids", "Science", "Sports"];

const SETUP_MAX = 140;
const PUNCH_MAX = 80;

export function Create() {
  const navigate = useNavigate();
  const { submit, showToast } = useStore();
  const [kind, setKind] = useState<"text" | "image">("text");
  const [setup, setSetup] = useState("");
  const [punchline, setPunchline] = useState("");
  const [background, setBackground] = useState<JokeBackground>("red");
  const [imageUrl, setImageUrl] = useState<string>();
  const [caption, setCaption] = useState("");
  const [region, setRegion] = useState("Everywhere");
  const [tags, setTags] = useState<string[]>([]);
  const [original, setOriginal] = useState(false);
  const [showPunch, setShowPunch] = useState(true);

  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );

  const hasContent = kind === "text" ? setup.trim() && punchline.trim() : Boolean(imageUrl);
  const ready = Boolean(hasContent) && original;

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUrl(URL.createObjectURL(file));
  };

  const toggleTag = (t: string) =>
    setTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : prev.length < 3 ? [...prev, t] : prev,
    );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    submit({
      setup: kind === "text" ? setup.trim() : caption.trim() || "Image joke",
      punchline: kind === "text" ? punchline.trim() : "",
      background,
    });
    showToast("Submitted for curation");
    void navigate("/studio");
  };

  const missing = !hasContent
    ? kind === "text"
      ? "Add a setup and a punchline to submit."
      : "Add an image to submit."
    : !original
      ? "Confirm the joke is your own to submit."
      : "";

  return (
    <form className="create" onSubmit={onSubmit} aria-labelledby="create-title">
      <header className="create-head">
        <button
          type="button"
          className="icon-btn"
          onClick={() => void navigate(-1)}
          aria-label="Discard and close"
        >
          <Icon name="close" />
        </button>
        <h1 id="create-title">Write a joke</h1>
      </header>

      <p className="create-intro">
        Curators pick one joke each day from everyone's submissions. If yours is picked, every
        subscriber gets it at their delivery time, and you see the views, reactions and tips.
      </p>

      <div className="create-grid">
        <div className="create-form">
          <fieldset className="segmented">
            <legend className="visually-hidden">Joke format</legend>
            {(["text", "image"] as const).map((k) => (
              <label key={k} className={`segmented-opt${kind === k ? " is-on" : ""}`}>
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="visually-hidden"
                />
                <Icon name={k === "text" ? "comment" : "image"} size={20} />
                {k === "text" ? "Setup and punchline" : "Image or meme"}
              </label>
            ))}
          </fieldset>

          {kind === "text" ? (
            <>
              <div className="field">
                <div className="field-label">
                  <label htmlFor="setup">Setup</label>
                  <span className="field-count">
                    {setup.length}/{SETUP_MAX}
                  </span>
                </div>
                <textarea
                  id="setup"
                  rows={3}
                  maxLength={SETUP_MAX}
                  value={setup}
                  onChange={(e) => setSetup(e.target.value)}
                  placeholder="Why did the scarecrow win an award?"
                />
              </div>
              <div className="field">
                <div className="field-label">
                  <label htmlFor="punchline">Punchline</label>
                  <span className="field-count">
                    {punchline.length}/{PUNCH_MAX}
                  </span>
                </div>
                <input
                  id="punchline"
                  maxLength={PUNCH_MAX}
                  value={punchline}
                  onChange={(e) => setPunchline(e.target.value)}
                  placeholder="He was outstanding in his field."
                  autoComplete="off"
                />
                <p className="field-help">
                  Readers see the setup first. The punchline appears after a pause.
                </p>
              </div>
              <fieldset className="field">
                <legend className="field-legend">Background</legend>
                <div className="swatches">
                  {BACKGROUNDS.map((b) => (
                    <label
                      key={b.value}
                      className={`swatch story-bg-${b.value}${background === b.value ? " is-on" : ""}`}
                    >
                      <input
                        type="radio"
                        name="background"
                        value={b.value}
                        checked={background === b.value}
                        onChange={() => setBackground(b.value)}
                        className="visually-hidden"
                      />
                      <span className="visually-hidden">{b.label}</span>
                      {background === b.value ? <Icon name="check" size={18} /> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <div className="field">
                <span className="field-legend">Image</span>
                <label className={`dropzone${imageUrl ? " has-image" : ""}`}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onFile}
                    className="visually-hidden"
                  />
                  <Icon name="image" size={28} />
                  <span>{imageUrl ? "Choose a different image" : "Choose an image"}</span>
                  <span className="field-help">PNG, JPG or GIF, up to 10 MB</span>
                </label>
              </div>
              <div className="field">
                <div className="field-label">
                  <label htmlFor="caption">Caption (optional)</label>
                  <span className="field-count">{caption.length}/80</span>
                </div>
                <input
                  id="caption"
                  maxLength={80}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="When the kids ask what's for dinner"
                  autoComplete="off"
                />
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="region" className="field-legend">
              Who will get it?
            </label>
            <select id="region" value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <p className="field-help">Pick a country if the joke needs local knowledge to land.</p>
          </div>

          <fieldset className="field">
            <legend className="field-legend">Topics (up to 3)</legend>
            <div className="chips">
              {TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip${tags.includes(t) ? " is-on" : ""}`}
                  aria-pressed={tags.includes(t)}
                  onClick={() => toggleTag(t)}
                  disabled={!tags.includes(t) && tags.length >= 3}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="original">
            <input
              type="checkbox"
              checked={original}
              onChange={(e) => setOriginal(e.target.checked)}
            />
            <span>
              <strong>I wrote this joke myself.</strong>
              <span className="field-help">
                Jokes copied from elsewhere are taken down and don't earn tips.
              </span>
            </span>
          </label>

          <div className="create-submit">
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={!ready}
              aria-describedby="submit-hint"
            >
              Submit for curation
            </button>
            <p id="submit-hint" className="field-help" aria-live="polite">
              {missing}
            </p>
          </div>
        </div>

        <aside className="create-preview" aria-label="Preview">
          <div className="create-preview-head">
            <h2>Preview</h2>
            {kind === "text" ? (
              <button
                type="button"
                className="btn btn-quiet btn-small"
                onClick={() => setShowPunch((s) => !s)}
              >
                {showPunch ? "Show setup only" : "Show punchline"}
              </button>
            ) : null}
          </div>
          <div className="create-preview-card">
            <StoryCard
              face={
                kind === "text"
                  ? { kind, setup, punchline, background }
                  : { kind, imageUrl, caption, imageAlt: caption }
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
