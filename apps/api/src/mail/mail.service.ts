import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import { AppConfig } from "../config/config.module";

export const MAIL_QUEUE = "mail";

export interface LoginCodeJob {
  email: string;
  code: string;
}

export interface MailJobs {
  "login-code": LoginCodeJob;
}

/**
 * Queues outgoing email for the worker, so a slow mail provider never slows
 * down sign-in and failed sends are retried.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue,
    private readonly config: AppConfig,
  ) {}

  async sendLoginCode(email: string, code: string) {
    if (this.config.get("NODE_ENV") === "development") {
      this.logger.log(`Sign-in code for ${email}: ${code}`);
    }
    await this.queue.add("login-code", { email, code } satisfies LoginCodeJob, {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      // Keep failures briefly for debugging, without the code lingering for long.
      removeOnFail: { age: 3600 },
    });
  }
}
