import type { LocalFilterState, MetaPayload, RecruitRow } from "../types";
import { jobCanEnter, matchesOpenPositions } from "./jobs";
import { matchesKeywordFilter, parseKeywordFilter } from "./keywords";
import { deriveRecruitTags, normalizeTagAlias } from "./tags";
import { matchesTimeFilter } from "./time";

const SAVAGE_TYPE = "零式";
const ARCADION_M_RE = /阿卡[迪狄]亚(?:零式)?登天斗技场\s+M(\d{1,2})S(?:\s*-\s*M?(\d{1,2})S)?/i;
const ARCADION_OFFICIAL_RE = /阿卡[迪狄]亚零式登天斗技场\s*(轻量级|中量级|重量级)([1-4])$/;
const CURRENT_SAVAGE_LAYER_RE =
  /^当前零式([1-4一二三四])(?:\s*(?:-|~|～|到|至)\s*([1-4一二三四]))?层$/;
const ARCADION_TIER_OFFSET: Record<string, number> = {
  轻量级: 0,
  中量级: 4,
  重量级: 8
};

export interface RecruitFilterResult {
  rows: RecruitRow[];
  rejected: number;
}

export function filterRecruitRowsByDataRange(
  rows: RecruitRow[],
  range: { fbType: string; fbName: string },
  meta: MetaPayload | null
): RecruitRow[] {
  if (!range.fbType && !range.fbName) {
    return rows;
  }
  const typeByDungeon = new Map((meta?.fbConfigs ?? []).map((config) => [config.fb_name, config.fb_type]));
  return rows.filter((row) => {
    const dungeonName = row.fb_name || row.parsedFields?.dungeon || "";
    if (range.fbName && !matchesDungeonName(row, dungeonName, range.fbName, meta)) {
      return false;
    }
    if (!range.fbType) {
      return true;
    }
    const rowType = row.source === "nga" ? inferNgaDungeonType(dungeonName, meta, typeByDungeon) : row.fb_type;
    return rowType === range.fbType;
  });
}

function matchesDungeonName(
  row: RecruitRow,
  dungeonName: string,
  selectedDungeonName: string,
  meta: MetaPayload | null
): boolean {
  if (dungeonName === selectedDungeonName) {
    return true;
  }
  if (row.source !== "nga") {
    return false;
  }
  return matchesNgaDungeonAlias(dungeonName, selectedDungeonName, meta);
}

function inferNgaDungeonType(
  dungeonName: string,
  meta: MetaPayload | null,
  typeByDungeon: Map<string, string>
): string | undefined {
  const exactType = typeByDungeon.get(dungeonName);
  if (exactType) {
    return exactType;
  }
  if (isArcadionMLabel(dungeonName) || parseCurrentSavageLayerRange(dungeonName) || dungeonName === SAVAGE_TYPE) {
    return SAVAGE_TYPE;
  }
  const selectedContext = meta?.fbConfigs.find((config) => config.fb_name === dungeonName);
  return selectedContext?.fb_type;
}

function matchesNgaDungeonAlias(
  dungeonName: string,
  selectedDungeonName: string,
  meta: MetaPayload | null
): boolean {
  const context = getSelectedSavageContext(selectedDungeonName, meta);
  if (!context) {
    return false;
  }
  if (context.mNumber !== undefined && matchesArcadionMNumber(dungeonName, context.mNumber)) {
    return true;
  }
  if (
    context.isCurrentTier &&
    context.floor !== undefined &&
    matchesCurrentSavageLayer(dungeonName, context.floor)
  ) {
    return true;
  }
  return false;
}

function getSelectedSavageContext(
  selectedDungeonName: string,
  meta: MetaPayload | null
): { floor?: number; mNumber?: number; isCurrentTier: boolean } | null {
  const selectedConfig = meta?.fbConfigs.find((config) => config.fb_name === selectedDungeonName);
  if (!selectedConfig || selectedConfig.fb_type !== SAVAGE_TYPE) {
    return null;
  }
  const currentSavageNames = getCurrentSavageConfigs(meta).map((config) => config.fb_name);
  const floor = getOfficialSavageFloor(selectedConfig.fb_name);
  return {
    floor,
    mNumber: getArcadionMNumber(selectedConfig.fb_name),
    isCurrentTier: currentSavageNames.includes(selectedDungeonName)
  };
}

function getCurrentSavageConfigs(meta: MetaPayload | null) {
  return (meta?.fbConfigs ?? [])
    .filter((config) => config.fb_type === SAVAGE_TYPE)
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
}

function getOfficialSavageFloor(dungeonName: string): number | undefined {
  const match = /([1-4])$/.exec(dungeonName.trim());
  if (!match?.[1]) {
    return undefined;
  }
  return Number(match[1]);
}

function getArcadionMNumber(dungeonName: string): number | undefined {
  const match = ARCADION_OFFICIAL_RE.exec(dungeonName.trim());
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  return ARCADION_TIER_OFFSET[match[1]] + Number(match[2]);
}

function isArcadionMLabel(dungeonName: string): boolean {
  return ARCADION_M_RE.test(dungeonName);
}

function matchesArcadionMNumber(dungeonName: string, mNumber: number): boolean {
  const match = ARCADION_M_RE.exec(dungeonName);
  if (!match?.[1]) {
    return false;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }
  return mNumber >= Math.min(start, end) && mNumber <= Math.max(start, end);
}

function matchesCurrentSavageLayer(dungeonName: string, floor: number): boolean {
  const range = parseCurrentSavageLayerRange(dungeonName);
  if (!range) {
    return false;
  }
  return floor >= range.start && floor <= range.end;
}

function parseCurrentSavageLayerRange(dungeonName: string): { start: number; end: number } | null {
  const match = CURRENT_SAVAGE_LAYER_RE.exec(dungeonName.trim());
  if (!match?.[1]) {
    return null;
  }
  const start = parseSavageFloor(match[1]);
  const end = match[2] ? parseSavageFloor(match[2]) : start;
  if (start === undefined || end === undefined) {
    return null;
  }
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function parseSavageFloor(value: string): number | undefined {
  if (/^[1-4]$/.test(value)) {
    return Number(value);
  }
  const floors: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4 };
  return floors[value];
}

export function filterRecruitRows(
  rows: RecruitRow[],
  filters: LocalFilterState,
  meta: MetaPayload | null
): RecruitFilterResult {
  const progressFilter = parseKeywordFilter(filters.progressText);
  const strategyFilter = parseKeywordFilter(filters.strategyText);
  const globalExcludeFilter = parseKeywordFilter(filters.excludeText);
  const globalExcludeTokens = [...globalExcludeFilter.include, ...globalExcludeFilter.exclude];
  const acceptedRows: RecruitRow[] = [];

  for (const row of rows) {
    if (!matchesKeywordFilter(row.progress, progressFilter)) {
      continue;
    }
    if (!matchesKeywordFilter(row.strategy, strategyFilter)) {
      continue;
    }
    if (
      !matchesTimeFilter(row.fb_time ?? "", {
        timeText: filters.timeText,
        timeStart: filters.timeStart,
        timeEnd: filters.timeEnd,
        dailyMaxHours: filters.dailyMaxHours,
        timeDays: filters.timeDays,
        showUnparsedTime: filters.showUnparsedTime
      })
    ) {
      continue;
    }
    if (
      meta &&
      !jobCanEnter(filters.selectedJobIds, row.need_job ?? [], meta.jobMeta, {
        row,
        alliance: filters.alliance,
        noDuplicateJobs: filters.noDuplicateJobs
      })
    ) {
      continue;
    }
    if (!matchesOpenPositions(row, filters.selectedPositions, filters.alliance)) {
      continue;
    }
    if (!matchesAreaPreference(row, filters.areaPreferenceId, meta)) {
      continue;
    }
    if (!matchesLabelFilter(row, filters.selectedLabelIds, meta)) {
      continue;
    }
    if (!matchesGlobalExclude(row, globalExcludeTokens)) {
      continue;
    }
    acceptedRows.push(row);
  }

  return {
    rows: acceptedRows,
    rejected: rows.length - acceptedRows.length
  };
}

function matchesAreaPreference(row: RecruitRow, areaPreferenceId: string, meta: MetaPayload | null): boolean {
  if (!areaPreferenceId) {
    return true;
  }

  const areaName =
    areaPreferenceId === "-1"
      ? "国际服"
      : meta?.areas.find((area) => String(area.AreaID) === areaPreferenceId)?.AreaName ?? areaPreferenceId;
  const target = areaName.toLowerCase();
  const text = [
    row.area_name,
    row.group_name,
    row.target_area_name,
    row.parsedFields?.server,
    row.sourceTitle,
    row.rawText
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  if (areaPreferenceId === "-1") {
    return /国际服|日服|欧区|欧服|美区|美服|大洋洲|陆服外|外服|jp|eu|us|oce/.test(text);
  }
  return text.includes(target);
}

function matchesLabelFilter(row: RecruitRow, selectedLabelIds: string[], meta: MetaPayload | null): boolean {
  if (!selectedLabelIds.length) {
    return true;
  }

  const labelsById = new Map((meta?.labels ?? []).map((label) => [label.id, label.name]));
  const selected = new Set(
    selectedLabelIds
      .flatMap((value) => {
        const label = labelsById.get(value) ?? "";
        return [value, label, normalizeTagAlias(value), label ? normalizeTagAlias(label) : ""];
      })
      .map((value) => value.toLowerCase())
      .filter(Boolean)
  );
  const textValues = [
    ...(row.label ?? []),
    ...(row.labelInfo?.flatMap((label) => [label.id, label.name]) ?? []),
    ...(row.parseTags ?? []),
    ...deriveRecruitTags(row),
    row.parsedFields?.requirements,
    row.parsedFields?.teamType,
    row.sourceMeta?.recruitKind ? formatRecruitKindLabel(row.sourceMeta.recruitKind) : ""
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.toLowerCase());

  return [...selected].some((target) => textValues.some((value) => value === target || value.includes(target)));
}

function formatRecruitKindLabel(kind: NonNullable<RecruitRow["sourceMeta"]>["recruitKind"]): string {
  switch (kind) {
    case "seeking":
      return "求职 玩家求职";
    case "recruit":
      return "招募 队伍招募";
    case "closed":
      return "已关闭 已招满";
    case "noise":
      return "噪音";
    case "unknown":
      return "未识别";
    default:
      return "";
  }
}

function matchesGlobalExclude(row: RecruitRow, excludeTokens: string[]): boolean {
  if (excludeTokens.length === 0) {
    return true;
  }

  const text = [
    row.fb_name,
    row.fb_type,
    row.progress,
    row.strategy,
    row.fb_time,
    row.team_composition,
    row.sourceTitle,
    row.sourceAuthor,
    row.rawText,
    row.custom_label,
    ...(Object.values(row.parsedFields ?? {}).flatMap((value) => (Array.isArray(value) ? value : [value])) ?? []),
    ...(row.parseTags ?? []),
    ...(row.parseWarnings ?? []),
    ...(row.labelInfo?.map((label) => label.name) ?? [])
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return excludeTokens.every((token) => !text.includes(token));
}
