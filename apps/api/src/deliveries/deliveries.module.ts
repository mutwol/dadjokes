import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { JokesModule } from "../jokes/jokes.module";
import { JokesController, TodayController } from "./deliveries.controller";
import { DELIVERY_QUEUE, DeliveriesProcessor } from "./deliveries.processor";
import { DeliveriesService } from "./deliveries.service";

@Module({
  imports: [JokesModule],
  controllers: [TodayController, JokesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}

/** Worker side: the scheduled delivery job. */
@Module({
  imports: [JokesModule, BullModule.registerQueue({ name: DELIVERY_QUEUE })],
  providers: [DeliveriesService, DeliveriesProcessor],
  exports: [DeliveriesService],
})
export class DeliveriesWorkerModule {}
