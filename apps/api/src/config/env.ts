import { z } from "zod";

/**
 * Every setting the API and worker read, validated once at startup.
 * A missing or malformed value stops the process with a clear message
 * instead of failing later on the first request that needs it.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),

  DATABASE_URL: z.string().startsWith("postgres"),
  REDIS_URL: z.string().startsWith("redis").default("redis://localhost:6379"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  CODE_SECRET: z.string().min(32, "CODE_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  GOOGLE_CLIENT_ID: z.string().optional().transform((v) => v || undefined),

  SMTP_URL: z.string().default("smtp://localhost:1025"),
  MAIL_FROM: z.string().default("Daddy Jokes <hello@daddyjokes.local>"),

  /** Turns request rate limits off. Only for automated tests. */
  THROTTLE_DISABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}
