import type React from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/client.ts";
import { disablePush, enablePush } from "../api/push.ts";
import type { Creator } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { NameTag } from "../components/NameTag.tsx";
import { formatHour } from "../components/useCountdown.ts";
import type { Role } from "../data/types.ts";
import { useStore } from "../state/useStore.ts";
import { Switch, button, card, cn, field } from "../components/ui/index.ts";

/** A titled block of the profile page. */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid justify-items-start gap-3" aria-labelledby={id}>
      <h2 id={id} className="text-xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A card of label/value rows separated by hairlines. */
const rows = cn(card, "m-0 w-full list-none divide-y divide-line p-0");
const row = "flex items-center justify-between gap-4 px-4 py-3.5";

function Setting({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={row}>
      <dt className="font-bold">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-ink-soft">{children}</dd>
    </div>
  );
}

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
  const { account, hasRole, setRole, deliveryHour, setDeliveryHour, notifications, setNotifications, signOut, showToast } =
    useStore();
  const [pushBusy, setPushBusy] = useState(false);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (notifications === "on") {
        await disablePush();
        setNotifications("off");
        showToast("Notifications are off on this device.");
      } else {
        const result = await enablePush();
        setNotifications(result);
        showToast(
          result === "on"
            ? "Notifications are on. We'll tell you when your joke lands."
            : result === "denied"
              ? "Notifications are blocked in your browser settings."
              : result === "unsupported"
                ? "This browser can't show notifications."
                : "Notifications stay off.",
        );
      }
    } catch {
      showToast("Couldn't change notifications. Try again.");
    } finally {
      setPushBusy(false);
    }
  };
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
    <div className="mx-auto grid max-w-narrow gap-7 px-4 pt-6 lg:pt-10">
      <header className="flex items-center gap-4">
        <Avatar name={name} tone={account.tone} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl">{name}</h1>
          <p className="text-sm text-ink-soft">
            @{account.handle}
            {account.country ? `, ${account.country}` : ""}
          </p>
          {account.bio ? <p className="mt-1 text-sm">{account.bio}</p> : null}
        </div>
        <NameTag name={name.split(" ")[0]} size="s" tilt={4} className="hidden sm:inline-flex" />
      </header>

      <Section id="roles-title" title="How you use Daddy Jokes">
        <ul className={rows}>
          {(["reader", "writer"] as const).map((r) => {
            const on = hasRole(r);
            return (
              <li key={r} className={row}>
                <div>
                  <p className="font-extrabold" id={`role-${r}`}>
                    {ROLE_COPY[r].title}
                  </p>
                  <p className="text-sm text-ink-soft">{on ? ROLE_COPY[r].on : ROLE_COPY[r].off}</p>
                </div>
                <Switch
                  checked={on}
                  aria-labelledby={`role-${r}`}
                  aria-busy={busyRole === r}
                  disabled={busyRole !== null}
                  onClick={() => void toggle(r)}
                />
              </li>
            );
          })}
        </ul>
      </Section>

      {hasRole("reader") ? (
        <Section id="delivery-title" title="Daily joke">
          <dl className={rows}>
            <Setting label={<label htmlFor="profile-hour">Arrives at</label>}>
              <select
                  id="profile-hour"
                  className={field("pill")}
                  value={deliveryHour}
                  onChange={(e) => setDeliveryHour(Number(e.target.value))}
                >
                  {[6, 7, 8, 9, 12, 17, 20].map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </select>
            </Setting>
            <Setting label="Time zone">{account.timezone.replace(/_/g, " ")}</Setting>
            <Setting label="Notifications on this device">
              <Switch
                checked={notifications === "on"}
                aria-label="Notifications on this device"
                disabled={pushBusy || notifications === "unsupported"}
                onClick={() => void togglePush()}
              />
            </Setting>
            <Setting label="Topics">
              {account.preferences.topics.length ? account.preferences.topics.map(titleCase).join(", ") : "Any"}
            </Setting>
            <Setting label="Subscribed to">
              {subscriptions === null
                ? "…"
                : subscriptions.length
                  ? subscriptions.map((c) => c.name).join(", ")
                  : "No writers yet"}
            </Setting>
          </dl>
        </Section>
      ) : null}

      {hasRole("writer") ? (
        <Section id="payout-title" title="Tips">
          <dl className={rows}>
            <Setting label="Paid to">
              {account.payout
                ? `M-Pesa, ending ${account.payout.phoneLast3}${account.payout.verified ? "" : " (not confirmed yet)"}`
                : "Not set up. Tips wait in your account."}
            </Setting>
          </dl>
        </Section>
      ) : null}

      {hasRole("curator") || hasRole("admin") ? (
        <Section id="curation-title" title="Curation">
          <p className="text-sm text-ink-soft">You can review submissions and pick the daily joke.</p>
          <Link to="/curate" className={button({ variant: "quiet" })}>
            Open the review queue
          </Link>
        </Section>
      ) : null}

      <Section id="account-title" title="Account">
        <dl className={rows}>
          <Setting label="Email">{account.email}</Setting>
        </dl>
        <button
          type="button"
          className={button({ variant: "quiet" })}
          onClick={() => {
            void signOut().then(() => navigate("/welcome", { replace: true }));
          }}
        >
          Sign out
        </button>
      </Section>
    </div>
  );
}
