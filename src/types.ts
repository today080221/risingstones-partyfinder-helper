export type PositionKey = "MT" | "ST" | "H1" | "H2" | "D1" | "D2" | "D3" | "D4";
export type LightPartyPositionKey = "T" | "H" | "D1" | "D2";
export type AllianceKey = "A" | "B" | "C";
export type RecruitSource = "official" | "nga";
export type NgaLoginStatus = "unknown" | "not_logged_in" | "logged_in";
export type NgaFilterMode = "strict" | "balanced" | "loose" | "unrecognized";
export type NgaRecruitViewMode = "teams" | "seeking" | "all";
export type NgaCollectionStatus = "idle" | "opening" | "collecting" | "cancelled" | "completed" | "error";

export interface OfficialApiResponse<T> {
  code?: number;
  Code?: number;
  msg?: string;
  data: T;
}

export interface FbConfig {
  id: string;
  fb_type: string;
  fb_name: string;
  team_composition: string;
  weight: number;
}

export interface FbLabel {
  id: string;
  name: string;
  weight: number;
}

export interface AreaGroup {
  AreaID: number;
  AreaName: string;
  vGroup?: Array<{
    AreaID: number;
    AreaName: string;
    GroupID: number;
    GroupName: string;
    UniName: string;
  }>;
}

export interface JobConfigEntry {
  id: string;
  value: string;
  job_pic_url?: string;
  job_type: string;
}

export type JobConfigMap = Record<string, JobConfigEntry[] | JobConfigEntry>;

export interface NormalizedJobMeta {
  jobs: JobConfigEntry[];
  jobsById: Record<string, JobConfigEntry>;
  childIdsByCategoryId: Record<string, string[]>;
}

export interface MetaPayload {
  fbConfigs: FbConfig[];
  labels: FbLabel[];
  areas: AreaGroup[];
  jobConfig: JobConfigMap;
  jobMeta: NormalizedJobMeta;
  fetchedAt: string;
}

export interface RecruitRow {
  id: number;
  uuid: string;
  source?: RecruitSource;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  sourcePublishedAt?: string;
  rawText?: string;
  parsedFields?: NgaParsedFields;
  parseConfidence?: Partial<Record<keyof NgaParsedFields, "high" | "medium" | "low" | "unknown">>;
  parseEvidence?: NgaParseEvidence[];
  parseTags?: string[];
  parseWarnings?: string[];
  sourceMeta?: RecruitSourceMeta;
  character_name: string;
  area_name: string;
  group_name: string;
  target_area_name?: string;
  fb_type: string;
  fb_name: string;
  fb_time: string;
  team_composition: string;
  progress: string;
  strategy: string;
  begin_time?: string;
  end_time?: string;
  response_num?: number;
  last_response_time?: string | null;
  MT?: number;
  ST?: number;
  H1?: number;
  H2?: number;
  H?: number;
  T?: number;
  D1?: number;
  D2?: number;
  D3?: number;
  D4?: number;
  team_position?: Partial<Record<AllianceKey, Partial<Record<PositionKey, number>>>> | null;
  need_job: string[];
  label?: string[];
  labelInfo?: FbLabel[];
  jobInfo?: JobConfigEntry[];
  status?: number;
  [key: string]: unknown;
}

export interface RecruitDetail extends RecruitRow {
  team_detail?: string | null;
  team_detail_mask?: string | null;
  recruit_require?: string | null;
  recruit_require_mask?: string | null;
  strategy_desc?: string | null;
  strategy_desc_mask?: string | null;
  contact_info_mask?: string | null;
  is_response?: number;
}

export interface RecruitQuery {
  fb_name: string;
  fb_type?: string;
  target_area_id?: string;
  label?: string;
  team_composition?: string;
  position?: string;
  son_team_key?: AllianceKey;
  son_team_position?: string;
}

export interface RecruitFetchPayload {
  count: number;
  fetched: number;
  rows: RecruitRow[];
  query: RecruitQuery;
  pageSize: number;
  fetchedAt: string;
  warnings: string[];
}

export interface RecruitSourceMeta {
  platform: "risingstones" | "nga";
  forumId?: string;
  topicId?: string;
  postId?: string;
  importedAt?: string;
  isClosed?: boolean;
  isNoise?: boolean;
  recruitKind?: "recruit" | "seeking" | "closed" | "noise" | "unknown";
  bodyCollected?: boolean;
}

export type NgaParseConfidence = "high" | "medium" | "low" | "unknown";

export interface NgaParseEvidence {
  field: keyof NgaParsedFields | "recruitKind" | "tag" | "warning";
  value: string;
  snippet: string;
  confidence: NgaParseConfidence;
}

export interface NgaParsedFields {
  dungeon?: string;
  progress?: string;
  strategy?: string;
  time?: string;
  timeSupplement?: string;
  dailyDuration?: string;
  rosterSlots?: Partial<Record<PositionKey, string[]>>;
  rosterFlexGroups?: PositionKey[][];
  vacancySlots?: Partial<Record<PositionKey, string[]>>;
  vacancyFlexGroups?: PositionKey[][];
  jobs?: string[];
  positions?: string[];
  excludedJobs?: string[];
  excludedPositions?: string[];
  playerAvailableJobs?: string[];
  playerAvailablePositions?: string[];
  server?: string;
  contact?: string;
  contactDetails?: string;
  teamType?: string;
  clearGoal?: string;
  rosterSize?: string;
  requirements?: string;
}

export interface NgaSample {
  title: string;
  body: string;
  url: string;
  author: string;
  publishedAt: string;
  forumId: string;
  topicId: string;
}

export interface NgaSampleCandidate {
  value: string;
  count: number;
  examples: string[];
}

export interface NgaSampleAnalysisReport {
  sampleCount: number;
  generatedAt: string;
  fieldPresence: Record<keyof NgaSample, { present: number; missing: number; presentRate: number; missingRate: number }>;
  titleStructures: NgaSampleCandidate[];
  bodyStructures: NgaSampleCandidate[];
  dungeonAliases: NgaSampleCandidate[];
  progressExpressions: NgaSampleCandidate[];
  jobPositionExpressions: NgaSampleCandidate[];
  timeExpressions: NgaSampleCandidate[];
  unknownExpressions: NgaSampleCandidate[];
  confirmationQuestions: string[];
  warnings: string[];
}

export interface NgaCollectionSettings {
  keepLogin: boolean;
  startUrl: string;
  selectedBoardUrls: string[];
  allowMultipleBoards: boolean;
  requestIntervalMs: number;
  maxItems: number;
  filterMode: NgaFilterMode;
  includeDetails: boolean;
}

export interface NgaCollectionProgress {
  status: NgaCollectionStatus;
  currentUrl: string;
  collected: number;
  maxItems: number;
  message: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface NgaSessionStatusPayload {
  available: boolean;
  loginStatus: NgaLoginStatus;
  keepLogin: boolean;
  dataLocation: string;
  message: string;
  autoCollectOnStart?: boolean;
}

export interface NgaVisiblePageStatusPayload {
  opened: boolean;
  allowed: boolean;
  currentUrl: string;
  message: string;
  state?: "ready" | "interstitial" | "unsupported" | "closed";
  targetUrl?: string;
}

export interface NgaNavigateSessionPayload extends NgaVisiblePageStatusPayload {
  openedUrl?: string;
}

export interface NgaOpenSessionPayload extends NgaSessionStatusPayload {
  openedUrl: string;
}

export interface NgaClearSessionPayload {
  message: string;
  dataLocation: string;
  cleared: boolean;
}

export interface NgaCollectPayload {
  samples: NgaSample[];
  progress: NgaCollectionProgress;
  warnings: string[];
  fetchedAt: string;
}

export interface NgaDetailCollectPayload extends NgaCollectPayload {
  updated: number;
}

export interface NgaSampleStorePayload {
  samples: NgaSample[];
  count: number;
  dataLocation: string;
  message: string;
  savedAt?: string;
}

export type UpdateProvider = "github" | "gitee";

export interface AppVersionPayload {
  name: string;
  version: string;
  builtAt: string;
  portable: boolean;
  platform: string;
  runtime?: "development" | "portable" | "desktop";
}

export interface UpdateAsset {
  name: string;
  downloadUrl: string;
  size?: number;
}

export interface UpdateCheckPayload {
  provider: UpdateProvider;
  sourceLabel: string;
  currentVersion: string;
  latestVersion: string;
  latestName: string;
  latestUrl: string;
  publishedAt: string;
  body: string;
  assets: UpdateAsset[];
  isNewer: boolean;
  fetchedAt: string;
}

export interface UpdateInstallPayload {
  message: string;
  restart: boolean;
  assetName: string;
}

export interface GeoIpPayload {
  countryCode: string;
  countryName: string;
  recommendedProvider: UpdateProvider;
  source: string;
  fallback: boolean;
  fetchedAt: string;
  message?: string;
}

export interface KeywordFilter {
  include: string[];
  exclude: string[];
}

export interface LocalFilterState {
  ngaRecruitView: NgaRecruitViewMode;
  progressText: string;
  strategyText: string;
  timeText: string;
  excludeText: string;
  timeStart: string;
  timeEnd: string;
  timeDays: string[];
  selectedLabelIds: string[];
  selectedJobIds: string[];
  noDuplicateJobs: boolean;
  selectedPositions: string[];
  alliance: "" | AllianceKey;
  showUnparsedTime: boolean;
}
