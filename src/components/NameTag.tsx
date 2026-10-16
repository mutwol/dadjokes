import "./NameTag.css";

/**
 * The "Hello, my name is" sticker. Used as the logo and as the byline on a joke,
 * because every dad joke starts with "Hi hungry, I'm Dad."
 */
export function NameTag({
  name,
  size = "m",
  tilt = -3,
}: {
  name: string;
  size?: "s" | "m" | "l";
  tilt?: number;
}) {
  return (
    <span className={`nametag nametag-${size}`} style={{ rotate: `${tilt}deg` }}>
      <span className="nametag-band">Hello, my name is</span>
      <span className="nametag-name">{name}</span>
    </span>
  );
}
