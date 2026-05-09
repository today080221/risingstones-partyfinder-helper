import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Database,
  Download,
  Eraser,
  ExternalLink,
  FileSearch,
  Filter,
  GitBranch,
  Globe2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Square,
  XCircle
} from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  checkUpdate,
  cancelNgaCollection,
  clearNgaSession,
  collectNgaSampleDetails,
  collectNgaVisibleSamples,
  fetchAppVersion,
  fetchGeoIp,
  fetchMeta,
  fetchNgaCollectionProgress,
  fetchNgaSessionStatus,
  fetchNgaVisiblePageStatus,
  fetchRecruitDetail,
  fetchRecruits,
  installUpdate,
  loadNgaSamples,
  navigateNgaSession,
  openNgaSession,
  saveNgaSamples
} from "./api";
import { UPDATE_PROVIDER_LABELS } from "./config";
import { isTauriRuntime, openExternalUrl } from "./lib/external-links";
import { filterRecruitRows, filterRecruitRowsByDataRange } from "./lib/filters";
import {
  FULL_PARTY_POSITIONS,
  LIGHT_PARTY_POSITIONS,
  buildJobPickerGroups,
  formatJobNames,
  getOpenPositions
} from "./lib/jobs";
import {
  analyzeNgaSamples,
  applyNgaCacheLifecycle,
  buildNgaCachedTopicIndex,
  classifyNgaSample,
  cleanNgaDisplayText,
  getNgaSampleKey,
  getNgaSamplesPendingRefresh,
  isNgaSampleArchived,
  isNgaSampleSoftClosed,
  mergeNgaSamples,
  mergeNgaSamplesWithDiff,
  NGA_MAX_SAMPLE_STORE_ITEMS,
  NGA_RECRUIT_BOARD_URLS,
  normalizeNgaCacheReviewSamples,
  normalizeNgaCollectionSettings,
  resolveKeepLoginPreference,
  sanitizeNgaSample,
  shouldShowNgaSample
} from "./lib/nga";
import { buildRecruitTagOptions, deriveRecruitTags } from "./lib/tags";
import { formatRecruitDailyDuration, formatRecruitTimeDisplay } from "./lib/time";
import { getUpdateLevel, getUpdateStatusLabel, getUpdateStatusText } from "./lib/update-status";
import { ALL_RECRUIT_SOURCES, defaultFilters, loadUiState, saveUiState } from "./storage";
import type {
  AllianceKey,
  AppVersionPayload,
  FbConfig,
  GeoIpPayload,
  JobConfigEntry,
  LocalFilterState,
  MetaPayload,
  NgaCollectPayload,
  NgaCollectionProgress,
  NgaCollectionSettings,
  NgaDetailCollectPayload,
  NgaParsedFields,
  NgaRecruitViewMode,
  NgaSample,
  NgaSampleAnalysisReport,
  NgaSessionStatusPayload,
  NgaVisiblePageStatusPayload,
  PositionKey,
  RecruitDetail,
  RecruitFetchPayload,
  RecruitQuery,
  RecruitRow,
  RecruitSource,
  RecruitSourceMeta,
  UpdateAsset,
  UpdateCheckPayload,
  UpdateProvider
} from "./types";

const DAY_OPTIONS = [
  ["1", "周一"],
  ["2", "周二"],
  ["3", "周三"],
  ["4", "周四"],
  ["5", "周五"],
  ["6", "周六"],
  ["0", "周日"]
] as const;

const ALLIANCES: Array<["" | AllianceKey, string]> = [
  ["", "不限团队"],
  ["A", "团队A"],
  ["B", "团队B"],
  ["C", "团队C"]
];

const SOURCE_OPTIONS: Array<[RecruitSource, string]> = [
  ["official", "石之家"],
  ["nga", "NGA"]
];
const NGA_RECRUIT_VIEW_OPTIONS: Array<[NgaRecruitViewMode, string]> = [
  ["teams", "队伍招募"],
  ["seeking", "玩家求职"],
  ["all", "全部"]
];

const NGA_KEEP_LOGIN_NOTICE =
  "保持本机网页会话说明\n\n" +
  "开启后，本软件会使用内置网页窗口的本地数据目录保存 NGA 的普通网页会话，这样下次打开软件时通常不需要重新操作。\n\n" +
  "本软件只读取页面上已经渲染出的公开招募内容，不读取、导出、上传或展示网页内部状态；网页会话由本机网页窗口按普通浏览器机制保存。\n\n" +
  "如果你使用的是公用电脑，或者不希望本机保存网页会话，请不要开启此选项。你也可以随时在设置中清除 NGA 本机网页状态。";
const NGA_AUTO_COLLECT_MAX_WAIT_MS = 15 * 60 * 1000;
const NGA_BOARD_READY_MAX_WAIT_MS = 15 * 1000;
const NGA_BOARD_INTERSTITIAL_MAX_WAIT_MS = 45 * 1000;
const NGA_UPDATE_FLASH_MS = 2200;
const NGA_RECRUIT_BOARD_PRESETS = [
  [NGA_RECRUIT_BOARD_URLS.cn, "国服"],
  [NGA_RECRUIT_BOARD_URLS.jp, "日服"],
  [NGA_RECRUIT_BOARD_URLS.eu, "欧区"],
  [NGA_RECRUIT_BOARD_URLS.oceania, "大洋洲"],
  [NGA_RECRUIT_BOARD_URLS.us, "美区"]
] as const;

export function App() {
  const initialState = useMemo(loadUiState, []);
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [metaError, setMetaError] = useState("");
  const [fbType, setFbType] = useState(initialState.fbType);
  const [fbName, setFbName] = useState(initialState.fbName);
  const [teamComposition, setTeamComposition] = useState(initialState.teamComposition);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialState.sidebarCollapsed);
  const [updateProvider, setUpdateProvider] = useState<UpdateProvider>(initialState.updateProvider);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(initialState.autoCheckUpdates);
  const [autoDetectUpdateProvider, setAutoDetectUpdateProvider] = useState(initialState.autoDetectUpdateProvider);
  const [sourceFilters, setSourceFilters] = useState<RecruitSource[]>(initialState.sourceFilters);
  const [ngaSettings, setNgaSettings] = useState<NgaCollectionSettings>(
    normalizeNgaCollectionSettings(initialState.ngaSettings)
  );
  const [ngaKeepLoginAcknowledged, setNgaKeepLoginAcknowledged] = useState(initialState.ngaKeepLoginAcknowledged);
  const [ngaSession, setNgaSession] = useState<NgaSessionStatusPayload | null>(null);
  const [ngaSamples, setNgaSamples] = useState<NgaSample[]>([]);
  const [ngaSamplesLoaded, setNgaSamplesLoaded] = useState(false);
  const [updatedRowKeys, setUpdatedRowKeys] = useState<Set<string>>(() => new Set());
  const [softClosedRowKeys, setSoftClosedRowKeys] = useState<Set<string>>(() => new Set());
  const [ngaSampleStoreLocation, setNgaSampleStoreLocation] = useState("");
  const [ngaReport, setNgaReport] = useState<NgaSampleAnalysisReport | null>(null);
  const [ngaProgress, setNgaProgress] = useState<NgaCollectionProgress>({
    status: "idle",
    currentUrl: "",
    collected: 0,
    maxItems: ngaSettings.maxItems,
    message: "还没有开始读取 NGA 招募。"
  });
  const [ngaError, setNgaError] = useState("");
  const [ngaMessage, setNgaMessage] = useState("");
  const [isOpeningNga, setIsOpeningNga] = useState(false);
  const [isClearingNga, setIsClearingNga] = useState(false);
  const [isCollectingNga, setIsCollectingNga] = useState(false);
  const [isAutoCollectArmed, setIsAutoCollectArmed] = useState(false);
  const [filters, setFilters] = useState<LocalFilterState>(initialState.filters);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [tagFiltersExpanded, setTagFiltersExpanded] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [appVersion, setAppVersion] = useState<AppVersionPayload | null>(null);
  const [geoInfo, setGeoInfo] = useState<GeoIpPayload | null>(null);
  const [geoResolved, setGeoResolved] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckPayload | null>(null);
  const [updateError, setUpdateError] = useState("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateInstallMessage, setUpdateInstallMessage] = useState("");
  const [updateInstallError, setUpdateInstallError] = useState("");
  const [payload, setPayload] = useState<RecruitFetchPayload | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const updateAbortRef = useRef<AbortController | null>(null);
  const ngaAutoCollectRunRef = useRef(0);
  const ngaAutoCollectStartedRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchMeta(controller.signal)
      .then(setMeta)
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setMetaError(error.message);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAppVersion(controller.signal)
      .then(setAppVersion)
      .catch(() => {
        setAppVersion(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchNgaSessionStatus(controller.signal)
      .then(setNgaSession)
      .catch(() => {
        setNgaSession({
          available: false,
          loginStatus: "unknown",
          keepLogin: false,
          dataLocation: "仅桌面版会保存本机网页窗口状态。",
          message: "浏览器预览仅能使用已保存的 NGA 招募。"
        });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadNgaSamples(controller.signal)
      .then((payload) => {
        const loadedSamples = mergeNgaSamples(payload.samples, NGA_MAX_SAMPLE_STORE_ITEMS);
        const samples = normalizeNgaCacheReviewSamples(loadedSamples, NGA_MAX_SAMPLE_STORE_ITEMS);
        const patchedCacheMetadata = samples.some((sample, index) => sample.closedAt !== loadedSamples[index]?.closedAt);
        setNgaSamples(samples);
        setSoftClosedRowKeys(new Set(samples.filter(isNgaSampleSoftClosed).map((sample) => getNgaRenderKey(sample))));
        setNgaSampleStoreLocation(payload.dataLocation);
        if (samples.length > 0) {
          setNgaReport(analyzeNgaSamples(samples));
          setNgaMessage(payload.message);
        }
        if (patchedCacheMetadata) {
          void saveNgaSamples(samples)
            .then((saved) => setNgaSampleStoreLocation(saved.dataLocation))
            .catch((error: Error) => {
              setNgaError(`NGA 已保存招募元数据补齐失败：${error.message}`);
            });
        }
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setNgaError(`NGA 已保存招募读取失败：${error.message}`);
        }
      })
      .finally(() => {
        setNgaSamplesLoaded(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!ngaSession?.available || !ngaSession.autoCollectOnStart || ngaAutoCollectStartedRef.current) {
      return;
    }
    ngaAutoCollectStartedRef.current = true;
    void openNgaAndCollectAfterLogin();
  }, [ngaSession?.available, ngaSession?.autoCollectOnStart]);

  useEffect(() => {
    const controller = new AbortController();
    fetchGeoIp(controller.signal)
      .then((payload) => {
        setGeoInfo(payload);
        if (autoDetectUpdateProvider) {
          applyUpdateProvider(payload.recommendedProvider);
        }
        setGeoResolved(true);
      })
      .catch(() => {
        if (autoDetectUpdateProvider) {
          applyUpdateProvider("gitee");
        }
        setGeoResolved(true);
      });
    return () => controller.abort();
  }, [autoDetectUpdateProvider]);

  useEffect(() => {
    return () => updateAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      ngaAutoCollectRunRef.current += 1;
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!autoCheckUpdates || (autoDetectUpdateProvider && !geoResolved)) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runUpdateCheck(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [autoCheckUpdates, autoDetectUpdateProvider, geoResolved, updateProvider]);

  useEffect(() => {
    if (!isCollectingNga) {
      return;
    }
    const timer = window.setInterval(() => {
      fetchNgaCollectionProgress()
        .then((progress) => {
          if (progress.status === "collecting") {
            setNgaProgress(progress);
          }
        })
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isCollectingNga]);

  useEffect(() => {
    saveUiState({
      fbType,
      fbName,
      targetAreaId: filters.areaPreferenceId,
      labels: filters.selectedLabelIds,
      teamComposition,
      officialPosition: "",
      officialAlliance: "",
      sidebarCollapsed,
      updateProvider,
      autoCheckUpdates,
      autoDetectUpdateProvider,
      sourceFilters,
      ngaSettings,
      ngaKeepLoginAcknowledged,
      filters
    });
  }, [
    fbType,
    fbName,
    teamComposition,
    filters.areaPreferenceId,
    sidebarCollapsed,
    updateProvider,
    autoCheckUpdates,
    autoDetectUpdateProvider,
    sourceFilters,
    ngaSettings,
    ngaKeepLoginAcknowledged,
    filters
  ]);

  const fbTypes = useMemo(() => {
    const types = new Set(meta?.fbConfigs.map((config) => config.fb_type) ?? []);
    return [...types];
  }, [meta]);

  const selectedConfig = useMemo(
    () => meta?.fbConfigs.find((config) => config.fb_name === fbName),
    [fbName, meta]
  );

  const fbOptions = useMemo(() => {
    const configs = meta?.fbConfigs ?? [];
    return configs
      .filter((config) => !fbType || config.fb_type === fbType)
      .slice()
      .sort(sortFbConfig);
  }, [fbType, meta]);

  const positionOptions = teamComposition === "轻锐小队" ? LIGHT_PARTY_POSITIONS : FULL_PARTY_POSITIONS;

  const officialRows = useMemo(() => (payload?.rows ?? []).map(markOfficialRow), [payload]);
  const ngaRows = useMemo(
    () =>
      ngaSamples
        .filter((sample) => !isNgaSampleArchived(sample))
        .filter((sample) => shouldShowNgaSample(sample, ngaSettings.filterMode))
        .map((sample, index) => ngaSampleToRecruitRow(sample, index)),
    [ngaSamples, ngaSettings.filterMode]
  );
  const selectedSources = useMemo(() => new Set(sourceFilters), [sourceFilters]);
  const hasOfficialSource = selectedSources.has("official");
  const hasNgaSource = selectedSources.has("nga");
  const selectedSourceLabel = useMemo(() => {
    if (sourceFilters.length === SOURCE_OPTIONS.length) {
      return "石之家 + NGA";
    }
    return sourceFilters.map((source) => SOURCE_OPTIONS.find(([value]) => value === source)?.[1] ?? source).join(" + ") || "未选择来源";
  }, [sourceFilters]);
  const selectedViewLabel = useMemo(
    () => NGA_RECRUIT_VIEW_OPTIONS.find(([value]) => value === filters.ngaRecruitView)?.[1] ?? "队伍招募",
    [filters.ngaRecruitView]
  );
  const selectedNgaBoardLabels = useMemo(
    () =>
      ngaSettings.selectedBoardUrls.map(
        (url) => NGA_RECRUIT_BOARD_PRESETS.find(([presetUrl]) => presetUrl === url)?.[1] ?? "自定义"
      ),
    [ngaSettings.selectedBoardUrls]
  );
  const combinedRows = useMemo(() => {
    const rows: RecruitRow[] = [];
    if (hasOfficialSource) {
      rows.push(...officialRows);
    }
    if (hasNgaSource) {
      rows.push(...ngaRows);
    }
    return rows;
  }, [hasNgaSource, hasOfficialSource, ngaRows, officialRows]);
  const rangeRows = useMemo(
    () => filterRecruitRowsByDataRange(combinedRows, { fbType, fbName }, meta),
    [combinedRows, fbName, fbType, meta]
  );
  const viewRows = useMemo(
    () => rangeRows.filter((row) => matchesRecruitView(row, filters.ngaRecruitView)),
    [filters.ngaRecruitView, rangeRows]
  );
  const tagFilterOptions = useMemo(
    () => buildRecruitTagOptions(viewRows, meta?.labels ?? [], filters.selectedLabelIds),
    [filters.selectedLabelIds, meta, viewRows]
  );
  const orderedTagFilterOptions = useMemo(() => {
    const selected = new Set(filters.selectedLabelIds);
    return [...tagFilterOptions].sort((a, b) => {
      const activeDelta = Number(selected.has(b.id)) - Number(selected.has(a.id));
      if (activeDelta !== 0) {
        return activeDelta;
      }
      return 0;
    });
  }, [filters.selectedLabelIds, tagFilterOptions]);
  const filtered = useMemo(() => filterRecruitRows(viewRows, filters, meta), [filters, meta, viewRows]);
  const pendingNgaRefreshSamples = useMemo(
    () => getNgaSamplesPendingRefresh(ngaSamples, ngaSettings.refreshIntervalHours),
    [ngaSamples, ngaSettings.refreshIntervalHours]
  );
  const archivedNgaSampleCount = useMemo(() => ngaSamples.filter(isNgaSampleArchived).length, [ngaSamples]);
  const latestNgaCheckedAt = useMemo(() => getLatestNgaCacheTime(ngaSamples), [ngaSamples]);
  const suggestedUpdateAsset = useMemo(
    () => selectUpdateAsset(updateInfo?.assets ?? [], appVersion),
    [appVersion, updateInfo]
  );
  const updatePanelLevel = useMemo(() => getUpdateLevel(updateInfo, false, ""), [updateInfo]);
  const updatePanelLabel = updateInfo ? getUpdateStatusLabel(updatePanelLevel, updateInfo, false, "") : "";
  const updatePanelText = updateInfo ? getUpdateStatusText(updatePanelLevel, updateInfo, updateProvider, "") : "";

  useEffect(() => {
    if (
      ngaAutoCollectStartedRef.current ||
      !ngaSamplesLoaded ||
      !ngaSettings.autoRefreshOnStart ||
      !hasNgaSource ||
      !isTauriRuntime() ||
      isCollectingNga ||
      pendingNgaRefreshSamples.length === 0
    ) {
      return;
    }
    ngaAutoCollectStartedRef.current = true;
    const timer = window.setTimeout(() => {
      void collectNgaSelectedBoards(undefined, { reason: "startup-refresh" });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    hasNgaSource,
    isCollectingNga,
    ngaSamplesLoaded,
    ngaSettings.autoRefreshOnStart,
    pendingNgaRefreshSamples.length
  ]);

  const groupedJobs = useMemo(() => {
    if (!meta) {
      return [];
    }
    return buildJobPickerGroups(meta.jobConfig);
  }, [meta]);

  const selectedJobs = useMemo(() => {
    if (!meta) {
      return [];
    }
    return filters.selectedJobIds
      .map((id) => meta.jobMeta.jobsById[id])
      .filter((job): job is JobConfigEntry => Boolean(job));
  }, [filters.selectedJobIds, meta]);

  function updateFilters(patch: Partial<LocalFilterState>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function updateNgaSettings(patch: Partial<NgaCollectionSettings>) {
    setNgaSettings((current) => normalizeNgaCollectionSettings({ ...current, ...patch }));
  }

  function toggleSourceFilter(source: RecruitSource) {
    setSourceFilters((current) => {
      const next = current.includes(source) ? current.filter((item) => item !== source) : [...current, source];
      return ALL_RECRUIT_SOURCES.filter((item) => next.includes(item));
    });
  }

  function toggleNgaBoardUrl(boardUrl: string) {
    setNgaSettings((current) => {
      if (!current.allowMultipleBoards) {
        return normalizeNgaCollectionSettings({
          ...current,
          startUrl: boardUrl,
          selectedBoardUrls: [boardUrl]
        });
      }
      const nextSelected = current.selectedBoardUrls.includes(boardUrl)
        ? current.selectedBoardUrls.filter((url) => url !== boardUrl)
        : [...current.selectedBoardUrls, boardUrl];
      const selectedBoardUrls = nextSelected.length ? nextSelected : [boardUrl];
      return normalizeNgaCollectionSettings({
        ...current,
        startUrl: selectedBoardUrls[0],
        selectedBoardUrls
      });
    });
  }

  function toggleNgaMultiBoardMode(nextValue: boolean) {
    setNgaSettings((current) =>
      normalizeNgaCollectionSettings({
        ...current,
        allowMultipleBoards: nextValue,
        selectedBoardUrls: nextValue ? current.selectedBoardUrls : [current.selectedBoardUrls[0] ?? current.startUrl]
      })
    );
  }

  async function applyNgaSamples(incomingSamples: NgaSample[], message?: string, options: { replace?: boolean } = {}): Promise<NgaSample[]> {
    const enrichedIncoming = incomingSamples.map((sample) => enrichNgaSampleForCache(sample));
    const scrollAnchor = captureResultScrollAnchor();
    const mergeResult = options.replace
      ? {
          samples: mergeNgaSamples(enrichedIncoming, NGA_MAX_SAMPLE_STORE_ITEMS),
          addedKeys: enrichedIncoming.map(getNgaSampleKey).filter(Boolean),
          updatedKeys: [],
          checkedKeys: [],
          softClosedKeys: enrichedIncoming.filter(isNgaSampleSoftClosed).map(getNgaSampleKey).filter(Boolean)
        }
      : mergeNgaSamplesWithDiff(ngaSamples, enrichedIncoming, NGA_MAX_SAMPLE_STORE_ITEMS);
    const sanitized = mergeResult.samples;
    setNgaSamples(sanitized);
    setNgaReport(sanitized.length ? analyzeNgaSamples(sanitized) : null);
    if (options.replace) {
      setUpdatedRowKeys(new Set());
      setSoftClosedRowKeys(new Set(sanitized.filter(isNgaSampleSoftClosed).map((sample) => getNgaRenderKey(sample))));
    } else {
      markNgaRowsChanged(mergeResult.addedKeys, mergeResult.updatedKeys, mergeResult.softClosedKeys);
    }
    restoreResultScrollAnchor(scrollAnchor);
    try {
      const saved = await saveNgaSamples(sanitized);
      setNgaSampleStoreLocation(saved.dataLocation);
      setNgaMessage(message ?? saved.message);
    } catch (error) {
      setNgaMessage(message ?? `已保留 ${sanitized.length} 条 NGA 招募。`);
      setNgaError(error instanceof Error ? `NGA 招募保存失败：${error.message}` : `NGA 招募保存失败：${String(error)}`);
    }
    return sanitized;
  }

  function markNgaRowsChanged(addedKeys: string[], updatedKeys: string[], softClosedKeys: string[]) {
    const flashKeys = [...addedKeys, ...updatedKeys].map((key) => `nga-${key}`);
    const closedKeys = softClosedKeys.map((key) => `nga-${key}`);
    if (flashKeys.length) {
      setUpdatedRowKeys((current) => new Set([...current, ...flashKeys]));
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
      }
      flashTimerRef.current = window.setTimeout(() => {
        setUpdatedRowKeys((current) => {
          const next = new Set(current);
          for (const key of flashKeys) {
            next.delete(key);
          }
          return next;
        });
      }, NGA_UPDATE_FLASH_MS);
    }
    if (closedKeys.length) {
      setSoftClosedRowKeys((current) => new Set([...current, ...closedKeys]));
    }
  }

  function toggleJobId(jobId: string) {
    updateFilters({
      selectedJobIds: filters.selectedJobIds.includes(jobId)
        ? filters.selectedJobIds.filter((id) => id !== jobId)
        : [...filters.selectedJobIds, jobId]
    });
  }

  function onFbNameChange(nextName: string) {
    setFbName(nextName);
    const config = meta?.fbConfigs.find((item) => item.fb_name === nextName);
    if (config) {
      setFbType(config.fb_type);
      setTeamComposition(config.team_composition);
      updateFilters({ selectedPositions: [], alliance: "" });
    }
  }

  async function loadRecruits() {
    if (!fbName) {
      setFetchError("请先选择副本名称。");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setFetchError("");

    try {
      const query = buildRecruitQuery({
        fbName,
        fbType,
        teamComposition
      });
      const result = await fetchRecruits(query, controller.signal);
      setPayload(result);
    } catch (error) {
      const typed = error as Error;
      if (typed.name !== "AbortError") {
        setFetchError(typed.message);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  }

  async function runAggregateSearch() {
    if (!sourceFilters.length) {
      setFetchError("请至少选择一个结果来源。");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const notices: string[] = [];
    setIsLoading(true);
    setFetchError("");
    setNgaError("");

    try {
      if (hasOfficialSource) {
        if (!fbName) {
          notices.push("石之家已跳过：请先选择副本名称。");
        } else {
          try {
            const query = buildRecruitQuery({
              fbName,
              fbType,
              teamComposition
            });
            const result = await fetchRecruits(query, controller.signal);
            setPayload(result);
          } catch (error) {
            const typed = error as Error;
            if (typed.name !== "AbortError") {
              notices.push(`石之家拉取失败：${typed.message}`);
            }
          }
        }
      }

      if (hasNgaSource && controller.signal.aborted === false) {
        await collectNgaSelectedBoards(controller.signal);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
      if (notices.length) {
        setFetchError(notices.join(" "));
      }
    }
  }

  function cancelLoad() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }

  function resetLocalFilters() {
    setFilters(defaultFilters);
  }

  async function toggleNgaKeepLogin(nextValue: boolean) {
    const enabled = await resolveKeepLoginPreference(ngaSettings.keepLogin, nextValue, () => {
      if (ngaKeepLoginAcknowledged) {
        return true;
      }
      const confirmed = window.confirm(NGA_KEEP_LOGIN_NOTICE);
      if (confirmed) {
        setNgaKeepLoginAcknowledged(true);
      }
      return confirmed;
    });
    updateNgaSettings({ keepLogin: enabled });
  }

  async function openNgaLoginWindow() {
    setIsOpeningNga(true);
    setNgaError("");
    setNgaMessage("");
    try {
      const result = await openNgaSession({ ...ngaSettings, windowMode: "normal" });
      setNgaSession(result);
      setNgaMessage(result.message);
    } catch (error) {
      setNgaError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOpeningNga(false);
    }
  }

  async function clearNgaLoginState() {
    const confirmed = window.confirm("将清除本应用内 NGA 网页窗口保存的本机状态，不影响系统浏览器。是否继续？");
    if (!confirmed) {
      return;
    }
    setIsClearingNga(true);
    setNgaError("");
    setNgaMessage("");
    try {
      const result = await clearNgaSession();
      setNgaSession((current) => ({
        available: current?.available ?? true,
        loginStatus: "unknown",
        keepLogin: false,
        dataLocation: result.dataLocation,
        message: result.message
      }));
      setNgaMessage(result.message);
    } catch (error) {
      setNgaError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsClearingNga(false);
    }
  }

  async function collectNgaSamplesFromVisiblePage() {
    setIsCollectingNga(true);
    setNgaError("");
    setNgaMessage("");
    setNgaProgress({
      status: "collecting",
      currentUrl: "",
      collected: 0,
      maxItems: ngaSettings.maxItems,
      message: "正在按设置的请求间隔读取当前 NGA 可见页面。"
    });
    try {
      const result: NgaCollectPayload = await collectNgaVisibleSamples(
        { ...ngaSettings, cachedSamples: buildNgaCachedTopicIndex(ngaSamples) }
      );
      const sanitized = await applyNgaSamples(
        result.samples,
        `${result.progress.message} 已保存招募现有 ${mergeNgaSamples([...ngaSamples, ...result.samples], NGA_MAX_SAMPLE_STORE_ITEMS).length} 条。`
      );
      setNgaProgress(result.progress);
      if (result.warnings.length) {
        setNgaError(result.warnings.join("；"));
      } else {
        setNgaError("");
      }
      if (sanitized.length >= NGA_MAX_SAMPLE_STORE_ITEMS) {
        setNgaMessage(`已保存招募达到 ${NGA_MAX_SAMPLE_STORE_ITEMS} 条上限，后续会继续去重保留前 ${NGA_MAX_SAMPLE_STORE_ITEMS} 条。`);
      }
    } catch (error) {
      setNgaProgress((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString()
      }));
      setNgaError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCollectingNga(false);
    }
  }

  async function collectNgaSelectedBoards(signal?: AbortSignal, options: { reason?: "startup-refresh" | "manual" } = {}) {
    const runId = ngaAutoCollectRunRef.current + 1;
    ngaAutoCollectRunRef.current = runId;
    const boardUrls = ngaSettings.selectedBoardUrls.length ? ngaSettings.selectedBoardUrls : [ngaSettings.startUrl];
    const startedAt = new Date().toISOString();
    const totalBudget = ngaSettings.maxItems;
    let scannedThisRun = 0;
    let addedThisRun = 0;
    let checkedThisRun = 0;
    let reviewedThisRun = 0;
    let archivedThisRun = 0;
    let deletedThisRun = 0;
    let collectedSamples = ngaSamples;

    if (!isTauriRuntime()) {
      setNgaMessage("浏览器预览仅合并当前页面内存/本机已有 NGA 招募；请使用桌面版读取 NGA。");
      setNgaProgress({
        status: "completed",
        currentUrl: "",
        collected: 0,
        maxItems: totalBudget,
        message: "浏览器预览未打开本机网页窗口。",
        startedAt,
        finishedAt: new Date().toISOString()
      });
      return;
    }

    setIsCollectingNga(true);
    setIsAutoCollectArmed(false);
    setNgaError("");
    setNgaMessage(`准备读取已选 ${boardUrls.length} 个 NGA 招募板。`);
    setNgaProgress({
      status: "collecting",
      currentUrl: boardUrls[0] ?? "",
      collected: 0,
      maxItems: totalBudget,
      message: "正在打开本机网页窗口，并按地区顺序读取公开可见内容。",
      startedAt
    });

    try {
      setIsOpeningNga(true);
      const pageStatus = await fetchNgaVisiblePageStatus(signal).catch(() => null);
      if (pageStatus?.opened) {
        await navigateNgaSession(boardUrls[0], signal);
        setNgaMessage("已复用当前 NGA 窗口，开始按地区顺序读取。");
      } else {
        const sessionResult = await openNgaSession({ ...ngaSettings, startUrl: boardUrls[0], windowMode: ngaSettings.windowMode }, signal);
        setNgaSession(sessionResult);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNgaError(message);
      setNgaProgress((current) => ({
        ...current,
        status: "error",
        message,
        finishedAt: new Date().toISOString()
      }));
      setIsCollectingNga(false);
      return;
    } finally {
      setIsOpeningNga(false);
    }

    try {
      for (let index = 0; index < boardUrls.length; index += 1) {
        if (signal?.aborted || ngaAutoCollectRunRef.current !== runId || scannedThisRun >= totalBudget) {
          break;
        }
        const boardUrl = boardUrls[index];
        const boardLabel = NGA_RECRUIT_BOARD_PRESETS.find(([url]) => url === boardUrl)?.[1] ?? "NGA 招募板";
        const remaining = totalBudget - scannedThisRun;

        if (index > 0) {
          await navigateNgaSession(boardUrl, signal);
        }

        const ready = await waitForNgaPageReady(boardUrl, boardLabel, runId, signal);
        if (!ready) {
          continue;
        }

        setNgaProgress((current) => ({
          ...current,
          status: "collecting",
          currentUrl: boardUrl,
          collected: scannedThisRun,
          maxItems: totalBudget,
          message: `正在读取 ${boardLabel}，本轮剩余预算 ${remaining} 条。`
        }));

        const result = await collectNgaVisibleSamples(
          { ...ngaSettings, maxItems: remaining, cachedSamples: buildNgaCachedTopicIndex(collectedSamples) },
          signal
        );
        const scannedByBoard = Math.min(result.progress.collected || result.samples.length, remaining);
        const reviewedByBoard =
          result.progress.reviewed ?? (result.progress.updated ?? 0) + (result.progress.pendingRefresh ?? 0);
        scannedThisRun += scannedByBoard;
        addedThisRun += result.progress.added ?? 0;
        checkedThisRun += result.progress.checked ?? 0;
        reviewedThisRun += reviewedByBoard;
        if (result.samples.length) {
          collectedSamples = await applyNgaSamples(
            result.samples,
            `已从 ${boardLabel} 快扫 ${result.progress.collected} 个主题，新帖 ${result.progress.added ?? 0} 条，复核 ${reviewedByBoard} 条。`
          );
        }
        if (result.warnings.length) {
          setNgaError(result.warnings.join("；"));
        }
        setNgaProgress({
          ...result.progress,
          currentUrl: boardUrl,
          collected: Math.min(scannedThisRun, totalBudget),
          maxItems: totalBudget,
          message: `${boardLabel}：${result.progress.message}`
        });
      }

      const cancelled = signal?.aborted || ngaAutoCollectRunRef.current !== runId;
      if (!cancelled) {
        const lifecycleResult = applyNgaCacheLifecycle(collectedSamples, {
          activeWindowSize: totalBudget,
          scannedCount: scannedThisRun,
          scannedAt: startedAt,
          archiveAfterDays: ngaSettings.recentActiveDays
        });
        archivedThisRun = lifecycleResult.archivedCount;
        deletedThisRun = lifecycleResult.deletedCount;
        const shouldPersistLifecycle =
          scannedThisRun >= totalBudget || archivedThisRun > 0 || deletedThisRun > 0 || lifecycleResult.samples.length !== collectedSamples.length;
        if (shouldPersistLifecycle) {
          const scrollAnchor = captureResultScrollAnchor();
          collectedSamples = lifecycleResult.samples;
          setNgaSamples(collectedSamples);
          setNgaReport(collectedSamples.length ? analyzeNgaSamples(collectedSamples) : null);
          setSoftClosedRowKeys(new Set(collectedSamples.filter(isNgaSampleSoftClosed).map((sample) => getNgaRenderKey(sample))));
          restoreResultScrollAnchor(scrollAnchor);
          try {
            const saved = await saveNgaSamples(collectedSamples);
            setNgaSampleStoreLocation(saved.dataLocation);
          } catch (error) {
            setNgaError(error instanceof Error ? `NGA 已保存招募生命周期保存失败：${error.message}` : `NGA 已保存招募生命周期保存失败：${String(error)}`);
          }
        }
      }
      const pendingAfterRun = getNgaSamplesPendingRefresh(collectedSamples, ngaSettings.refreshIntervalHours).length;
      const completedMessage =
        addedThisRun === 0 && reviewedThisRun === 0
          ? `已快扫活跃窗口，无需打开正文。快扫 ${scannedThisRun}/${totalBudget} · 新帖 0 · 复核 0 · 归档 ${archivedThisRun} · 清理 ${deletedThisRun}。`
          : `NGA 聚合检索完成。快扫 ${scannedThisRun}/${totalBudget} · 新帖 ${addedThisRun} · 复核 ${reviewedThisRun} · 归档 ${archivedThisRun} · 清理 ${deletedThisRun} · 待刷新 ${pendingAfterRun}。`;
      setNgaProgress((current) => ({
        ...current,
        status: cancelled ? "cancelled" : "completed",
        collected: Math.min(scannedThisRun, totalBudget),
        maxItems: totalBudget,
        added: addedThisRun,
        checked: checkedThisRun,
        reviewed: reviewedThisRun,
        fastScanned: scannedThisRun,
        archived: archivedThisRun,
        deleted: deletedThisRun,
        pendingRefresh: pendingAfterRun,
        message: cancelled
          ? "NGA 聚合读取已停止。"
          : completedMessage,
        finishedAt: new Date().toISOString()
      }));
      if (!cancelled) {
        setNgaMessage(
          options.reason === "startup-refresh"
            ? completedMessage
            : `${completedMessage} 已保存招募现有 ${collectedSamples.length} 条。`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNgaError(message);
      setNgaProgress((current) => ({
        ...current,
        status: "error",
        message,
        finishedAt: new Date().toISOString()
      }));
    } finally {
      setIsCollectingNga(false);
      setIsAutoCollectArmed(false);
    }
  }

  async function waitForNgaPageReady(expectedUrl: string, boardLabel: string, runId: number, signal?: AbortSignal): Promise<boolean> {
    const interval = Math.max(500, ngaSettings.requestIntervalMs);
    const maxAttempts = Math.max(3, Math.ceil(NGA_BOARD_READY_MAX_WAIT_MS / interval));
    const interstitialMaxAttempts = Math.max(maxAttempts, Math.ceil(NGA_BOARD_INTERSTITIAL_MAX_WAIT_MS / interval));
    let redirectedToExpected = false;
    let latestStatus: NgaVisiblePageStatusPayload | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (signal?.aborted || ngaAutoCollectRunRef.current !== runId) {
        return false;
      }
      const pageStatus = await fetchNgaVisiblePageStatus(signal);
      latestStatus = pageStatus;
      if (isSameNgaTargetUrl(pageStatus.currentUrl, expectedUrl)) {
        setNgaProgress((current) => ({
          ...current,
          currentUrl: pageStatus.currentUrl || expectedUrl,
          message: `${boardLabel} 已就绪，准备读取。`
        }));
        return true;
      }
      if (!pageStatus.opened) {
        setNgaError("NGA 窗口已关闭，本轮已跳过。");
        return false;
      }
      if (pageStatus.allowed && !isSameNgaTargetUrl(pageStatus.currentUrl, expectedUrl) && !redirectedToExpected) {
        redirectedToExpected = true;
        await navigateNgaSession(expectedUrl, signal);
        await sleep(interval);
        continue;
      }
      if (pageStatus.state === "interstitial") {
        return waitForNgaInterstitialReady(expectedUrl, boardLabel, runId, interval, interstitialMaxAttempts, attempt, signal);
      }
      if (!redirectedToExpected) {
        redirectedToExpected = true;
        try {
          await navigateNgaSession(expectedUrl, signal);
        } catch {
          // Keep polling; the visible window may still finish loading the requested board.
        }
      }
      setNgaProgress((current) => ({
        ...current,
        currentUrl: pageStatus.currentUrl || expectedUrl,
        message: `${boardLabel} 正在打开目标板块，第 ${attempt}/${maxAttempts} 次检查。`
      }));
      await sleep(interval);
    }
    setNgaError(`${boardLabel} 未进入可读取页面，已跳过本地区。当前页面：${latestStatus?.currentUrl || "未知"}`);
    return false;
  }

  async function waitForNgaInterstitialReady(
    expectedUrl: string,
    boardLabel: string,
    runId: number,
    interval: number,
    maxAttempts: number,
    startAttempt: number,
    signal?: AbortSignal
  ): Promise<boolean> {
    for (let attempt = startAttempt; attempt <= maxAttempts; attempt += 1) {
      if (signal?.aborted || ngaAutoCollectRunRef.current !== runId) {
        return false;
      }
      const pageStatus = await fetchNgaVisiblePageStatus(signal);
      setNgaProgress((current) => ({
        ...current,
        currentUrl: pageStatus.currentUrl || expectedUrl,
        message:
          pageStatus.state === "interstitial"
            ? `${boardLabel} 打开了继续浏览页，请在 NGA 窗口点继续；工具会自动重试。`
            : isSameNgaTargetUrl(pageStatus.currentUrl, expectedUrl)
              ? `${boardLabel} 已就绪，准备读取。`
              : `${boardLabel} 正在返回目标板块，第 ${attempt}/${maxAttempts} 次检查。`
      }));
      if (isSameNgaTargetUrl(pageStatus.currentUrl, expectedUrl)) {
        return true;
      }
      if (!pageStatus.opened) {
        setNgaError("NGA 窗口已关闭，本轮已跳过。");
        return false;
      }
      await sleep(interval);
    }
    setNgaError(`${boardLabel} 仍停留在继续浏览页或未回到招募板，已跳过本地区。`);
    return false;
  }

  function isSameNgaTargetUrl(currentUrl: string | undefined, expectedUrl: string): boolean {
    try {
      const current = new URL(currentUrl || "");
      const expected = new URL(expectedUrl);
      const currentFile = current.pathname.toLowerCase().split("/").pop();
      const expectedFile = expected.pathname.toLowerCase().split("/").pop();
      if (currentFile !== expectedFile) {
        return false;
      }
      if (expectedFile === "thread.php") {
        return current.searchParams.get("stid") === expected.searchParams.get("stid");
      }
      if (expectedFile === "read.php") {
        return current.searchParams.get("tid") === expected.searchParams.get("tid");
      }
    } catch {
      return false;
    }
    return false;
  }

  async function collectNgaDetailsForStoredSamples() {
    if (ngaSamples.length === 0) {
      setNgaError("当前没有可补正文的 NGA 招募。");
      return;
    }
    setIsCollectingNga(true);
    setNgaError("");
    setNgaMessage("");
    setNgaProgress({
      status: "collecting",
      currentUrl: "",
      collected: 0,
      maxItems: Math.min(ngaSettings.maxItems, ngaSamples.length),
      message: "正在按已存帖子链接补齐正文，请保持 NGA 窗口可见。"
    });
    try {
      const result: NgaDetailCollectPayload = await collectNgaSampleDetails(ngaSamples, ngaSettings);
      const merged = await applyNgaSamples(
        result.samples,
        `${result.progress.message} 已保存招募现有 ${mergeNgaSamples([...ngaSamples, ...result.samples], NGA_MAX_SAMPLE_STORE_ITEMS).length} 条。`
      );
      setNgaProgress(result.progress);
      if (result.warnings.length) {
        setNgaError(result.warnings.join("；"));
      } else {
        setNgaError("");
      }
      if (result.updated === 0 && merged.some((sample) => !sample.body)) {
        setNgaMessage("本轮没有新增正文。请确认 NGA 窗口能正常打开帖子详情页。");
      }
    } catch (error) {
      setNgaProgress((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString()
      }));
      setNgaError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCollectingNga(false);
    }
  }

  async function openNgaAndCollectAfterLogin() {
    const runId = ngaAutoCollectRunRef.current + 1;
    ngaAutoCollectRunRef.current = runId;
    setIsAutoCollectArmed(true);
    setIsCollectingNga(true);
    setIsOpeningNga(true);
    setNgaError("");
    setNgaMessage("已进入待命：请在弹出的 NGA 窗口打开招募版面或帖子页。");
    const startedAt = new Date().toISOString();
    let collectedSamples = ngaSamples;
    setNgaProgress({
      status: "collecting",
      currentUrl: "",
      collected: collectedSamples.length,
      maxItems: ngaSettings.maxItems,
      message: "等待你打开 NGA 招募页面；可随时点击停止。",
      startedAt
    });

    try {
      const sessionResult = await openNgaSession({ ...ngaSettings, windowMode: "normal" });
      setNgaSession(sessionResult);
      setNgaMessage("NGA 窗口已打开。请停留在招募列表或帖子页，工具会按请求间隔检查当前可见页面。");
    } catch (error) {
      setNgaError(error instanceof Error ? error.message : String(error));
      setNgaProgress((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString()
      }));
      setIsCollectingNga(false);
      setIsAutoCollectArmed(false);
      return;
    } finally {
      setIsOpeningNga(false);
    }

    const interval = Math.max(2_000, Math.min(15_000, ngaSettings.requestIntervalMs));
    const maxAttempts = Math.max(1, Math.ceil(NGA_AUTO_COLLECT_MAX_WAIT_MS / interval));
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (ngaAutoCollectRunRef.current !== runId) {
        setNgaProgress((current) => ({
          ...current,
          status: "cancelled",
          message: "已停止自动读取待命。",
          finishedAt: new Date().toISOString()
        }));
        setIsCollectingNga(false);
        setIsAutoCollectArmed(false);
        return;
      }

      setNgaProgress((current) => ({
        ...current,
        status: "collecting",
        collected: collectedSamples.length,
        maxItems: ngaSettings.maxItems,
        message: `等待目标页中，第 ${attempt}/${maxAttempts} 次检查；请保持 NGA 窗口可见并停留在招募页面。`
      }));

      let pageStatus: NgaVisiblePageStatusPayload;
      try {
        pageStatus = await fetchNgaVisiblePageStatus();
      } catch (error) {
        setNgaProgress((current) => ({
          ...current,
          status: "collecting",
          message: `暂时无法读取 NGA 窗口地址，将继续等待：${error instanceof Error ? error.message : String(error)}`
        }));
        await sleep(interval);
        continue;
      }

      if (!pageStatus.opened) {
        setNgaProgress((current) => ({
          ...current,
          status: "cancelled",
          currentUrl: "",
          message: "NGA 窗口已关闭，自动读取待命已停止。",
          finishedAt: new Date().toISOString()
        }));
        setNgaMessage("NGA 窗口已关闭；没有继续后台读取。");
        setIsCollectingNga(false);
        setIsAutoCollectArmed(false);
        return;
      }

      if (!pageStatus.allowed) {
        setNgaError("");
        setNgaProgress((current) => ({
          ...current,
          status: "collecting",
          currentUrl: pageStatus.currentUrl,
          collected: collectedSamples.length,
          maxItems: ngaSettings.maxItems,
          message: pageStatus.message
        }));
        setNgaMessage("当前页面暂不可读取；回到 NGA 招募页面后会继续检查。");
        await sleep(interval);
        continue;
      }

      setNgaError("");
      let result: NgaCollectPayload;
      try {
        result = await collectNgaVisibleSamples({ ...ngaSettings, cachedSamples: buildNgaCachedTopicIndex(collectedSamples) });
      } catch (error) {
        setNgaProgress((current) => ({
          ...current,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString()
        }));
        setNgaError(error instanceof Error ? error.message : String(error));
        setIsCollectingNga(false);
        setIsAutoCollectArmed(false);
        return;
      }
      if (ngaAutoCollectRunRef.current !== runId) {
        setNgaProgress(result.progress);
        setIsCollectingNga(false);
        setIsAutoCollectArmed(false);
        return;
      }
      if (result.samples.length > 0) {
        const sanitized = await applyNgaSamples(
          result.samples,
          `已在 NGA 当前可见页面读取到 ${result.samples.length} 条，已保存招募现有 ${mergeNgaSamples([...collectedSamples, ...result.samples], NGA_MAX_SAMPLE_STORE_ITEMS).length} 条。`
        );
        collectedSamples = sanitized;
        setNgaProgress(result.progress);
        if (result.warnings.length) {
          setNgaError(result.warnings.join("；"));
        } else {
          setNgaError("");
        }
        setIsCollectingNga(false);
        setIsAutoCollectArmed(false);
        return;
      }

      setNgaProgress({
        ...result.progress,
        status: "collecting",
        collected: collectedSamples.length,
        maxItems: ngaSettings.maxItems,
        message: "当前 NGA 可见页面暂未识别到招募内容；将继续按请求间隔等待。"
      });
      setNgaMessage("还没识别到招募内容。请在 NGA 窗口打开招募列表或具体帖子页。");
    }

    setNgaProgress((current) => ({
      ...current,
      status: "cancelled",
      message: "自动读取待命已到达 15 分钟上限，未继续后台等待。",
      finishedAt: new Date().toISOString()
    }));
    setIsCollectingNga(false);
    setIsAutoCollectArmed(false);
  }

  async function stopNgaCollection() {
    ngaAutoCollectRunRef.current += 1;
    try {
      const progress = await cancelNgaCollection();
      setNgaProgress(progress);
    } catch {
      setNgaProgress((current) => ({
        ...current,
        status: "cancelled",
        message: "已请求停止 NGA 读取。",
        finishedAt: new Date().toISOString()
      }));
    } finally {
      setIsCollectingNga(false);
      setIsAutoCollectArmed(false);
    }
  }

  async function clearNgaSamples() {
    await applyNgaSamples([], "已清空 NGA 已保存招募。", { replace: true });
    setNgaProgress({
      status: "idle",
      currentUrl: "",
      collected: 0,
      maxItems: ngaSettings.maxItems,
      message: "已清空 NGA 已保存招募。"
    });
  }

  function applyUpdateProvider(provider: UpdateProvider) {
    setUpdateProvider(provider);
    setUpdateInfo(null);
    setUpdateError("");
    setUpdateInstallMessage("");
    setUpdateInstallError("");
  }

  async function runUpdateCheck(silent = false) {
    updateAbortRef.current?.abort();
    const controller = new AbortController();
    updateAbortRef.current = controller;
    setIsCheckingUpdate(true);
    setUpdateError("");
    setUpdateInstallMessage("");
    setUpdateInstallError("");

    try {
      const result = await checkUpdate(updateProvider, controller.signal);
      setUpdateInfo(result);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setUpdateError((error as Error).message);
      }
    } finally {
      if (updateAbortRef.current === controller) {
        updateAbortRef.current = null;
        setIsCheckingUpdate(false);
      }
    }
  }

  async function installSuggestedUpdate() {
    if (!suggestedUpdateAsset) {
      setUpdateInstallError("没有找到适合当前客户端的更新包。");
      return;
    }

    const confirmed = window.confirm(
      `将下载并安装 ${suggestedUpdateAsset.name}。\n\n当前程序会自动退出，覆盖当前解压目录，然后重新启动新版。请先确认没有正在进行的全量拉取。`
    );
    if (!confirmed) {
      return;
    }

    setIsInstallingUpdate(true);
    setUpdateInstallMessage("");
    setUpdateInstallError("");

    try {
      const result = await installUpdate(suggestedUpdateAsset);
      setUpdateInstallMessage(result.message);
    } catch (error) {
      setUpdateInstallError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInstallingUpdate(false);
    }
  }

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand">
          <button
            type="button"
            className="brand-mark"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? "展开筛选器" : "折叠筛选器"}
          >
            <AppMark />
          </button>
          <div>
            <h1>副本招募筛选器</h1>
            <p>选定副本后拉取完整分页，本地二次过滤。</p>
          </div>
          <button
            type="button"
            className="collapse-button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? "展开筛选器" : "折叠筛选器"}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <div className="sidebar-content">
        <section className="panel source-panel">
          <div className="panel-title-row">
            <SectionTitle icon={<Globe2 size={16} />} title="数据来源" />
            <button
              type="button"
              className="panel-collapse-button"
              aria-expanded={sourcePanelOpen}
              onClick={() => setSourcePanelOpen((current) => !current)}
            >
              {sourcePanelOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              {sourcePanelOpen ? "收起" : "展开"}
            </button>
          </div>
          {sourcePanelOpen ? (
            <>
              <Field label="结果来源">
                <div className="source-toggle-grid" role="group" aria-label="结果来源">
                  {SOURCE_OPTIONS.map(([value, label]) => (
                    <ToggleButton
                      key={value}
                      active={sourceFilters.includes(value)}
                      label={label}
                      onClick={() => toggleSourceFilter(value)}
                    />
                  ))}
                </div>
              </Field>
              <Field label="浏览视图">
                <div className="segmented-control">
                  {NGA_RECRUIT_VIEW_OPTIONS.map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={filters.ngaRecruitView === value ? "active" : ""}
                      onClick={() => updateFilters({ ngaRecruitView: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              {hasNgaSource ? (
                <NgaPanel
                  settings={ngaSettings}
                  session={ngaSession}
                  progress={ngaProgress}
                  sampleCount={ngaSamples.length}
                  visibleSampleCount={ngaRows.length}
                  archivedSampleCount={archivedNgaSampleCount}
                  pendingRefreshCount={pendingNgaRefreshSamples.length}
                  sampleStoreLocation={ngaSampleStoreLocation}
                  report={ngaReport}
                  isOpening={isOpeningNga}
                  isClearing={isClearingNga}
                  isCollecting={isCollectingNga}
                  isAutoCollectArmed={isAutoCollectArmed}
                  message={ngaMessage}
                  error={ngaError}
                  onSettingsChange={updateNgaSettings}
                  onBoardToggle={toggleNgaBoardUrl}
                  onMultiBoardToggle={toggleNgaMultiBoardMode}
                  onKeepLoginChange={(nextValue) => void toggleNgaKeepLogin(nextValue)}
                  onOpen={() => void openNgaLoginWindow()}
                  onClear={() => void clearNgaLoginState()}
                  onAutoCollect={() => void openNgaAndCollectAfterLogin()}
                  onCollect={() => void collectNgaSamplesFromVisiblePage()}
                  onCollectDetails={() => void collectNgaDetailsForStoredSamples()}
                  onStop={() => void stopNgaCollection()}
                  onAnalyze={() => setNgaReport(analyzeNgaSamples(ngaSamples))}
                  onClearSamples={() => void clearNgaSamples()}
                />
              ) : null}
            </>
          ) : (
            <div className="source-panel-summary">
              <span>
                <strong>来源</strong>
                {selectedSourceLabel}
              </span>
              <span>
                <strong>视图</strong>
                {selectedViewLabel}
              </span>
              {hasNgaSource ? (
                <>
                  <span>
                    <strong>NGA地区</strong>
                    {formatNgaBoardSummary(selectedNgaBoardLabels)}
                  </span>
                  <span>
                    <strong>NGA已保存</strong>
                    {ngaSamples.length}
                  </span>
                  <span>
                    <strong>待刷新</strong>
                    {pendingNgaRefreshSamples.length}
                  </span>
                </>
              ) : null}
              {isCollectingNga || isAutoCollectArmed ? (
                <button type="button" className="danger-button source-summary-stop" onClick={() => void stopNgaCollection()}>
                  <XCircle size={15} />
                  停止
                </button>
              ) : null}
            </div>
          )}
        </section>

        <section className="panel">
          <SectionTitle icon={<Shield size={16} />} title="数据范围" />
          <Field label="副本类型">
            <select value={fbType} onChange={(event) => setFbType(event.target.value)} disabled={!meta}>
              <option value="">全部类型</option>
              {fbTypes.map((type) => (
                <option value={type} key={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="副本名称">
            <select value={fbName} onChange={(event) => onFbNameChange(event.target.value)} disabled={!meta}>
              <option value="">选择副本后允许全量拉取</option>
              {fbOptions.map((config) => (
                <option value={config.fb_name} key={config.id}>
                  {config.fb_name}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="panel">
          <SectionTitle icon={<Filter size={16} />} title="招募筛选条件" />
          <Field label="标签/类型">
            <ExpandableTagChipGrid
              options={orderedTagFilterOptions}
              selectedIds={filters.selectedLabelIds}
              expanded={tagFiltersExpanded}
              onExpandedChange={setTagFiltersExpanded}
              onToggle={(tagId) => {
                updateFilters({
                  selectedLabelIds: filters.selectedLabelIds.includes(tagId)
                    ? filters.selectedLabelIds.filter((id) => id !== tagId)
                    : [...filters.selectedLabelIds, tagId]
                });
              }}
            />
          </Field>
          <div className="two-columns">
            <Field label="不能早于">
              <input
                type="number"
                min="0"
                max="23"
                value={filters.timeStart}
                onChange={(event) => updateFilters({ timeStart: event.target.value })}
                placeholder="20"
              />
            </Field>
            <Field label="不能晚于">
              <input
                type="number"
                min="0"
                max="30"
                value={filters.timeEnd}
                onChange={(event) => updateFilters({ timeEnd: event.target.value })}
                placeholder="23"
              />
            </Field>
          </div>
          <Field label="每日最多小时">
            <input
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={filters.dailyMaxHours}
              onChange={(event) => updateFilters({ dailyMaxHours: event.target.value })}
              placeholder="例：3"
            />
          </Field>
          <Field label="星期">
            <div className="chip-grid compact">
              {DAY_OPTIONS.map(([value, label]) => (
                <ToggleChip
                  key={value}
                  active={filters.timeDays.includes(value)}
                  label={label}
                  onClick={() =>
                    updateFilters({
                      timeDays: filters.timeDays.includes(value)
                        ? filters.timeDays.filter((day) => day !== value)
                        : [...filters.timeDays, value]
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={filters.showUnparsedTime}
              onChange={(event) => updateFilters({ showUnparsedTime: event.target.checked })}
            />
            保留时间不明确的招募
          </label>
          <Field label="空缺位置">
            <div className="chip-grid compact">
              {positionOptions.map((position) => (
                <ToggleChip
                  key={position}
                  active={filters.selectedPositions.includes(position)}
                  label={position}
                  onClick={() =>
                    updateFilters({
                      selectedPositions: filters.selectedPositions.includes(position)
                        ? filters.selectedPositions.filter((item) => item !== position)
                        : [...filters.selectedPositions, position]
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <Field label="我想玩的职业">
            <JobPicker
              groups={groupedJobs}
              selectedIds={filters.selectedJobIds}
              selectedJobs={selectedJobs}
              search={jobSearch}
              disabled={!meta}
              onSearchChange={setJobSearch}
              onToggle={toggleJobId}
              onClear={() => updateFilters({ selectedJobIds: [] })}
            />
          </Field>
          <button
            type="button"
            className="disclosure-button"
            aria-expanded={advancedFiltersOpen}
            onClick={() => setAdvancedFiltersOpen((current) => !current)}
          >
            {advancedFiltersOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            高级筛选
          </button>
          {advancedFiltersOpen ? (
            <div className="compact-disclosure">
              <Field label="进度关键词">
                <input
                  value={filters.progressText}
                  onChange={(event) => updateFilters({ progressText: event.target.value })}
                  placeholder="例：从0 -清cd"
                />
              </Field>
              <Field label="攻略关键词">
                <input
                  value={filters.strategyText}
                  onChange={(event) => updateFilters({ strategyText: event.target.value })}
                  placeholder="例：菓子 a -无攻略"
                />
              </Field>
              <Field label="时间关键词">
                <input
                  value={filters.timeText}
                  onChange={(event) => updateFilters({ timeText: event.target.value })}
                  placeholder="例：晚 周末"
                />
              </Field>
              <Field label="不包含关键词">
                <input
                  value={filters.excludeText}
                  onChange={(event) => updateFilters({ excludeText: event.target.value })}
                  placeholder="例：保次 代打"
                />
              </Field>
              <Field label="大区偏好">
                <select
                  value={filters.areaPreferenceId}
                  onChange={(event) => updateFilters({ areaPreferenceId: event.target.value })}
                  disabled={!meta}
                >
                  <option value="">不限大区</option>
                  {meta?.areas.map((area) => (
                    <option value={String(area.AreaID)} key={area.AreaID}>
                      {area.AreaName}
                    </option>
                  ))}
                  <option value="-1">国际服</option>
                </select>
              </Field>
              {teamComposition === "团队" && (
                <Field label="团队偏好">
                  <select value={filters.alliance} onChange={(event) => updateFilters({ alliance: event.target.value as AllianceKey })}>
                    {ALLIANCES.map(([value, label]) => (
                      <option key={value || "all"} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={filters.noDuplicateJobs}
                  onChange={(event) => updateFilters({ noDuplicateJobs: event.target.checked })}
                />
                避开重复职业
              </label>
            </div>
          ) : null}
          <button className="secondary-button full" onClick={resetLocalFilters}>
            <RotateCcw size={15} />
            清空筛选
          </button>
        </section>

        <section className="panel">
          <SectionTitle icon={<GitBranch size={16} />} title="更新检查" />
          <Field label="当前版本">
            <div className="inline-value">
              {appVersion ? `v${appVersion.version}` : "读取中"}
              {appVersion ? <span>{getVersionRuntimeLabel(appVersion)}</span> : null}
            </div>
          </Field>
          <div className="two-columns">
            <Field label="下载节点">
              <select
                value={updateProvider}
                onChange={(event) => {
                  setAutoDetectUpdateProvider(false);
                  applyUpdateProvider(event.target.value as UpdateProvider);
                }}
              >
                <option value="github">GitHub</option>
                <option value="gitee">国内镜像</option>
              </select>
            </Field>
            <Field label="节点说明">
              <div className="inline-value compact-value">
                {updateProvider === "github" ? "官方源码库" : "国内镜像节点"}
              </div>
            </Field>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={autoDetectUpdateProvider}
              onChange={(event) => {
                const checked = event.target.checked;
                setAutoDetectUpdateProvider(checked);
                if (checked && geoInfo) {
                  applyUpdateProvider(geoInfo.recommendedProvider);
                }
              }}
            />
            根据 IP 自动推荐节点
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={autoCheckUpdates}
              onChange={(event) => setAutoCheckUpdates(event.target.checked)}
            />
            启动时检查更新
          </label>
          {geoInfo && (
            <div className="geo-hint">
              {geoInfo.fallback
                ? `GeoIP 检测失败，默认使用${geoInfo.recommendedProvider === "gitee" ? "国内镜像" : "GitHub"}。`
                : `${geoInfo.countryCode || "未知地区"}，推荐 ${
                    geoInfo.recommendedProvider === "gitee" ? "国内镜像" : "GitHub"
                  }`}
              </div>
            )}
          <button
            type="button"
            className="secondary-button full"
            onClick={() => void runUpdateCheck()}
            disabled={isCheckingUpdate}
          >
            {isCheckingUpdate ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            检查更新
          </button>
          {updateError && <div className="mini-notice error">{updateError}</div>}
          {updateInfo && (
            <div className={updateInfo.isNewer ? "update-card has-update" : updatePanelLevel === "yellow" ? "update-card has-warning" : "update-card"}>
              <div className="update-head">
                <strong>{updateInfo.isNewer ? "发现新版本" : updatePanelLevel === "yellow" ? updatePanelLabel : "已是最新版本"}</strong>
                <span>{updateInfo.latestVersion}</span>
              </div>
              <div className="update-meta">
                {updateInfo.sourceLabel}
                {updateInfo.publishedAt ? ` / ${updateInfo.publishedAt.slice(0, 10)}` : ""}
              </div>
              {updateInfo.isNewer ? (
                <div className="update-install-box">
                  <div className="selected-asset">
                    <span>更新包</span>
                    <strong>
                      {suggestedUpdateAsset
                        ? `${suggestedUpdateAsset.name}${
                            suggestedUpdateAsset.size ? ` (${formatBytes(suggestedUpdateAsset.size)})` : ""
                          }`
                        : "未找到适合当前客户端的 zip 包"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="primary-button full"
                    onClick={() => void installSuggestedUpdate()}
                    disabled={!suggestedUpdateAsset || isInstallingUpdate}
                  >
                    {isInstallingUpdate ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                    {isInstallingUpdate ? "正在下载更新" : "一键更新"}
                  </button>
                  {updateInstallMessage && <div className="mini-notice success">{updateInstallMessage}</div>}
                  {updateInstallError && <div className="mini-notice error">{updateInstallError}</div>}
                </div>
              ) : (
                <div className={updatePanelLevel === "yellow" ? "mini-notice warning" : "mini-notice success"}>
                  {updatePanelLevel === "yellow" ? updatePanelText : "当前客户端已经与最新 Release 对齐。"}
                </div>
              )}
              <div className="asset-list">
                {updateInfo.assets.slice(0, 3).map((asset) => (
                  <span className="asset-item" key={asset.downloadUrl}>
                    {asset.name}
                    {asset.size ? ` (${formatBytes(asset.size)})` : ""}
                  </span>
                ))}
                <span className="asset-item">备用发布页：{updateInfo.latestVersion}</span>
              </div>
            </div>
          )}
        </section>
        </div>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div>
            <div className="toolbar-title">招募结果</div>
            <div className="toolbar-subtitle">
              {selectedConfig
                ? `${selectedSourceLabel} / ${selectedConfig.fb_type} / ${selectedConfig.team_composition}`
                : `${selectedSourceLabel} / NGA 已保存 ${ngaSamples.length} 条`}
            </div>
          </div>
          <div className="toolbar-actions">
            {isLoading ? (
              <button
                className="danger-button"
                onClick={() => {
                  cancelLoad();
                  if (isCollectingNga) {
                    void stopNgaCollection();
                  }
                }}
              >
                <XCircle size={16} />
                取消
              </button>
            ) : null}
            <button
              className="primary-button"
              onClick={() => void runAggregateSearch()}
              disabled={isLoading || isCollectingNga || !sourceFilters.length}
            >
              {isLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              聚合检索
            </button>
          </div>
        </header>

        <AggregateStatusStrip
          sourceLabel={selectedSourceLabel}
          isLoading={isLoading || isCollectingNga}
          officialFetched={payload?.fetched ?? 0}
          ngaProgress={ngaProgress}
          ngaSampleCount={ngaSamples.length}
          visibleCount={filtered.rows.length}
          pendingRefreshCount={pendingNgaRefreshSamples.length}
          latestCheckedAt={latestNgaCheckedAt}
          error={fetchError || ngaError}
        />
        <UpdateStatusBanner
          info={updateInfo}
          provider={updateProvider}
          geoInfo={geoInfo}
          isChecking={isCheckingUpdate}
          error={updateError}
          onCheck={() => void runUpdateCheck()}
        />

        {metaError && <Notice tone="error" text={`配置加载失败：${metaError}`} />}
        {fetchError && <Notice tone="error" text={fetchError} />}
        {payload?.warnings.map((warning) => <Notice key={warning} tone="warning" text={warning} />)}

        {combinedRows.length === 0 && !isLoading && (
          <div className="empty-state">
            <Search size={28} />
            <h2>先选择石之家副本，或读取 NGA 招募帖</h2>
            <p>石之家来源会按当前条件顺序翻页；NGA 来源只整理你在本机网页窗口中可正常浏览的招募帖内容。</p>
          </div>
        )}

        {filtered.rows.length > 0 ? (
          <Virtuoso<RecruitRow>
            useWindowScroll
            increaseViewportBy={{ top: 600, bottom: 900 }}
            data={filtered.rows}
            computeItemKey={(_, row) => getRecruitRenderKey(row)}
            itemContent={(_, row) => {
              const rowKey = getRecruitRenderKey(row);
              return (
                <div className="result-list-item" data-row-id={rowKey}>
                  <RecruitCard
                    row={row}
                    meta={meta}
                    alliance={filters.alliance}
                    isUpdated={updatedRowKeys.has(rowKey)}
                    isSoftClosed={softClosedRowKeys.has(rowKey) || Boolean(row.sourceMeta?.isClosed)}
                  />
                </div>
              );
            }}
          />
        ) : null}

        {combinedRows.length > 0 && filtered.rows.length === 0 && (
          <div className="empty-state">
            <Square size={28} />
            <h2>没有命中的招募</h2>
            <p>可以放宽关键词、时间段、职业/位置或来源条件。当前共有 {combinedRows.length} 条本地候选。</p>
          </div>
        )}
      </main>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="section-title">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}

function ToggleChip({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" className={active ? "chip active" : "chip"} onClick={onClick}>
      <span>{label}</span>
      {count !== undefined ? <em>{count}</em> : null}
    </button>
  );
}

type RecruitTagOption = ReturnType<typeof buildRecruitTagOptions>[number];

function ExpandableTagChipGrid({
  options,
  selectedIds,
  expanded,
  onExpandedChange,
  onToggle
}: {
  options: RecruitTagOption[];
  selectedIds: string[];
  expanded: boolean;
  onExpandedChange: (nextValue: boolean) => void;
  onToggle: (tagId: string) => void;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);

  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!element) {
      setHiddenCount(0);
      return;
    }

    let frame = 0;
    const measure = () => {
      const chips = Array.from(element.querySelectorAll<HTMLElement>(".chip"));
      const rowTops = [...new Set(chips.map((chip) => Math.round(chip.offsetTop)))].sort((a, b) => a - b);
      if (rowTops.length <= 4) {
        setHiddenCount(0);
        return;
      }
      const lastVisibleTop = rowTops[3];
      setHiddenCount(chips.filter((chip) => Math.round(chip.offsetTop) > lastVisibleTop).length);
    };
    const scheduleMeasure = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(element);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [expanded, options, selectedIds]);

  if (!options.length) {
    return <div className="inline-value compact-value">暂无可用标签</div>;
  }

  const hasOverflow = hiddenCount > 0;

  return (
    <div className="tag-filter-shell">
      <div className={`tag-filter-clip${expanded ? " expanded" : ""}${hasOverflow && !expanded ? " overflowing" : ""}`}>
        <div className="chip-grid compact tag-filter-grid" ref={gridRef}>
          {options.map((tag) => (
            <ToggleChip
              key={tag.id}
              active={selectedIds.includes(tag.id)}
              label={tag.label}
              count={tag.count}
              onClick={() => onToggle(tag.id)}
            />
          ))}
        </div>
      </div>
      {hasOverflow ? (
        <button
          type="button"
          className="tag-filter-more-button"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} />
              收起标签
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              展开更多（{hiddenCount}）
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={active ? "source-toggle active" : "source-toggle"}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function AppMark() {
  return (
    <svg className="app-mark-icon" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="5" y="5" width="30" height="30" rx="7" />
      <path d="M20 8 L28 18 L20 32 L12 18 Z" />
      <path d="M20 8 L20 32 M12 18 L28 18" />
      <circle cx="20" cy="20" r="3.2" />
    </svg>
  );
}

function AggregateStatusStrip({
  sourceLabel,
  isLoading,
  officialFetched,
  ngaProgress,
  ngaSampleCount,
  visibleCount,
  pendingRefreshCount,
  latestCheckedAt,
  error
}: {
  sourceLabel: string;
  isLoading: boolean;
  officialFetched: number;
  ngaProgress: NgaCollectionProgress;
  ngaSampleCount: number;
  visibleCount: number;
  pendingRefreshCount: number;
  latestCheckedAt: string;
  error: string;
}) {
  const tone = error ? "error" : isLoading || ngaProgress.status === "collecting" ? "active" : ngaProgress.status;
  const latestText = latestCheckedAt ? formatDateTime(latestCheckedAt) : "暂无";
  const progressValue = ngaProgress.maxItems > 0 ? Math.min(100, Math.round((ngaProgress.collected / ngaProgress.maxItems) * 100)) : 0;
  const message =
    error ||
    (isLoading
      ? `${ngaProgress.message || "正在按所选来源读取招募。"} · 快扫 ${ngaProgress.fastScanned ?? ngaProgress.collected}/${ngaProgress.maxItems || "-"} · 新帖 ${ngaProgress.added ?? 0} · 复核 ${ngaProgress.reviewed ?? 0} · 归档 ${ngaProgress.archived ?? 0} · 清理 ${ngaProgress.deleted ?? 0}`
      : ngaProgress.message || "本地已保存招募会先展示，聚合检索会增量更新。");
  return (
    <div className={`aggregate-status ${tone}`}>
      <div>
        <strong>{sourceLabel}</strong>
        <span>{message}</span>
        {isLoading || ngaProgress.status === "collecting" ? (
          <div className="aggregate-progress-bar" aria-hidden="true">
            <i style={{ width: `${progressValue}%` }} />
          </div>
        ) : null}
      </div>
      <div className="aggregate-status-metrics">
        <span>NGA已保存 {ngaSampleCount}</span>
        <span>石之家本轮 {officialFetched || "-"}</span>
        <span>当前命中 {visibleCount}</span>
        <span>待刷新 {pendingRefreshCount}</span>
        <span>最近复核 {latestText}</span>
      </div>
    </div>
  );
}

function NgaPanel({
  settings,
  session,
  progress,
  sampleCount,
  visibleSampleCount,
  archivedSampleCount,
  pendingRefreshCount,
  sampleStoreLocation,
  report,
  isOpening,
  isClearing,
  isCollecting,
  isAutoCollectArmed,
  message,
  error,
  onSettingsChange,
  onBoardToggle,
  onMultiBoardToggle,
  onKeepLoginChange,
  onOpen,
  onClear,
  onAutoCollect,
  onCollect,
  onCollectDetails,
  onStop,
  onAnalyze,
  onClearSamples
}: {
  settings: NgaCollectionSettings;
  session: NgaSessionStatusPayload | null;
  progress: NgaCollectionProgress;
  sampleCount: number;
  visibleSampleCount: number;
  archivedSampleCount: number;
  pendingRefreshCount: number;
  sampleStoreLocation: string;
  report: NgaSampleAnalysisReport | null;
  isOpening: boolean;
  isClearing: boolean;
  isCollecting: boolean;
  isAutoCollectArmed: boolean;
  message: string;
  error: string;
  onSettingsChange: (patch: Partial<NgaCollectionSettings>) => void;
  onBoardToggle: (boardUrl: string) => void;
  onMultiBoardToggle: (nextValue: boolean) => void;
  onKeepLoginChange: (nextValue: boolean) => void;
  onOpen: () => void;
  onClear: () => void;
  onAutoCollect: () => void;
  onCollect: () => void;
  onCollectDetails: () => void;
  onStop: () => void;
  onAnalyze: () => void;
  onClearSamples: () => void;
}) {
  const available = session?.available ?? false;
  const accessLabel = available ? "桌面版可读取" : "浏览器预览";
  const latestTime = progress.finishedAt ? formatDateTime(progress.finishedAt) : "暂无";
  const selectedBoardLabels = settings.selectedBoardUrls.map(
    (url) => NGA_RECRUIT_BOARD_PRESETS.find(([presetUrl]) => presetUrl === url)?.[1] ?? "自定义"
  );
  const boardSummary = formatNgaBoardSummary(selectedBoardLabels);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const showDevDiagnostics = isViteDevMode() || isLocalDebugFlagEnabled();

  return (
    <div className="nga-panel">
      <div className="nga-subpanel-head">
        <button
          type="button"
          className="nga-subpanel-toggle"
          aria-expanded={sectionOpen}
          onClick={() => setSectionOpen((current) => !current)}
        >
          <span className="nga-subpanel-text">
            <span className="nga-subpanel-title-row">
              <strong>NGA</strong>
              <span>{boardSummary}</span>
            </span>
            <span className="nga-subpanel-summary">
              已保存 {sampleCount} · 命中 {visibleSampleCount} · 待更新 {pendingRefreshCount}
            </span>
          </span>
          {sectionOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {isCollecting || isAutoCollectArmed ? (
          <button type="button" className="danger-button nga-subpanel-stop" onClick={onStop}>
            <XCircle size={15} />
            停止
          </button>
        ) : null}
      </div>

      {!sectionOpen ? (
        <div className="nga-subpanel-brief">
          <span>{accessLabel}</span>
          <span>最近更新 {latestTime}</span>
        </div>
      ) : null}

      {sectionOpen ? (
        <>
      <div className="field">
        <div className="field-label-row">
          <label>NGA 地区</label>
          <div className="field-inline-actions">
            <button
              type="button"
              className={`mini-toggle ${settings.allowMultipleBoards ? "active" : ""}`}
              aria-pressed={settings.allowMultipleBoards}
              onClick={() => onMultiBoardToggle(!settings.allowMultipleBoards)}
            >
              多区读取
            </button>
            <button type="button" className="mini-action-button" onClick={onClear} disabled={isClearing || !available}>
              {isClearing ? <Loader2 size={13} className="spin" /> : <Eraser size={13} />}
              清除网页状态
            </button>
          </div>
        </div>
        <div className="nga-board-grid" role="group" aria-label="NGA 地区">
          {NGA_RECRUIT_BOARD_PRESETS.map(([url, label]) => (
            <ToggleButton
              key={url}
              active={settings.selectedBoardUrls.includes(url)}
              label={label}
              onClick={() => onBoardToggle(url)}
            />
          ))}
        </div>
      </div>

      <div className="nga-status-grid">
        <div className="inline-value">
          {accessLabel}
          <span>{settings.selectedBoardUrls.length || 1} 个地区</span>
        </div>
        <div className="inline-value compact-value">{sampleCount} 条已保存招募</div>
      </div>

      <div className="inline-value compact-value">
        本轮 {progress.collected}/{progress.maxItems || settings.maxItems}
        <span>待复核 {pendingRefreshCount} · 最近更新 {latestTime}</span>
      </div>

      <button
        type="button"
        className="disclosure-button"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((current) => !current)}
      >
        {advancedOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        高级设置
      </button>

      {advancedOpen ? (
        <div className="compact-disclosure">
          <label className="check-row">
            <input type="checkbox" checked={settings.keepLogin} onChange={(event) => onKeepLoginChange(event.target.checked)} />
            保持本机网页会话
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.autoRefreshOnStart}
              onChange={(event) => onSettingsChange({ autoRefreshOnStart: event.target.checked })}
            />
            启动后自动复核已保存招募
          </label>

          <Field label="NGA 招募板地址">
            <input
              value={settings.startUrl}
              onChange={(event) => onSettingsChange({ startUrl: event.target.value })}
              placeholder="https://bbs.nga.cn/"
            />
            <div className="preset-row">
              {NGA_RECRUIT_BOARD_PRESETS.map(([url, label]) => (
                <button type="button" className="tiny-button" key={url} onClick={() => onSettingsChange({ startUrl: url })}>
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <div className="two-columns">
            <Field label="翻页间隔(秒)">
              <input
                type="number"
                min="0.5"
                max="15"
                step="0.5"
                value={settings.requestIntervalMs / 1000}
                onChange={(event) => onSettingsChange({ requestIntervalMs: Number(event.target.value) * 1000 })}
              />
            </Field>
            <Field label="活跃窗口大小">
              <input
                type="number"
                min="1"
                max={NGA_MAX_SAMPLE_STORE_ITEMS}
                value={settings.maxItems}
                onChange={(event) => onSettingsChange({ maxItems: Number(event.target.value) })}
              />
            </Field>
          </div>

          <div className="two-columns">
            <Field label="复核间隔(小时)">
              <input
                type="number"
                min="1"
                max="168"
                value={settings.refreshIntervalHours}
                onChange={(event) => onSettingsChange({ refreshIntervalHours: Number(event.target.value) })}
              />
            </Field>
            <Field label="聚合窗口">
              <select
                value={settings.windowMode}
                onChange={(event) => onSettingsChange({ windowMode: event.target.value as NgaCollectionSettings["windowMode"] })}
              >
                <option value="minimized">最小化</option>
                <option value="normal">正常显示</option>
              </select>
            </Field>
          </div>

          <Field label="归档判定(天)">
            <input
              type="number"
              min="0"
              max="180"
              value={settings.recentActiveDays}
              onChange={(event) => onSettingsChange({ recentActiveDays: Number(event.target.value) })}
              placeholder="14；0 表示不自动归档"
            />
          </Field>

          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.includeDetails}
              onChange={(event) => onSettingsChange({ includeDetails: event.target.checked })}
            />
            同时打开帖子正文
          </label>

          <Field label="筛选档位">
            <select
              value={settings.filterMode}
              onChange={(event) => onSettingsChange({ filterMode: event.target.value as NgaCollectionSettings["filterMode"] })}
            >
              <option value="strict">严格</option>
              <option value="balanced">平衡（默认）</option>
              <option value="loose">宽松</option>
              <option value="unrecognized">未识别</option>
            </select>
          </Field>

          <div className="nga-action-grid">
            <button type="button" className="secondary-button" onClick={onOpen} disabled={isOpening || !available}>
              {isOpening ? <Loader2 size={15} className="spin" /> : <Globe2 size={15} />}
              打开 NGA
            </button>
            <button type="button" className="primary-button" onClick={onAutoCollect} disabled={isCollecting || isOpening || !available}>
              {isCollecting ? <Loader2 size={15} className="spin" /> : <Database size={15} />}
              打开后读取
            </button>
          </div>

          <button type="button" className="secondary-button full" onClick={onCollect} disabled={isCollecting || !available}>
            {isCollecting && !isAutoCollectArmed ? <Loader2 size={15} className="spin" /> : <Database size={15} />}
            {settings.includeDetails ? "读取当前页和正文" : "读取当前页"}
          </button>

          <button
            type="button"
            className="secondary-button full"
            onClick={onCollectDetails}
            disabled={isCollecting || !available || sampleCount === 0}
          >
            {isCollecting && !isAutoCollectArmed ? <Loader2 size={15} className="spin" /> : <FileSearch size={15} />}
            补齐已存正文
          </button>

          <div className="nga-action-grid">
            <button type="button" className="secondary-button" onClick={onAnalyze} disabled={sampleCount === 0}>
              <FileSearch size={15} />
              生成报告
            </button>
            <button type="button" className="secondary-button" onClick={onClearSamples} disabled={sampleCount === 0}>
              <RotateCcw size={15} />
              清空已保存
            </button>
          </div>
        </div>
      ) : null}

      {showDevDiagnostics ? (
        <>
          <button
            type="button"
            className="disclosure-button diagnostic-toggle"
            aria-expanded={diagnosticsOpen}
            onClick={() => setDiagnosticsOpen((current) => !current)}
          >
            {diagnosticsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            开发诊断
          </button>
          {diagnosticsOpen ? (
            <div className="compact-disclosure diagnostic-panel">
              <div className="mini-notice warning">
                网页状态位置：{session?.dataLocation || "待读取"}。保存位置：{sampleStoreLocation || "待读取"}。
                当前默认展示 {visibleSampleCount}/{sampleCount} 条，已归档 {archivedSampleCount} 条；读取只保存标题、正文、链接、作者、发布时间、版面 ID 和主题 ID。
              </div>
              {progress.currentUrl ? <div className="mini-notice">当前页面：{progress.currentUrl}</div> : null}
              {report && <NgaReportSummary report={report} />}
            </div>
          ) : null}
        </>
      ) : null}
        </>
      ) : null}

      {message && isCollecting ? <div className="mini-notice success">{message}</div> : null}
      {error ? <div className="mini-notice error">{error}</div> : null}
    </div>
  );
}

function isLocalDebugFlagEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("risingstones:debug") === "1";
  } catch {
    return false;
  }
}

function isViteDevMode(): boolean {
  return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
}

function NgaReportSummary({ report }: { report: NgaSampleAnalysisReport }) {
  return (
    <div className="nga-report">
      <div className="nga-report-head">
        <strong>招募分析报告</strong>
        <span>{report.sampleCount} 条</span>
      </div>
      <div className="nga-report-list">
        <span>标题结构：{formatCandidates(report.titleStructures)}</span>
        <span>正文结构：{formatCandidates(report.bodyStructures)}</span>
        <span>副本候选：{formatCandidates(report.dungeonAliases)}</span>
        <span>进度候选：{formatCandidates(report.progressExpressions)}</span>
        <span>职业/位置：{formatCandidates(report.jobPositionExpressions)}</span>
        <span>时间表达：{formatCandidates(report.timeExpressions)}</span>
      </div>
      {report.warnings.length ? (
        <div className="nga-question-box">
          <strong>招募提示</strong>
          {report.warnings.slice(0, 4).map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <div className="nga-question-box">
        <strong>待用户确认问题</strong>
        {report.confirmationQuestions.length ? (
          report.confirmationQuestions.slice(0, 6).map((question) => <span key={question}>{question}</span>)
        ) : (
          <span>暂无高频歧义表达。</span>
        )}
      </div>
    </div>
  );
}

function JobPicker({
  groups,
  selectedIds,
  selectedJobs,
  search,
  disabled,
  onSearchChange,
  onToggle,
  onClear
}: {
  groups: Array<{ group: string; label: string; jobs: JobConfigEntry[] }>;
  selectedIds: string[];
  selectedJobs: JobConfigEntry[];
  search: string;
  disabled: boolean;
  onSearchChange: (value: string) => void;
  onToggle: (jobId: string) => void;
  onClear: () => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleGroups = groups
    .map(({ group, label, jobs }) => ({
      group,
      label,
      jobs: normalizedSearch
        ? jobs.filter((job) => `${job.value} ${job.job_type}`.toLowerCase().includes(normalizedSearch))
        : jobs
    }))
    .filter(({ jobs }) => jobs.length > 0);

  return (
    <div className="job-picker" aria-disabled={disabled}>
      <div className="job-picker-top">
        <div className="job-selected-summary">
          {selectedJobs.length ? (
            selectedJobs.map((job) => (
              <button type="button" className="selected-job" key={job.id} onClick={() => onToggle(job.id)}>
                {job.job_pic_url ? <img src={job.job_pic_url} alt="" /> : null}
                {job.value}
                <span>×</span>
              </button>
            ))
          ) : (
            <span className="job-placeholder">未选择时不过滤职业；可选具体职业或职能分类。</span>
          )}
        </div>
        {selectedJobs.length ? (
          <button type="button" className="tiny-link-button" onClick={onClear}>
            清空
          </button>
        ) : null}
      </div>

      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="搜索职业或职能，比如：学者、贤者、治疗、近战"
        disabled={disabled}
      />

      <div className="job-group-list">
        {visibleGroups.map(({ group, label, jobs }) => (
          <section className="job-group" key={group}>
            <div className="job-group-title">
              <strong>{label}</strong>
              <span>{group === "职能分类" ? "选中职能会匹配该类所有职业" : `${jobs.length} 个可选`}</span>
            </div>
            <div className="job-button-grid">
              {jobs.map((job) => {
                const active = selectedIds.includes(job.id);
                return (
                  <button
                    type="button"
                    className={active ? "job-button active" : "job-button"}
                    key={job.id}
                    disabled={disabled}
                    onClick={() => onToggle(job.id)}
                  >
                    {job.job_pic_url ? <img src={job.job_pic_url} alt="" /> : null}
                    <span>{job.value}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function StatusStrip({
  payload,
  visibleCount,
  isLoading
}: {
  payload: RecruitFetchPayload | null;
  visibleCount: number;
  isLoading: boolean;
}) {
  return (
    <div className="status-strip">
      <StatusItem label="石之家总数" value={payload ? String(payload.count) : "-"} />
      <StatusItem label="已拉取" value={payload ? String(payload.fetched) : isLoading ? "拉取中" : "-"} />
      <StatusItem label="当前命中" value={payload ? String(visibleCount) : "-"} />
      <StatusItem label="更新时间" value={payload ? new Date(payload.fetchedAt).toLocaleTimeString() : "-"} />
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UpdateStatusBanner({
  info,
  provider,
  geoInfo,
  isChecking,
  error,
  onCheck
}: {
  info: UpdateCheckPayload | null;
  provider: UpdateProvider;
  geoInfo: GeoIpPayload | null;
  isChecking: boolean;
  error: string;
  onCheck: () => void;
}) {
  const level = getUpdateLevel(info, isChecking, error);
  const label = getUpdateStatusLabel(level, info, isChecking, error);
  const text = getUpdateStatusText(level, info, provider, error);
  const nodeHint = geoInfo
    ? geoInfo.fallback
      ? `GeoIP 失败，默认${geoInfo.recommendedProvider === "gitee" ? "国内镜像" : "GitHub"}`
      : `${geoInfo.countryCode || "未知地区"} 推荐 ${geoInfo.recommendedProvider === "gitee" ? "国内镜像" : "GitHub"}`
    : "正在判断下载节点";

  return (
    <div className={`update-status ${level}`}>
      <div className="status-light" aria-label={label} />
      <div className="update-status-body">
        <strong>{label}</strong>
        <span>{text}</span>
        <em>{nodeHint}</em>
      </div>
      <button type="button" className="tiny-button" onClick={onCheck} disabled={isChecking}>
        {isChecking ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        刷新
      </button>
    </div>
  );
}

function Notice({ tone, text }: { tone: "warning" | "error"; text: string }) {
  return (
    <div className={`notice ${tone}`}>
      {tone === "warning" ? <AlertTriangle size={16} /> : <XCircle size={16} />}
      {text}
    </div>
  );
}

function RecruitCard({
  row,
  meta,
  alliance,
  isUpdated = false,
  isSoftClosed = false
}: {
  row: RecruitRow;
  meta: MetaPayload | null;
  alliance: "" | AllianceKey;
  isUpdated?: boolean;
  isSoftClosed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<RecruitDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const source = row.source ?? "official";
  const openPositions = getOpenPositions(row, alliance);
  const ngaDisplayJobGroups = getNgaDisplayJobGroups(row, meta);
  const recruitKind = getRecruitKind(row);
  const ngaKindLabel = formatNgaRecruitKind(recruitKind);
  const jobSideLabel = recruitKind === "seeking" ? "可用职业" : "需求职业";
  const positionSideLabel = recruitKind === "seeking" ? "可用位置" : "空缺位置";
  const sourceLabel = formatRecruitSourceLabel(source);
  const sidePositionLabels = source === "nga" ? formatNgaPositionRequirementLabels(row.parsedFields ?? {}, row.sourceMeta?.recruitKind) : openPositions;
  const timeText = formatRecruitTimeForDisplay(row.fb_time);
  const dailyDuration = getRecruitDailyDuration(row);
  const timeHintParts = [dailyDuration, row.parsedFields?.timeSupplement].filter(Boolean);
  const timeHint = timeHintParts.length ? timeHintParts.join(" · ") : getRecruitTimeHint(row.fb_time, timeText);
  const visibleTags = getVisibleRecruitTags(row);
  const cardTitle = source === "nga" ? row.parsedFields?.dungeon || "未识别副本" : row.fb_name;
  const ngaSubtitleTitle = cleanNgaDisplayText(row.sourceTitle) || "NGA 原帖";
  const ngaGroupName = cleanNgaDisplayText(row.group_name) || "未知队伍";
  const ngaAuthor = cleanNgaDisplayText(row.sourceAuthor) || "NGA 用户";
  const detailUrl =
    source === "nga" && row.sourceUrl
      ? row.sourceUrl
      : `https://ff14risingstones.web.sdo.com/pc/index.html#/recruit/party?id=${row.id}`;
  const remaining = getRemainingTime(row.end_time);
  const shownDetail = detail ?? row;

  async function toggleDetail() {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (!nextExpanded || detail || isDetailLoading) {
      return;
    }
    if (source === "nga") {
      return;
    }

    setDetailError("");
    setIsDetailLoading(true);
    try {
      const payload = await fetchRecruitDetail(row.id);
      setDetail(payload);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDetailLoading(false);
    }
  }

  function handleDetailClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isTauriRuntime()) {
      return;
    }

    event.preventDefault();
    void openExternalUrl(detailUrl).catch((error) => {
      console.error("打开详情失败", error);
      window.alert(`打开详情失败：${error instanceof Error ? error.message : String(error)}`);
    });
  }

  return (
    <article className={`recruit-card source-${source}${isUpdated ? " updated" : ""}${isSoftClosed ? " soft-closed" : ""}`}>
      {isUpdated ? <div className="card-update-badge">刚刚更新</div> : null}
      <div className="card-main">
        <div className="card-heading">
          <div>
            <div className="source-heading">
              <span className={source === "nga" ? "source-badge nga" : "source-badge official"}>
                {sourceLabel}
              </span>
              <h2>{cardTitle}</h2>
            </div>
            <p className={source === "nga" ? "card-subtitle nga-subtitle" : "card-subtitle"}>
              {source === "nga" ? (
                <>
                  <span className="subtitle-kind">{ngaKindLabel}</span>
                  <span className="subtitle-title">{ngaSubtitleTitle}</span>
                  <span className="subtitle-taxonomy">{row.area_name}/{ngaGroupName}</span>
                </>
              ) : (
                <>
                  {row.fb_type} · {row.area_name}/{row.group_name}
                  {row.target_area_name ? ` · 目标 ${row.target_area_name}` : ""}
                </>
              )}
            </p>
          </div>
          <div className="card-actions">
            <button type="button" className="inline-detail-button" onClick={toggleDetail}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? "收起" : "详情"}
            </button>
            <a
              href={detailUrl}
              target="_blank"
              rel="noreferrer"
              className="detail-link"
              onClick={handleDetailClick}
            >
              查看详情
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="detail-grid">
          <Detail label="进度" value={row.progress || "未识别"} />
          <Detail label="攻略" value={row.strategy || "未识别"} />
          <Detail label="时间" value={timeText} hint={timeHint} />
          <Detail label={source === "nga" ? "发布" : "响应"} value={source === "nga" ? row.sourcePublishedAt || "未识别" : `${row.response_num ?? 0} 人`} hint={source === "nga" ? ngaAuthor : remaining} />
        </div>

        <div className="tag-row">
          {visibleTags.map((tag) => (
            <span className={`soft-tag ${getNgaTagClass(tag)}`} key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="card-side">
        <div className="side-label">{jobSideLabel}</div>
        <div className="job-icons">
          {source === "nga" ? (
            ngaDisplayJobGroups.length ? (
              ngaDisplayJobGroups.map((group) => (
                <NgaJobPillGroup group={group} key={group.key} />
              ))
            ) : (
              <span className="muted">{ngaKindLabel}</span>
            )
          ) : row.jobInfo?.length ? (
            row.jobInfo.map((job) => (
              <span className="job-pill" key={job.id} title={job.value}>
                {job.job_pic_url ? <img src={job.job_pic_url} alt="" /> : null}
                {job.value}
              </span>
            ))
          ) : (
            <span className="muted">{meta ? formatJobNames(row.need_job ?? [], meta.jobMeta) : row.need_job?.join("、")}</span>
          )}
        </div>
        <div className="side-label">{positionSideLabel}</div>
        <div className="position-list">
          {sidePositionLabels.length ? (
            sidePositionLabels.map((position) => (
              <span className="position-chip" key={position}>
                {position}
              </span>
            ))
          ) : (
            <span className="muted">未识别</span>
          )}
        </div>
      </div>

      {expanded && (
        <RecruitDetailPanel
          row={shownDetail}
          meta={meta}
          isLoading={isDetailLoading}
          error={detailError}
          alliance={alliance}
        />
      )}
    </article>
  );
}

function RecruitDetailPanel({
  row,
  meta,
  isLoading,
  error,
  alliance
}: {
  row: RecruitRow | RecruitDetail;
  meta: MetaPayload | null;
  isLoading: boolean;
  error: string;
  alliance: "" | AllianceKey;
}) {
  if ((row.source ?? "official") === "nga") {
    return <NgaDetailPanel row={row} meta={meta} />;
  }

  const requirement = textOrFallback(
    typeof row.recruit_require_mask === "string" ? row.recruit_require_mask : row.recruit_require
  );
  const strategyDescription = textOrFallback(
    typeof row.strategy_desc_mask === "string" ? row.strategy_desc_mask : row.strategy_desc
  );
  const teamDetail = textOrFallback(typeof row.team_detail_mask === "string" ? row.team_detail_mask : row.team_detail);

  return (
    <div className="expanded-detail">
      {isLoading && (
        <div className="detail-loading">
          <Loader2 size={15} className="spin" />
          正在读取石之家详情
        </div>
      )}
      {error && <Notice tone="error" text={`详情加载失败：${error}`} />}

      <section className="expanded-section composition-section">
        <h3>当前队伍构成</h3>
        <PositionMatrix row={row} meta={meta} alliance={alliance} />
      </section>
      <div className="detail-text-stack">
        <section className="expanded-section">
          <h3>队伍详情</h3>
          <p>{teamDetail}</p>
        </section>
        <section className="expanded-section">
          <h3>招募要求</h3>
          <p>{requirement}</p>
        </section>
        <section className="expanded-section">
          <h3>攻略说明</h3>
          <p>{strategyDescription}</p>
        </section>
      </div>
    </div>
  );
}

function NgaDetailPanel({ row, meta }: { row: RecruitRow | RecruitDetail; meta: MetaPayload | null }) {
  const fields = row.parsedFields ?? {};
  const kind = row.sourceMeta?.recruitKind;
  const openPositions = kind === "seeking" ? fields.playerAvailablePositions ?? [] : fields.positions ?? [];
  const jobs = kind === "seeking" ? fields.playerAvailableJobs ?? [] : fields.jobs ?? [];
  const detailItems = buildNgaTeamDetailItems(row);
  const requirementItems = buildNgaRequirementItems(row, meta);
  const strategyText = fields.strategy || row.strategy || "未识别";
  const referenceText = buildNgaReferenceText(row);
  const contactText = fields.contactDetails || "";

  return (
    <div className="expanded-detail nga-expanded-detail nga-readable-detail">
      <section className="expanded-section composition-section">
        <h3>{kind === "seeking" ? "玩家可用位置" : "当前队伍构成"}</h3>
        <NgaPositionMatrix row={row} meta={meta} />
      </section>
      <div className="detail-text-stack">
        <section className="expanded-section">
          <h3>队伍详情</h3>
          <div className="nga-summary-grid">
            {detailItems.map((item) => (
              <div className="nga-summary-item" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="expanded-section">
          <h3>{kind === "seeking" ? "求职信息" : "招募要求"}</h3>
          {requirementItems.length ? (
            <div className="nga-readable-list">
              {requirementItems.map((item) => (
                <span
                  className={[item.tone ? `soft-tag ${item.tone}` : "soft-tag", item.jobs?.length ? "nga-job-requirement" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  key={item.text}
                >
                  {item.jobs?.length ? (
                    <>
                      <span className="nga-job-requirement-label">{item.label}</span>
                      <NgaInlineJobList jobs={item.jobs} relation={item.relation} />
                    </>
                  ) : (
                    item.text
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p>{openPositions.length || jobs.length ? "暂无额外要求。" : "暂未识别到明确要求；低置信黑话不会被强行归类。"}</p>
          )}
        </section>
        {contactText ? (
          <section className="expanded-section nga-contact-section">
            <h3>联系方式</h3>
            <p className="nga-contact-text">{contactText}</p>
          </section>
        ) : null}
        <section className="expanded-section">
          <h3>攻略说明</h3>
          <p>{strategyText}</p>
        </section>
        {referenceText ? (
          <section className="expanded-section">
            <h3>原文参考</h3>
            <p className="nga-reference-text">{referenceText}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function NgaPositionMatrix({ row, meta }: { row: RecruitRow | RecruitDetail; meta: MetaPayload | null }) {
  const fields = row.parsedFields ?? {};
  const kind = row.sourceMeta?.recruitKind;
  const openPositions = new Set(kind === "seeking" ? fields.playerAvailablePositions ?? [] : fields.positions ?? []);
  const excludedPositions = new Set(fields.excludedPositions ?? []);
  const rosterSlots = fields.rosterSlots ?? {};
  const flexGroups = getNgaPositionFlexGroups(fields, kind);
  const skipPositions = new Set<PositionKey>(flexGroups.flatMap((group) => group.slice(1)) as PositionKey[]);
  const groupByFirst = new Map<PositionKey, PositionKey[]>(
    flexGroups
      .filter((group): group is PositionKey[] => group.length > 1)
      .map((group) => [group[0] as PositionKey, group])
  );

  return (
    <div className="position-matrix nga-position-matrix">
      {FULL_PARTY_POSITIONS.map((position) => {
        if (skipPositions.has(position as PositionKey)) {
          return null;
        }
        const flexGroup = groupByFirst.get(position as PositionKey);
        if (flexGroup) {
          const flexLabel = flexGroup.join("/");
          const flexJobs = uniqueDisplayItems(flexGroup.flatMap((slot) => rosterSlots[slot] ?? []));
          const flexJobEntries = flexJobs.map((name) => getJobEntryByName(name, meta));
          const isOpen = flexGroup.some((slot) => openPositions.has(slot));
          const label = flexJobs.length
            ? isOpen
              ? `${flexLabel} ${flexJobs.join("/")}；可补其中一位`
              : `${flexLabel} ${flexJobs.join("/")}`
            : isOpen
              ? "招募中"
              : "有人可切位置";
          const state = flexJobs.length && isOpen ? "mixed" : flexJobs.length ? "filled" : isOpen ? "open" : "unknown";
          return (
            <div className={`position-cell nga-position-cell ${state} flex-slot`} key={flexLabel}>
              <span className="slot-key">{flexLabel}</span>
              {flexJobEntries.length ? <NgaRosterJobStack jobs={flexJobEntries} /> : <span className="slot-state-dot" />}
              <strong title={label}>{flexJobs.length && isOpen ? "有人可切 + 招募" : label}</strong>
            </div>
          );
        }
        const rosterJobs = rosterSlots[position];
        const rosterJobEntries = (rosterJobs ?? []).map((name) => getJobEntryByName(name, meta));
        const isOpen = openPositions.has(position);
        const isExcluded = excludedPositions.has(position);
        const state = rosterJobs?.length && isOpen ? "mixed" : isOpen ? "open" : rosterJobs?.length ? "filled" : isExcluded ? "blocked" : "unknown";
        const label =
          kind === "seeking"
            ? isOpen
              ? "可用"
              : "未标注"
            : isOpen && rosterJobs?.length
              ? "有人可切 + 招募"
              : isOpen
              ? "招募中"
              : rosterJobs?.length
                ? rosterJobs.join("/")
                : isExcluded
                  ? "排除"
                  : "未识别";
        return (
          <div className={`position-cell nga-position-cell ${state}`} key={position}>
            <span className="slot-key">{position}</span>
            {rosterJobEntries.length ? <NgaRosterJobStack jobs={rosterJobEntries} /> : <span className="slot-state-dot" />}
            <strong title={label}>{label}</strong>
          </div>
        );
      })}
    </div>
  );
}

function getNgaPositionFlexGroups(fields: Partial<NgaParsedFields>, kind: string | undefined): PositionKey[][] {
  const rosterGroups = (fields.rosterFlexGroups ?? []).filter((group) => group.length > 1) as PositionKey[][];
  if (kind === "seeking") {
    return rosterGroups;
  }

  const openPositions = new Set(fields.positions ?? []);
  const rosterSlots = fields.rosterSlots ?? {};
  const rosterGroupPositions = new Set(rosterGroups.flat());
  const vacancyGroups = ((fields.vacancyFlexGroups ?? []) as PositionKey[][]).filter(
    (group) =>
      group.length > 1 &&
      group.every((position) => openPositions.has(position)) &&
      !group.some((position) => rosterGroupPositions.has(position)) &&
      group.every((position) => !(rosterSlots[position]?.length))
  );
  return [...rosterGroups, ...vacancyGroups];
}

function NgaRosterJobStack({ jobs }: { jobs: JobConfigEntry[] }) {
  const title = jobs.map((job) => job.value).join(" / ");
  return (
    <span
      className={jobs.length > 1 ? "nga-job-stack multi" : "nga-job-stack"}
      tabIndex={jobs.length > 1 ? 0 : -1}
      title={title}
      aria-label={title}
    >
      {jobs.map((job, index) => (
        <span
          className="nga-job-card"
          key={`${job.id}-${index}`}
          style={
            {
              "--compact-x": `${index * 9}px`,
              "--expanded-x": `${index * 30}px`,
              zIndex: jobs.length - index
            } as CSSProperties
          }
        >
          {job.job_pic_url ? <img src={job.job_pic_url} alt="" /> : <span>{job.value.slice(0, 1)}</span>}
        </span>
      ))}
    </span>
  );
}

function NgaInlineJobList({ jobs, relation }: { jobs: JobConfigEntry[]; relation?: "or" }) {
  return (
    <span className="nga-inline-job-list">
      {jobs.map((job, index) => (
        <span className="nga-inline-job-piece" key={`${job.id}-${index}`}>
          {relation === "or" && index > 0 ? <span className="nga-job-or">或</span> : null}
          <span className="nga-inline-job" title={job.value}>
            {job.job_pic_url ? <img src={job.job_pic_url} alt="" /> : null}
            <span>{job.value}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

type NgaDisplayJobGroup = {
  key: string;
  label?: string;
  jobs: JobConfigEntry[];
  relation?: "or";
};

function NgaJobPillGroup({ group }: { group: NgaDisplayJobGroup }) {
  const title = `${group.label ? `${group.label}：` : ""}${group.jobs.map((job) => job.value).join(group.relation === "or" ? " 或 " : "、")}`;
  return (
    <span className={group.relation === "or" ? "job-pill-group or-group" : "job-pill-group"} title={title}>
      {group.label ? <span className="job-pill-group-label">{group.label}</span> : null}
      {group.jobs.map((job, index) => (
        <span className="job-pill-piece" key={`${job.id}-${index}`}>
          {group.relation === "or" && index > 0 ? <span className="job-pill-or">或</span> : null}
          <span className="job-pill compact" title={job.value}>
            {job.job_pic_url ? <img src={job.job_pic_url} alt="" /> : null}
            {job.value}
          </span>
        </span>
      ))}
    </span>
  );
}

function PositionMatrix({
  row,
  meta,
  alliance
}: {
  row: RecruitRow | RecruitDetail;
  meta: MetaPayload | null;
  alliance: "" | AllianceKey;
}) {
  if (row.team_composition === "团队" && row.team_position) {
    const alliances = alliance ? [alliance] : (["A", "B", "C"] as AllianceKey[]);
    return (
      <div className="alliance-matrix">
        {alliances.map((teamKey) => (
          <div className="alliance-block" key={teamKey}>
            <div className="alliance-title">团队 {teamKey}</div>
            <div className="position-matrix">
              {FULL_PARTY_POSITIONS.map((position) => (
                <PositionCell
                  key={`${teamKey}-${position}`}
                  position={position}
                  jobId={row.team_position?.[teamKey]?.[position]}
                  meta={meta}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const positions = row.team_composition === "轻锐小队" ? LIGHT_PARTY_POSITIONS : FULL_PARTY_POSITIONS;
  return (
    <div className="position-matrix">
      {positions.map((position) => (
        <PositionCell key={position} position={position} jobId={row[position]} meta={meta} />
      ))}
    </div>
  );
}

function PositionCell({
  position,
  jobId,
  meta
}: {
  position: string;
  jobId: unknown;
  meta: MetaPayload | null;
}) {
  const normalizedJobId = Number(jobId) > 0 ? String(jobId) : "";
  const job = normalizedJobId ? meta?.jobMeta.jobsById[normalizedJobId] : undefined;
  return (
    <div className={normalizedJobId ? "position-cell filled" : "position-cell empty"}>
      <span>{position}</span>
      {job?.job_pic_url ? <img src={job.job_pic_url} alt="" /> : null}
      <strong>{job?.value ?? "空缺"}</strong>
    </div>
  );
}

function textOrFallback(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "未填写";
}

function formatRecruitSourceLabel(source: RecruitSource): string {
  return source === "nga" ? "NGA" : "石之家";
}

function formatNgaBoardSummary(labels: string[]): string {
  const uniqueLabels = uniqueDisplayItems(labels);
  if (!uniqueLabels.length) {
    return "国服";
  }
  if (uniqueLabels.length <= 2) {
    return uniqueLabels.join(" + ");
  }
  return `${uniqueLabels.slice(0, 2).join(" + ")} 等 ${uniqueLabels.length} 区`;
}

function formatRecruitTimeForDisplay(value: string): string {
  if (isStructuredRecruitTime(value)) {
    return value;
  }
  return formatRecruitTimeDisplay(value) || value || "未识别";
}

function isStructuredRecruitTime(value: string): boolean {
  return /(?:首周|次周开始|后续|之后|第二周|第一周).*\d{1,2}:\d{2}/.test(value);
}

function getRecruitTimeHint(raw: string, display: string): string | undefined {
  if (!raw || raw === display || display === "未识别") {
    return undefined;
  }
  return `原文：${raw}`;
}

function getRecruitDailyDuration(row: RecruitRow | RecruitDetail): string {
  const fields = row.parsedFields ?? {};
  if (fields.dailyDuration) {
    return fields.dailyDuration;
  }
  if ((row.source ?? "official") === "nga" && fields.time) {
    const inferredFromParsedTime = formatRecruitDailyDuration(fields.time, { inferFromRanges: true });
    if (inferredFromParsedTime) {
      return inferredFromParsedTime;
    }
  }
  const sourceText = (row.source ?? "official") === "nga" ? `${row.sourceTitle ?? ""}\n${row.rawText ?? ""}` : row.fb_time;
  return formatRecruitDailyDuration(sourceText, { inferFromRanges: true });
}

function getVisibleRecruitTags(row: RecruitRow): string[] {
  const tags = deriveRecruitTags(row);
  if (row.parseWarnings?.some((warning) => /低置信|人工确认/.test(warning))) {
    tags.push("需看原文确认");
  }
  const visible = uniqueDisplayItems(tags).filter((tag) => !/低置信未识别/.test(tag));
  const important = visible.filter(isImportantNgaTag);
  const ordinary = visible.filter((tag) => !isImportantNgaTag(tag));
  return [...important, ...ordinary].slice(0, 7);
}

function isImportantNgaTag(tag: string): boolean {
  return Boolean(getNgaTagClass(tag)) || /需看原文确认|已关闭|疑似噪音|低置信/.test(tag);
}

function mergeDisplayValues(...values: Array<string | undefined>): string {
  return uniqueDisplayItems(values.flatMap((value) => (value ? value.split(/[、,，;；]/) : []))).join("、");
}

function buildNgaTeamDetailItems(row: RecruitRow | RecruitDetail): Array<{ label: string; value: string }> {
  const fields = row.parsedFields ?? {};
  const timeValue = formatNgaTimeDetail(fields.time || row.fb_time || "", fields.timeSupplement);
  const locationPreference = fields.server || "";
  const items = [
    { label: "来源", value: `${formatNgaRecruitKind(row.sourceMeta?.recruitKind)} · NGA` },
    { label: "副本", value: fields.dungeon || row.fb_name || "未识别" },
    { label: "进度", value: fields.progress || row.progress || fields.clearGoal || "未识别" },
    { label: "目标", value: fields.clearGoal || "未识别" },
    { label: "时间", value: timeValue },
    { label: "强度", value: getRecruitDailyDuration(row) || "未识别" },
    locationPreference ? { label: "区服偏好", value: locationPreference } : null,
    { label: "队伍", value: [fields.teamType, fields.rosterSize].filter(Boolean).join(" · ") || row.group_name || "未识别" }
  ];
  return items.filter((item): item is { label: string; value: string } => Boolean(item));
}

function formatNgaTimeDetail(time: string, supplement: string | undefined): string {
  const regular = formatRecruitTimeForDisplay(time);
  return [regular, supplement].filter(Boolean).join("；") || "未识别";
}

type NgaRequirementItem = {
  text: string;
  tone?: string;
  label?: string;
  jobs?: JobConfigEntry[];
  relation?: "or";
};

function buildNgaRequirementItems(row: RecruitRow | RecruitDetail, meta: MetaPayload | null): NgaRequirementItem[] {
  const fields = row.parsedFields ?? {};
  const items: NgaRequirementItem[] = [];
  const vacancyLabel = row.sourceMeta?.recruitKind === "seeking" ? "可用位置" : "空缺位置";
  const jobLabel = row.sourceMeta?.recruitKind === "seeking" ? "可用职业" : "需求职业";
  for (const value of formatNgaPositionRequirementLabels(fields, row.sourceMeta?.recruitKind)) {
    items.push({ text: `${vacancyLabel}：${value}` });
  }
  const vacancySlotJobNames = new Set<string>();
  if (row.sourceMeta?.recruitKind !== "seeking") {
    for (const position of FULL_PARTY_POSITIONS) {
      const slotJobs = fields.vacancySlots?.[position as PositionKey] ?? [];
      if (!slotJobs.length) {
        continue;
      }
      for (const job of slotJobs) {
        vacancySlotJobNames.add(job);
      }
      items.push({
        text: `${position} 倾向：${slotJobs.join(" / ")}`,
        label: `${position} 倾向：`,
        jobs: slotJobs.map((name) => getJobEntryByName(name, meta)),
        relation: "or"
      });
    }
  }
  const jobNames = uniqueDisplayItems([...(fields.jobs ?? []), ...(fields.playerAvailableJobs ?? [])]).filter(
    (name) => !vacancySlotJobNames.has(name)
  );
  if (jobNames.length) {
    items.push({
      text: `${jobLabel}：${jobNames.join(" / ")}`,
      label: `${jobLabel}：`,
      jobs: jobNames.map((name) => getJobEntryByName(name, meta)),
      relation: jobNames.length > 1 ? "or" : undefined
    });
  }
  for (const value of splitNgaList(fields.requirements)) {
    items.push({ text: value, tone: getNgaTagClass(value) });
  }
  for (const value of fields.excludedPositions ?? []) {
    items.push({ text: `排除位置：${value}`, tone: "warning-tag" });
  }
  for (const value of fields.excludedJobs ?? []) {
    items.push({ text: `排除职业：${value}`, tone: "warning-tag" });
  }
  return dedupeNgaRequirementItems(items);
}

function formatNgaPositionRequirementLabels(fields: Partial<NgaParsedFields>, kind: string | undefined): string[] {
  const positions = kind === "seeking" ? fields.playerAvailablePositions ?? [] : fields.positions ?? [];
  const labels: string[] = [];
  const skipped = new Set<string>();
  if (kind !== "seeking") {
    for (const group of fields.vacancyFlexGroups ?? []) {
      const relevant = group.filter((position) => positions.includes(position));
      if (relevant.length < 2) {
        continue;
      }
      labels.push(relevant.join("/"));
      relevant.forEach((position) => skipped.add(position));
    }
  }
  for (const position of positions) {
    if (!skipped.has(position)) {
      labels.push(position);
    }
  }
  return uniqueDisplayItems(labels);
}

function dedupeNgaRequirementItems(items: NgaRequirementItem[]): NgaRequirementItem[] {
  const seen = new Set<string>();
  const result: NgaRequirementItem[] = [];
  for (const item of items) {
    const key = `${item.text}\u0000${item.tone ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function splitNgaList(value: string | undefined): string[] {
  return value ? value.split("、").map((item) => item.trim()).filter(Boolean) : [];
}

function buildNgaReferenceText(row: RecruitRow | RecruitDetail): string {
  const fields = row.parsedFields ?? {};
  const needsReference =
    Boolean(fields.positions?.length || fields.playerAvailablePositions?.length) ||
    Boolean(fields.jobs?.length || fields.playerAvailableJobs?.length) ||
    Boolean(fields.requirements || fields.rosterSlots || fields.vacancySlots || fields.contactDetails) ||
    Boolean(row.parseWarnings?.length) ||
    row.sourceMeta?.recruitKind === "unknown";
  if (!needsReference) {
    return "";
  }
  const raw = row.rawText || row.sourceTitle || "";
  if (!raw.trim()) {
    return "未读取到正文；请在 NGA 帖子详情页补齐正文。";
  }
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function uniqueDisplayItems(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function markOfficialRow(row: RecruitRow): RecruitRow {
  const recruitKind = isOfficialSeekingRow(row) ? "seeking" : "recruit";
  return {
    ...row,
    source: row.source ?? "official",
    sourceMeta: {
      ...(row.sourceMeta ?? {}),
      platform: "risingstones",
      importedAt: row.sourceMeta?.importedAt ?? row.begin_time,
      recruitKind: row.sourceMeta?.recruitKind ?? recruitKind
    }
  };
}

function isOfficialSeekingRow(row: RecruitRow): boolean {
  const labelText = [
    ...(row.labelInfo?.flatMap((label) => [label.id, label.name]) ?? []),
    ...(row.label ?? []),
    row.custom_label
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return /求职|玩家求职/.test(labelText);
}

function enrichNgaSampleForCache(sample: NgaSample): NgaSample {
  const sanitized = sanitizeNgaSample(sample);
  const now = new Date().toISOString();
  const signal = classifyNgaSample(sanitized);
  const hasDetailReview = Boolean(sanitized.body || sanitized.lastCheckedAt || sanitized.detailFetchedAt);
  return {
    ...sanitized,
    lastSeenAt: sanitized.lastSeenAt || now,
    lastCheckedAt: hasDetailReview ? sanitized.lastCheckedAt || now : sanitized.lastCheckedAt,
    detailFetchedAt: sanitized.body ? sanitized.detailFetchedAt || now : sanitized.detailFetchedAt,
    closedAt: signal.isClosed ? sanitized.closedAt || now : sanitized.closedAt
  };
}

function getNgaRenderKey(sample: NgaSample): string {
  return `nga-${getNgaSampleKey(sample) || sample.topicId || sample.url || sample.title}`;
}

function getRecruitRenderKey(row: RecruitRow): string {
  if ((row.source ?? "official") === "nga") {
    return row.uuid || `nga-${row.sourceMeta?.topicId || row.sourceUrl || row.sourceTitle || row.id}`;
  }
  return row.uuid || `official-${row.id}`;
}

function getLatestNgaCacheTime(samples: NgaSample[]): string {
  const latest = samples
    .flatMap((sample) => [sample.lastCheckedAt, sample.detailFetchedAt, sample.lastSeenAt])
    .map((value) => Date.parse(value || ""))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return latest ? new Date(latest).toISOString() : "";
}

function captureResultScrollAnchor(): { key: string; top: number } | null {
  if (typeof document === "undefined") {
    return null;
  }
  const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-row-id]"));
  const anchor = elements.find((element) => element.getBoundingClientRect().bottom > 0);
  if (!anchor) {
    return null;
  }
  return {
    key: anchor.dataset.rowId ?? "",
    top: anchor.getBoundingClientRect().top
  };
}

function restoreResultScrollAnchor(anchor: { key: string; top: number } | null) {
  if (!anchor?.key || typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(anchor.key)}"]`);
    if (!target) {
      return;
    }
    const delta = target.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) {
      window.scrollBy(0, delta);
    }
  });
}

function ngaSampleToRecruitRow(sample: NgaSample, index: number): RecruitRow {
  const signal = classifyNgaSample(sample);
  const fields = signal.parsedFields;
  const title = cleanNgaDisplayText(sample.title);
  const author = cleanNgaDisplayText(sample.author);
  const teamType = cleanNgaDisplayText(fields.teamType);
  const sampleKey = getNgaSampleKey(sample) || sample.topicId || sample.url || String(index);
  const numericTopicId = Number.parseInt(sample.topicId, 10);
  return {
    id: Number.isSafeInteger(numericTopicId) && numericTopicId > 0 ? -numericTopicId : -1_000_000 - index,
    uuid: `nga-${sampleKey}`,
    source: "nga",
    sourceUrl: sample.url,
    sourceTitle: title,
    sourceAuthor: author,
    sourcePublishedAt: sample.publishedAt,
    rawText: sample.body || sample.title,
    parsedFields: fields,
    parseConfidence: signal.parseConfidence,
    parseEvidence: signal.evidence,
    parseTags: signal.tags,
    parseWarnings: signal.warnings,
    sourceMeta: {
      platform: "nga",
      forumId: sample.forumId,
      topicId: sample.topicId,
      importedAt: sample.lastSeenAt || sample.detailFetchedAt || sample.lastCheckedAt || new Date().toISOString(),
      isClosed: signal.isClosed || Boolean(sample.closedAt),
      isNoise: signal.isNoise,
      recruitKind: signal.recruitKind,
      bodyCollected: Boolean(sample.body)
    },
    character_name: author || "NGA 用户",
    area_name: fields.server || "NGA",
    group_name: teamType || author || "未知队伍",
    fb_type: "NGA",
    fb_name: fields.dungeon || "未识别副本",
    fb_time: fields.time || "",
    team_composition: "满编小队",
    progress: mergeDisplayValues(fields.progress, fields.clearGoal),
    strategy: fields.strategy || "",
    team_position: null,
    need_job: []
  };
}

function getNgaDisplayJobEntries(row: RecruitRow, meta: MetaPayload | null): JobConfigEntry[] {
  if ((row.source ?? "official") !== "nga") {
    return [];
  }
  const fields = row.parsedFields ?? {};
  const vacancySlotJobs = uniqueDisplayItems(Object.values(fields.vacancySlots ?? {}).flat());
  const names =
    row.sourceMeta?.recruitKind === "seeking"
      ? fields.playerAvailableJobs?.length
        ? fields.playerAvailableJobs
        : fields.jobs ?? []
      : fields.jobs?.length
        ? fields.jobs
        : vacancySlotJobs.length
          ? vacancySlotJobs
          : fields.playerAvailableJobs ?? [];

  return names.map((name) => getJobEntryByName(name, meta));
}

function getNgaDisplayJobGroups(row: RecruitRow, meta: MetaPayload | null): NgaDisplayJobGroup[] {
  if ((row.source ?? "official") !== "nga") {
    return [];
  }
  const fields = row.parsedFields ?? {};
  const kind = row.sourceMeta?.recruitKind;
  const groups: NgaDisplayJobGroup[] = [];
  const consumed = new Set<string>();
  if (kind !== "seeking") {
    for (const position of FULL_PARTY_POSITIONS) {
      const slotJobs = uniqueDisplayItems(fields.vacancySlots?.[position as PositionKey] ?? []);
      if (!slotJobs.length) {
        continue;
      }
      slotJobs.forEach((job) => consumed.add(job));
      groups.push({
        key: `slot-${position}`,
        label: position,
        jobs: slotJobs.map((name) => getJobEntryByName(name, meta)),
        relation: slotJobs.length > 1 ? "or" : undefined
      });
    }
  }

  const names =
    kind === "seeking"
      ? uniqueDisplayItems(fields.playerAvailableJobs?.length ? fields.playerAvailableJobs : fields.jobs ?? [])
      : uniqueDisplayItems(fields.jobs ?? []).filter((name) => !consumed.has(name));
  if (names.length) {
    const positionLabels = formatNgaPositionRequirementLabels(fields, kind);
    const singleOpenSlot = kind !== "seeking" && positionLabels.length === 1;
    groups.push({
      key: "jobs",
      label: singleOpenSlot ? positionLabels[0] : undefined,
      jobs: names.map((name) => getJobEntryByName(name, meta)),
      relation: names.length > 1 ? "or" : undefined
    });
  }

  return groups;
}

function getJobEntryByName(name: string, meta: MetaPayload | null): JobConfigEntry {
  const configured = meta?.jobMeta.jobs.find((job) => job.value === name);
  if (configured) {
    return configured;
  }
  const roleCategoryNames = GENERIC_NGA_JOB_ROLE_CATEGORY[name] ?? [];
  const roleCategory = roleCategoryNames
    .map((categoryName) => meta?.jobMeta.jobs.find((job) => job.value === categoryName))
    .find((job) => job);
  if (roleCategory) {
    return {
      ...roleCategory,
      id: `nga-${name}`,
      value: name
    };
  }
  return { id: `nga-${name}`, value: name, job_type: "NGA" };
}

const GENERIC_NGA_JOB_ROLE_CATEGORY: Record<string, string[]> = {
  任意坦克: ["防护职业"],
  任意治疗: ["治疗职业"],
  任意近战: ["近战职业"],
  任意远敏: ["远程物理", "远程物理职业"],
  任意法系: ["远程魔法", "远程魔法职业"]
};

function matchesRecruitView(row: RecruitRow, mode: NgaRecruitViewMode): boolean {
  const kind = getRecruitKind(row);
  if (mode === "all") {
    return true;
  }
  if (mode === "seeking") {
    return kind === "seeking";
  }
  return kind !== "seeking";
}

function getRecruitKind(row: RecruitRow): RecruitSourceMeta["recruitKind"] {
  if (row.sourceMeta?.recruitKind) {
    return row.sourceMeta.recruitKind;
  }
  return isOfficialSeekingRow(row) ? "seeking" : "recruit";
}

function formatNgaRecruitKind(kind: RecruitSourceMeta["recruitKind"] | undefined): string {
  switch (kind) {
    case "recruit":
      return "队伍招人";
    case "seeking":
      return "玩家求职";
    case "closed":
      return "已关闭/已招满";
    case "noise":
      return "疑似噪音";
    case "unknown":
      return "低置信未识别";
    default:
      return "未识别";
  }
}

function formatNgaFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    dungeon: "副本",
    progress: "进度",
    strategy: "攻略",
    time: "时间",
    timeSupplement: "补充时间",
    dailyDuration: "每日强度",
    jobs: "招募职业",
    positions: "招募位置",
    vacancySlots: "位置职业倾向",
    vacancyFlexGroups: "可替代空缺位置",
    rosterSlots: "当前阵容",
    rosterFlexGroups: "可切位置",
    excludedJobs: "排除职业",
    excludedPositions: "排除位置",
    playerAvailableJobs: "求职职业",
    playerAvailablePositions: "求职位置",
    server: "大区",
    contact: "联系方式",
    teamType: "队伍类型",
    clearGoal: "目标",
    rosterSize: "队伍人数",
    requirements: "要求",
    recruitKind: "分流",
    tag: "标签",
    warning: "警告"
  };
  return labels[key] ?? key;
}

function getNgaTagClass(tag: string): string {
  if (/纯净队|禁第三方|拒绝装甲车|代打记录|拒绝绘图轮椅依赖|拒绝插件依赖|拒绝极端插件立场|反作弊/.test(tag)) {
    return "clean-tag";
  }
  if (/全妹队|女生限定|女生优先/.test(tag)) {
    return "social-tag";
  }
  if (/插件态度中性|插件生态均可|ACT\/logs 记录复盘/.test(tag)) {
    return "neutral-tag";
  }
  if (/第三方工具|ACT 时间轴|TTS 辅助|科技|装甲车|代打|工作室|已关闭/.test(tag)) {
    return "risk-tag";
  }
  return "";
}

function formatParsedValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join("、");
  }
  return String(value);
}

function formatCandidates(candidates: Array<{ value: string; count: number }>): string {
  if (candidates.length === 0) {
    return "暂无";
  }
  return candidates
    .slice(0, 4)
    .map((candidate) => `${candidate.value}(${candidate.count})`)
    .join("、");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function Detail({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </div>
  );
}

function buildRecruitQuery(input: {
  fbName: string;
  fbType: string;
  teamComposition: string;
}): RecruitQuery {
  const query: RecruitQuery = {
    fb_name: input.fbName
  };
  if (input.fbType) {
    query.fb_type = input.fbType;
  }
  if (input.teamComposition) {
    query.team_composition = input.teamComposition;
  }
  return query;
}

function sortFbConfig(a: FbConfig, b: FbConfig) {
  if (a.fb_type !== b.fb_type) {
    return a.fb_type.localeCompare(b.fb_type, "zh-CN");
  }
  return b.weight - a.weight;
}

function getRemainingTime(endTime: string | undefined): string {
  if (!endTime) {
    return "";
  }
  const end = Number(endTime) * 1000;
  if (!Number.isFinite(end)) {
    return "";
  }
  const diffMs = end - Date.now();
  if (diffMs <= 0) {
    return "已结束";
  }
  const hours = Math.floor(diffMs / 1000 / 60 / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `剩余 ${days} 天 ${hours % 24} 小时`;
  }
  return `剩余 ${hours} 小时`;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getVersionRuntimeLabel(version: AppVersionPayload): string {
  if (version.runtime === "desktop") {
    return "桌面版";
  }
  if (version.runtime === "portable" || version.portable) {
    return "便携包";
  }
  return "开发模式";
}

function selectUpdateAsset(assets: UpdateAsset[], version: AppVersionPayload | null): UpdateAsset | null {
  if (!assets.length) {
    return null;
  }

  const zipAssets = assets.filter((asset) => asset.name.toLowerCase().endsWith(".zip"));
  if (!zipAssets.length) {
    return null;
  }

  if (version?.runtime === "desktop") {
    return (
      zipAssets.find((asset) => asset.name.includes("desktop-win-x64-portable")) ??
      zipAssets.find((asset) => asset.name.includes("desktop")) ??
      null
    );
  }

  if (version?.runtime === "portable" || version?.portable) {
    return (
      zipAssets.find((asset) => asset.name.includes("-win-x64") && !asset.name.includes("desktop")) ??
      null
    );
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
