import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { DB } from "../src/db/db.module";
import type { Db } from "../src/db/db.module";
import { seed } from "../src/db/seed";
import { MailService } from "../src/mail/mail.service";

/** Captures sign-in codes instead of queueing email. */
export class FakeMail {
  readonly codes = new Map<string, string>();
  async sendLoginCode(email: string, code: string) {
    this.codes.set(email, code);
  }
}

export interface TestApp {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  mail: FakeMail;
  db: Db;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const mail = new FakeMail();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  return {
    app,
    http: request(app.getHttpServer()),
    mail,
    db: app.get<Db>(DB),
    close: () => app.close(),
  };
}

/** Empties every table, then loads the development seed (topics and writers). */
export async function resetDb(db: Db) {
  await db.execute(sql`
    truncate table users, topics, email_codes restart identity cascade
  `);
  await seed(process.env.DATABASE_URL!);
}

/** Signs in through the real email-code flow and returns the session. */
export async function signIn(t: TestApp, email: string) {
  await t.http.post("/v1/auth/email/start").send({ email }).expect(202);
  const code = t.mail.codes.get(email.toLowerCase())!;
  const res = await t.http.post("/v1/auth/email/verify").send({ email, code }).expect(200);
  const cookie = res.headers["set-cookie"] as unknown as string[];
  return {
    token: res.body.accessToken as string,
    user: res.body.user,
    isNew: res.body.isNew as boolean,
    cookie: cookie.find((c) => c.startsWith("dj_refresh="))!.split(";")[0],
  };
}

export const onboardingBody = (overrides: Record<string, unknown> = {}) => ({
  name: "Cyrus Mutwol",
  handle: "cyrus_m",
  country: "Kenya",
  timezone: "Africa/Nairobi",
  roles: ["reader"],
  topics: ["wordplay"],
  deliveryHour: 7,
  ...overrides,
});

/** Signs up and onboards someone, optionally with extra staff roles. Returns their auth header. */
export async function signUp(
  t: TestApp,
  email: string,
  opts: { roles?: ("reader" | "writer")[]; staff?: ("curator" | "admin")[]; handle?: string } = {},
) {
  const { token, user } = await signIn(t, email);
  const auth = { Authorization: `Bearer ${token}` };
  await t.http
    .post("/v1/me/onboarding")
    .set(auth)
    .send(onboardingBody({ roles: opts.roles ?? ["reader"], handle: opts.handle ?? email.split("@")[0].replace(/\W/g, "_").slice(0, 20) }))
    .expect(200);
  for (const role of opts.staff ?? []) {
    await t.db.execute(sql`insert into user_roles (user_id, role) values (${user.id}, ${role}) on conflict do nothing`);
  }
  return { auth, userId: user.id as string };
}
