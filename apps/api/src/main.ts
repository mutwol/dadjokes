import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { buildOpenApi, configureApp } from "./bootstrap";
import { AppConfig } from "./config/config.module";

async function main() {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false }));
  const config = app.get(AppConfig);

  if (!config.isProduction) {
    // Interactive docs at /docs, raw spec at /docs/json.
    SwaggerModule.setup("docs", app, buildOpenApi(app), { jsonDocumentUrl: "docs/json" });
  }

  const port = config.get("PORT");
  await app.listen(port);
  Logger.log(`API on http://localhost:${port} (docs at /docs)`, "Main");
}

void main();
