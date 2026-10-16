import { z } from "zod";
import { named } from "../common/zod";
import { MeSchema } from "../users/schemas";

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter an email address like name@example.com."));

export const StartEmailRequest = named("StartEmailRequest", z.object({ email: Email }));

export const StartEmailResponse = named(
  "StartEmailResponse",
  z.object({
    expiresInSeconds: z.number().int(),
    resendAfterSeconds: z.number().int(),
  }),
);

export const VerifyEmailRequest = named(
  "VerifyEmailRequest",
  z.object({
    email: Email,
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
  }),
);

export const GoogleSignInRequest = named("GoogleSignInRequest", z.object({ idToken: z.string().min(10) }));

export const SessionSchema = named(
  "Session",
  z.object({
    accessToken: z.string(),
    expiresInSeconds: z.number().int(),
    /** True the first time this email signs in: send them to onboarding. */
    isNew: z.boolean(),
    user: MeSchema,
  }),
  "A signed-in session. The refresh token is set as an httpOnly cookie.",
);

export const AccessTokenSchema = named(
  "AccessToken",
  z.object({ accessToken: z.string(), expiresInSeconds: z.number().int() }),
);
