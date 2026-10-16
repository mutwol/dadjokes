import { randomInt } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { AppError } from "../common/errors";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { emailCodes } from "../db/schema";
import { TokensService } from "./tokens.service";

export const CODE_TTL_SECONDS = 10 * 60;
export const RESEND_AFTER_SECONDS = 30;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

/** Six-digit email codes: short-lived, single-use, and limited per address. */
@Injectable()
export class CodesService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly tokens: TokensService,
  ) {}

  async issue(email: string): Promise<string> {
    const hourAgo = new Date(Date.now() - 3_600_000);
    const recent = await this.db
      .select({ createdAt: emailCodes.createdAt })
      .from(emailCodes)
      .where(and(eq(emailCodes.email, email), gt(emailCodes.createdAt, hourAgo)))
      .orderBy(desc(emailCodes.createdAt));

    if (recent.length >= MAX_CODES_PER_HOUR) {
      throw new AppError(429, "too_many_codes", "Too many codes requested. Try again in an hour.");
    }
    const last = recent[0]?.createdAt;
    if (last && Date.now() - last.getTime() < RESEND_AFTER_SECONDS * 1000) {
      throw new AppError(429, "resend_too_soon", `Wait ${RESEND_AFTER_SECONDS} seconds before asking for a new code.`);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.db.transaction(async (tx) => {
      // Only the newest code works.
      await tx
        .update(emailCodes)
        .set({ consumedAt: new Date() })
        .where(and(eq(emailCodes.email, email), isNull(emailCodes.consumedAt)));
      await tx.insert(emailCodes).values({
        email,
        codeHash: this.tokens.hashCode(email, code),
        expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
      });
    });
    return code;
  }

  /** Consumes the code if it matches, or throws a problem the UI can show. */
  async verify(email: string, code: string): Promise<void> {
    const row = await this.db.query.emailCodes.findFirst({
      where: and(eq(emailCodes.email, email), isNull(emailCodes.consumedAt), gt(emailCodes.expiresAt, new Date())),
      orderBy: desc(emailCodes.createdAt),
    });
    if (!row) {
      throw new AppError(400, "code_expired", "That code has expired. Send a new one.");
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new AppError(429, "code_locked", "Too many wrong tries. Send a new code.");
    }
    if (!this.tokens.safeEqual(row.codeHash, this.tokens.hashCode(email, code))) {
      await this.db
        .update(emailCodes)
        .set({ attempts: sql`${emailCodes.attempts} + 1` })
        .where(eq(emailCodes.id, row.id));
      throw new AppError(400, "code_invalid", "That code didn't work. Check the latest email from us, or send a new code.");
    }
    const used = await this.db
      .update(emailCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)))
      .returning({ id: emailCodes.id });
    if (!used.length) {
      throw new AppError(400, "code_expired", "That code has already been used. Send a new one.");
    }
  }
}
