import { Module } from "@nestjs/common";
import { AppealsController } from "./appeals.controller";
import { AppealsService } from "./appeals.service";

/** Appeals against takedowns. Reports themselves live in the engagement module. */
@Module({
  controllers: [AppealsController],
  providers: [AppealsService],
})
export class ModerationModule {}
