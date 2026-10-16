import { Global, Injectable, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { validateEnv } from "./env";
import type { Env } from "./env";

/** Typed access to validated settings: `config.get("JWT_SECRET")`. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get("NODE_ENV") === "production";
  }
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests set their environment explicitly.
      ignoreEnvFile: process.env.NODE_ENV === "test",
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
