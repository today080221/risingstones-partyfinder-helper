import type { AllianceKey, LocalFilterState, UpdateProvider } from "./types";
import { DEFAULT_UPDATE_PROVIDER, UPDATE_REPOSITORIES } from "./config";

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
  updateRepo: string;
  autoCheckUpdates: boolean;
  autoDetectUpdateProvider: boolean;
  filters: LocalFilterState;
}

const STORAGE_KEY = "risingstones-partyfinder-helper:v1";

export const defaultFilters: LocalFilterState = {
  progressText: "",
  strategyText: "",
  timeText: "",
  excludeText: "",
  timeStart: "",
  timeEnd: "",
  timeDays: [],
  selectedJobIds: [],
  noDuplicateJobs: true,
  selectedPositions: [],
  alliance: "",
  showUnparsedTime: false
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
  updateRepo: UPDATE_REPOSITORIES[DEFAULT_UPDATE_PROVIDER],
  autoCheckUpdates: true,
  autoDetectUpdateProvider: true,
  filters: defaultFilters
};

export function loadUiState(): SavedUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultUiState;
    }
    const parsed = JSON.parse(raw) as Partial<SavedUiState>;
    const parsedProvider = parsed.updateProvider === "github" ? "github" : DEFAULT_UPDATE_PROVIDER;
    return {
      ...defaultUiState,
      ...parsed,
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
      updateProvider: parsedProvider,
      updateRepo:
        typeof parsed.updateRepo === "string" && parsed.updateRepo
          ? parsed.updateRepo
          : UPDATE_REPOSITORIES[parsedProvider],
      filters: {
        ...defaultFilters,
        ...(parsed.filters ?? {})
      }
    };
  } catch {
    return defaultUiState;
  }
}

export function saveUiState(state: SavedUiState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
