import { inArray } from "drizzle-orm";
import { AppError } from "../common/app-error";
import type { Tx } from "./db.module";
import { topics } from "./schema";

/** 422s with one error per unknown topic slug. */
export async function assertTopicsExist(tx: Tx, slugs: string[], path = "topics") {
  if (!slugs.length) return;
  const found = await tx.select({ slug: topics.slug }).from(topics).where(inArray(topics.slug, slugs));
  const missing = slugs.filter((s) => !found.some((f) => f.slug === s));
  if (missing.length) {
    throw new AppError(422, "unknown_topic", "Some topics don't exist.", {
      errors: missing.map((m) => ({ path, message: `Unknown topic: ${m}` })),
    });
  }
}
