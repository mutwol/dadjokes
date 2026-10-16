import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { queueRoot } from "./app.module";
import { AppConfigModule } from "./config/config.module";
import { DbModule } from "./db/db.module";
import { MailWorkerModule } from "./mail/mail.module";

/**
 * The background worker: same codebase and modules as the API, no HTTP.
 * Later it also runs the hourly delivery job, push fan-out and stats rollups.
 */
@Module({
  imports: [AppConfigModule, DbModule, queueRoot, MailWorkerModule],
})
class WorkerModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log("Worker started", "Worker");
}

void main();
