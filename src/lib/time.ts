export interface ParsedTimeInfo {
  ranges: TimeRange[];
  days: string[];
  parsed: boolean;
}

export interface TimeRange {
  start: number;
  end: number;
  raw: string;
}

export interface TimeFilterInput {
  timeText: string;
  timeStart: string;
  timeEnd: string;
  timeDays: string[];
  showUnparsedTime: boolean;
}

const DAY_ALIASES: Array<[RegExp, string[]]> = [
  [/周末|双休|星期六|周六|礼拜六|星期日|星期天|周日|周天|礼拜日|礼拜天/, ["6", "0"]],
  [/工作日|平日|周一到周五|周一至周五/, ["1", "2", "3", "4", "5"]],
  [/周一|星期一|礼拜一/, ["1"]],
  [/周二|星期二|礼拜二/, ["2"]],
  [/周三|星期三|礼拜三/, ["3"]],
  [/周四|星期四|礼拜四/, ["4"]],
  [/周五|星期五|礼拜五/, ["5"]],
  [/周六|星期六|礼拜六/, ["6"]],
  [/周日|周天|星期日|星期天|礼拜日|礼拜天/, ["0"]]
];

const TIME_RANGE_RE =
  /(?<prefix>凌晨|早上|上午|中午|下午|晚上|晚|夜里|夜)?\s*(?<start>\d{1,2})(?:[:：点]\d{0,2})?\s*(?:-|—|–|~|～|到|至)\s*(?<end>\d{1,2})(?:[:：点]\d{0,2})?/g;

export function parseRecruitTime(value: string): ParsedTimeInfo {
  const normalized = normalizeTimeText(value);
  const days = new Set<string>();
  const ranges: TimeRange[] = [];

  for (const [pattern, dayValues] of DAY_ALIASES) {
    if (pattern.test(normalized)) {
      dayValues.forEach((day) => days.add(day));
    }
  }

  for (const match of normalized.matchAll(TIME_RANGE_RE)) {
    const groups = match.groups;
    if (!groups) {
      continue;
    }
    const prefix = groups.prefix ?? "";
    const start = normalizeHour(Number(groups.start), prefix, true);
    const end = normalizeHour(Number(groups.end), prefix, false);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }
    ranges.push({
      start,
      end: end <= start ? end + 24 : end,
      raw: match[0]
    });
  }

  return {
    ranges,
    days: [...days],
    parsed: ranges.length > 0 || days.size > 0
  };
}

export function matchesTimeFilter(rawTime: string, filter: TimeFilterInput): boolean {
  const textNeedle = filter.timeText.trim().toLowerCase();
  const textMatched = !textNeedle || rawTime.toLowerCase().includes(textNeedle);
  if (!textMatched) {
    return false;
  }

  const requestedRange = parseRequestedRange(filter.timeStart, filter.timeEnd);
  const wantsRange = requestedRange !== null;
  const wantsDays = filter.timeDays.length > 0;

  if (!wantsRange && !wantsDays) {
    return true;
  }

  const parsed = parseRecruitTime(rawTime);
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
    return parsed.ranges.some((range) => rangesOverlap(range, requestedRange));
  }

  if (wantsRange && parsed.ranges.length === 0) {
    return filter.showUnparsedTime;
  }

  return true;
}

export function describeTimeParse(rawTime: string): string {
  const parsed = parseRecruitTime(rawTime);
  if (!parsed.parsed) {
    return "未解析";
  }
  const rangeText = parsed.ranges.map((range) => `${range.start}-${range.end % 24}`).join(", ");
  const dayText = parsed.days.length ? `周${parsed.days.join("/")}` : "";
  return [dayText, rangeText].filter(Boolean).join(" ");
}

function normalizeTimeText(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/[－—–~～]/g, "-")
    .replace(/\s+/g, "");
}

function normalizeHour(hour: number, prefix: string, isStart: boolean): number {
  if (hour > 24) {
    return Number.NaN;
  }

  const afternoon = ["下午", "晚上", "晚", "夜里", "夜"].includes(prefix);
  if (afternoon && hour < 12) {
    return hour + 12;
  }
  if (prefix === "中午" && hour < 11) {
    return hour + 12;
  }
  if (!prefix && !isStart && hour <= 8) {
    return hour + 24;
  }
  return hour;
}

function parseRequestedRange(start: string, end: string): TimeRange | null {
  if (!start.trim() || !end.trim()) {
    return null;
  }
  const startHour = Number(start);
  const endHour = Number(end);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) {
    return null;
  }
  return {
    start: startHour,
    end: endHour <= startHour ? endHour + 24 : endHour,
    raw: `${start}-${end}`
  };
}

function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}
