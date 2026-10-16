import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { MailProcessor } from "./mail.processor";
import { MAIL_QUEUE, MailService } from "./mail.service";

/** API side: can queue email. */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailService],
  exports: [MailService, BullModule],
})
export class MailModule {}

/** Worker side: also sends it. */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailProcessor],
})
export class MailWorkerModule {}
