import { Link } from "react-router";
import { Icon } from "../components/Icon.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { longDate } from "../data/mock.ts";
import { compact } from "../data/reactions.ts";
import type { SubmissionStatus } from "../data/types.ts";
import { useStore } from "../state/useStore.ts";
import "./Studio.css";

const STATUS: Record<SubmissionStatus, string> = {
  "in-review": "In review",
  scheduled: "Scheduled",
  delivered: "Delivered",
  declined: "Not picked",
};

export function Studio() {
  const { submissions } = useStore();
  const delivered = submissions.filter((s) => s.status === "delivered");
  const reach = delivered.reduce((n, s) => n + (s.deliveredTo ?? 0), 0);

  return (
    <div className="studio">
      <header className="studio-head">
        <h1>Studio</h1>
        <Link to="/create" className="btn btn-primary">
          <Icon name="plus" size={20} />
          Write a joke
        </Link>
      </header>

      <dl className="studio-stats">
        <div>
          <dt>People reached</dt>
          <dd>{compact(reach)}</dd>
        </div>
        <div>
          <dt>Jokes picked</dt>
          <dd>{delivered.length + submissions.filter((s) => s.status === "scheduled").length}</dd>
        </div>
        <div>
          <dt>Waiting for review</dt>
          <dd>{submissions.filter((s) => s.status === "in-review").length}</dd>
        </div>
        <div>
          <dt>Tips received</dt>
          <dd>KES 0</dd>
        </div>
      </dl>

      <section aria-labelledby="subs-title" className="studio-list">
        <h2 id="subs-title">Your jokes</h2>
        <ul>
          {submissions.map((s) => (
            <li key={s.id} className="sub">
              <div className="sub-thumb">
                <StoryCard
                  face={{
                    kind: "text",
                    setup: s.setup,
                    punchline: s.punchline,
                    background: s.background,
                  }}
                  revealed
                  animate={false}
                />
              </div>
              <div className="sub-body">
                <span className={`status status-${s.status}`}>{STATUS[s.status]}</span>
                <p className="sub-setup">{s.setup}</p>
                <p className="sub-meta">
                  {s.status === "delivered" && s.deliveredTo
                    ? `Went out ${longDate(s.scheduledFor!)} to ${compact(s.deliveredTo)} people`
                    : s.status === "scheduled"
                      ? `Goes out ${longDate(s.scheduledFor!)}`
                      : `Submitted ${longDate(s.submittedOn)}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
