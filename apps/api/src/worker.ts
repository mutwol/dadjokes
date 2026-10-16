import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { queueRoot } from "./app.module";
import { AppConfigModule } from "./config/config.module";
import { DbModule } from "./db/db.module";
import { DeliveriesWorkerModule } from "./deliveries/deliveries.module";
import { MailWorkerModule } from "./mail/mail.module";
import { StorageCoreModule } from "./storage/storage.module";

/**
 * The background worker: same codebase and modules as the API, no HTTP.
 * Sends email and delivers the daily joke every few minutes.
 */
@Module({
  imports: [AppConfigModule, DbModule, queueRoot, StorageCoreModule, MailWorkerModule, DeliveriesWorkerModule],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log("Worker started", "Worker");
}

void main();
