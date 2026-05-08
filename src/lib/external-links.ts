let tauriOpenUrlPromise: Promise<typeof import("@tauri-apps/plugin-opener").openUrl> | null = null;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    tauriOpenUrlPromise ??= import("@tauri-apps/plugin-opener").then((module) => module.openUrl);
    const openUrl = await tauriOpenUrlPromise;
    await openUrl(url);
    return;
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(url);
  }
}
