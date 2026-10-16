import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { AppError } from "../common/errors";
import { AppConfig } from "../config/config.module";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { sessions } from "../db/schema";
import { TokensService } from "./tokens.service";

export interface IssuedSession {
  userId: string;
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const expired = () => new AppError(401, "session_expired", "Your session has expired. Sign in again.");

/**
 * Refresh tokens rotate on every use. Presenting an old token for a live
 * session means it was copied, so the whole session is revoked.
 */
@Injectable()
export class SessionsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly tokens: TokensService,
    private readonly config: AppConfig,
  ) {}

  private expiry() {
    return new Date(Date.now() + this.config.get("REFRESH_TOKEN_TTL_DAYS") * 86_400_000);
  }

  async create(userId: string, userAgent?: string): Promise<IssuedSession> {
    const secret = this.tokens.newSecret();
    const expiresAt = this.expiry();
    const [row] = await this.db
      .insert(sessions)
      .values({ userId, secretHash: this.tokens.hashSecret(secret), userAgent: userAgent?.slice(0, 300), expiresAt })
      .returning({ id: sessions.id });
    return { userId, sessionId: row.id, refreshToken: `${row.id}.${secret}`, refreshExpiresAt: expiresAt };
  }

  async rotate(refreshToken: string): Promise<IssuedSession> {
    const { sessionId, secret } = parse(refreshToken);
    const session = await this.db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw expired();

    if (!this.tokens.safeEqual(session.secretHash, this.tokens.hashSecret(secret))) {
      await this.revoke(sessionId);
      throw expired();
    }

    const next = this.tokens.newSecret();
    const expiresAt = this.expiry();
    // Compare-and-swap on the old hash, so two concurrent refreshes can't both win.
    const updated = await this.db
      .update(sessions)
      .set({ secretHash: this.tokens.hashSecret(next), expiresAt, lastUsedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.secretHash, session.secretHash), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (!updated.length) throw expired();

    return { userId: session.userId, sessionId, refreshToken: `${sessionId}.${next}`, refreshExpiresAt: expiresAt };
  }

  async revoke(sessionId: string) {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async revokeByToken(refreshToken: string) {
    try {
      await this.revoke(parse(refreshToken).sessionId);
    } catch {
      // Signing out with a malformed token is still a successful sign-out.
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse(token: string) {
  const [sessionId, secret] = token.split(".");
  if (!sessionId || !secret || !UUID.test(sessionId)) throw expired();
  return { sessionId, secret };
}
