import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  GitBranch,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Square,
  XCircle
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkUpdate, fetchAppVersion, fetchGeoIp, fetchMeta, fetchRecruitDetail, fetchRecruits } from "./api";
import { UPDATE_REPOSITORIES } from "./config";
import { filterRecruitRows } from "./lib/filters";
import { FULL_PARTY_POSITIONS, LIGHT_PARTY_POSITIONS, formatJobNames, getOpenPositions } from "./lib/jobs";
import { describeTimeParse } from "./lib/time";
import { defaultFilters, loadUiState, saveUiState } from "./storage";
import type {
  AllianceKey,
  AppVersionPayload,
  FbConfig,
  GeoIpPayload,
  JobConfigEntry,
  LocalFilterState,
  MetaPayload,
  RecruitDetail,
  RecruitFetchPayload,
  RecruitQuery,
  RecruitRow,
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

export function App() {
  const initialState = useMemo(loadUiState, []);
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [metaError, setMetaError] = useState("");
  const [fbType, setFbType] = useState(initialState.fbType);
  const [fbName, setFbName] = useState(initialState.fbName);
  const [targetAreaId, setTargetAreaId] = useState(initialState.targetAreaId);
  const [labels, setLabels] = useState<string[]>(initialState.labels);
  const [teamComposition, setTeamComposition] = useState(initialState.teamComposition);
  const [officialPosition, setOfficialPosition] = useState(initialState.officialPosition);
  const [officialAlliance, setOfficialAlliance] = useState<"" | AllianceKey>(initialState.officialAlliance);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialState.sidebarCollapsed);
  const [updateProvider, setUpdateProvider] = useState<UpdateProvider>(initialState.updateProvider);
  const [updateRepo, setUpdateRepo] = useState(initialState.updateRepo || UPDATE_REPOSITORIES[initialState.updateProvider]);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(initialState.autoCheckUpdates);
  const [autoDetectUpdateProvider, setAutoDetectUpdateProvider] = useState(initialState.autoDetectUpdateProvider);
  const [filters, setFilters] = useState<LocalFilterState>(initialState.filters);
  const [jobSearch, setJobSearch] = useState("");
  const [appVersion, setAppVersion] = useState<AppVersionPayload | null>(null);
  const [geoInfo, setGeoInfo] = useState<GeoIpPayload | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckPayload | null>(null);
  const [updateError, setUpdateError] = useState("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [payload, setPayload] = useState<RecruitFetchPayload | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const updateAbortRef = useRef<AbortController | null>(null);

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
    fetchGeoIp(controller.signal)
      .then((payload) => {
        setGeoInfo(payload);
        if (autoDetectUpdateProvider) {
          applyUpdateProvider(payload.recommendedProvider);
        }
      })
      .catch(() => {
        if (autoDetectUpdateProvider) {
          applyUpdateProvider("gitee");
        }
      });
    return () => controller.abort();
  }, [autoDetectUpdateProvider]);

  useEffect(() => {
    return () => updateAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!autoCheckUpdates || !updateRepo.trim()) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runUpdateCheck(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [autoCheckUpdates, updateProvider, updateRepo]);

  useEffect(() => {
    saveUiState({
      fbType,
      fbName,
      targetAreaId,
      labels,
      teamComposition,
      officialPosition,
      officialAlliance,
      sidebarCollapsed,
      updateProvider,
      updateRepo,
      autoCheckUpdates,
      autoDetectUpdateProvider,
      filters
    });
  }, [
    fbType,
    fbName,
    targetAreaId,
    labels,
    teamComposition,
    officialPosition,
    officialAlliance,
    sidebarCollapsed,
    updateProvider,
    updateRepo,
    autoCheckUpdates,
    autoDetectUpdateProvider,
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

  const filtered = useMemo(() => filterRecruitRows(payload?.rows ?? [], filters, meta), [payload, filters, meta]);

  const groupedJobs = useMemo(() => {
    if (!meta) {
      return [];
    }
    return Object.entries(meta.jobConfig)
      .map(([group, value]) => ({
        group,
        jobs: Array.isArray(value) ? value : [value]
      }))
      .filter(({ group }) => group !== "限制职业");
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
      setOfficialPosition("");
      setOfficialAlliance("");
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
        targetAreaId,
        labels,
        teamComposition,
        officialPosition,
        officialAlliance
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

  function cancelLoad() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }

  function resetLocalFilters() {
    setFilters(defaultFilters);
  }

  function applyUpdateProvider(provider: UpdateProvider) {
    setUpdateProvider(provider);
    setUpdateRepo(UPDATE_REPOSITORIES[provider]);
    setUpdateInfo(null);
    setUpdateError("");
  }

  async function runUpdateCheck(silent = false) {
    const repo = updateRepo.trim();
    if (!repo) {
      if (!silent) {
        setUpdateError("请先填写仓库路径，例如 owner/repo。");
      }
      return;
    }

    updateAbortRef.current?.abort();
    const controller = new AbortController();
    updateAbortRef.current = controller;
    setIsCheckingUpdate(true);
    setUpdateError("");

    try {
      const result = await checkUpdate(updateProvider, repo, controller.signal);
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
            石
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
        <section className="panel">
          <SectionTitle icon={<Shield size={16} />} title="官方拉取条件" />
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
          <Field label="招募大区">
            <select value={targetAreaId} onChange={(event) => setTargetAreaId(event.target.value)} disabled={!meta}>
              <option value="">不限大区</option>
              {meta?.areas.map((area) => (
                <option value={String(area.AreaID)} key={area.AreaID}>
                  {area.AreaName}
                </option>
              ))}
              <option value="-1">国际服</option>
            </select>
          </Field>
          <Field label="队伍构成">
            <select value={teamComposition} onChange={(event) => setTeamComposition(event.target.value)}>
              <option value="">不限</option>
              <option value="满编小队">满编小队</option>
              <option value="轻锐小队">轻锐小队</option>
              <option value="团队">团队</option>
              <option value="其他">其他</option>
            </select>
          </Field>
          {teamComposition === "团队" && (
            <Field label="官方团队">
              <select value={officialAlliance} onChange={(event) => setOfficialAlliance(event.target.value as AllianceKey)}>
                {ALLIANCES.map(([value, label]) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="官方位置">
            <select value={officialPosition} onChange={(event) => setOfficialPosition(event.target.value)}>
              <option value="">不限位置</option>
              {positionOptions.map((position) => (
                <option value={position} key={position}>
                  {position}
                </option>
              ))}
            </select>
          </Field>
          <Field label="官方标签">
            <div className="chip-grid">
              {meta?.labels.map((label) => (
                <ToggleChip
                  key={label.id}
                  active={labels.includes(label.id)}
                  label={label.name}
                  onClick={() => {
                    setLabels((current) =>
                      current.includes(label.id) ? current.filter((id) => id !== label.id) : [...current, label.id]
                    );
                  }}
                />
              ))}
            </div>
          </Field>
        </section>

        <section className="panel">
          <SectionTitle icon={<Filter size={16} />} title="本地二次筛选" />
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
          <div className="two-columns">
            <Field label="开始小时">
              <input
                type="number"
                min="0"
                max="23"
                value={filters.timeStart}
                onChange={(event) => updateFilters({ timeStart: event.target.value })}
                placeholder="20"
              />
            </Field>
            <Field label="结束小时">
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
            保留无法解析时间的招募
          </label>
          <Field label="我的职业可进">
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
          <label className="check-row">
            <input
              type="checkbox"
              checked={filters.noDuplicateJobs}
              onChange={(event) => updateFilters({ noDuplicateJobs: event.target.checked })}
            />
            无重复职业
          </label>
          {teamComposition === "团队" && (
            <Field label="本地团队">
              <select value={filters.alliance} onChange={(event) => updateFilters({ alliance: event.target.value as AllianceKey })}>
                {ALLIANCES.map(([value, label]) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          )}
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
          <button className="secondary-button full" onClick={resetLocalFilters}>
            <RotateCcw size={15} />
            清空本地筛选
          </button>
        </section>

        <section className="panel">
          <SectionTitle icon={<GitBranch size={16} />} title="更新检查" />
          <Field label="当前版本">
            <div className="inline-value">
              {appVersion ? `v${appVersion.version}` : "读取中"}
              {appVersion?.portable ? <span>便携包</span> : <span>开发模式</span>}
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
                <option value="gitee">Gitee</option>
              </select>
            </Field>
            <Field label="仓库">
              <div className="inline-value compact-value">{updateRepo}</div>
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
                ? "GeoIP 检测失败，默认使用 Gitee。"
                : `${geoInfo.countryCode || "未知地区"}，推荐 ${geoInfo.recommendedProvider === "gitee" ? "Gitee" : "GitHub"}`}
            </div>
          )}
          <button
            type="button"
            className="secondary-button full"
            onClick={() => void runUpdateCheck()}
            disabled={isCheckingUpdate || !updateRepo.trim()}
          >
            {isCheckingUpdate ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            检查更新
          </button>
          {updateError && <div className="mini-notice error">{updateError}</div>}
          {updateInfo && (
            <div className={updateInfo.isNewer ? "update-card has-update" : "update-card"}>
              <div className="update-head">
                <strong>{updateInfo.isNewer ? "发现新版本" : "已是最新版本"}</strong>
                <span>{updateInfo.latestVersion}</span>
              </div>
              <div className="update-meta">
                {updateInfo.provider} / {updateInfo.repo}
                {updateInfo.publishedAt ? ` / ${updateInfo.publishedAt.slice(0, 10)}` : ""}
              </div>
              <div className="asset-list">
                {updateInfo.assets.slice(0, 3).map((asset) => (
                  <a href={asset.downloadUrl} target="_blank" rel="noreferrer" key={asset.downloadUrl}>
                    {asset.name}
                    {asset.size ? ` (${formatBytes(asset.size)})` : ""}
                  </a>
                ))}
                <a href={updateInfo.latestUrl} target="_blank" rel="noreferrer">
                  发布页
                </a>
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
              {selectedConfig ? `${selectedConfig.fb_type} / ${selectedConfig.team_composition}` : "请选择副本名称开始"}
            </div>
          </div>
          <div className="toolbar-actions">
            {isLoading ? (
              <button className="danger-button" onClick={cancelLoad}>
                <XCircle size={16} />
                取消
              </button>
            ) : null}
            <button className="primary-button" onClick={loadRecruits} disabled={isLoading || !fbName}>
              {isLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              {payload ? "刷新全量" : "拉取全量"}
            </button>
          </div>
        </header>

        <StatusStrip payload={payload} visibleCount={filtered.rows.length} isLoading={isLoading} />
        <UpdateStatusBanner
          info={updateInfo}
          provider={updateProvider}
          repo={updateRepo}
          geoInfo={geoInfo}
          isChecking={isCheckingUpdate}
          error={updateError}
          onCheck={() => void runUpdateCheck()}
        />

        {metaError && <Notice tone="error" text={`配置加载失败：${metaError}`} />}
        {fetchError && <Notice tone="error" text={fetchError} />}
        {payload?.warnings.map((warning) => <Notice key={warning} tone="warning" text={warning} />)}

        {!payload && !isLoading && (
          <div className="empty-state">
            <Search size={28} />
            <h2>先选择副本，再拉取完整分页</h2>
            <p>官方页面滚动时分批加载；这里会按同一组官方条件顺序翻页，然后只在本地筛选。</p>
          </div>
        )}

        <div className="result-list">
          {filtered.rows.map((row) => (
            <RecruitCard key={row.id} row={row} meta={meta} alliance={filters.alliance} />
          ))}
        </div>

        {payload && filtered.rows.length === 0 && (
          <div className="empty-state">
            <Square size={28} />
            <h2>没有命中的招募</h2>
            <p>可以放宽关键词、时间段或职业/位置条件。官方已拉取 {payload.fetched} 条。</p>
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

function ToggleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? "chip active" : "chip"} onClick={onClick}>
      {label}
    </button>
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
  groups: Array<{ group: string; jobs: JobConfigEntry[] }>;
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
    .map(({ group, jobs }) => ({
      group,
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
        {visibleGroups.map(({ group, jobs }) => (
          <section className="job-group" key={group}>
            <div className="job-group-title">
              <strong>{group}</strong>
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
      <StatusItem label="官方总数" value={payload ? String(payload.count) : "-"} />
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
  repo,
  geoInfo,
  isChecking,
  error,
  onCheck
}: {
  info: UpdateCheckPayload | null;
  provider: UpdateProvider;
  repo: string;
  geoInfo: GeoIpPayload | null;
  isChecking: boolean;
  error: string;
  onCheck: () => void;
}) {
  const level = getUpdateLevel(info, isChecking, error);
  const label =
    level === "green"
      ? "Release 对齐"
      : level === "yellow"
        ? "有可用更新"
        : level === "red"
          ? "建议立即更新"
          : isChecking
            ? "正在检查更新"
            : "更新状态未知";
  const text = getUpdateStatusText(level, info, provider, repo, error);
  const nodeHint = geoInfo
    ? geoInfo.fallback
      ? "GeoIP 失败，默认 Gitee"
      : `${geoInfo.countryCode || "未知地区"} 推荐 ${geoInfo.recommendedProvider === "gitee" ? "Gitee" : "GitHub"}`
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
  alliance
}: {
  row: RecruitRow;
  meta: MetaPayload | null;
  alliance: "" | AllianceKey;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<RecruitDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const openPositions = getOpenPositions(row, alliance);
  const detailUrl = `https://ff14risingstones.web.sdo.com/pc/index.html#/recruit/party?id=${row.id}`;
  const remaining = getRemainingTime(row.end_time);
  const shownDetail = detail ?? row;

  async function toggleDetail() {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (!nextExpanded || detail || isDetailLoading) {
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

  return (
    <article className="recruit-card">
      <div className="card-main">
        <div className="card-heading">
          <div>
            <h2>{row.fb_name}</h2>
            <p>
              {row.fb_type} · {row.area_name}/{row.group_name}
              {row.target_area_name ? ` · 目标 ${row.target_area_name}` : ""}
            </p>
          </div>
          <div className="card-actions">
            <button type="button" className="inline-detail-button" onClick={toggleDetail}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? "收起" : "详情"}
            </button>
            <a href={detailUrl} target="_blank" rel="noreferrer" className="detail-link">
              官方详情
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="detail-grid">
          <Detail label="进度" value={row.progress || "未填写"} />
          <Detail label="攻略" value={row.strategy || "未填写"} />
          <Detail label="时间" value={row.fb_time || "未填写"} hint={describeTimeParse(row.fb_time || "")} />
          <Detail label="响应" value={`${row.response_num ?? 0} 人`} hint={remaining} />
        </div>

        <div className="tag-row">
          {row.labelInfo?.map((label) => (
            <span className="soft-tag" key={label.id}>
              {label.name}
            </span>
          ))}
        </div>
      </div>

      <div className="card-side">
        <div className="side-label">需求职业</div>
        <div className="job-icons">
          {row.jobInfo?.length ? (
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
        <div className="side-label">空缺位置</div>
        <div className="position-list">
          {openPositions.length ? (
            openPositions.map((position) => (
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
          正在读取官方详情
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
  targetAreaId: string;
  labels: string[];
  teamComposition: string;
  officialPosition: string;
  officialAlliance: "" | AllianceKey;
}): RecruitQuery {
  const query: RecruitQuery = {
    fb_name: input.fbName
  };
  if (input.fbType) {
    query.fb_type = input.fbType;
  }
  if (input.targetAreaId) {
    query.target_area_id = input.targetAreaId;
  }
  if (input.labels.length) {
    query.label = input.labels.join(",");
  }
  if (input.teamComposition) {
    query.team_composition = input.teamComposition;
  }
  if (input.officialPosition) {
    query.position = input.officialPosition;
  }
  if (input.teamComposition === "团队" && input.officialAlliance) {
    query.son_team_key = input.officialAlliance;
    if (input.officialPosition) {
      query.son_team_position = input.officialPosition;
    }
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

function getUpdateLevel(
  info: UpdateCheckPayload | null,
  isChecking: boolean,
  error: string
): "green" | "yellow" | "red" | "unknown" {
  if (isChecking || error || !info) {
    return "unknown";
  }
  if (!info.isNewer) {
    return "green";
  }
  return hasMajorVersionGap(info.currentVersion, info.latestVersion) ? "red" : "yellow";
}

function getUpdateStatusText(
  level: "green" | "yellow" | "red" | "unknown",
  info: UpdateCheckPayload | null,
  provider: UpdateProvider,
  repo: string,
  error: string
): string {
  if (error) {
    return `检查失败：${error}`;
  }
  if (!info) {
    return `${provider} / ${repo}`;
  }
  if (level === "green") {
    return `当前 ${info.currentVersion} 与 ${info.provider} 最新 Release ${info.latestVersion} 对齐。`;
  }
  if (level === "red") {
    return `当前 ${info.currentVersion} 落后到重大版本 ${info.latestVersion}，建议直接更新。`;
  }
  return `当前 ${info.currentVersion}，最新 ${info.latestVersion}，可择时下载更新。`;
}

function hasMajorVersionGap(current: string, latest: string): boolean {
  const currentMajor = parseMajorVersion(current);
  const latestMajor = parseMajorVersion(latest);
  return latestMajor !== null && currentMajor !== null && latestMajor > currentMajor;
}

function parseMajorVersion(value: string): number | null {
  const match = value.trim().replace(/^v/i, "").match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}
