import { Global, Inject, Injectable, Module } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AppConfig } from "../config/config.module";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction; services accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

export const DB = Symbol("DB");
export const InjectDb = () => Inject(DB);

/** Owns the connection pool so it is closed cleanly on shutdown. */
@Injectable()
export class PgPool implements OnApplicationShutdown {
  readonly pool: Pool;

  constructor(config: AppConfig) {
    this.pool = new Pool({ connectionString: config.get("DATABASE_URL"), max: 10 });
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    PgPool,
    {
      provide: DB,
      inject: [PgPool],
      useFactory: (pg: PgPool): Db => drizzle(pg.pool, { schema, casing: "snake_case" }),
    },
  ],
  exports: [DB, PgPool],
})
export class DbModule {}
