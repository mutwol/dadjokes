import { Module } from "@nestjs/common";
import { CreatorsModule } from "../creators/creators.module";
import { HandlesController, MeController, TopicsController } from "./me.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [CreatorsModule],
  controllers: [MeController, HandlesController, TopicsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
