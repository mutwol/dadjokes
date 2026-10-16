import { z } from "zod";
import { named } from "../common/zod";
import { Tone } from "../users/schemas";

export const CreatorSchema = named(
  "Creator",
  z.object({
    id: z.uuid(),
    name: z.string(),
    handle: z.string(),
    country: z.string().nullable(),
    bio: z.string(),
    tone: Tone,
    subscriberCount: z.number().int(),
    isSubscribed: z.boolean(),
  }),
  "A writer, as shown on lists and profiles.",
);
export type Creator = z.infer<typeof CreatorSchema>;

export const CreatorPageSchema = named(
  "CreatorPage",
  z.object({ data: z.array(CreatorSchema), nextCursor: z.string().nullable() }),
);

export const CreatorListSchema = named("CreatorList", z.object({ data: z.array(CreatorSchema) }));

export const ListCreatorsQuery = z.object({
  sort: z.enum(["popular", "new"]).default("popular"),
  country: z.string().min(2).max(56).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});
export type ListCreatorsQuery = z.infer<typeof ListCreatorsQuery>;
