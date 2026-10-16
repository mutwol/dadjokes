import { z } from "zod";
import { named } from "../common/zod";

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const Handle = z.string().regex(HANDLE_PATTERN, "Use 3 to 20 lowercase letters, numbers or underscores.");
export const TimeZone = z.string().refine(isTimeZone, "Unknown time zone. Use an IANA name like Africa/Nairobi.");
export const ChosenRole = z.enum(["reader", "writer"]);
export const AnyRole = z.enum(["reader", "writer", "curator", "admin"]);
export const JokeOrigin = z.enum(["everywhere", "local"]);
export const Tone = z.enum(["red", "navy", "yellow", "green", "denim"]);
export const DeliveryHour = z.number().int().min(0).max(23);

export const PreferencesSchema = named(
  "Preferences",
  z.object({
    deliveryHour: DeliveryHour,
    jokeOrigin: JokeOrigin,
    topics: z.array(z.string()),
  }),
);

export const PayoutSchema = named(
  "Payout",
  z.object({
    method: z.literal("mpesa"),
    phoneLast3: z.string(),
    verified: z.boolean(),
  }),
);

export const MeSchema = named(
  "Me",
  z.object({
    id: z.uuid(),
    email: z.email(),
    name: z.string().nullable(),
    handle: z.string().nullable(),
    country: z.string().nullable(),
    bio: z.string(),
    tone: Tone,
    timezone: z.string(),
    roles: z.array(AnyRole),
    preferences: PreferencesSchema,
    payout: PayoutSchema.nullable(),
    onboarded: z.boolean(),
    createdAt: z.iso.datetime(),
  }),
  "The signed-in person.",
);
export type Me = z.infer<typeof MeSchema>;

export const UpdateMeRequest = named(
  "UpdateMeRequest",
  z
    .object({
      name: z.string().trim().min(2).max(60),
      handle: Handle,
      country: z.string().trim().min(2).max(56),
      bio: z.string().trim().max(80),
      timezone: TimeZone,
    })
    .partial(),
);

export const ReplaceRolesRequest = named(
  "ReplaceRolesRequest",
  z.object({
    roles: z
      .array(ChosenRole)
      .min(1, "Keep at least one on.")
      .transform((r) => [...new Set(r)]),
  }),
);

export const UpdatePreferencesRequest = named(
  "UpdatePreferencesRequest",
  z
    .object({
      deliveryHour: DeliveryHour,
      jokeOrigin: JokeOrigin,
      topics: z.array(z.string()).max(20),
    })
    .partial(),
);

export const KenyanMobile = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .transform((d) => (d.startsWith("0") ? `254${d.slice(1)}` : d.length === 9 ? `254${d}` : d))
  .pipe(z.string().regex(/^254(7|1)\d{8}$/, "Enter a Kenyan mobile number, like 0712 345 678."));

export const PayoutMethodRequest = named(
  "PayoutMethodRequest",
  z.object({ method: z.literal("mpesa"), phone: KenyanMobile }),
);

export const CompleteOnboardingRequest = named(
  "CompleteOnboardingRequest",
  z.object({
    name: z.string().trim().min(2).max(60),
    handle: Handle,
    country: z.string().trim().min(2).max(56),
    bio: z.string().trim().max(80).default(""),
    timezone: TimeZone,
    roles: ReplaceRolesRequest.shape.roles,
    topics: z.array(z.string()).max(20).default([]),
    jokeOrigin: JokeOrigin.default("everywhere"),
    deliveryHour: DeliveryHour.default(8),
    following: z.array(z.uuid()).max(50).default([]),
    payout: PayoutMethodRequest.optional(),
  }),
  "Everything collected during onboarding, saved in one step.",
);

export const HandleAvailabilitySchema = named(
  "HandleAvailability",
  z.object({
    handle: z.string(),
    available: z.boolean(),
    reason: z.enum(["invalid", "reserved", "taken"]).optional(),
    suggestion: z.string().optional(),
  }),
);

export const TopicSchema = named("Topic", z.object({ slug: z.string(), label: z.string() }));
export const TopicListSchema = named("TopicList", z.object({ data: z.array(TopicSchema) }));
