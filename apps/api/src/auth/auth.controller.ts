import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { z } from "zod";
import { AppError, ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodResponse, zod } from "../common/zod";
import { AppConfig } from "../config/config.module";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import type { SignInResult } from "./auth.service";
import { Public } from "./decorators";
import {
  AccessTokenSchema,
  GoogleSignInRequest,
  SessionSchema,
  StartEmailRequest,
  StartEmailResponse,
  VerifyEmailRequest,
} from "./schemas";
import type { IssuedSession } from "./sessions.service";

/** The refresh token lives in an httpOnly cookie scoped to the auth routes only. */
export const REFRESH_COOKIE = "dj_refresh";
const COOKIE_PATH = "/v1/auth";

@ApiTags("auth")
@Public()
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: AppConfig,
  ) {}

  @Post("email/start")
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ operationId: "startEmailSignIn", summary: "Email a 6-digit sign-in code" })
  @ApiZodBody(StartEmailRequest)
  @ApiZodResponse(202, StartEmailResponse, "Code sent")
  @ApiZodResponse(429, ProblemSchema, "Asked too soon or too often (codes: resend_too_soon, too_many_codes)")
  start(@Body(zod(StartEmailRequest)) body: z.infer<typeof StartEmailRequest>) {
    return this.auth.startEmail(body.email);
  }

  @Post("email/verify")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: "verifyEmailSignIn", summary: "Exchange the code for a session" })
  @ApiZodBody(VerifyEmailRequest)
  @ApiZodResponse(200, SessionSchema)
  @ApiZodResponse(400, ProblemSchema, "Wrong or expired code (codes: code_invalid, code_expired)")
  @ApiZodResponse(429, ProblemSchema, "Too many wrong tries (code: code_locked)")
  async verify(
    @Body(zod(VerifyEmailRequest)) body: z.infer<typeof VerifyEmailRequest>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(await this.auth.verifyEmail(body.email, body.code, req.get("user-agent")), res);
  }

  @Post("google")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: "googleSignIn", summary: "Sign in with a Google ID token" })
  @ApiZodBody(GoogleSignInRequest)
  @ApiZodResponse(200, SessionSchema)
  @ApiZodResponse(401, ProblemSchema, "Token rejected")
  async google(
    @Body(zod(GoogleSignInRequest)) body: z.infer<typeof GoogleSignInRequest>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(await this.auth.google(body.idToken, req.get("user-agent")), res);
  }

  @Post("refresh")
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ operationId: "refreshSession", summary: "New access token from the refresh cookie" })
  @ApiZodResponse(200, AccessTokenSchema)
  @ApiZodResponse(401, ProblemSchema, "Signed out or expired (code: session_expired)")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req);
    if (!token) throw new AppError(401, "session_expired", "Your session has expired. Sign in again.");
    try {
      const { accessToken, expiresInSeconds, session } = await this.auth.refresh(token);
      this.setCookie(res, session);
      return { accessToken, expiresInSeconds };
    } catch (e) {
      this.clearCookie(res);
      throw e;
    }
  }

  @Post("logout")
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ operationId: "logout", summary: "Sign out this device" })
  @ApiNoContentResponse({ description: "Signed out" })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readCookie(req));
    this.clearCookie(res);
  }

  private async respond(result: SignInResult, res: Response) {
    this.setCookie(res, result.session);
    return {
      accessToken: result.accessToken,
      expiresInSeconds: result.expiresInSeconds,
      isNew: result.isNew,
      user: await this.users.getMe(result.userId),
    };
  }

  private setCookie(res: Response, session: IssuedSession) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: "lax",
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }
}

function readCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === "string" ? value : undefined;
}
