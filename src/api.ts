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
  if (isTauriRuntime()) {
    return invokeTauri<MetaPayload>("risingstones_meta", undefined, signal);
  }
  const response = await fetch("/api/meta", { signal });
  return readJson<MetaPayload>(response);
}

export async function fetchAppVersion(signal?: AbortSignal): Promise<AppVersionPayload> {
  if (isTauriRuntime()) {
    return invokeTauri<AppVersionPayload>("risingstones_version", undefined, signal);
  }
  const response = await fetch("/api/version", { signal });
  return readJson<AppVersionPayload>(response);
}

export async function fetchGeoIp(signal?: AbortSignal): Promise<GeoIpPayload> {
  if (isTauriRuntime()) {
    return invokeTauri<GeoIpPayload>("risingstones_geoip", undefined, signal);
  }
  const response = await fetch("/api/geoip", { signal });
  return readJson<GeoIpPayload>(response);
}

export async function fetchRecruits(query: RecruitQuery, signal?: AbortSignal): Promise<RecruitFetchPayload> {
  if (isTauriRuntime()) {
    return invokeTauri<RecruitFetchPayload>("risingstones_recruits", { query }, signal);
  }
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
  if (isTauriRuntime()) {
    return invokeTauri<RecruitDetail>("risingstones_recruit_detail", { id }, signal);
  }
  const response = await fetch(`/api/recruit-detail?id=${encodeURIComponent(String(id))}`, { signal });
  const payload = await readJson<{ detail: RecruitDetail; fetchedAt: string }>(response);
  return payload.detail;
}

export async function checkUpdate(
  provider: UpdateProvider,
  signal?: AbortSignal
): Promise<UpdateCheckPayload> {
  if (isTauriRuntime()) {
    return invokeTauri<UpdateCheckPayload>("risingstones_check_update", { provider }, signal);
  }
  const params = new URLSearchParams({ provider });
  const response = await fetch(`/api/update/check?${params.toString()}`, { signal });
  return readJson<UpdateCheckPayload>(response);
}

let tauriInvokePromise: Promise<typeof import("@tauri-apps/api/core").invoke> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    throw new Error("请求已取消");
  }
  tauriInvokePromise ??= import("@tauri-apps/api/core").then((module) => module.invoke);
  const invoke = await tauriInvokePromise;
  try {
    const result = await invoke<T>(command, args);
    if (signal?.aborted) {
      throw new Error("请求已取消");
    }
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.message ?? `请求失败：HTTP ${response.status}`);
  }
  return json as T;
}
