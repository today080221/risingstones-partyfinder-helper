import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OFFICIAL_CACHE_TTL_MS,
  buildOfficialRecruitCacheKey,
  readOfficialRecruitCache,
  shouldUseOfficialRecruitCache,
  writeOfficialRecruitCache
} from "./official-cache";
import type { RecruitFetchPayload, RecruitQuery } from "../types";

describe("official recruit cache", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds stable keys for the official query shape", () => {
    const query: RecruitQuery = {
      fb_name: " 妖星乱舞绝境战 ",
      fb_type: "绝境战",
      team_composition: "轻锐小队",
      target_area_id: "1"
    };
    expect(buildOfficialRecruitCacheKey(query)).toBe(
      JSON.stringify({
        fb_name: "妖星乱舞绝境战",
        fb_type: "绝境战",
        team_composition: "轻锐小队"
      })
    );
  });

  it("returns fresh entries inside the fifteen minute window", () => {
    const now = new Date("2026-05-10T10:00:00.000Z");
    const payload = createPayload({ fb_name: "妖星乱舞绝境战" }, now);
    writeOfficialRecruitCache(payload, now);

    const lookup = readOfficialRecruitCache(payload.query, new Date(now.getTime() + OFFICIAL_CACHE_TTL_MS - 1));
    expect(lookup.status).toBe("fresh");
    expect(lookup.entry?.payload.rows).toHaveLength(1);
  });

  it("returns miss when no entry matches the current query", () => {
    const lookup = readOfficialRecruitCache({ fb_name: "不存在的副本" }, new Date("2026-05-10T10:00:00.000Z"));
    expect(lookup.status).toBe("miss");
    expect(lookup.entry).toBeUndefined();
  });

  it("keeps stale entries readable after the short freshness window", () => {
    const now = new Date("2026-05-10T10:00:00.000Z");
    const payload = createPayload({ fb_name: "妖星乱舞绝境战" }, now);
    writeOfficialRecruitCache(payload, now);

    const lookup = readOfficialRecruitCache(payload.query, new Date(now.getTime() + OFFICIAL_CACHE_TTL_MS + 1));
    expect(lookup.status).toBe("stale");
    expect(lookup.entry?.payload.fetched).toBe(1);
  });

  it("does not use fresh cache when force refresh is requested", () => {
    const now = new Date("2026-05-10T10:00:00.000Z");
    const payload = createPayload({ fb_name: "妖星乱舞绝境战" }, now);
    writeOfficialRecruitCache(payload, now);

    const lookup = readOfficialRecruitCache(payload.query, now);
    expect(shouldUseOfficialRecruitCache(lookup)).toBe(true);
    expect(shouldUseOfficialRecruitCache(lookup, true)).toBe(false);
  });

  it("drops entries older than one day", () => {
    const now = new Date("2026-05-10T10:00:00.000Z");
    const payload = createPayload({ fb_name: "妖星乱舞绝境战" }, now);
    writeOfficialRecruitCache(payload, now);

    const lookup = readOfficialRecruitCache(payload.query, new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1));
    expect(lookup.status).toBe("miss");
  });

  it("keeps only the newest twenty entries", () => {
    const now = new Date("2026-05-10T10:00:00.000Z");
    for (let index = 0; index < 25; index += 1) {
      const savedAt = new Date(now.getTime() + index * 1000);
      writeOfficialRecruitCache(createPayload({ fb_name: `副本-${index}` }, savedAt), savedAt);
    }

    expect(readOfficialRecruitCache({ fb_name: "副本-0" }, new Date(now.getTime() + 25_000)).status).toBe("miss");
    expect(readOfficialRecruitCache({ fb_name: "副本-4" }, new Date(now.getTime() + 25_000)).status).toBe("miss");
    expect(readOfficialRecruitCache({ fb_name: "副本-5" }, new Date(now.getTime() + 25_000)).status).toBe("fresh");
    expect(readOfficialRecruitCache({ fb_name: "副本-24" }, new Date(now.getTime() + 25_000)).status).toBe("fresh");
  });
});

function createPayload(query: RecruitQuery, now: Date): RecruitFetchPayload {
  return {
    count: 1,
    fetched: 1,
    rows: [
      {
        id: 1,
        uuid: "official-1",
        character_name: "队长",
        area_name: "陆行鸟",
        group_name: "静语庄园",
        fb_name: query.fb_name,
        fb_type: query.fb_type ?? "",
        fb_time: "20:00-23:00",
        team_composition: query.team_composition ?? "",
        progress: "开荒",
        strategy: "未填写",
        need_job: [],
        label: []
      }
    ],
    query,
    pageSize: 100,
    fetchedAt: now.toISOString(),
    warnings: []
  };
}
