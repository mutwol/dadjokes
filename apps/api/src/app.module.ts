import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { AppConfig, AppConfigModule } from "./config/config.module";
import { CreatorsModule } from "./creators/creators.module";
import { DbModule } from "./db/db.module";
import { CurationModule } from "./curation/curation.module";
import { JokesModule } from "./jokes/jokes.module";
import { HealthController } from "./health/health.controller";
import { MailModule } from "./mail/mail.module";
import { UsersModule } from "./users/users.module";

/** Redis connection shared by queues in the API and the worker. */
export const queueRoot = BullModule.forRootAsync({
  inject: [AppConfig],
  useFactory: (config: AppConfig) => {
    const url = new URL(config.get("REDIS_URL"));
    return {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        username: url.username || undefined,
        password: url.password || undefined,
        db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
        maxRetriesPerRequest: null,
      },
      prefix: "dj",
    };
  },
});

@Module({
  imports: [
    AppConfigModule,
    DbModule,
    queueRoot,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: "default", ttl: 60_000, limit: 120 }],
        skipIf: () => config.get("THROTTLE_DISABLED"),
      }),
    }),
    MailModule,
    UsersModule,
    CreatorsModule,
    JokesModule,
    CurationModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
