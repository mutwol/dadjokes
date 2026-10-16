import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { OnApplicationBootstrap } from "@nestjs/common";
import type { Queue } from "bullmq";
import { DeliveriesService } from "./deliveries.service";

export const DELIVERY_QUEUE = "deliveries";
/** How often the worker delivers jokes whose hour has come. Delivery hours are whole hours, so this is plenty. */
export const DELIVERY_EVERY_MS = 5 * 60_000;

/** Worker only: runs delivery on a schedule. One scheduler entry, however many workers run. */
@Injectable()
@Processor(DELIVERY_QUEUE, { concurrency: 1 })
export class DeliveriesProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly deliveries: DeliveriesService,
    @InjectQueue(DELIVERY_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      "deliver-due",
      { every: DELIVERY_EVERY_MS },
      { name: "deliver-due", opts: { removeOnComplete: 100, removeOnFail: 100 } },
    );
    // Catch up straight away after a restart instead of waiting for the first tick.
    await this.queue.add("deliver-due", {}, { removeOnComplete: true, removeOnFail: 100 });
  }

  override async process() {
    const delivered = await this.deliveries.run();
    return { delivered: delivered.length };
  }
}
