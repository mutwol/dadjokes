import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { DeliveriesModule, DeliveriesWorkerModule } from "../deliveries/deliveries.module";
import { MpesaClient } from "./mpesa.client";
import { MoneyAdminService } from "./money-admin.service";
import { MoneyAdminController, MpesaCallbackController, TipsController } from "./payments.controller";
import { PaymentsProcessor } from "./payments.processor";
import { PAYMENTS_QUEUE, PaymentsService } from "./payments.service";
import { DarajaProvider, PaymentProviders } from "./providers";

@Module({
  imports: [DeliveriesModule, BullModule.registerQueue({ name: PAYMENTS_QUEUE })],
  controllers: [TipsController, MpesaCallbackController, MoneyAdminController],
  providers: [PaymentsService, MoneyAdminService, MpesaClient, DarajaProvider, PaymentProviders],
  exports: [PaymentsService],
})
export class PaymentsModule {}

@Module({
  imports: [DeliveriesWorkerModule, BullModule.registerQueue({ name: PAYMENTS_QUEUE })],
  providers: [PaymentsService, MoneyAdminService, MpesaClient, DarajaProvider, PaymentProviders, PaymentsProcessor],
})
export class PaymentsWorkerModule {}
