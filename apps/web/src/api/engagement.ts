import { useCallback } from "react";
import { api, useReactMutation, useUnreactMutation } from "./rtk/index.ts";
import type { Joke, JokeStats } from "./rtk/index.ts";
import type { ReactionKind } from "../data/types.ts";
import { store } from "../state/redux.ts";

/**
 * Picking your current reaction again takes it back, like the buttons suggest.
 * Returns the server's counts; the cached joke updates optimistically (endpoints.ts).
 */
export function useToggleReaction() {
  const [react] = useReactMutation();
  const [unreact] = useUnreactMutation();
  return useCallback(
    (jokeId: string, current: ReactionKind | null, kind: ReactionKind): Promise<JokeStats> =>
      (current === kind ? unreact({ id: jokeId }) : react({ id: jokeId, reactRequest: { kind } })).unwrap(),
    [react, unreact],
  );
}

/** Best effort: replays and shares are stats, never worth an error message. */
export function recordEvent(jokeId: string, type: "replay" | "share") {
  void store.dispatch(api.endpoints.recordEvents.initiate({ eventsRequest: { events: [{ jokeId, type }] } }));
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
