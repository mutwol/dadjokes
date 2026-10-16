import type { NotificationType } from "../db/schema";

/** Feed and push wording for each notification. Data comes from the notification row. */
export function describe(
  type: NotificationType,
  data: Record<string, unknown>,
  actorName: string | null,
  jokeId: string | null,
): { title: string; body: string | null; url: string } {
  const who = actorName ?? "Someone";
  const setup = typeof data.setup === "string" ? data.setup : null;
  switch (type) {
    case "joke_scheduled":
      return { title: "Your joke was picked!", body: setup ? `“${setup}” goes out on ${String(data.deliverOn)}.` : null, url: "/studio" };
    case "joke_declined":
      return { title: "Not picked this time", body: setup ? `“${setup}”` : null, url: "/studio" };
    case "joke_delivered":
      return { title: "Your joke is out", body: "It's going out to readers today.", url: jokeId ? `/joke/${jokeId}` : "/studio" };
    case "joke_removed":
      return { title: "A joke of yours was taken down", body: setup ? `“${setup}”` : null, url: "/studio" };
    case "new_subscriber":
      return { title: `${who} subscribed to you`, body: null, url: "/studio" };
    case "comment":
      return { title: `${who} commented on your joke`, body: typeof data.excerpt === "string" ? data.excerpt : null, url: jokeId ? `/joke/${jokeId}` : "/studio" };
    case "tip_received":
      return { title: `${who} tipped you KES ${String(data.amountKes)}`, body: setup ? `For “${setup}”` : null, url: "/studio" };
    case "payout_paid":
      return { title: `KES ${String(data.amountKes)} sent to your M-Pesa`, body: null, url: "/studio" };
    case "payout_failed":
      return { title: "A withdrawal didn't go through", body: "The money is back in your balance.", url: "/studio" };
  }
}
