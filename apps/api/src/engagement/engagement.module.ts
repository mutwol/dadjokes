import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { DeliveriesModule, DeliveriesWorkerModule } from "../deliveries/deliveries.module";
import { EngagementController, JokeEngagementController } from "./engagement.controller";
import { EngagementService } from "./engagement.service";
import { LiveService } from "./live.service";
import { STATS_QUEUE, StatsProcessor } from "./stats.processor";

@Module({
  imports: [DeliveriesModule],
  controllers: [JokeEngagementController, EngagementController],
  providers: [EngagementService, LiveService],
  exports: [EngagementService, LiveService],
})
export class EngagementModule {}

/** Worker side: the stats rollup. */
@Module({
  imports: [DeliveriesWorkerModule, BullModule.registerQueue({ name: STATS_QUEUE })],
  providers: [EngagementService, LiveService, StatsProcessor],
})
export class EngagementWorkerModule {}
