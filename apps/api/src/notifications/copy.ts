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
    case "tip_received": {
      // Like a Super Chat: who sent how much, with their message front and centre.
      const from = data.anonymous ? "someone" : (actorName ?? "a reader");
      const amount = Number(data.amountKes).toLocaleString("en-KE");
      const note = typeof data.note === "string" && data.note ? data.note : null;
      return {
        title: `You've received a KSh ${amount} tip from ${from}`,
        body: note ? `“${note}”${setup ? ` · on “${setup}”` : ""}` : setup ? `For “${setup}”` : null,
        url: jokeId ? `/joke/${jokeId}#tips` : "/studio",
      };
    }
    case "payout_paid":
      return { title: `KSh ${Number(data.amountKes).toLocaleString("en-KE")} sent to your M-Pesa`, body: null, url: "/studio" };
    case "payout_failed":
      return { title: "A withdrawal didn't go through", body: "The money is back in your balance.", url: "/studio" };
    case "report_resolved":
      return {
        title: data.action === "removed" ? `Thanks: the ${String(data.target)} you reported was taken down` : `We looked at the ${String(data.target)} you reported`,
        body: data.action === "removed" ? null : "The curators decided to leave it up this time.",
        url: jokeId ? `/joke/${jokeId}` : "/",
      };
    case "appeal_resolved":
      return {
        title: data.decision === "overturned" ? "Your appeal worked: the joke is back" : "Your appeal was looked at",
        body: typeof data.note === "string" && data.note ? data.note : data.decision === "overturned" ? (setup ? `“${setup}”` : null) : "The curators kept the joke down.",
        url: "/studio",
      };
    case "automation":
      return {
        title: typeof data.title === "string" ? data.title : "Daddy Jokes",
        body: typeof data.body === "string" ? data.body : null,
        url: typeof data.url === "string" ? data.url : "/",
      };
  }
}
