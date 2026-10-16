import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client.ts";
import type { Creator } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { NameTag } from "../components/NameTag.tsx";
import { formatHour } from "../components/useCountdown.ts";
import type { Role } from "../data/types.ts";
import { useStore } from "../state/useStore.ts";
import "./Profile.css";

const ROLE_COPY: Record<Role, { title: string; on: string; off: string }> = {
  reader: {
    title: "Get a joke every day",
    on: "You get one joke a day and can react, comment and tip.",
    off: "Turn this on to get the daily joke.",
  },
  writer: {
    title: "Write jokes",
    on: "You can submit jokes and see how they do in Studio.",
    off: "Turn this on to submit jokes and get tips.",
  },
};

const titleCase = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);

export function Profile() {
  const navigate = useNavigate();
  const { account, hasRole, setRole, deliveryHour, setDeliveryHour, notifications, signOut, showToast } = useStore();
  const [subscriptions, setSubscriptions] = useState<Creator[] | null>(null);
  const [busyRole, setBusyRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.GET("/v1/me/subscriptions").then(({ data }) => {
      if (!cancelled) setSubscriptions(data?.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account) return null;
  const chosenRoles = account.roles.filter((r) => r === "reader" || r === "writer");
  const name = account.name ?? account.email;

  const toggle = async (r: Role) => {
    const on = hasRole(r);
    if (on && chosenRoles.length === 1) {
      showToast("Keep at least one on.");
      return;
    }
    setBusyRole(r);
    try {
      await setRole(r, !on);
      showToast(
        on
          ? r === "writer"
            ? "Writing is off. Your jokes stay in Studio."
            : "Daily jokes are off."
          : r === "writer"
            ? "You can write jokes now."
            : "Daily jokes are on.",
      );
    } catch {
      // setRole already showed the error.
    } finally {
      setBusyRole(null);
    }
  };

  return (
    <div className="profile">
      <header className="profile-head">
        <Avatar name={name} tone={account.tone} size={72} />
        <div className="profile-id">
          <h1>{name}</h1>
          <p>
            @{account.handle}
            {account.country ? `, ${account.country}` : ""}
          </p>
          {account.bio ? <p className="profile-bio">{account.bio}</p> : null}
        </div>
        <NameTag name={name.split(" ")[0]} size="s" tilt={4} />
      </header>

      <section className="profile-section" aria-labelledby="roles-title">
        <h2 id="roles-title">How you use Daddy Jokes</h2>
        <ul className="role-switches">
          {(["reader", "writer"] as const).map((r) => {
            const on = hasRole(r);
            return (
              <li key={r}>
                <div>
                  <p className="switch-title" id={`role-${r}`}>
                    {ROLE_COPY[r].title}
                  </p>
                  <p className="switch-sub">{on ? ROLE_COPY[r].on : ROLE_COPY[r].off}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={`role-${r}`}
                  aria-busy={busyRole === r}
                  disabled={busyRole !== null}
                  className="switch"
                  onClick={() => void toggle(r)}
                >
                  <span />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {hasRole("reader") ? (
        <section className="profile-section" aria-labelledby="delivery-title">
          <h2 id="delivery-title">Daily joke</h2>
          <dl className="settings">
            <div>
              <dt>
                <label htmlFor="profile-hour">Arrives at</label>
              </dt>
              <dd>
                <select
                  id="profile-hour"
                  value={deliveryHour}
                  onChange={(e) => setDeliveryHour(Number(e.target.value))}
                >
                  {[6, 7, 8, 9, 12, 17, 20].map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            <div>
              <dt>Time zone</dt>
              <dd>{account.timezone.replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt>Notifications on this device</dt>
              <dd>{notifications === "on" ? "On" : "Off"}</dd>
            </div>
            <div>
              <dt>Topics</dt>
              <dd>{account.preferences.topics.length ? account.preferences.topics.map(titleCase).join(", ") : "Any"}</dd>
            </div>
            <div>
              <dt>Subscribed to</dt>
              <dd>
                {subscriptions === null
                  ? "…"
                  : subscriptions.length
                    ? subscriptions.map((c) => c.name).join(", ")
                    : "No writers yet"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {hasRole("writer") ? (
        <section className="profile-section" aria-labelledby="payout-title">
          <h2 id="payout-title">Tips</h2>
          <dl className="settings">
            <div>
              <dt>Paid to</dt>
              <dd>
                {account.payout
                  ? `M-Pesa, ending ${account.payout.phoneLast3}${account.payout.verified ? "" : " (not confirmed yet)"}`
                  : "Not set up. Tips wait in your account."}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {hasRole("curator") || hasRole("admin") ? (
        <section className="profile-section" aria-labelledby="curation-title">
          <h2 id="curation-title">Curation</h2>
          <p className="profile-note">You can review submissions and pick the daily joke.</p>
          <Link to="/curate" className="btn btn-quiet">
            Open the review queue
          </Link>
        </section>
      ) : null}

      <section className="profile-section" aria-labelledby="account-title">
        <h2 id="account-title">Account</h2>
        <dl className="settings">
          <div>
            <dt>Email</dt>
            <dd>{account.email}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            void signOut().then(() => navigate("/welcome", { replace: true }));
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
