import { AppError } from "./app-error";

/**
 * Opaque page cursors: base64url JSON, so the paging strategy can change
 * without breaking clients. A cursor that doesn't decode is a 400.
 */
export function encodeCursor(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor<T extends Record<string, string | number>>(
  cursor: string | undefined,
  isValid: (v: Record<string, unknown>) => v is T,
): T | undefined {
  if (!cursor) return undefined;
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (v && typeof v === "object" && isValid(v as Record<string, unknown>)) return v as T;
  } catch {
    // fall through
  }
  throw new AppError(400, "invalid_cursor", "That page link is no longer valid.");
}

/** A keyset cursor over (timestamp, id), newest first. */
export interface TimeCursor extends Record<string, string> {
  t: string;
  id: string;
}

export const isTimeCursor = (v: Record<string, unknown>): v is TimeCursor =>
  typeof v.t === "string" && !Number.isNaN(Date.parse(v.t)) && typeof v.id === "string" && /^[0-9a-f-]{36}$/.test(v.id);
