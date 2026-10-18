import { z } from "zod";
import { named } from "../common/zod";

export const CreateAppealRequest = named(
  "CreateAppealRequest",
  z.object({ message: z.string().trim().min(10, "Tell the curators why, in a sentence or two.").max(1000) }),
);
export type CreateAppealRequest = z.infer<typeof CreateAppealRequest>;

export const AppealSchema = named(
  "Appeal",
  z.object({
    id: z.uuid(),
    jokeId: z.uuid(),
    preview: z.string(),
    authorHandle: z.string(),
    message: z.string(),
    status: z.enum(["open", "upheld", "overturned"]),
    resolutionNote: z.string().nullable(),
    resolvedBy: z.string().nullable(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().nullable(),
  }),
  "A writer asking curators to look again at a joke that was taken down.",
);
export type AppealOut = z.infer<typeof AppealSchema>;
export const AppealListSchema = named("AppealList", z.object({ data: z.array(AppealSchema) }));

export const AppealsQuery = z.object({ status: z.enum(["open", "upheld", "overturned"]).optional() });
export type AppealsQuery = z.infer<typeof AppealsQuery>;

export const ResolveAppealRequest = named(
  "ResolveAppealRequest",
  z.object({
    decision: z.enum(["uphold", "overturn"]).describe("uphold keeps it down; overturn puts it back up."),
    note: z.string().trim().max(500).optional().describe("Shown to the writer."),
  }),
);
export type ResolveAppealRequest = z.infer<typeof ResolveAppealRequest>;
