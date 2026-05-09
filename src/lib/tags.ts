import type { FbLabel, RecruitRow } from "../types";

export interface RecruitTagOption {
  id: string;
  label: string;
  count: number;
}

export const CORE_RECRUIT_TAGS = [
  "玩家求职",
  "队伍招募",
  "开荒",
  "过本",
  "清CD/低保",
  "伐木/Farm",
  "首周目标",
  "次周目标",
  "首月目标",
  "次月目标",
  "固定队/长期队",
  "补人/替班/临时",
  "社畜/晚间队",
  "爆肝队",
  "时差队",
  "休闲队",
  "logs 要求",
  "需看原文确认",
  "纯净队/禁第三方",
  "第三方工具/插件风险",
  "ACT 时间轴/TTS 辅助",
  "拒绝装甲车/代打记录",
  "代打/工作室/带老板风险"
];

const CORE_TAG_SET = new Set(CORE_RECRUIT_TAGS);

const TAG_RULES: Array<{ value: string; pattern: RegExp }> = [
  { value: "开荒", pattern: /开荒|从0|从零|补进度|练习|见[^\s,，。；;、]{1,8}|P\d{1,2}/i },
  { value: "过本", pattern: /过本|渡劫|狂暴|清CD|清cd/i },
  { value: "清CD/低保", pattern: /清CD|清cd|低保|周常|消化/i },
  { value: "伐木/Farm", pattern: /伐木|farm|FM/i },
  { value: "首周目标", pattern: /首周|一周内|第一周/i },
  { value: "次周目标", pattern: /次周|二周|第二周/i },
  { value: "首月目标", pattern: /首月|一个月|月内/i },
  { value: "次月目标", pattern: /次月|第二个月/i },
  { value: "固定队/长期队", pattern: /固定队|长期|稳定队/i },
  { value: "补人/替班/临时", pattern: /补人|补招|替班|代班|救急|临时/i },
  { value: "社畜/晚间队", pattern: /社畜|晚间|晚上|每晚|下班/i },
  { value: "爆肝队", pattern: /爆肝|高强度|长时间/i },
  { value: "时差队", pattern: /时差|美西|美东|欧服|中欧|大洋洲/i },
  { value: "休闲队", pattern: /休闲|慢打|随缘/i },
  { value: "logs 要求", pattern: /logs?|fflogs|颜色|紫色|蓝色|灰色|median/i },
  { value: "纯净队/禁第三方", pattern: /纯净队|禁第三方|禁止插件|不用插件|拒绝插件/i },
  { value: "第三方工具/插件风险", pattern: /第三方工具\/插件风险|红玩|非绿玩|科技/i },
  { value: "ACT 时间轴/TTS 辅助", pattern: /ACT 时间轴|TTS 辅助|轮椅|播报/i },
  { value: "拒绝装甲车/代打记录", pattern: /拒绝装甲车|拒绝代打|代打记录|非装甲车|装甲车过本看不到/i },
  { value: "代打/工作室/带老板风险", pattern: /代打\/工作室\/带老板风险/i }
];

export function deriveRecruitTags(row: RecruitRow): string[] {
  const tags = new Set<string>();
  const kind = row.sourceMeta?.recruitKind;
  if (kind === "seeking") {
    tags.add("玩家求职");
  } else if (kind === "recruit") {
    tags.add("队伍招募");
  }

  for (const value of [
    ...(row.labelInfo?.flatMap((label) => [label.id, label.name]) ?? []),
    ...(row.label ?? []),
    ...(row.parseTags ?? []),
    row.custom_label,
    row.parsedFields?.teamType,
    row.parsedFields?.clearGoal,
    row.parsedFields?.requirements,
    row.parsedFields?.rosterSize
  ]) {
    addSplitTags(tags, value);
  }

  if (row.parseWarnings?.some((warning) => /低置信|人工确认/.test(warning))) {
    tags.add("需看原文确认");
  }

  const text = [
    row.progress,
    row.strategy,
    row.fb_time,
    row.group_name,
    row.sourceTitle,
    row.rawText,
    row.parsedFields?.progress,
    row.parsedFields?.strategy,
    row.parsedFields?.time,
    row.parsedFields?.timeSupplement,
    row.parsedFields?.dailyDuration
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");

  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) {
      tags.add(rule.value);
    }
  }

  return [...tags].filter(Boolean);
}

export function buildRecruitTagOptions(rows: RecruitRow[], labels: FbLabel[], selectedIds: string[]): RecruitTagOption[] {
  const counts = new Map<string, number>();
  const labelsById = new Map(labels.map((label) => [label.id, label.name]));
  const metaOptionIds = labels.flatMap((label) =>
    CORE_TAG_SET.has(normalizeTagAlias(label.name)) ? [] : [label.id, label.name]
  );
  const optionIds = new Set([...CORE_RECRUIT_TAGS, ...metaOptionIds, ...selectedIds]);

  for (const row of rows) {
    const rowTags = new Set(deriveRecruitTags(row).flatMap((tag) => [tag, normalizeTagAlias(tag)]));
    for (const optionId of optionIds) {
      const label = labelsById.get(optionId) ?? optionId;
      if (rowTags.has(optionId) || rowTags.has(label) || rowTags.has(normalizeTagAlias(label))) {
        counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
      }
    }
  }

  const coreIndex = new Map(CORE_RECRUIT_TAGS.map((tag, index) => [tag, index]));
  const selected = new Set(selectedIds);
  return [...optionIds]
    .map((id) => ({ id, label: labelsById.get(id) ?? id, count: counts.get(id) ?? 0 }))
    .filter((option) => CORE_TAG_SET.has(option.id) || CORE_TAG_SET.has(option.label) || option.count > 0 || selected.has(option.id))
    .sort((a, b) => {
      const selectedDelta = Number(selected.has(b.id)) - Number(selected.has(a.id));
      if (selectedDelta) {
        return selectedDelta;
      }
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return (coreIndex.get(a.label) ?? 999) - (coreIndex.get(b.label) ?? 999) || a.label.localeCompare(b.label, "zh-CN");
    });
}

function addSplitTags(target: Set<string>, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const fullTag = normalizeTagAlias(value);
  if (CORE_TAG_SET.has(fullTag)) {
    target.add(fullTag);
    return;
  }
  for (const part of value.split(/[、,，;；/]/)) {
    const tag = part.trim();
    if (tag) {
      target.add(normalizeTagAlias(tag));
    }
  }
}

export function normalizeTagAlias(value: string): string {
  const trimmed = value.trim();
  if (/^求职$|玩家求职/.test(value)) {
    return "玩家求职";
  }
  if (/^招募$|队伍招募|队伍招人/.test(value)) {
    return "队伍招募";
  }
  if (/低保|清CD|清cd/.test(value)) {
    return "清CD/低保";
  }
  if (/首周/.test(value)) {
    return "首周目标";
  }
  if (/次周/.test(value)) {
    return "次周目标";
  }
  if (/首月/.test(value)) {
    return "首月目标";
  }
  if (/次月/.test(value)) {
    return "次月目标";
  }
  if (/固定队|长期队|稳定队|长期|稳定/.test(value)) {
    return "固定队/长期队";
  }
  if (/补人|补招|替班|代班|救急|临时/.test(value)) {
    return "补人/替班/临时";
  }
  if (/社畜|晚间队|晚间|晚上|下班/.test(value)) {
    return "社畜/晚间队";
  }
  if (/爆肝|高强度/.test(value)) {
    return "爆肝队";
  }
  if (/时差|美西|美东|欧服|中欧|大洋洲/.test(value)) {
    return "时差队";
  }
  if (/休闲|慢打|随缘/.test(value)) {
    return "休闲队";
  }
  if (/logs?|fflogs|颜色|紫色|蓝色|灰色|median/i.test(value)) {
    return "logs 要求";
  }
  if (/拒绝装甲车|拒绝代打|代打记录|非装甲车|装甲车过本看不到/.test(value)) {
    return "拒绝装甲车/代打记录";
  }
  return trimmed;
}
