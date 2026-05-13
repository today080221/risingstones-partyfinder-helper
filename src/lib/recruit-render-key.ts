import type { RecruitRow } from "../types";

export function getRecruitRenderKey(row: RecruitRow): string {
  if ((row.source ?? "official") === "nga") {
    return row.uuid || `nga-${row.sourceMeta?.topicId || row.sourceUrl || row.sourceTitle || row.id}`;
  }

  if (Number.isFinite(row.id) && row.id > 0) {
    return `official-${row.id}`;
  }

  return row.uuid ? `official-uuid-${row.uuid}` : "official-unknown";
}
