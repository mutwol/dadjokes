import { z } from "zod";
import { named } from "../common/zod";
import { Tone } from "../users/schemas";

export const NotificationType = z.enum([
  "joke_scheduled",
  "joke_declined",
  "joke_delivered",
  "joke_removed",
  "new_subscriber",
  "comment",
  "tip_received",
  "payout_paid",
  "payout_failed",
]);

export const ActivitySchema = named(
  "Activity",
  z.object({
    id: z.uuid(),
    type: NotificationType,
    title: z.string(),
    body: z.string().nullable(),
    url: z.string().describe("Where tapping it should go in the app."),
    actor: z.object({ name: z.string(), handle: z.string(), tone: Tone }).nullable(),
    createdAt: z.iso.datetime(),
    read: z.boolean(),
  }),
  "One item in the Activity feed.",
);
export type Activity = z.infer<typeof ActivitySchema>;

export const ActivityPageSchema = named(
  "ActivityPage",
  z.object({ data: z.array(ActivitySchema), nextCursor: z.string().nullable(), unread: z.number().int() }),
);

export const ActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});
export type ActivityQuery = z.infer<typeof ActivityQuery>;

export const PushConfigSchema = named(
  "PushConfig",
  z.object({ enabled: z.boolean(), publicKey: z.string().nullable() }),
  "Whether push is set up, and the key browsers subscribe with.",
);

export const PushSubscriptionRequest = named(
  "PushSubscriptionRequest",
  z.object({
    endpoint: z.url().max(1000),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  }),
  "A browser's PushSubscription, as from subscription.toJSON().",
);
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequest>;

export const RemovePushSubscriptionRequest = named(
  "RemovePushSubscriptionRequest",
  z.object({ endpoint: z.url().max(1000) }),
);
