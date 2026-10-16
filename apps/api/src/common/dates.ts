/** Calendar dates are ISO strings (YYYY-MM-DD); instants are Dates. */

/** The date at an instant in an IANA time zone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The hour (0-23) at an instant in an IANA time zone. */
export function localHour(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at));
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The latest calendar date anywhere on Earth right now (UTC+14). A day after
 * this hasn't started for any reader yet, so jokes can still be scheduled,
 * moved or withdrawn for it.
 */
export function latestDateNow(now = new Date()): string {
  return localDate(now, "Pacific/Kiritimati");
}

/** The first day a joke can still be scheduled for. */
export function firstOpenDay(now = new Date()): string {
  return addDays(latestDateNow(now), 1);
}

/** The instant a wall-clock hour on a date happens in a time zone. */
export function zonedInstant(isoDate: string, hour: number, timeZone: string): Date {
  const wall = new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00Z`).getTime();
  // Apply the zone's offset, then re-check it at the result in case a DST change lies between.
  const first = wall - zoneOffsetMs(new Date(wall), timeZone);
  return new Date(wall - zoneOffsetMs(new Date(first), timeZone));
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}
