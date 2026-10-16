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

  /**
   * Where uploaded images go. "local" writes to UPLOAD_DIR and the API serves them
   * at /media (fine for development and a single server). "s3" uses any
   * S3-compatible store: AWS S3, Cloudflare R2, MinIO.
   */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR: z.string().default("./uploads"),
  /** Public URL prefix for stored images, e.g. https://media.daddyjokes.app. */
  MEDIA_BASE_URL: z.string().default("/media"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  /** Only for non-AWS stores, e.g. https://<account>.r2.cloudflarestorage.com */
  S3_ENDPOINT: z.string().optional().transform((v) => v || undefined),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  /** Web Push (VAPID). Generate with `pnpm --filter api push:keys`. Push is off when unset. */
  VAPID_PUBLIC_KEY: z.string().optional().transform((v) => v || undefined),
  VAPID_PRIVATE_KEY: z.string().optional().transform((v) => v || undefined),
  VAPID_SUBJECT: z.string().default("mailto:hello@daddyjokes.local"),

  /**
   * M-Pesa (Safaricom Daraja). "fake" needs no account: tips and payouts settle
   * by themselves after a few seconds (phones ending 0000 fail, 1111 cancel).
   */
  MPESA_MODE: z.enum(["fake", "sandbox", "production"]).default("fake"),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  /** Paybill or till for STK push (tips). */
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  /** Public base URL Safaricom calls back, e.g. https://daddyjokes.app */
  MPESA_CALLBACK_BASE_URL: z.string().optional(),
  /** B2C (payouts to writers). */
  MPESA_B2C_SHORTCODE: z.string().optional(),
  MPESA_B2C_INITIATOR: z.string().optional(),
  MPESA_B2C_SECURITY_CREDENTIAL: z.string().optional(),
  /** Platform share of each tip, in percent. */
  TIP_FEE_PERCENT: z.coerce.number().min(0).max(50).default(10),
  PAYOUT_MIN_KES: z.coerce.number().int().min(1).default(100),

  /** Turns request rate limits off. Only for automated tests. */
  THROTTLE_DISABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const CheckedEnv = EnvSchema.superRefine((env, ctx) => {
  const require = (keys: readonly (keyof typeof env)[], why: string) => {
    for (const key of keys) if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `Required when ${why}` });
  };
  if (env.STORAGE_DRIVER === "s3") require(["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"], "STORAGE_DRIVER=s3");
  if (env.MPESA_MODE !== "fake") {
    require(
      [
        "MPESA_CONSUMER_KEY",
        "MPESA_CONSUMER_SECRET",
        "MPESA_SHORTCODE",
        "MPESA_PASSKEY",
        "MPESA_CALLBACK_BASE_URL",
        "MPESA_B2C_SHORTCODE",
        "MPESA_B2C_INITIATOR",
        "MPESA_B2C_SECURITY_CREDENTIAL",
      ],
      `MPESA_MODE=${env.MPESA_MODE}`,
    );
  }
  if (Boolean(env.VAPID_PUBLIC_KEY) !== Boolean(env.VAPID_PRIVATE_KEY)) {
    ctx.addIssue({ code: "custom", path: ["VAPID_PRIVATE_KEY"], message: "Set both VAPID keys, or neither" });
  }
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = CheckedEnv.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}
