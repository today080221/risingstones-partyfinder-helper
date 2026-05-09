import type { LocalFilterState, MetaPayload, RecruitRow } from "../types";
import { jobCanEnter, matchesOpenPositions } from "./jobs";
import { matchesKeywordFilter, parseKeywordFilter } from "./keywords";
import { matchesTimeFilter } from "./time";

export interface RecruitFilterResult {
  rows: RecruitRow[];
  rejected: number;
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

function matchesLabelFilter(row: RecruitRow, selectedLabelIds: string[], meta: MetaPayload | null): boolean {
  if (!selectedLabelIds.length) {
    return true;
  }

  const labelsById = new Map((meta?.labels ?? []).map((label) => [label.id, label.name]));
  const selected = new Set(
    selectedLabelIds
      .flatMap((value) => [value, labelsById.get(value) ?? ""])
      .map((value) => value.toLowerCase())
      .filter(Boolean)
  );
  const textValues = [
    ...(row.label ?? []),
    ...(row.labelInfo?.flatMap((label) => [label.id, label.name]) ?? []),
    ...(row.parseTags ?? []),
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
