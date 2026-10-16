import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { AppConfig } from "../config/config.module";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { pushSubscriptions } from "../db/schema";
import { PUSH_QUEUE } from "./notifications.service";
import type { PushJob } from "./notifications.service";

/** Worker only: sends Web Push to each of a person's browsers, forgetting ones that have gone. */
@Injectable()
@Processor(PUSH_QUEUE, { concurrency: 20 })
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: AppConfig,
  ) {
    super();
  }

  override async process(job: Job<PushJob>) {
    const publicKey = this.config.get("VAPID_PUBLIC_KEY");
    const privateKey = this.config.get("VAPID_PRIVATE_KEY");
    if (!publicKey || !privateKey) return;
    const subs = await this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, job.data.userId));
    const gone: string[] = [];
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(job.data.payload),
          { vapidDetails: { subject: this.config.get("VAPID_SUBJECT"), publicKey, privateKey }, TTL: 6 * 3600, urgency: "normal" },
        );
        sent++;
        await this.db.update(pushSubscriptions).set({ lastSuccessAt: new Date() }).where(eq(pushSubscriptions.id, s.id));
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else this.logger.warn(`Push to ${new URL(s.endpoint).host} failed: ${status ?? (e as Error).message}`);
      }
    }
    if (gone.length) await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    return { sent, removed: gone.length };
  }
}
