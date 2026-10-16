import { Module } from "@nestjs/common";
import { CreatorsController, SubscriptionsController } from "./creators.controller";
import { CreatorsService } from "./creators.service";

@Module({
  controllers: [CreatorsController, SubscriptionsController],
  providers: [CreatorsService],
  exports: [CreatorsService],
})
export class CreatorsModule {}
