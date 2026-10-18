import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import { AppConfig } from "../config/config.module";
import { MAIL_QUEUE } from "./mail.service";
import type { LoginCodeJob, MessageJob } from "./mail.service";
import { loginCodeEmail, messageEmail } from "./templates";

/** Runs in the worker process only. Sends queued email over SMTP. */
@Injectable()
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly transport: Transporter;

  constructor(private readonly config: AppConfig) {
    super();
    this.transport = createTransport(config.get("SMTP_URL"));
  }

  override async process(job: Job): Promise<void> {
    switch (job.name) {
      case "login-code": {
        const { email, code } = job.data as LoginCodeJob;
        await this.transport.sendMail({ from: this.config.get("MAIL_FROM"), to: email, ...loginCodeEmail(code) });
        this.logger.log(`Sent sign-in code to ${email}`);
        return;
      }
      case "message": {
        const m = job.data as MessageJob;
        await this.transport.sendMail({ from: this.config.get("MAIL_FROM"), to: m.to, ...messageEmail(m) });
        return;
      }
      default:
        throw new Error(`Unknown mail job: ${job.name}`);
    }
  }
}
