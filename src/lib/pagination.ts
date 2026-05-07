import type { RecruitQuery } from "../types";

export interface RecruitPage<T> {
  count: number | string;
  rows: T[];
}

export interface PaginatedRows<T> {
  count: number;
  rows: T[];
  warnings: string[];
}

export async function collectPaginatedRows<T>(options: {
  firstPage: RecruitPage<T>;
  fetchPage: (page: number) => Promise<RecruitPage<T>>;
  maxPages: number;
  beforePage?: (page: number) => Promise<void>;
}): Promise<PaginatedRows<T>> {
  const count = parseCount(options.firstPage.count);
  const rows = [...options.firstPage.rows];
  const warnings: string[] = [];

  for (let page = 2; rows.length < count && page <= options.maxPages; page += 1) {
    await options.beforePage?.(page);
    const nextPage = await options.fetchPage(page);
    if (nextPage.rows.length === 0) {
      warnings.push(`第 ${page} 页为空，已提前停止拉取。`);
      break;
    }
    rows.push(...nextPage.rows);
  }

  if (rows.length < count) {
    warnings.push(`官方 count=${count}，本次实际拉取 ${rows.length} 条。`);
  }

  return { count, rows, warnings };
}

export function buildOfficialRecruitParams(
  query: RecruitQuery,
  page: number,
  limit: number
): Record<string, string> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(limit)
  };

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params[key] = value;
    }
  }

  return params;
}

function parseCount(value: string | number): number {
  const count = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(count) ? count : 0;
}
