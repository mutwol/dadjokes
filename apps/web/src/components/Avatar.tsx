import type { JokeBackground } from "../data/types.ts";

export function Avatar({
  name,
  tone,
  size = 40,
}: {
  name: string;
  tone: JokeBackground;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        width: `var(--avatar-size, ${size}px)`,
        height: `var(--avatar-size, ${size}px)`,
        borderRadius: "50%",
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        background: `var(--bg-${tone})`,
        color: `var(--on-${tone})`,
        fontWeight: 800,
        fontSize: `calc(var(--avatar-size, ${size}px) * 0.38)`,
      }}
    >
      {initials}
    </span>
  );
}
