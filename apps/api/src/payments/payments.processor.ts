import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { OnApplicationBootstrap } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { MoneyAdminService } from "./money-admin.service";
import { PAYMENTS_QUEUE, PaymentsService } from "./payments.service";
import type { PaymentJob } from "./payments.service";

/** Worker only: verifies tips, sends payouts, releases holds, sweeps up anything a callback missed, and checks the books daily. */
@Injectable()
@Processor(PAYMENTS_QUEUE, { concurrency: 5 })
export class PaymentsProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly payments: PaymentsService,
    private readonly money: MoneyAdminService,
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
    // The books check, daily just after midnight Nairobi time.
    await this.queue.upsertJobScheduler(
      "reconcile-books",
      { pattern: "10 0 * * *", tz: "Africa/Nairobi" },
      { name: "reconcile-books", data: { name: "reconcile-books" }, opts: { removeOnComplete: 30, removeOnFail: 30 } },
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
      case "reconcile-books":
        return (await this.money.reconcile()).status;
    }
  }
}
