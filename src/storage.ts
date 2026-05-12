import type { AllianceKey, LocalFilterState, NgaCollectionSettings, RecruitSource, UpdateProvider } from "./types";
import { DEFAULT_UPDATE_PROVIDER } from "./config";
import { DEFAULT_NGA_COLLECTION_SETTINGS, normalizeNgaCollectionSettings } from "./lib/nga";

export interface SavedUiState {
  fbType: string;
  fbName: string;
  targetAreaId: string;
  labels: string[];
  teamComposition: string;
  officialPosition: string;
  officialAlliance: "" | AllianceKey;
  sidebarCollapsed: boolean;
  updateProvider: UpdateProvider;
  autoCheckUpdates: boolean;
  autoDetectUpdateProvider: boolean;
  sourceFilters: RecruitSource[];
  ngaSettings: NgaCollectionSettings;
  ngaKeepLoginAcknowledged: boolean;
  ngaInterstitialAcknowledged: boolean;
  filters: LocalFilterState;
}

const STORAGE_KEY = "risingstones-partyfinder-helper:v1";
export const ALL_RECRUIT_SOURCES: RecruitSource[] = ["official", "nga"];

export const defaultFilters: LocalFilterState = {
  ngaRecruitView: "teams",
  progressText: "",
  strategyText: "",
  timeText: "",
  excludeText: "",
  timeStart: "",
  timeEnd: "",
  dailyMaxHours: "",
  timeDays: [],
  areaPreferenceId: "",
  selectedLabelIds: [],
  labelMatchMode: "all",
  selectedJobIds: [],
  noDuplicateJobs: true,
  selectedPositions: [],
  alliance: "",
  showUnparsedTime: true
};

export const defaultUiState: SavedUiState = {
  fbType: "",
  fbName: "",
  targetAreaId: "",
  labels: [],
  teamComposition: "",
  officialPosition: "",
  officialAlliance: "",
  sidebarCollapsed: false,
  updateProvider: DEFAULT_UPDATE_PROVIDER,
  autoCheckUpdates: true,
  autoDetectUpdateProvider: true,
  sourceFilters: [...ALL_RECRUIT_SOURCES],
  ngaSettings: { ...DEFAULT_NGA_COLLECTION_SETTINGS, selectedBoardUrls: [...DEFAULT_NGA_COLLECTION_SETTINGS.selectedBoardUrls] },
  ngaKeepLoginAcknowledged: false,
  ngaInterstitialAcknowledged: false,
  filters: defaultFilters
};

export function normalizeSourceFilters(value: unknown, legacyValue?: unknown): RecruitSource[] {
  const rawValues =
    Array.isArray(value) && value.length
      ? value
      : legacyValue === "all"
        ? ALL_RECRUIT_SOURCES
        : legacyValue === "official" || legacyValue === "nga"
          ? [legacyValue]
          : ALL_RECRUIT_SOURCES;
  const selected = rawValues.filter((source): source is RecruitSource => source === "official" || source === "nga");
  return selected.length ? [...new Set(selected)] : [...ALL_RECRUIT_SOURCES];
}

export function loadUiState(): SavedUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultUiState;
    }
    const parsed = JSON.parse(raw) as Partial<SavedUiState> & { sourceFilter?: "all" | RecruitSource };
    const parsedProvider = parsed.updateProvider === "github" ? "github" : DEFAULT_UPDATE_PROVIDER;
    const parsedFilters: Partial<LocalFilterState> = parsed.filters ?? {};
    const selectedLabelIds = Array.isArray(parsedFilters.selectedLabelIds)
      ? parsedFilters.selectedLabelIds
      : Array.isArray(parsed.labels)
        ? parsed.labels
        : [];
    return {
      ...defaultUiState,
      ...parsed,
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
      updateProvider: parsedProvider,
      autoCheckUpdates: parsed.autoCheckUpdates ?? true,
      sourceFilters: normalizeSourceFilters(parsed.sourceFilters, parsed.sourceFilter),
      ngaSettings: normalizeNgaCollectionSettings(parsed.ngaSettings ?? {}),
      ngaKeepLoginAcknowledged: Boolean(parsed.ngaKeepLoginAcknowledged),
      ngaInterstitialAcknowledged: Boolean(parsed.ngaInterstitialAcknowledged),
      filters: {
        ...defaultFilters,
        ...parsedFilters,
        areaPreferenceId: parsedFilters.areaPreferenceId ?? parsed.targetAreaId ?? "",
        selectedLabelIds,
        labelMatchMode: parsedFilters.labelMatchMode === "any" ? "any" : "all"
      }
    };
  } catch {
    return defaultUiState;
  }
}

export function saveUiState(state: SavedUiState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
