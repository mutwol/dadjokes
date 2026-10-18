import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { EventsService } from "./events.service";

/** Cross-cutting services every module may use: the audit trail and the event outbox. */
@Global()
@Module({
  providers: [AuditService, EventsService],
  exports: [AuditService, EventsService],
})
export class PlatformModule {}
