import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { AppConfig } from "../config/config.module";

/**
 * "Something changed on this joke" signals across API processes, over Redis
 * pub/sub. Listeners then reload the counts themselves, so messages stay tiny
 * and a missed one only delays an update.
 */
@Injectable()
export class LiveService implements OnModuleDestroy {
  private readonly logger = new Logger(LiveService.name);
  private pub?: Redis;
  private sub?: Redis;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(private readonly config: AppConfig) {}

  private connect() {
    if (this.pub) return;
    const url = this.config.get("REDIS_URL");
    this.pub = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    this.sub = new Redis(url, { maxRetriesPerRequest: null });
    this.sub.on("message", (channel: string) => {
      for (const fn of this.listeners.get(channel) ?? []) fn();
    });
    for (const r of [this.pub, this.sub]) r.on("error", (e: Error) => this.logger.warn(`Redis: ${e.message}`));
  }

  /** Tells everyone watching this joke to refresh. Never fails the request that changed it. */
  changed(jokeId: string) {
    this.connect();
    this.pub!.publish(channel(jokeId), "1").catch(() => undefined);
  }

  /** Calls `fn` whenever the joke changes. Returns a function that stops listening. */
  listen(jokeId: string, fn: () => void): () => void {
    this.connect();
    const ch = channel(jokeId);
    let set = this.listeners.get(ch);
    if (!set) {
      set = new Set();
      this.listeners.set(ch, set);
      void this.sub!.subscribe(ch).catch(() => undefined);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (!set.size) {
        this.listeners.delete(ch);
        void this.sub?.unsubscribe(ch).catch(() => undefined);
      }
    };
  }

  async onModuleDestroy() {
    await Promise.all([this.pub?.quit(), this.sub?.quit()].map((p) => p?.catch(() => undefined)));
  }
}

const channel = (jokeId: string) => `dj:joke:${jokeId}`;
