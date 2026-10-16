import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { queueRoot } from "./app.module";
import { AppConfigModule } from "./config/config.module";
import { DbModule } from "./db/db.module";
import { DeliveriesWorkerModule } from "./deliveries/deliveries.module";
import { EngagementWorkerModule } from "./engagement/engagement.module";
import { MailWorkerModule } from "./mail/mail.module";
import { NotificationsWorkerModule } from "./notifications/notifications.module";
import { PaymentsWorkerModule } from "./payments/payments.module";
import { StorageCoreModule } from "./storage/storage.module";

/**
 * The background worker: same codebase and modules as the API, no HTTP.
 * Sends email and push, delivers the daily joke, rolls up stats, and
 * settles M-Pesa tips and payouts.
 */
@Module({
  imports: [AppConfigModule, DbModule, queueRoot, StorageCoreModule, NotificationsWorkerModule, MailWorkerModule, DeliveriesWorkerModule, EngagementWorkerModule, PaymentsWorkerModule],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log("Worker started", "Worker");
}

void main();
