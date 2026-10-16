import { createParamDecorator, SetMetadata } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { Role } from "../db/schema";

/** Who is calling, set by AuthGuard on every authenticated request. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  roles: Role[];
}

export type AuthedRequest = Request & { auth?: AuthContext };

export const IS_PUBLIC = "auth:public";
export const REQUIRED_ROLES = "auth:roles";

/** Skips authentication for a route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires at least one of these roles, e.g. `@Roles("writer")`. */
export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);

/** Injects the AuthContext of the caller. */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.auth) throw new Error("@Auth() used on a public route");
  return req.auth;
});
