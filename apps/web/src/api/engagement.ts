import { api, unwrap } from "./client.ts";
import type { Joke, JokeStats } from "./client.ts";
import type { ReactionKind } from "../data/types.ts";

/** Picking your current reaction again takes it back, like the buttons suggest. */
export async function toggleReaction(jokeId: string, current: ReactionKind | null, kind: ReactionKind): Promise<JokeStats> {
  const params = { path: { id: jokeId } };
  return unwrap(
    current === kind
      ? await api.DELETE("/v1/jokes/{id}/reaction", { params })
      : await api.PUT("/v1/jokes/{id}/reaction", { params, body: { kind } }),
  );
}

/** Best effort: replays and shares are stats, never worth an error message. */
export function recordEvent(jokeId: string, type: "replay" | "share") {
  void api.POST("/v1/events", { body: { events: [{ jokeId, type }] } }).catch(() => undefined);
}

/** Shares the joke as text: the system share sheet where there is one, else the clipboard. */
export async function shareJoke(joke: Joke): Promise<"shared" | "copied" | "cancelled"> {
  const text =
    joke.kind === "text"
      ? `${joke.setup}\n${joke.punchline}\n\nFrom @${joke.creator.handle} on Daddy Jokes`
      : `${joke.caption ?? joke.imageAlt}\n\nFrom @${joke.creator.handle} on Daddy Jokes`;
  try {
    if (navigator.share) {
      await navigator.share({ text });
      recordEvent(joke.id, "share");
      return "shared";
    }
    await navigator.clipboard.writeText(text);
    recordEvent(joke.id, "share");
    return "copied";
  } catch {
    return "cancelled";
  }
}
