export type CollapsePlaybackState =
  | "idle"
  | "announce"
  | "charge"
  | "unstable"
  | "breaking"
  | "recalculate"
  | "nextRound"
  | "complete";

export type CollapsePlaybackEvent =
  | "begin"
  | "beginCharge"
  | "showUnstable"
  | "beginBreaking"
  | "recalculate"
  | "nextRound"
  | "complete"
  | "reset";

export function transitionCollapsePlayback(
  state: CollapsePlaybackState,
  event: CollapsePlaybackEvent,
): CollapsePlaybackState {
  if (event === "reset") return "idle";
  if (event === "begin") {
    return state === "idle" || state === "complete" ? "announce" : state;
  }
  if (event === "beginCharge") {
    return state === "announce" || state === "nextRound" || state === "recalculate" ? "charge" : state;
  }
  if (event === "showUnstable") {
    return state === "announce" || state === "charge" || state === "nextRound" ? "unstable" : state;
  }
  if (event === "beginBreaking") {
    return state === "unstable" ? "breaking" : state;
  }
  if (event === "recalculate") {
    return state === "breaking" ? "recalculate" : state;
  }
  if (event === "nextRound") {
    return state === "recalculate" ? "nextRound" : state;
  }
  if (event === "complete") {
    return state === "announce" ||
      state === "unstable" ||
      state === "charge" ||
      state === "breaking" ||
      state === "recalculate" ||
      state === "nextRound"
      ? "complete"
      : state;
  }
  return state;
}

export function collapseStateForFrame(
  stage: "initial" | "charge" | "marked" | "removed" | "complete",
): CollapsePlaybackState {
  if (stage === "initial") return "announce";
  if (stage === "charge") return "charge";
  if (stage === "marked") return "unstable";
  if (stage === "removed") return "recalculate";
  return "complete";
}
