import { describe, expect, it } from "vitest";
import {
  canStartAggregateRead,
  isReadLocked,
  shouldStartOfficialAutoRefresh
} from "./read-state";

describe("read lock state", () => {
  it("disables force refresh while aggregate reading is active", () => {
    expect(canStartAggregateRead({ runState: "manual", isLoading: true, isCollectingNga: false, sourceCount: 2 })).toBe(
      false
    );
  });

  it("disables aggregate reading while force refresh is active", () => {
    expect(canStartAggregateRead({ runState: "force", isLoading: true, isCollectingNga: false, sourceCount: 2 })).toBe(
      false
    );
  });

  it("returns unlocked after cancel or error cleanup restores idle flags", () => {
    expect(isReadLocked({ runState: "idle", isLoading: false, isCollectingNga: false })).toBe(false);
  });

  it("requires at least one selected source before starting a read", () => {
    expect(canStartAggregateRead({ runState: "idle", isLoading: false, isCollectingNga: false, sourceCount: 0 })).toBe(
      false
    );
  });
});

describe("official and NGA auto refresh decisions", () => {
  it("starts official cache background refresh only for stale unlocked cache entries", () => {
    expect(
      shouldStartOfficialAutoRefresh({
        runState: "idle",
        isLoading: false,
        isCollectingNga: false,
        hasQuery: true,
        hasOfficialSource: true,
        officialCacheStatus: "stale",
        refreshKey: "q:old",
        lastStartedKey: ""
      })
    ).toBe(true);
  });

  it("does not repeat the same official stale refresh key", () => {
    expect(
      shouldStartOfficialAutoRefresh({
        runState: "idle",
        isLoading: false,
        isCollectingNga: false,
        hasQuery: true,
        hasOfficialSource: true,
        officialCacheStatus: "stale",
        refreshKey: "q:old",
        lastStartedKey: "q:old"
      })
    ).toBe(false);
  });

  it("does not start an official background refresh while another read is active", () => {
    expect(
      shouldStartOfficialAutoRefresh({
        runState: "nga-auto",
        isLoading: false,
        isCollectingNga: true,
        hasQuery: true,
        hasOfficialSource: true,
        officialCacheStatus: "stale",
        refreshKey: "q:old",
        lastStartedKey: ""
      })
    ).toBe(false);
  });
});
