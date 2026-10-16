import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { OnApplicationBootstrap } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { PAYMENTS_QUEUE, PaymentsService } from "./payments.service";
import type { PaymentJob } from "./payments.service";

/** Worker only: verifies tips, sends payouts, and sweeps up anything a callback missed. */
@Injectable()
@Processor(PAYMENTS_QUEUE, { concurrency: 5 })
export class PaymentsProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly payments: PaymentsService,
    @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      "reconcile",
      { every: 60_000 },
      { name: "reconcile", data: { name: "reconcile" }, opts: { removeOnComplete: 20, removeOnFail: 50 } },
    );
  }

  override async process(job: Job<PaymentJob>) {
    const data = job.data;
    switch (data.name) {
      case "verify-tip":
        return this.payments.verifyTip(data.tipId);
      case "send-payout":
        return this.payments.sendPayout(data.payoutId);
      case "reconcile":
        return this.payments.reconcile();
    }
  }
}
