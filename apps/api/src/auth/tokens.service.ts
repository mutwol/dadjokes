import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AppError } from "../common/errors";
import { AppConfig } from "../config/config.module";

export interface AccessClaims {
  sub: string;
  sid: string;
}

/** Signing and hashing helpers. Nothing secret is ever stored in plain text. */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  get accessTtlSeconds() {
    return this.config.get("ACCESS_TOKEN_TTL_SECONDS");
  }

  signAccess(claims: AccessClaims): Promise<string> {
    return this.jwt.signAsync(claims, { expiresIn: this.accessTtlSeconds });
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { sub, sid } = await this.jwt.verifyAsync<AccessClaims>(token);
      return { sub, sid };
    } catch {
      throw new AppError(401, "token_invalid", "Your session has expired. Sign in again.");
    }
  }

  /** HMAC of a sign-in code, bound to the email it was sent to. */
  hashCode(email: string, code: string): string {
    return createHmac("sha256", this.config.get("CODE_SECRET")).update(`${email}:${code}`).digest("hex");
  }

  newSecret(): string {
    return randomBytes(32).toString("base64url");
  }

  hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
}
