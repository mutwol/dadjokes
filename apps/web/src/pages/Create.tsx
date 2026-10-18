import { useEffect, useState } from "react";
import { useFormState, useWatch } from "react-hook-form";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import { problemMessage, useCreateUploadMutation, useListTopicsQuery, useSubmitJokeMutation } from "../api/rtk/index.ts";
import { button, IconButton } from "@/components/ui/button.tsx";
import { CheckRow } from "@/components/ui/check-row.tsx";
import { Chip } from "@/components/ui/chip.tsx";
import { Form, FormError, FormField, useFieldIds } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { field } from "@/components/ui/input.tsx";
import { errorText, fieldset, help, label } from "@/components/ui/label.tsx";
import { segment, segmented } from "@/components/ui/segmented.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { TONE } from "@/lib/tones.ts";
import { cn } from "@/lib/utils.ts";
import { StoryCard } from "../components/StoryCard.tsx";

const BACKGROUNDS = [
  { value: "red", label: "Name-tag red" },
  { value: "navy", label: "Polo navy" },
  { value: "yellow", label: "Highlighter yellow" },
  { value: "green", label: "Lawn green" },
  { value: "denim", label: "Denim" },
] as const;

const REGIONS = ["Everywhere", "Kenya", "Nigeria", "South Africa", "United Kingdom", "United States"];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SETUP_MAX = 140;
const PUNCH_MAX = 80;
const ALT_MAX = 200;
const CAPTION_MAX = 80;

/**
 * One schema for both formats: the fields of the format not in use are ignored.
 * Messages are written for the person filling the form in, not for a developer.
 */
const schema = z
  .object({
    kind: z.enum(["text", "image"]),
    setup: z.string().trim().max(SETUP_MAX),
    punchline: z.string().trim().max(PUNCH_MAX),
    background: z.enum(["red", "navy", "yellow", "green", "denim"]),
    imageKey: z.string(),
    imageAlt: z.string().trim().max(ALT_MAX),
    caption: z.string().trim().max(CAPTION_MAX),
    region: z.string(),
    topics: z.array(z.string()).max(3, "Pick up to three topics."),
    original: z.boolean().refine((v) => v, "Confirm the joke is your own to submit."),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "text") {
      if (!v.setup) ctx.addIssue({ code: "custom", path: ["setup"], message: "Add a setup." });
      if (!v.punchline) ctx.addIssue({ code: "custom", path: ["punchline"], message: "Add a punchline." });
    } else {
      if (!v.imageKey) ctx.addIssue({ code: "custom", path: ["imageKey"], message: "Add an image." });
      if (v.imageAlt.length < 3) ctx.addIssue({ code: "custom", path: ["imageAlt"], message: "Describe the image in a few words." });
    }
  });

/** Character count shown next to a field's label. */
function Count({ value, max }: { value: string; max: number }) {
  return <span className={cn(help, "tabular-nums", value.length >= max && "text-tag-red-deep")}>{`${value.length}/${max}`}</span>;
}

/** A registered input or textarea that picks up the label/help/error wiring of its <FormField>. */
function Control({ as = "input", className, ...props }: { as?: "input" | "textarea" } & Record<string, unknown>) {
  const ids = useFieldIds();
  const Tag = as;
  return <Tag {...ids} className={field("md", cn(as === "textarea" && "resize-y", className as string))} {...props} />;
}

export function Create() {
  const navigate = useNavigate();
  const { data: topics } = useListTopicsQuery();
  const [submitJoke] = useSubmitJokeMutation();
  const [createUpload] = useCreateUploadMutation();
  const [imageUrl, setImageUrl] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [showPunch, setShowPunch] = useState(true);

  const form = useZodForm(schema, {
    defaultValues: {
      kind: "text",
      setup: "",
      punchline: "",
      background: "red",
      imageKey: "",
      imageAlt: "",
      caption: "",
      region: "Everywhere",
      topics: [],
      original: false,
    },
  });
  const { register, setValue, setError, clearErrors } = form;
  const v = { ...form.getValues(), ...useWatch({ control: form.control }) };
  // Subscribed hooks rather than form.watch()/form.formState: the React Compiler memoizes reads off `form`.
  const formState = useFormState({ control: form.control });

  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );

  // Warn before leaving with a half-written joke.
  const dirty = formState.isDirty && !formState.isSubmitSuccessful;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Uploads straight to storage as soon as an image is picked, so submitting is instant. */
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) return setError("imageKey", { message: "Use a PNG, JPG, GIF or WebP image." });
    if (file.size > MAX_IMAGE_BYTES) return setError("imageKey", { message: "That image is over 10 MB. Try a smaller one." });
    clearErrors("imageKey");
    setValue("imageKey", "", { shouldDirty: true });
    setImageUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const target = await createUpload({ createUploadRequest: { contentType: file.type as (typeof IMAGE_TYPES)[number], size: file.size } }).unwrap();
      const put = await fetch(target.url, { method: "PUT", headers: target.headers, body: file });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setValue("imageKey", target.key, { shouldDirty: true, shouldValidate: true });
    } catch (err) {
      setImageUrl(undefined);
      setError("imageKey", { message: problemMessage(err, "The upload didn't work. Try again.") });
    } finally {
      setUploading(false);
    }
  };

  const toggleTopic = (t: string) => {
    const next = v.topics.includes(t) ? v.topics.filter((x) => x !== t) : v.topics.length < 3 ? [...v.topics, t] : v.topics;
    setValue("topics", next, { shouldDirty: true });
  };

  // A gentle hint under the button; the field errors themselves appear on submit.
  const missing =
    v.kind === "text"
      ? !v.setup.trim() || !v.punchline.trim()
        ? "Add a setup and a punchline to submit."
        : ""
      : uploading
        ? "Uploading the image…"
        : !v.imageKey
          ? "Add an image to submit."
          : v.imageAlt.trim().length < 3
            ? "Describe the image to submit."
            : "";

  const submit = async (d: z.output<typeof schema>) => {
    const common = { region: d.region === "Everywhere" ? null : d.region, topics: d.topics, original: true as const };
    await submitJoke({
      createJokeRequest:
        d.kind === "text"
          ? { kind: "text", setup: d.setup, punchline: d.punchline, background: d.background, ...common }
          : { kind: "image", imageKey: d.imageKey, imageAlt: d.imageAlt, caption: d.caption || undefined, ...common },
    }).unwrap();
    toast.success("Sent to the curators");
    void navigate("/studio");
  };

  return (
    <Form form={form} onSubmit={submit} className="mx-auto max-w-wide gap-4 px-4 lg:px-8 lg:pt-7" aria-labelledby="create-title">
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
              <label key={k} className={segment(v.kind === k)}>
                <input type="radio" value={k} {...register("kind")} className="sr-only" />
                <Icon name={k === "text" ? "comment" : "image"} size={20} />
                {k === "text" ? "Setup and punchline" : "Image or meme"}
              </label>
            ))}
          </fieldset>

          {v.kind === "text" ? (
            <>
              <FormField name="setup" label={<span className="flex w-full justify-between">Setup <Count value={v.setup} max={SETUP_MAX} /></span>}>
                <Control as="textarea" className="text-xl font-medium" rows={3} maxLength={SETUP_MAX} placeholder="Why did the scarecrow win an award?" {...register("setup")} />
              </FormField>
              <FormField
                name="punchline"
                label={<span className="flex w-full justify-between">Punchline <Count value={v.punchline} max={PUNCH_MAX} /></span>}
                help="Readers see the setup first. The punchline appears after a pause."
              >
                <Control className="font-marker text-xl" maxLength={PUNCH_MAX} placeholder="He was outstanding in his field." autoComplete="off" {...register("punchline")} />
              </FormField>
              <fieldset className={fieldset}>
                <legend className={label}>Background</legend>
                <div className="flex gap-2.5">
                  {BACKGROUNDS.map((b) => (
                    <label
                      key={b.value}
                      className={cn(
                        "grid size-11 cursor-pointer place-items-center rounded-full border-3 border-paper has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-denim",
                        TONE[b.value],
                        v.background === b.value ? "shadow-[0_0_0_3px_var(--color-ink)]" : "shadow-[0_0_0_1px_var(--color-line-strong)]",
                      )}
                    >
                      <input type="radio" value={b.value} {...register("background")} className="sr-only" />
                      <span className="sr-only">{b.label}</span>
                      {v.background === b.value ? <Icon name="check" size={18} /> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <FormField name="imageKey" label="Image" help="PNG, JPG, GIF or WebP, up to 10 MB">
                <ImagePicker uploading={uploading} hasImage={Boolean(v.imageKey)} onFile={(e) => void onFile(e)} />
              </FormField>
              <FormField
                name="imageAlt"
                label={<span className="flex w-full justify-between">Describe the image <Count value={v.imageAlt} max={ALT_MAX} /></span>}
                help="For people who use a screen reader. Required."
              >
                <Control maxLength={ALT_MAX} placeholder="A dad holding a fish, looking proud" autoComplete="off" {...register("imageAlt")} />
              </FormField>
              <FormField name="caption" optional label={<span className="flex w-full justify-between">Caption <Count value={v.caption} max={CAPTION_MAX} /></span>}>
                <Control maxLength={CAPTION_MAX} placeholder="When the kids ask what's for dinner" autoComplete="off" {...register("caption")} />
              </FormField>
            </>
          )}

          <FormField name="region" label="Who will get it?" help="Pick a country if the joke needs local knowledge to land.">
            <Control as={"select" as "input"} className="pr-8" {...register("region")}>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Control>
          </FormField>

          <fieldset className={fieldset}>
            <legend className={label}>Topics (up to 3)</legend>
            <div className="flex flex-wrap gap-2">
              {(topics?.data ?? []).map((t) => (
                <Chip key={t.slug} on={v.topics.includes(t.slug)} onClick={() => toggleTopic(t.slug)} disabled={!v.topics.includes(t.slug) && v.topics.length >= 3}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <CheckRow checked={v.original} onChange={(on) => setValue("original", on, { shouldDirty: true, shouldValidate: formState.isSubmitted })} title="I wrote this joke myself.">
              Jokes copied from elsewhere are taken down and don't earn tips.
            </CheckRow>
            {formState.errors.original ? (
              <p className={errorText} role="alert">
                {formState.errors.original.message}
              </p>
            ) : null}
          </div>

          <div className="sticky bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom))] grid gap-2 bg-[linear-gradient(transparent,var(--color-fridge)_30%)] py-3 lg:bottom-0">
            <FormError />
            <button type="submit" className={button({ block: true })} disabled={formState.isSubmitting || uploading} aria-busy={formState.isSubmitting || undefined} aria-describedby="submit-hint">
              {formState.isSubmitting ? "Sending…" : uploading ? "Uploading the image…" : "Submit for curation"}
            </button>
            <p id="submit-hint" className={help} aria-live="polite">
              {missing}
            </p>
          </div>
        </div>

        <aside className="-order-1 grid content-start gap-3 lg:sticky lg:top-7 lg:order-none" aria-label="Preview">
          <div className="flex items-center justify-between">
            <h2 className="text-base">Preview</h2>
            {v.kind === "text" ? (
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
                v.kind === "text"
                  ? { kind: "text", setup: v.setup, punchline: v.punchline, background: v.background }
                  : { kind: "image", imageUrl, caption: v.caption, imageAlt: v.imageAlt }
              }
              revealed={v.kind === "image" || showPunch}
              variant="card"
            />
          </div>
        </aside>
      </div>
    </Form>
  );
}

/** The drop zone for an image joke; wired to its <FormField> like any other control. */
function ImagePicker({ uploading, hasImage, onFile }: { uploading: boolean; hasImage: boolean; onFile: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const ids = useFieldIds();
  return (
    <label
      className={cn(
        "grid cursor-pointer justify-items-center gap-1 rounded-lg border border-dashed border-line-strong bg-paper px-4 py-7 text-center font-medium transition-colors duration-120 hover:border-ink-faint hover:bg-fridge has-focus-visible:border-focus",
        ids["aria-invalid"] && "border-tag-red",
      )}
    >
      <input {...ids} type="file" accept={IMAGE_TYPES.join(",")} onChange={onFile} className="sr-only" disabled={uploading} />
      <Icon name="image" size={28} />
      <span>{uploading ? "Uploading…" : hasImage ? "Choose a different image" : "Choose an image"}</span>
    </label>
  );
}
