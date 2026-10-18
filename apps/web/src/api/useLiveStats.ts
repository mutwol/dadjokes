import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiUrl, getAccessToken, refreshAccessToken } from "./client.ts";
import type { JokeStats } from "./rtk/index.ts";

/**
 * Live counts for a joke from GET /v1/jokes/:id/live (server-sent events,
 * read with fetch because it needs the Authorization header). Reconnects with
 * backoff if the connection drops. `initial` shows until the first event.
 */
export function useLiveStats(jokeId: string, initial: JokeStats): [JokeStats, Dispatch<SetStateAction<JokeStats>>] {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    const ctrl = new AbortController();
    let attempt = 0;

    const connect = async (): Promise<void> => {
      while (!ctrl.signal.aborted) {
        try {
          let res = await stream(jokeId, ctrl.signal);
          if (res.status === 401 && (await refreshAccessToken())) res = await stream(jokeId, ctrl.signal);
          if (!res.ok || !res.body) return; // Not allowed or gone: stop quietly.
          attempt = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let end: number;
            while ((end = buf.indexOf("\n\n")) >= 0) {
              const block = buf.slice(0, end);
              buf = buf.slice(end + 2);
              const data = block.split("\n").find((l) => l.startsWith("data: "));
              if (block.startsWith("event: stats") && data) setStats(JSON.parse(data.slice(6)) as JokeStats);
            }
          }
        } catch {
          if (ctrl.signal.aborted) return;
        }
        attempt++;
        await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** attempt)));
      }
    };
    void connect();
    return () => ctrl.abort();
  }, [jokeId]);

  return [stats, setStats];
}

function stream(jokeId: string, signal: AbortSignal) {
  const token = getAccessToken();
  return fetch(apiUrl(`/v1/jokes/${jokeId}/live`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
    credentials: "include",
  });
}
