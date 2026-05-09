import type {
  AppVersionPayload,
  GeoIpPayload,
  MetaPayload,
  NgaClearSessionPayload,
  NgaCollectPayload,
  NgaCollectionSettings,
  NgaCollectionProgress,
  NgaDetailCollectPayload,
  NgaNavigateSessionPayload,
  NgaOpenSessionPayload,
  NgaSample,
  NgaSampleStorePayload,
  NgaSessionStatusPayload,
  NgaVisiblePageStatusPayload,
  RecruitDetail,
  RecruitFetchPayload,
  RecruitQuery,
  UpdateAsset,
  UpdateCheckPayload,
  UpdateInstallPayload,
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

export async function installUpdate(asset: UpdateAsset, signal?: AbortSignal): Promise<UpdateInstallPayload> {
  const payload = {
    assetName: asset.name,
    downloadUrl: asset.downloadUrl
  };

  if (isTauriRuntime()) {
    return invokeTauri<UpdateInstallPayload>("risingstones_install_update", payload, signal);
  }

  const response = await fetch("/api/update/install", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return readJson<UpdateInstallPayload>(response);
}

export async function fetchNgaSessionStatus(signal?: AbortSignal): Promise<NgaSessionStatusPayload> {
  if (!isTauriRuntime()) {
    return {
      available: false,
      loginStatus: "unknown",
      keepLogin: false,
      dataLocation: "仅桌面版会保存本机网页窗口状态。",
      message: "浏览器预览仅能使用已保存的 NGA 招募。"
    };
  }
  return invokeTauri<NgaSessionStatusPayload>("risingstones_nga_session_status", undefined, signal);
}

export async function openNgaSession(
  settings: Pick<NgaCollectionSettings, "keepLogin" | "startUrl">,
  signal?: AbortSignal
): Promise<NgaOpenSessionPayload> {
  if (!isTauriRuntime()) {
    throw new Error("NGA 页面读取需要使用桌面版。");
  }
  return invokeTauri<NgaOpenSessionPayload>(
    "risingstones_nga_open_session",
    {
      keepLogin: settings.keepLogin,
      startUrl: settings.startUrl
    },
    signal
  );
}

export async function navigateNgaSession(startUrl: string, signal?: AbortSignal): Promise<NgaNavigateSessionPayload> {
  if (!isTauriRuntime()) {
    throw new Error("NGA 页面切换需要使用桌面版。");
  }
  return invokeTauri<NgaNavigateSessionPayload>("risingstones_nga_navigate_session", { startUrl }, signal);
}

export async function clearNgaSession(signal?: AbortSignal): Promise<NgaClearSessionPayload> {
  if (!isTauriRuntime()) {
    throw new Error("NGA 本机网页状态清理需要使用桌面版。");
  }
  return invokeTauri<NgaClearSessionPayload>("risingstones_nga_clear_session", undefined, signal);
}

export async function fetchNgaVisiblePageStatus(signal?: AbortSignal): Promise<NgaVisiblePageStatusPayload> {
  if (!isTauriRuntime()) {
    return {
      opened: false,
      allowed: false,
      currentUrl: "",
      state: "closed",
      message: "浏览器预览没有桌面网页窗口。"
    };
  }
  return invokeTauri<NgaVisiblePageStatusPayload>("risingstones_nga_visible_page_status", undefined, signal);
}

export async function collectNgaVisibleSamples(
  settings: Pick<NgaCollectionSettings, "maxItems" | "requestIntervalMs" | "includeDetails">,
  signal?: AbortSignal
): Promise<NgaCollectPayload> {
  if (!isTauriRuntime()) {
    throw new Error("NGA 页面读取需要使用桌面版。");
  }
  return invokeTauri<NgaCollectPayload>(
    "risingstones_nga_collect_visible_samples",
    {
      maxItems: settings.maxItems,
      requestIntervalMs: settings.requestIntervalMs,
      includeDetails: settings.includeDetails
    },
    signal
  );
}

export async function loadNgaSamples(signal?: AbortSignal): Promise<NgaSampleStorePayload> {
  if (!isTauriRuntime()) {
    return {
      samples: [],
      count: 0,
      dataLocation: "仅桌面版会保存 NGA 招募到本机应用数据目录。",
      message: "浏览器预览未读取本机保存的 NGA 招募。"
    };
  }
  return invokeTauri<NgaSampleStorePayload>("risingstones_nga_load_samples", undefined, signal);
}

export async function saveNgaSamples(samples: NgaSample[], signal?: AbortSignal): Promise<NgaSampleStorePayload> {
  if (!isTauriRuntime()) {
    return {
      samples,
      count: samples.length,
      dataLocation: "浏览器开发模式仅保留当前页面内存数据。",
      message: "浏览器预览未写入本机保存的 NGA 招募。",
      savedAt: new Date().toISOString()
    };
  }
  return invokeTauri<NgaSampleStorePayload>("risingstones_nga_save_samples", { samples }, signal);
}

export async function collectNgaSampleDetails(
  samples: NgaSample[],
  settings: Pick<NgaCollectionSettings, "maxItems" | "requestIntervalMs">,
  signal?: AbortSignal
): Promise<NgaDetailCollectPayload> {
  if (!isTauriRuntime()) {
    throw new Error("NGA 正文补齐需要使用桌面版。");
  }
  return invokeTauri<NgaDetailCollectPayload>(
    "risingstones_nga_collect_sample_details",
    {
      samples,
      maxItems: settings.maxItems,
      requestIntervalMs: settings.requestIntervalMs
    },
    signal
  );
}

export async function fetchNgaCollectionProgress(signal?: AbortSignal): Promise<NgaCollectionProgress> {
  if (!isTauriRuntime()) {
    return {
      status: "idle",
      currentUrl: "",
      collected: 0,
      maxItems: 0,
      message: "当前运行环境不支持桌面版 NGA 读取进度。"
    };
  }
  return invokeTauri<NgaCollectionProgress>("risingstones_nga_collection_progress", undefined, signal);
}

export async function cancelNgaCollection(signal?: AbortSignal): Promise<NgaCollectPayload["progress"]> {
  if (!isTauriRuntime()) {
    throw new Error("NGA 页面读取需要使用桌面版。");
  }
  return invokeTauri<NgaCollectPayload["progress"]>("risingstones_nga_cancel_collect", undefined, signal);
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
    throw abortError();
  }
  tauriInvokePromise ??= import("@tauri-apps/api/core").then((module) => module.invoke);
  const invoke = await tauriInvokePromise;
  try {
    const result = await invoke<T>(command, args);
    if (signal?.aborted) {
      throw abortError();
    }
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
}

function abortError(): Error {
  const error = new Error("请求已取消");
  error.name = "AbortError";
  return error;
}

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.message ?? `请求失败：HTTP ${response.status}`);
  }
  return json as T;
}
