import type { OfficialCacheStatus } from "./official-cache";

export type AggregateRunState = "idle" | "manual" | "force" | "official-auto" | "nga-auto";

export interface ReadLockState {
  runState: AggregateRunState;
  isLoading: boolean;
  isCollectingNga: boolean;
}

export function isReadLocked(state: ReadLockState): boolean {
  return state.runState !== "idle" || state.isLoading || state.isCollectingNga;
}

export function canStartAggregateRead(state: ReadLockState & { sourceCount: number }): boolean {
  return state.sourceCount > 0 && !isReadLocked(state);
}

export function shouldStartOfficialAutoRefresh(
  state: ReadLockState & {
    hasQuery: boolean;
    hasOfficialSource: boolean;
    officialCacheStatus: OfficialCacheStatus;
    refreshKey: string;
    lastStartedKey: string;
  }
): boolean {
  return (
    state.hasQuery &&
    state.hasOfficialSource &&
    state.officialCacheStatus === "stale" &&
    Boolean(state.refreshKey) &&
    state.refreshKey !== state.lastStartedKey &&
    !isReadLocked(state)
  );
}
