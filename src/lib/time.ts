export interface ParsedTimeInfo {
  ranges: TimeRange[];
  days: string[];
  excludedDays: string[];
  display: string;
  parsed: boolean;
}

export interface TimeRange {
  start: number;
  end: number;
  raw: string;
  display: string;
  index: number;
}

export interface TimeDuration {
  minHours: number;
  maxHours: number;
  raw: string;
  display: string;
  index: number;
}

export interface TimeFilterInput {
  timeText: string;
  timeStart: string;
  timeEnd: string;
  dailyMaxHours: string;
  timeDays: string[];
  showUnparsedTime: boolean;
}

const TIME_RANGE_RE =
  /(?<prefix>凌晨|早上|上午|中午|下午|晚上|晚|夜里|夜)?\s*(?<start>\d{1,2})(?:[:：.](?<startMinute>\d{1,2}))?(?:点)?(?<startHalf>半)?\s*(?:-|—|–|~|～|\?|到|至)\s*(?<end>\d{1,2})(?:[:：.](?<endMinute>\d{1,2}))?(?:点)?(?<endHalf>半)?/g;
const TIME_DURATION_RE =
  /(?<min>\d{1,2})(?:\s*(?:-|—|–|~|～|到|至)\s*(?<max>\d{1,2}))?\s*(?:h|H|小时|个小时)/g;

const DAY_LABELS: Record<string, string> = {
  "1": "周一",
  "2": "周二",
  "3": "周三",
  "4": "周四",
  "5": "周五",
  "6": "周六",
  "0": "周日"
};

interface DayMention {
  days: string[];
  label: string;
  index: number;
  length: number;
  excluded: boolean;
}

export function parseRecruitTime(value: string): ParsedTimeInfo {
  const normalized = normalizeTimeText(value);
  const dayMentions = collectDayMentions(normalized);
  const days = new Set<string>();
  const excludedDays = new Set<string>();
  const ranges: TimeRange[] = [];

  for (const mention of dayMentions) {
    const target = mention.excluded ? excludedDays : days;
    mention.days.forEach((day) => target.add(day));
  }

  for (const match of normalized.matchAll(TIME_RANGE_RE)) {
    const groups = match.groups;
    if (!groups) {
      continue;
    }
    if (hasSuspiciousDecimalMinute(groups, match[0])) {
      continue;
    }
    const explicitPrefix = groups.prefix ?? "";
    const rawStartHour = Number(groups.start);
    const rawEndHour = Number(groups.end);
    if (
      !explicitPrefix &&
      shouldSkipBareNumericRange(normalized, match.index, match[0], rawStartHour, rawEndHour, ranges)
    ) {
      continue;
    }
    const prefix = explicitPrefix || inferTimePrefixFromContext(normalized, match.index);
    const startMinute = Number(groups.startMinute ?? (groups.startHalf ? 30 : 0));
    const endMinute = Number(groups.endMinute ?? (groups.endHalf ? 30 : 0));
    const midnightEveningRange = ["晚上", "晚", "夜里", "夜"].includes(prefix) && rawStartHour === 12 && rawEndHour <= 6;
    const start = midnightEveningRange ? startMinute / 60 : normalizeHour(rawStartHour, startMinute, prefix, true);
    const end =
      midnightEveningRange || (["晚上", "晚", "夜里", "夜"].includes(prefix) && start >= 18 && rawEndHour <= 6)
        ? rawEndHour + endMinute / 60
        : normalizeHour(rawEndHour, endMinute, prefix, false);
    const normalizedEnd = end <= start ? end + 24 : end;
    if (!isLikelyTimeRange(start, normalizedEnd, prefix, match[0], normalized, match.index)) {
      continue;
    }
    ranges.push({
      start,
      end: normalizedEnd,
      raw: match[0],
      display: formatTimeRangeDisplay(start, normalizedEnd, prefix),
      index: match.index
    });
  }

  const activeDays = [...days].filter((day) => !excludedDays.has(day));
  if (!activeDays.length && excludedDays.size > 0 && ranges.length > 0 && hasEverydayExceptContext(normalized)) {
    for (const day of ["1", "2", "3", "4", "5", "6", "0"]) {
      if (!excludedDays.has(day)) {
        activeDays.push(day);
      }
    }
  }
  const dedupedRanges = dedupeRanges(ranges);
  const display = formatTimeDisplay(activeDays, dedupedRanges);
  return {
    ranges: dedupedRanges,
    days: activeDays,
    excludedDays: [...excludedDays],
    display,
    parsed: ranges.length > 0 || activeDays.length > 0 || excludedDays.size > 0
  };
}

export function matchesTimeFilter(rawTime: string, filter: TimeFilterInput): boolean {
  const textNeedle = filter.timeText.trim().toLowerCase();
  const parsed = parseRecruitTime(rawTime);
  const textMatched =
    !textNeedle || rawTime.toLowerCase().includes(textNeedle) || parsed.display.toLowerCase().includes(textNeedle);
  if (!textMatched) {
    return false;
  }

  const earliestStart = parseHourConstraint(filter.timeStart, "start");
  const latestEnd = parseHourConstraint(filter.timeEnd, "end");
  const maxDailyHours = parsePositiveHourAmount(filter.dailyMaxHours);
  const wantsRange = earliestStart !== null || latestEnd !== null;
  const wantsDays = filter.timeDays.length > 0;
  const wantsDuration = maxDailyHours !== null;

  if (!wantsRange && !wantsDays && !wantsDuration) {
    return true;
  }

  if (!parsed.parsed) {
    return filter.showUnparsedTime;
  }

  if (wantsDays && parsed.days.length > 0) {
    const hasDay = filter.timeDays.some((day) => parsed.days.includes(day));
    if (!hasDay) {
      return false;
    }
  } else if (wantsDays && parsed.days.length === 0 && !filter.showUnparsedTime) {
    return false;
  }

  if (wantsRange && parsed.ranges.length > 0) {
    const rangesOk = parsed.ranges.every((range) => {
      if (earliestStart !== null && range.start < earliestStart) {
        return false;
      }
      if (latestEnd !== null && range.end > latestEnd) {
        return false;
      }
      return true;
    });
    if (!rangesOk) {
      return false;
    }
  }

  if (wantsRange && parsed.ranges.length === 0) {
    return filter.showUnparsedTime;
  }

  if (wantsDuration) {
    if (!matchesDailyDurationLimit(rawTime, parsed, maxDailyHours)) {
      return false;
    }
  }

  return true;
}

export function describeTimeParse(rawTime: string): string {
  return formatRecruitTimeDisplay(rawTime) || "未解析";
}

export function formatRecruitTimeDisplay(rawTime: string): string {
  const parsed = parseRecruitTime(rawTime);
  return parsed.display;
}

export function parseRecruitDailyDurations(rawTime: string): TimeDuration[] {
  const normalized = normalizeTimeText(rawTime);
  const durations: TimeDuration[] = [];
  for (const match of normalized.matchAll(TIME_DURATION_RE)) {
    const groups = match.groups;
    if (!groups) {
      continue;
    }
    const minHours = Number(groups.min);
    const maxHours = groups.max ? Number(groups.max) : minHours;
    if (!isLikelyDailyDuration(normalized, match.index, match[0].length, match[0], minHours, maxHours)) {
      continue;
    }
    durations.push({
      minHours,
      maxHours,
      raw: match[0],
      display: formatDurationDisplay(minHours, maxHours),
      index: match.index
    });
  }
  return dedupeDurations(durations);
}

export function formatRecruitDailyDuration(
  rawTime: string,
  options: { inferFromRanges?: boolean } = {}
): string {
  const explicitDurations = parseRecruitDailyDurations(rawTime);
  if (explicitDurations.length) {
    return explicitDurations.map((duration) => duration.display).join("、");
  }
  if (!options.inferFromRanges) {
    return "";
  }
  const parsed = parseRecruitTime(rawTime);
  if (!parsed.ranges.length) {
    return "";
  }
  const durations = parsed.ranges.map((range) => range.end - range.start);
  if (hasAlternativeTimezoneContext(rawTime) && durations.length >= 2) {
    const [first] = durations;
    return durations.every((duration) => Math.abs(duration - first) < 0.05) ? `约${formatHourAmount(first)}小时/天` : "";
  }
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  if (total <= 0 || total > 14) {
    return "";
  }
  return `约${formatHourAmount(total)}小时/天`;
}

function normalizeTimeText(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/[－—–~～]/g, "-")
    .replace(/\s+/g, "");
}

function collectDayMentions(text: string): DayMention[] {
  const mentions: DayMention[] = [];
  const addMention = (days: string[], label: string, index: number, length: number, excludedOverride?: boolean) => {
    if (!hasScheduleDayContext(text, index, length)) {
      return;
    }
    mentions.push({
      days,
      label,
      index,
      length,
      excluded: excludedOverride ?? isExcludedDayContext(text, index, length)
    });
  };

  for (const match of text.matchAll(/(?:7|七)天无休|每天|每日|每晚|天天/g)) {
    if (isDailyDurationOnlyDayMention(text, match.index, match[0].length)) {
      continue;
    }
    addMention(["1", "2", "3", "4", "5", "6", "0"], "每天", match.index, match[0].length, false);
  }

  for (const match of text.matchAll(/周一(?:到|至|-)?周五|工作日|平日/g)) {
    addMention(["1", "2", "3", "4", "5"], "工作日", match.index, match[0].length);
  }
  for (const match of text.matchAll(/(?:周|星期|礼拜)([一二三四五六日天0-7])(?:到|至|-)(?:周|星期|礼拜)?([一二三四五六日天0-7])/g)) {
    const days = expandDayRange(charToDay(match[1]), charToDay(match[2]));
    if (days.length) {
      addMention(days, formatDayLabels(days), match.index, match[0].length);
    }
  }
  for (const match of text.matchAll(/周末|双休|星期六日|星期六天|周六周日|周六周天|周六日|周六天/g)) {
    if (isQuantityWeekContext(text, match.index, match[0])) {
      continue;
    }
    addMention(["6", "0"], "周末", match.index, match[0].length);
  }
  for (const match of text.matchAll(/(?:周|星期|礼拜)([一二三四五六日天0-7]+(?:(?:[、,，和及与同/\\／|｜+＋&~～]+|周|星期|礼拜)[一二三四五六日天0-7]+)*)/g)) {
    if (isQuantityWeekContext(text, match.index, match[0])) {
      continue;
    }
    const days = normalizeDayChars(match[1]);
    if (days.length) {
      addMention(days, formatDayLabels(days), match.index, match[0].length);
    }
  }

  return dedupeDayMentions(mentions);
}

function normalizeDayChars(value: string): string[] {
  const result: string[] = [];
  const normalized = value.replace(/[和及与同、,，/\\／|｜+＋&~～]/g, "");
  for (const char of normalized) {
    const day = charToDay(char);
    if (day) {
      result.push(day);
    }
  }
  return [...new Set(result)];
}

function charToDay(value: string): string | null {
  const map: Record<string, string> = {
    一: "1",
    二: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6",
    日: "0",
    天: "0",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "0",
    "0": "0"
  };
  return map[value] ?? null;
}

function expandDayRange(start: string | null, end: string | null): string[] {
  if (!start || !end) {
    return [];
  }
  const order = ["1", "2", "3", "4", "5", "6", "0"];
  const startIndex = order.indexOf(start);
  const endIndex = order.indexOf(end);
  if (startIndex < 0 || endIndex < 0) {
    return [];
  }
  if (startIndex <= endIndex) {
    return order.slice(startIndex, endIndex + 1);
  }
  return [...order.slice(startIndex), ...order.slice(0, endIndex + 1)];
}

function isQuantityWeekContext(text: string, index: number, raw: string): boolean {
  const before = text[index - 1] ?? "";
  return /[每一二三四五六七八九十0-9]/.test(before) && /[天日]$/.test(raw);
}

function hasScheduleDayContext(text: string, index: number, length: number): boolean {
  const context = text.slice(Math.max(0, index - 24), Math.min(text.length, index + length + 32));
  if (/(?:履历|经验|记录|过本记录|首周|次周|三周内|四周内|m\d|M\d|P\d|p\d)/.test(context) && !/(?:时间|上班|活动|开荒时间|加班|加练|休|无休|每天|每晚|清CD|消化)/.test(context)) {
    return false;
  }
  return /(?:时间|上班|活动|开荒|打|每天|每日|每晚|晚|晚上|晚间|夜|凌晨|上午|下午|中午|国内|美西|美东|中欧|工作日|平日|周末|双休|休|无休|加班|加练|清CD|消化|开打)/.test(context);
}

function isDailyDurationOnlyDayMention(text: string, index: number, length: number): boolean {
  const context = text.slice(index, Math.min(text.length, index + length + 14));
  const around = text.slice(Math.max(0, index - 8), Math.min(text.length, index + length + 18));
  const hasRange =
    /\d{1,2}(?:[:：.]\d{1,2})?(?:点)?\s*(?:-|—|–|~|～|到|至)\s*\d{1,2}(?:[:：.]\d{1,2})?(?:点)?/.test(around) &&
    !/\d{1,2}\s*(?:-|—|–|~|～|到|至)\s*\d{1,2}\s*(?:h|H|小时|个小时)/.test(around);
  return /^(?:每天|每日|每晚|天天)(?:至少|约|大约|打|活动|上班)?\d{1,2}(?:\s*-\s*\d{1,2})?(?:h|H|小时|个小时)/.test(context) && !hasRange;
}

function isExcludedDayContext(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 16), index);
  const after = text.slice(index + length, Math.min(text.length, index + length + 16));
  const around = text.slice(Math.max(0, index - 16), Math.min(text.length, index + length + 16));
  return (
    /(?:休|休息|不打|鸽|请假|双休|固定休|固定休息|周休|每周休|每星期休|每礼拜休)[^周星期礼拜0-7一二三四五六日天]{0,8}$/.test(before) ||
    /^[^周星期礼拜0-7一二三四五六日天]{0,8}(?:休|休息|不打|双休|鸽|请假)/.test(after) ||
    /(?:固定休|周休|每周休|每星期休|每礼拜休|休周|休星期|休礼拜|休息日)[^周星期礼拜0-7一二三四五六日天]{0,8}(?:周|星期|礼拜)?[一二三四五六日天0-7]/.test(around) ||
    /(?:周|星期|礼拜)?[一二三四五六日天0-7][^周星期礼拜0-7一二三四五六日天]{0,6}(?:休|休息|不打|鸽|请假)/.test(around)
  );
}

function hasEverydayExceptContext(text: string): boolean {
  return /(?:上6休1|做六休一|每晚|每天|每日|天天|七天无休|7天无休|周休\d+天|每周休\d+天|每星期休\d+天|每礼拜休\d+天|休[一二两三四五六七八九十0-9]+天|固定休(?:周|星期|礼拜)?[一二三四五六日天0-7])/.test(text);
}

function dedupeDayMentions(mentions: DayMention[]): DayMention[] {
  const seen = new Set<string>();
  const result: DayMention[] = [];
  for (const mention of mentions.sort((left, right) => left.index - right.index || right.length - left.length)) {
    const key = `${mention.days.join("/")}:${mention.excluded}:${mention.index}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(mention);
  }
  return result;
}

function normalizeHour(hour: number, minute: number, prefix: string, isStart: boolean): number {
  if (hour > 24) {
    return Number.NaN;
  }

  const afternoon = ["下午", "晚上", "晚", "夜里", "夜"].includes(prefix);
  if (afternoon && (hour < 12 || (!isStart && hour === 12))) {
    return hour + 12 + minute / 60;
  }
  if (prefix === "中午" && hour < 11) {
    return hour + 12 + minute / 60;
  }
  return hour + minute / 60;
}

function inferTimePrefixFromContext(text: string, index: number): string {
  const before = text.slice(Math.max(0, index - 36), index);
  const cues: Array<{ pattern: RegExp; prefix: string }> = [
    { pattern: /(?:晚上|晚间|夜间|夜里|社畜|晚)/g, prefix: "晚" },
    { pattern: /下午/g, prefix: "下午" },
    { pattern: /(?:上午|早上|早晨|早)/g, prefix: "上午" },
    { pattern: /中午/g, prefix: "中午" },
    { pattern: /凌晨/g, prefix: "凌晨" }
  ];
  let latest: { index: number; prefix: string } | null = null;
  for (const cue of cues) {
    for (const match of before.matchAll(cue.pattern)) {
      const cueIndex = match.index ?? -1;
      if (cueIndex >= 0 && (!latest || cueIndex >= latest.index)) {
        latest = { index: cueIndex, prefix: cue.prefix };
      }
    }
  }
  return latest?.prefix ?? "";
}

function shouldSkipBareNumericRange(
  text: string,
  index: number,
  raw: string,
  startHour: number,
  endHour: number,
  acceptedRanges: TimeRange[]
): boolean {
  if (acceptedRanges.length === 0 || /[:：点.]/.test(raw)) {
    return false;
  }
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) {
    return false;
  }
  const normalizedEnd = endHour <= startHour ? endHour + 24 : endHour;
  const duration = normalizedEnd - startHour;
  if (duration <= 6) {
    return false;
  }

  const before = text.slice(Math.max(0, index - 24), index);
  const segment = getTextAfterLastTimeSeparator(before);
  if (hasDirectTimeCue(segment)) {
    return false;
  }
  if (/(?:休|休息|不打|鸽|请假|固定休|暂定休|周休|双休|放假)[^0-9]{0,12}$/.test(before)) {
    return true;
  }
  return /[、,，;；。]$/.test(before);
}

function getTextAfterLastTimeSeparator(value: string): string {
  const separators = ["、", ",", "，", ";", "；", "。", "\n", "\r"];
  const lastIndex = Math.max(...separators.map((separator) => value.lastIndexOf(separator)));
  return value.slice(lastIndex + 1);
}

function hasDirectTimeCue(value: string): boolean {
  return /(?:时间|上班|活动|开打|每天|每日|每晚|晚|晚上|晚间|夜|凌晨|上午|下午|中午|国内|美西|美东|中欧|北京时间|工作日|平日|周末|周[一二三四五六日天0-7]|星期[一二三四五六日天0-7])/.test(value);
}

function hasSuspiciousDecimalMinute(groups: Record<string, string | undefined>, raw: string): boolean {
  if (!raw.includes(".")) {
    return false;
  }
  return Boolean(
    (groups.startMinute && groups.startMinute.length === 1) ||
      (groups.endMinute && groups.endMinute.length === 1)
  );
}

function isLikelyTimeRange(start: number, end: number, prefix: string, raw: string, text: string, index: number): boolean {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 36) {
    return false;
  }
  const duration = end - start;
  const hasExplicitClock = /[:：]/.test(raw);
  const hasNearbyKeyword = hasNearbyTimeKeyword(text, index, raw.length);
  const maxDuration = hasExplicitClock || prefix || hasNearbyKeyword ? 16 : 8;
  if (duration < 0.5 || duration > maxDuration) {
    return false;
  }
  if (hasNonTimeNumericContext(text, index, raw.length)) {
    return false;
  }
  if (!prefix && !/[:：点.]/.test(raw) && start >= 13 && end > 24 && duration > 6) {
    return false;
  }
  if (!prefix && start < 6 && !hasNearbyTimeKeyword(text, index, raw.length)) {
    return false;
  }
  return true;
}

function hasNonTimeNumericContext(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 8), index);
  const after = text.slice(index + length, Math.min(text.length, index + length + 8));
  if (/[A-Za-z]$/.test(before) || /^[A-Za-z]/.test(after)) {
    return true;
  }
  if (/^次(?!周)/.test(after)) {
    return true;
  }
  if (/^(?:h|H|小时|个小时|天|周|月|cd|CD|s|S|绝|有|回|个|名|人|小时|分钟)/.test(after)) {
    return true;
  }
  if (/(?:版本|目标|预计|通过|经验|首周|次周|M|P|m|p)$/.test(before)) {
    return true;
  }
  return false;
}

function hasNearbyTimeKeyword(text: string, index: number, length: number): boolean {
  const context = text.slice(Math.max(0, index - 12), Math.min(text.length, index + length + 12));
  return /(?:时间|上班|活动|开打|每天|每晚|晚|晚上|晚间|夜|凌晨|上午|下午|中午|国内|美西|美东|中欧|周[一二三四五六日天0-7]|星期[一二三四五六日天0-7]|工作日|平日|周末)/.test(context);
}

function isLikelyDailyDuration(
  text: string,
  index: number,
  length: number,
  raw: string,
  minHours: number,
  maxHours: number
): boolean {
  if (!Number.isFinite(minHours) || !Number.isFinite(maxHours) || minHours <= 0 || maxHours < minHours || maxHours > 16) {
    return false;
  }
  const before = text.slice(Math.max(0, index - 18), index);
  const after = text.slice(index + length, Math.min(text.length, index + length + 10));
  const context = `${before}${text.slice(index, index + length)}${after}`;
  if (/[hH]$/.test(raw) && (/^\d/.test(after) || /[=缺]\s*$/.test(before))) {
    return false;
  }
  if (/(?:周满|每周|一周|周内|cd|CD)$/.test(before) || /^(?:cd|CD|绝|本|层|S|s|次|个职业)/.test(after)) {
    return false;
  }
  const hasOvertimeContext = /(?:加班|加练|额外|看情况|补时|延长)/.test(context);
  const hasRegularDurationContext = /(?:每天|每日|每晚|一晚|一天|单日|日均|常规|正常|固定|活动|上班|攻略时间)/.test(context);
  if (hasOvertimeContext && !hasRegularDurationContext) {
    return false;
  }
  return /(?:每天|每日|每晚|一晚|一天|单日|日均|首周|次周|前期|后期|冲刺|临过本|至少|尽量|打|活动|上班|攻略时间|小时|h|H)/.test(context);
}

function dedupeDurations(durations: TimeDuration[]): TimeDuration[] {
  const seen = new Set<string>();
  const result: TimeDuration[] = [];
  for (const duration of durations.sort((left, right) => left.index - right.index)) {
    const key = `${duration.minHours}-${duration.maxHours}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(duration);
  }
  return result;
}

function formatDurationDisplay(minHours: number, maxHours: number): string {
  if (minHours === maxHours) {
    return `${formatHourAmount(minHours)}小时/天`;
  }
  return `${formatHourAmount(minHours)}-${formatHourAmount(maxHours)}小时/天`;
}

function formatHourAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function hasAlternativeTimezoneContext(value: string): boolean {
  return /美西|美东|美中|中欧|欧区|美区|北美|欧洲|国内|北京时间/.test(value);
}

function formatTimeDisplay(days: string[], ranges: TimeRange[]): string {
  const parts: string[] = [];
  const dayText = formatDayLabels(days);
  const rangeText = dedupeRanges(ranges).map((range) => range.display).join("、");
  if (dayText && rangeText) {
    parts.push(`${dayText} ${rangeText}`);
  } else if (rangeText) {
    parts.push(rangeText);
  } else if (dayText) {
    parts.push(dayText);
  }
  return parts.join("；");
}

function formatDayLabels(days: string[]): string {
  const unique = [...new Set(days)].sort(daySort);
  if (unique.length === 0) {
    return "";
  }
  if (sameDays(unique, ["1", "2", "3", "4", "5"])) {
    return "工作日";
  }
  if (sameDays(unique, ["6", "0"])) {
    return "周末";
  }
  if (sameDays(unique, ["1", "2", "3", "4", "5", "6", "0"])) {
    return "每天";
  }
  const rangeLabel = formatContiguousDayRange(unique);
  if (rangeLabel) {
    return rangeLabel;
  }
  return unique.map((day) => DAY_LABELS[day] ?? `周${day}`).join("/");
}

function formatContiguousDayRange(days: string[]): string {
  if (days.length < 3) {
    return "";
  }
  const order = ["1", "2", "3", "4", "5", "6", "0"];
  const indexes = days.map((day) => order.indexOf(day)).filter((index) => index >= 0);
  if (indexes.length !== days.length) {
    return "";
  }
  const min = Math.min(...indexes);
  const max = Math.max(...indexes);
  if (max - min + 1 !== indexes.length) {
    return "";
  }
  return `${DAY_LABELS[order[min]]}-${DAY_LABELS[order[max]]}`;
}

function daySort(left: string, right: string): number {
  const order = ["1", "2", "3", "4", "5", "6", "0"];
  return order.indexOf(left) - order.indexOf(right);
}

function sameDays(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((day, index) => day === right[index]);
}

function dedupeRanges(ranges: TimeRange[]): TimeRange[] {
  const seen = new Set<string>();
  const result: TimeRange[] = [];
  for (const range of ranges.sort((left, right) => left.index - right.index || left.display.localeCompare(right.display))) {
    const key = `${range.start}-${range.end}`;
    if (seen.has(key)) {
      continue;
    }
    if (result.some((existing) => range.start >= existing.start && range.end <= existing.end)) {
      continue;
    }
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const existing = result[index];
      if (existing.start >= range.start && existing.end <= range.end) {
        seen.delete(`${existing.start}-${existing.end}`);
        result.splice(index, 1);
      }
    }
    seen.add(key);
    result.push(range);
  }
  return result;
}

function formatTimeRangeDisplay(start: number, end: number, prefix: string): string {
  return `${toClockPart(start)}-${toClockPart(end, { nextDay: end > 24 })}`;
}

function toClockPart(value: number, options: { nextDay?: boolean } = {}): string {
  const normalized = value === 24 ? 24 : ((value % 24) + 24) % 24;
  const hour = Math.floor(normalized);
  const minute = Math.round((normalized - hour) * 60);
  const text = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return options.nextDay ? `次日${text}` : text;
}

function parseHourConstraint(value: string, mode: "start" | "end"): number | null {
  if (!value.trim()) {
    return null;
  }
  const hour = Number(value);
  if (!Number.isFinite(hour) || hour < 0 || hour > 30) {
    return null;
  }
  if (mode === "end" && hour >= 0 && hour <= 6) {
    return hour === 0 ? 24 : hour + 24;
  }
  return hour;
}

function parsePositiveHourAmount(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 24 ? amount : null;
}

function matchesDailyDurationLimit(rawTime: string, parsed: ParsedTimeInfo, maxHours: number): boolean {
  const explicitDurations = parseRecruitDailyDurations(rawTime);
  if (explicitDurations.length) {
    return explicitDurations.every((duration) => duration.maxHours <= maxHours);
  }
  if (!parsed.ranges.length) {
    return true;
  }
  const durations = parsed.ranges.map((range) => range.end - range.start).filter((duration) => duration > 0);
  if (!durations.length) {
    return true;
  }
  if (hasAlternativeTimezoneContext(rawTime) && durations.length >= 2) {
    return durations.every((duration) => duration <= maxHours);
  }
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  return total <= maxHours;
}
