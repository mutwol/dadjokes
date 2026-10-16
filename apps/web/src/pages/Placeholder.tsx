import { Link } from "react-router";

/** Stand-in for screens planned in later steps. */
export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{ maxWidth: 560, margin: "0 auto", padding: "48px 16px", display: "grid", gap: 12 }}
    >
      <h1 style={{ fontSize: "var(--step-3)" }}>{title}</h1>
      <p style={{ color: "var(--ink-soft)" }}>{body}</p>
      <Link to="/" className="btn btn-quiet" style={{ justifySelf: "start" }}>
        Back to today's joke
      </Link>
    </div>
  );
}
