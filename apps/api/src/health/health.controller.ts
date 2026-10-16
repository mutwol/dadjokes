import { InjectQueue } from "@nestjs/bullmq";
import { Controller, Get, Res, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Queue } from "bullmq";
import { sql } from "drizzle-orm";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { MAIL_QUEUE } from "../mail/mail.service";

/** For load balancers and uptime checks: 200 when Postgres and Redis answer. */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([
      this.db.execute(sql`select 1`).then(() => "ok" as const, () => "down" as const),
      this.queue.getVersion().then(() => "ok" as const, () => "down" as const),
    ]);
    const ok = db === "ok" && redis === "ok";
    res.status(ok ? 200 : 503);
    return { status: ok ? "ok" : "degraded", db, redis };
  }
}
