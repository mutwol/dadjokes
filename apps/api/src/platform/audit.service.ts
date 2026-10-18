import { Injectable } from "@nestjs/common";
import { InjectDb } from "../db/db.module";
import type { Db, Tx } from "../db/db.module";
import { auditLog } from "../db/schema";

export interface AuditEntry {
  /** Null when the system acted on its own, e.g. a rule auto-hiding a joke. */
  actorId: string | null;
  /** Dotted verb, e.g. report.resolved, user.suspended, order.shipped. */
  action: string;
  targetType: string;
  targetId: string;
  data?: Record<string, unknown>;
}

/** Writes the audit trail. Pass the transaction so the entry commits with the change it describes. */
@Injectable()
export class AuditService {
  constructor(@InjectDb() private readonly db: Db) {}

  async record(entry: AuditEntry, tx: Tx = this.db) {
    await tx.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      data: entry.data ?? {},
    });
  }
}
