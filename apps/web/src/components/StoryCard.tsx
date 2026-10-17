import type { JokeBackground } from "../data/types.ts";
import { TONE, cn } from "./ui/index.ts";

export interface StoryFace {
  kind: "text" | "image";
  setup?: string;
  punchline?: string;
  background?: JokeBackground;
  imageUrl?: string;
  imageAlt?: string;
  caption?: string;
}

/**
 * - `full`: fills the viewer, clear of its top and bottom overlays.
 * - `card`: a 9:14 story card for previews.
 * - `inline`: a wide card on Today and the joke page.
 * - `thumb`: a tiny card in lists; type scales with the card width.
 */
type Variant = "card" | "full" | "inline" | "thumb";

const FRAME: Record<Variant, string> = {
  full: "absolute inset-0",
  card: "aspect-[9/14] rounded-3xl",
  inline: "min-h-60 rounded-3xl",
  thumb: "aspect-[9/14] rounded-xl",
};

const BODY: Record<Variant, string> = {
  full: "gap-[7cqi] px-[9cqi] pt-30 pb-55",
  card: "gap-[7cqi] px-[9cqi] py-[10cqi]",
  inline: "gap-4.5 px-7 py-8",
  thumb: "gap-[7cqi] px-[9cqi] py-[10cqi]",
};

const SETUP: Record<Variant, string> = {
  full: "text-[clamp(1.25rem,8.6cqi,3rem)]",
  card: "text-[clamp(1.25rem,8.6cqi,3rem)]",
  inline: "text-[clamp(1.375rem,5.6cqi,2rem)]",
  thumb: "text-[10cqi]",
};

const PUNCHLINE: Record<Variant, string> = {
  full: "text-[clamp(1.375rem,9.4cqi,3.25rem)]",
  card: "text-[clamp(1.375rem,9.4cqi,3.25rem)]",
  inline: "text-[clamp(1.5rem,6.4cqi,2.375rem)]",
  thumb: "text-[10.5cqi]",
};

/**
 * The face of a joke: setup first, punchline revealed with a highlighter swipe.
 * Rendered full-screen in the viewer and as a small card in previews.
 */
export function StoryCard({
  face,
  revealed,
  variant = "card",
  animate = true,
}: {
  face: StoryFace;
  revealed: boolean;
  variant?: Variant;
  animate?: boolean;
}) {
  const frame = cn("@container relative flex flex-col justify-center overflow-hidden", FRAME[variant]);

  if (face.kind === "image") {
    return (
      <div className={cn(frame, "bg-ink text-white")}>
        {face.imageUrl ? (
          <img src={face.imageUrl} alt={face.imageAlt ?? ""} className="size-full object-contain" />
        ) : (
          <div className="m-auto font-bold text-white/70">Your image shows here</div>
        )}
        {face.caption ? (
          <p
            className={cn(
              "absolute inset-x-0 bottom-0 bg-linear-to-b from-transparent to-black/75 font-bold",
              variant === "thumb"
                ? "p-1.5 text-[10cqi]"
                : "px-[6cqi] pt-6 pb-[7cqi] text-[clamp(1rem,5cqi,1.5rem)]",
            )}
          >
            {face.caption}
          </p>
        ) : null}
      </div>
    );
  }

  const bg = face.background ?? "red";
  return (
    <div
      className={cn(
        frame,
        TONE[bg],
        bg === "yellow" ? "[--hl:var(--color-white)]" : "[--hl:var(--color-highlighter)]",
      )}
    >
      <div className={cn("flex flex-col", BODY[variant])}>
        <p className={cn(SETUP[variant], "leading-[1.12] font-extrabold tracking-[-0.015em] text-balance")}>
          {face.setup || "Your setup goes here."}
        </p>
        <p
          className={cn(
            PUNCHLINE[variant],
            "origin-left -rotate-2 font-marker leading-[1.3] text-ink",
            revealed ? "visible" : "invisible",
            revealed && animate && "animate-punch-in",
          )}
          aria-hidden={!revealed}
        >
          <span
            className={cn(
              "box-decoration-clone bg-[linear-gradient(var(--hl),var(--hl))] bg-size-[100%_88%] bg-position-[0_60%] bg-no-repeat px-[0.2em]",
              revealed && animate && "animate-highlighter",
            )}
          >
            {face.punchline || "And the punchline here."}
          </span>
        </p>
      </div>
    </div>
  );
}
