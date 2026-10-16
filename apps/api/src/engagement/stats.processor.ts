import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { OnApplicationBootstrap } from "@nestjs/common";
import type { Queue } from "bullmq";
import { EngagementService } from "./engagement.service";

export const STATS_QUEUE = "stats";

/** Worker only: rebuilds recent daily stats for Studio every 15 minutes. */
@Injectable()
@Processor(STATS_QUEUE, { concurrency: 1 })
export class StatsProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly engagement: EngagementService,
    @InjectQueue(STATS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      "rollup",
      { every: 15 * 60_000 },
      { name: "rollup", opts: { removeOnComplete: 50, removeOnFail: 50 } },
    );
    // Fresh numbers right after a restart, without waiting for the first tick.
    await this.queue.add("rollup", {}, { removeOnComplete: true, removeOnFail: 50 });
  }

  override async process() {
    await this.engagement.rollup();
  }
}
