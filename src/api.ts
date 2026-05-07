import type {
  AppVersionPayload,
  GeoIpPayload,
  MetaPayload,
  RecruitDetail,
  RecruitFetchPayload,
  RecruitQuery,
  UpdateCheckPayload,
  UpdateProvider
} from "./types";

export async function fetchMeta(signal?: AbortSignal): Promise<MetaPayload> {
  const response = await fetch("/api/meta", { signal });
  return readJson<MetaPayload>(response);
}

export async function fetchAppVersion(signal?: AbortSignal): Promise<AppVersionPayload> {
  const response = await fetch("/api/version", { signal });
  return readJson<AppVersionPayload>(response);
}

export async function fetchGeoIp(signal?: AbortSignal): Promise<GeoIpPayload> {
  const response = await fetch("/api/geoip", { signal });
  return readJson<GeoIpPayload>(response);
}

export async function fetchRecruits(query: RecruitQuery, signal?: AbortSignal): Promise<RecruitFetchPayload> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const response = await fetch(`/api/recruits?${params.toString()}`, { signal });
  return readJson<RecruitFetchPayload>(response);
}

export async function fetchRecruitDetail(id: number, signal?: AbortSignal): Promise<RecruitDetail> {
  const response = await fetch(`/api/recruit-detail?id=${encodeURIComponent(String(id))}`, { signal });
  const payload = await readJson<{ detail: RecruitDetail; fetchedAt: string }>(response);
  return payload.detail;
}

export async function checkUpdate(
  provider: UpdateProvider,
  repo: string,
  signal?: AbortSignal
): Promise<UpdateCheckPayload> {
  const params = new URLSearchParams({ provider, repo });
  const response = await fetch(`/api/update/check?${params.toString()}`, { signal });
  return readJson<UpdateCheckPayload>(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.message ?? `请求失败：HTTP ${response.status}`);
  }
  return json as T;
}
