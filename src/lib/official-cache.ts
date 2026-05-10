import type { RecruitFetchPayload, RecruitQuery } from "../types";

export type OfficialCacheStatus = "miss" | "fresh" | "stale";

export interface OfficialRecruitCacheEntry {
  key: string;
  query: RecruitQuery;
  payload: RecruitFetchPayload;
  savedAt: string;
  expiresAt: string;
}

export interface OfficialRecruitCacheLookup {
  status: OfficialCacheStatus;
  entry?: OfficialRecruitCacheEntry;
}

const STORAGE_KEY = "risingstones-partyfinder-helper:official-cache:v1";
export const OFFICIAL_CACHE_TTL_MS = 15 * 60 * 1000;
const OFFICIAL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OFFICIAL_CACHE_MAX_ENTRIES = 20;

export function buildOfficialRecruitCacheKey(query: RecruitQuery): string {
  return JSON.stringify({
    fb_name: cleanPart(query.fb_name),
    fb_type: cleanPart(query.fb_type),
    team_composition: cleanPart(query.team_composition)
  });
}

export function readOfficialRecruitCache(query: RecruitQuery, now = new Date()): OfficialRecruitCacheLookup {
  const key = buildOfficialRecruitCacheKey(query);
  const entries = pruneOfficialRecruitCache(loadOfficialRecruitCacheEntries(), now);
  saveOfficialRecruitCacheEntries(entries);
  const entry = entries.find((item) => item.key === key);
  if (!entry) {
    return { status: "miss" };
  }
  const expiresAt = Date.parse(entry.expiresAt);
  return {
    status: Number.isFinite(expiresAt) && expiresAt > now.getTime() ? "fresh" : "stale",
    entry
  };
}

export function shouldUseOfficialRecruitCache(
  lookup: OfficialRecruitCacheLookup,
  forceRefresh = false
): lookup is OfficialRecruitCacheLookup & { entry: OfficialRecruitCacheEntry } {
  return !forceRefresh && lookup.status === "fresh" && Boolean(lookup.entry);
}

export function writeOfficialRecruitCache(payload: RecruitFetchPayload, now = new Date()): OfficialRecruitCacheEntry {
  const key = buildOfficialRecruitCacheKey(payload.query);
  const savedAt = now.toISOString();
  const entry: OfficialRecruitCacheEntry = {
    key,
    query: payload.query,
    payload,
    savedAt,
    expiresAt: new Date(now.getTime() + OFFICIAL_CACHE_TTL_MS).toISOString()
  };
  const withoutCurrent = loadOfficialRecruitCacheEntries().filter((item) => item.key !== key);
  const entries = pruneOfficialRecruitCache([entry, ...withoutCurrent], now).slice(0, OFFICIAL_CACHE_MAX_ENTRIES);
  saveOfficialRecruitCacheEntries(entries);
  return entry;
}

export function clearOfficialRecruitCacheForQuery(query: RecruitQuery): void {
  const key = buildOfficialRecruitCacheKey(query);
  saveOfficialRecruitCacheEntries(loadOfficialRecruitCacheEntries().filter((item) => item.key !== key));
}

export function pruneOfficialRecruitCache(
  entries: OfficialRecruitCacheEntry[],
  now = new Date()
): OfficialRecruitCacheEntry[] {
  const cutoff = now.getTime() - OFFICIAL_CACHE_MAX_AGE_MS;
  return entries
    .filter((entry) => {
      if (!entry.key || !entry.payload || !entry.query?.fb_name) {
        return false;
      }
      const savedAt = Date.parse(entry.savedAt);
      return Number.isFinite(savedAt) && savedAt >= cutoff;
    })
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
}

function loadOfficialRecruitCacheEntries(): OfficialRecruitCacheEntry[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as OfficialRecruitCacheEntry[];
    return Array.isArray(parsed) ? parsed.filter(isOfficialRecruitCacheEntry) : [];
  } catch {
    return [];
  }
}

function saveOfficialRecruitCacheEntries(entries: OfficialRecruitCacheEntry[]): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function isOfficialRecruitCacheEntry(value: unknown): value is OfficialRecruitCacheEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<OfficialRecruitCacheEntry>;
  return Boolean(entry.key && entry.query?.fb_name && entry.payload?.rows && entry.savedAt && entry.expiresAt);
}

function cleanPart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
