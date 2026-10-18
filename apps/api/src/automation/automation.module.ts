import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { MailWorkerModule } from "../mail/mail.module";
import { RulesCoreModule } from "../rules/rules.module";
import { AutomationController } from "./automation.controller";
import { AutomationProcessor } from "./automation.processor";
import { AutomationService } from "./automation.service";
import { AUTOMATION_QUEUE, AutomationEngine } from "./engine.service";

/** API side: editing workflows and reading runs. */
@Module({
  imports: [BullModule.registerQueue({ name: AUTOMATION_QUEUE })],
  controllers: [AutomationController],
  providers: [AutomationService],
})
export class AutomationModule {}

/** Worker side: runs them. */
@Module({
  imports: [BullModule.registerQueue({ name: AUTOMATION_QUEUE }), RulesCoreModule, MailWorkerModule],
  providers: [AutomationEngine, AutomationProcessor],
})
export class AutomationWorkerModule {}
