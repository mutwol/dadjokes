import { Module } from "@nestjs/common";
import { RulesController } from "./rules.controller";
import { RulesService } from "./rules.service";

/** Rule sets: decisions as data, used by moderation and workflows. */
@Module({
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}

/** Worker side: evaluation only. */
@Module({
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesCoreModule {}
