import { Injectable } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import { AppError } from "../common/errors";
import { AppConfig } from "../config/config.module";
import { MailService } from "../mail/mail.service";
import { UsersService } from "../users/users.service";
import { CODE_TTL_SECONDS, CodesService, RESEND_AFTER_SECONDS } from "./codes.service";
import { SessionsService } from "./sessions.service";
import type { IssuedSession } from "./sessions.service";
import { TokensService } from "./tokens.service";

export interface SignInResult {
  accessToken: string;
  expiresInSeconds: number;
  isNew: boolean;
  userId: string;
  session: IssuedSession;
}

@Injectable()
export class AuthService {
  private readonly googleClient?: OAuth2Client;

  constructor(
    private readonly codes: CodesService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokensService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {
    const clientId = config.get("GOOGLE_CLIENT_ID");
    if (clientId) this.googleClient = new OAuth2Client(clientId);
  }

  /** Sends a code. Responds the same whether or not the email has an account. */
  async startEmail(email: string) {
    const code = await this.codes.issue(email);
    await this.mail.sendLoginCode(email, code);
    return { expiresInSeconds: CODE_TTL_SECONDS, resendAfterSeconds: RESEND_AFTER_SECONDS };
  }

  async verifyEmail(email: string, code: string, userAgent?: string): Promise<SignInResult> {
    await this.codes.verify(email, code);
    const { userId, isNew } = await this.users.findOrCreateByEmail(email);
    return this.signIn(userId, isNew, userAgent);
  }

  async google(idToken: string, userAgent?: string): Promise<SignInResult> {
    if (!this.googleClient) {
      throw new AppError(501, "google_disabled", "Google sign-in isn't set up on this server.");
    }
    const audience = this.config.get("GOOGLE_CLIENT_ID");
    let payload;
    try {
      payload = (await this.googleClient.verifyIdToken({ idToken, audience })).getPayload();
    } catch {
      throw new AppError(401, "google_token_invalid", "Google sign-in didn't work. Try again.");
    }
    if (!payload?.email || !payload.email_verified) {
      throw new AppError(401, "google_email_unverified", "Your Google account's email isn't verified.");
    }
    const { userId, isNew } = await this.users.findOrCreateByEmail(payload.email.toLowerCase(), payload.name);
    return this.signIn(userId, isNew, userAgent);
  }

  async refresh(refreshToken: string) {
    const session = await this.sessions.rotate(refreshToken);
    const accessToken = await this.tokens.signAccess({ sub: session.userId, sid: session.sessionId });
    return { accessToken, expiresInSeconds: this.tokens.accessTtlSeconds, session };
  }

  logout(refreshToken: string | undefined) {
    return refreshToken ? this.sessions.revokeByToken(refreshToken) : Promise.resolve();
  }

  private async signIn(userId: string, isNew: boolean, userAgent?: string): Promise<SignInResult> {
    const session = await this.sessions.create(userId, userAgent);
    const accessToken = await this.tokens.signAccess({ sub: userId, sid: session.sessionId });
    return { accessToken, expiresInSeconds: this.tokens.accessTtlSeconds, isNew, userId, session };
  }
}
