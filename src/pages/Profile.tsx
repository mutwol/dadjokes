import { useNavigate } from "react-router";
import { Avatar } from "../components/Avatar.tsx";
import { NameTag } from "../components/NameTag.tsx";
import { formatHour } from "../components/useCountdown.ts";
import { creatorById } from "../data/mock.ts";
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

export function Profile() {
  const navigate = useNavigate();
  const { profile, hasRole, addRole, removeRole, deliveryHour, setDeliveryHour, signOut, showToast } =
    useStore();
  if (!profile) return null;

  const toggle = (r: Role) => {
    if (hasRole(r)) {
      if (profile.roles.length === 1) {
        showToast("Keep at least one on.");
        return;
      }
      removeRole(r);
      showToast(r === "writer" ? "Writing is off. Your jokes stay in Studio." : "Daily jokes are off.");
    } else {
      addRole(r);
      showToast(r === "writer" ? "You can write jokes now." : "Daily jokes are on.");
    }
  };

  return (
    <div className="profile">
      <header className="profile-head">
        <Avatar name={profile.name} tone="denim" size={72} />
        <div className="profile-id">
          <h1>{profile.name}</h1>
          <p>
            @{profile.handle}, {profile.country}
          </p>
          {profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}
        </div>
        <NameTag name={profile.name.split(" ")[0]} size="s" tilt={4} />
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
                  className="switch"
                  onClick={() => toggle(r)}
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
              <dt>Notifications</dt>
              <dd>{profile.notifications === "on" ? "On" : "Off"}</dd>
            </div>
            <div>
              <dt>Topics</dt>
              <dd>{profile.topics.length ? profile.topics.join(", ") : "Any"}</dd>
            </div>
            <div>
              <dt>Subscribed to</dt>
              <dd>
                {profile.following.length
                  ? profile.following.map((id) => creatorById(id).name).join(", ")
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
                {profile.payout.method === "mpesa"
                  ? `M-Pesa, ending ${profile.payout.phone.slice(-3)}`
                  : "Not set up. Tips wait in your account."}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="profile-section" aria-labelledby="account-title">
        <h2 id="account-title">Account</h2>
        <dl className="settings">
          <div>
            <dt>Email</dt>
            <dd>{profile.email}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            signOut();
            void navigate("/welcome", { replace: true });
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
