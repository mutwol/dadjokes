import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { eq } from "drizzle-orm";
import { AppError } from "../common/errors";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { userRoles } from "../db/schema";
import type { Role } from "../db/schema";
import { IS_PUBLIC, REQUIRED_ROLES } from "./decorators";
import type { AuthedRequest } from "./decorators";
import { TokensService } from "./tokens.service";

/**
 * Runs on every route unless it is marked @Public(). Verifies the bearer
 * access token and loads the caller's current roles from the database, so a
 * role change takes effect on the next request rather than after the token expires.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    @InjectDb() private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new AppError(401, "unauthenticated", "Sign in to continue.");
    }

    const claims = await this.tokens.verifyAccess(token);
    const rows = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, claims.sub));
    req.auth = { userId: claims.sub, sessionId: claims.sid, roles: rows.map((r) => r.role) };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;
    const roles = ctx.switchToHttp().getRequest<AuthedRequest>().auth?.roles ?? [];
    if (required.some((r) => roles.includes(r))) return true;
    throw new AppError(403, "role_required", `This needs the ${required.join(" or ")} role.`, {
      detail: required.includes("writer") ? "Turn on writing in your profile first." : undefined,
    });
  }
}
