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
        noDuplicateJobs: filters.noDuplicateJobs
      })
    ) {
      continue;
    }
    if (!matchesOpenPositions(row, filters.selectedPositions, filters.alliance)) {
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
    row.custom_label,
    ...(row.labelInfo?.map((label) => label.name) ?? [])
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return excludeTokens.every((token) => !text.includes(token));
}
