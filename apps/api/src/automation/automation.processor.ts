import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { OnApplicationBootstrap } from "@nestjs/common";
import type { Job, Queue } from "bullmq";
import { AUTOMATION_QUEUE, AutomationEngine } from "./engine.service";
import type { AutomationJob } from "./engine.service";

/** Worker only: drains the event outbox, resumes waiting runs and scans deliveries. */
@Injectable()
@Processor(AUTOMATION_QUEUE, { concurrency: 5 })
export class AutomationProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly engine: AutomationEngine,
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue<AutomationJob>,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const opts = { removeOnComplete: 20, removeOnFail: 50 };
    await this.queue.upsertJobScheduler("drain", { every: 5_000 }, { name: "drain", data: { name: "drain" }, opts });
    await this.queue.upsertJobScheduler("sweep", { every: 60_000 }, { name: "sweep", data: { name: "sweep" }, opts });
    await this.queue.upsertJobScheduler("scan", { every: 10 * 60_000 }, { name: "scan", data: { name: "scan" }, opts });
  }

  override async process(job: Job<AutomationJob>) {
    const data = job.data;
    switch (data.name) {
      case "drain":
        return this.engine.drain();
      case "sweep":
        return this.engine.sweep();
      case "scan":
        return this.engine.scanDeliveries();
      case "resume":
        return this.engine.resume(data.runId);
      case "start":
        return this.engine.startManual(data.workflowId, data.userId, data.mode);
    }
  }
}
