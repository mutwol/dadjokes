import { Catch, HttpException, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "./app-error";
import { named } from "./zod";

export { AppError, notFound } from "./app-error";

/**
 * Errors are returned as RFC 9457 problem details. `code` is stable and
 * machine-readable, so the web app can map it to its own copy.
 */
export const ProblemSchema = named(
  "Problem",
  z.object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
  "An error response (RFC 9457 problem details).",
);
export type Problem = z.infer<typeof ProblemSchema>;

/** Unique constraints that map to a specific, user-facing conflict. */
const UNIQUE_CONSTRAINTS: Record<string, [string, string]> = {
  users_handle_key: ["handle_taken", "That username is taken."],
  jokes_one_per_day_key: ["day_taken", "Another joke is already going out that day."],
};

const STATUS_CODES: Record<number, [string, string]> = {
  400: ["bad_request", "The request is not valid."],
  401: ["unauthenticated", "Sign in to continue."],
  403: ["forbidden", "You don't have access to this."],
  404: ["not_found", "Not found."],
  409: ["conflict", "This conflicts with existing data."],
  429: ["rate_limited", "Too many requests. Try again in a minute."],
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger("Problem");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const problem = this.toProblem(exception);
    problem.instance = req.originalUrl;
    if (problem.status >= 500) this.logger.error(exception);
    res.status(problem.status).type("application/problem+json").json(problem);
  }

  private toProblem(e: unknown): Problem {
    if (e instanceof AppError) {
      return { type: typeUri(e.code), title: e.title, status: e.status, code: e.code, ...e.extra };
    }
    if (e instanceof ThrottlerException) {
      return fromStatus(429);
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const base = fromStatus(status);
      const body = e.getResponse();
      const message = typeof body === "object" && body && "message" in body ? body.message : undefined;
      return typeof message === "string" && status < 500 ? { ...base, detail: message } : base;
    }
    const pg = pgError(e);
    if (pg?.code === "23505") {
      const known = UNIQUE_CONSTRAINTS[pg.constraint ?? ""];
      return known ? { type: typeUri(known[0]), title: known[1], status: 409, code: known[0] } : fromStatus(409);
    }
    return { type: typeUri("internal"), title: "Something went wrong on our side.", status: 500, code: "internal" };
  }
}

function fromStatus(status: number): Problem {
  const [code, title] = STATUS_CODES[status] ?? ["error", "The request failed."];
  return { type: typeUri(code), title, status, code };
}

function typeUri(code: string) {
  return `https://daddyjokes.app/problems/${code}`;
}

/** The Postgres error behind an exception, also when wrapped by the query builder. */
function pgError(e: unknown): { code: string; constraint?: string } | undefined {
  for (let x: unknown = e, i = 0; x && typeof x === "object" && i < 3; x = (x as { cause?: unknown }).cause, i++) {
    const { code, constraint } = x as { code?: unknown; constraint?: unknown };
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return { code, constraint: typeof constraint === "string" ? constraint : undefined };
    }
  }
  return undefined;
}
