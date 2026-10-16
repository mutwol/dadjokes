import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { DeliveriesModule, DeliveriesWorkerModule } from "../deliveries/deliveries.module";
import { MpesaClient } from "./mpesa.client";
import { MpesaCallbackController, TipsController } from "./payments.controller";
import { PaymentsProcessor } from "./payments.processor";
import { PAYMENTS_QUEUE, PaymentsService } from "./payments.service";

@Module({
  imports: [DeliveriesModule, BullModule.registerQueue({ name: PAYMENTS_QUEUE })],
  controllers: [TipsController, MpesaCallbackController],
  providers: [PaymentsService, MpesaClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}

@Module({
  imports: [DeliveriesWorkerModule, BullModule.registerQueue({ name: PAYMENTS_QUEUE })],
  providers: [PaymentsService, MpesaClient, PaymentsProcessor],
})
export class PaymentsWorkerModule {}
