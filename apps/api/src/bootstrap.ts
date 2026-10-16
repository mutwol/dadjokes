import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { ProblemFilter } from "./common/errors";
import { openApiComponents } from "./common/zod";
import { AppConfig } from "./config/config.module";

/** Middleware and conventions shared by the server, the OpenAPI export and tests. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(AppConfig);
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.enableCors({ origin: config.get("WEB_ORIGIN"), credentials: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Daddy Jokes API")
      .setDescription(
        "One dad joke a day. Errors use RFC 9457 problem details with a stable `code`. " +
          "Send the access token as `Authorization: Bearer <token>`; refresh it with POST /v1/auth/refresh.",
      )
      .setVersion("1")
      .addBearerAuth()
      .addCookieAuth("dj_refresh")
      .build(),
  );
  doc.components = { ...doc.components, schemas: { ...doc.components?.schemas, ...openApiComponents() } };
  return doc;
}
