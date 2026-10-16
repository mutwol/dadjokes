import "reflect-metadata";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { buildOpenApi, configureApp } from "./bootstrap";

/**
 * Writes the OpenAPI spec to packages/contracts/openapi.json without starting
 * the server. The web client's types are generated from that file.
 */
async function main() {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error"] }));
  await app.init();
  const out = path.resolve(__dirname, "../../../packages/contracts/openapi.json");
  writeFileSync(out, `${JSON.stringify(buildOpenApi(app), null, 2)}\n`);
  await app.close();
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}

void main();
