import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService, PUSH_QUEUE } from "./notifications.service";
import { PushProcessor } from "./push.processor";

/** Global so any module can notify people without import cycles. */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: PUSH_QUEUE })],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: PUSH_QUEUE })],
  providers: [NotificationsService, PushProcessor],
  exports: [NotificationsService],
})
export class NotificationsWorkerModule {}
