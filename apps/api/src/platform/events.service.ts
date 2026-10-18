import { Injectable } from "@nestjs/common";
import { InjectDb } from "../db/db.module";
import type { Db, Tx } from "../db/db.module";
import { domainEvents } from "../db/schema";
import type { EventType } from "./event-types";

export interface DomainEvent {
  type: EventType;
  /** The person the event is about; workflows run "for" them. */
  userId?: string | null;
  payload?: Record<string, unknown>;
  /** The same key is only ever recorded once. */
  dedupeKey?: string;
}

/**
 * The outbox. Modules record what happened in the same transaction as the
 * change; the worker reads the outbox and starts matching workflows. Nothing
 * here runs a side effect, so emitting is cheap and safe inside any transaction.
 */
@Injectable()
export class EventsService {
  constructor(@InjectDb() private readonly db: Db) {}

  async emit(event: DomainEvent, tx: Tx = this.db) {
    await tx
      .insert(domainEvents)
      .values({
        type: event.type,
        userId: event.userId ?? null,
        payload: event.payload ?? {},
        dedupeKey: event.dedupeKey ?? null,
      })
      .onConflictDoNothing();
  }
}
