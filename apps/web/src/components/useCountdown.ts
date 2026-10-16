import { useEffect, useState } from "react";

/** Next time the clock reads `hour`:00 local time. */
export function nextDelivery(hour: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d;
}

/** "13h 42m" until `hour`:00, updating every 30 seconds. */
export function useCountdown(hour: number): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const ms = nextDelivery(hour, now).getTime() - now.getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
