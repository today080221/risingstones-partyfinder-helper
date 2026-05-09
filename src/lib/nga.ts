import type {
  NgaCollectionSettings,
  NgaCachedTopic,
  NgaFilterMode,
  NgaParseConfidence,
  NgaParseEvidence,
  NgaParsedFields,
  NgaSample,
  NgaSampleAnalysisReport,
  NgaSampleCandidate,
  PositionKey
} from "../types";
import { formatRecruitDailyDuration, parseRecruitTime } from "./time";

export const NGA_SAMPLE_FIELDS: Array<keyof NgaSample> = [
  "title",
  "body",
  "url",
  "author",
  "publishedAt",
  "updatedAt",
  "forumId",
  "topicId",
  "lastCheckedAt",
  "lastSeenAt",
  "detailFetchedAt",
  "contentHash",
  "closedAt",
  "sourceBoardUrl",
  "lastBoardSeenAt",
  "lastBoardRank",
  "lastFullWindowScanAt",
  "archivedAt",
  "archiveReason"
];

export const NGA_RECRUIT_BOARD_URLS = {
  cn: "https://bbs.nga.cn/thread.php?stid=44366746",
  jp: "https://bbs.nga.cn/thread.php?stid=42005319",
  eu: "https://bbs.nga.cn/thread.php?stid=30742918",
  oceania: "https://bbs.nga.cn/thread.php?stid=30742942",
  us: "https://bbs.nga.cn/thread.php?stid=30742904"
} as const;

export const DEFAULT_NGA_SELECTED_BOARD_URLS = [NGA_RECRUIT_BOARD_URLS.cn];
const NGA_RECRUIT_BOARD_URL_SET = new Set<string>(Object.values(NGA_RECRUIT_BOARD_URLS));

export const DEFAULT_NGA_COLLECTION_SETTINGS: NgaCollectionSettings = {
  keepLogin: false,
  startUrl: NGA_RECRUIT_BOARD_URLS.cn,
  selectedBoardUrls: [...DEFAULT_NGA_SELECTED_BOARD_URLS],
  allowMultipleBoards: false,
  autoRefreshOnStart: true,
  refreshIntervalHours: 12,
  windowMode: "minimized",
  requestIntervalMs: 1000,
  maxItems: 500,
  recentActiveDays: 14,
  filterMode: "balanced",
  includeDetails: true
};

const MIN_REQUEST_INTERVAL_MS = 500;
const MAX_REQUEST_INTERVAL_MS = 15000;
const MIN_MAX_ITEMS = 1;
export const NGA_MAX_SAMPLE_STORE_ITEMS = 1500;
export const NGA_ARCHIVE_AFTER_DAYS = 14;
export const NGA_DELETE_AFTER_DAYS = 30;
const MAX_MAX_ITEMS = 1500;
const MIN_REFRESH_INTERVAL_HOURS = 1;
const MAX_REFRESH_INTERVAL_HOURS = 168;
const MIN_RECENT_ACTIVE_DAYS = 0;
const MAX_RECENT_ACTIVE_DAYS = 180;
const HIGH_FREQUENCY_LIMIT = 12;
const EXAMPLE_LIMIT = 3;
const TOKEN_SPLIT_RE = /[\s,，;；|、/\\()[\]【】<>《》"'“”‘’!！?？:：]+/;
const TIME_RE =
  /(?:周[一二三四五六日天]|星期[一二三四五六日天]|工作日|平日|周末|双休|每天|今晚|明天|后天|晚[上]?|下午|凌晨|上午)?\s*(?:\d{1,2}[:：点]?\d{0,2})\s*(?:-|—|–|~|～|到|至)\s*(?:\d{1,2}[:：点]?\d{0,2})/g;
const POSITION_RE = /\b(?:MT|ST|H1|H2|D[1-4](?:(?:\/|&|or|ro)[1-4])?|T|H|DPS|奶|盾|T职|H职|近战|远敏|法系|远程|近|远|补[TDH]|缺[TDH])\b/gi;
const POSITION_LIST_SEPARATOR_PATTERN = String.raw`(?:\/|／|&|\+|＋|\||｜|、|,|，|;|；|或者|还是|以及|或|和|及|与|同|or|ro|~|～)`;
const POSITION_ALT_SEPARATOR_PATTERN = String.raw`(?:\/|／|&|\+|＋|\||｜|或者|还是|或|or|ro|~|～)`;
const ROSTER_FLEX_POSITION_SEPARATOR_PATTERN = String.raw`(?:\/|／|&|\||｜|或者|还是|或|or|ro|~|～)`;
const POSITION_LIST_SEPARATOR_SPACED_PATTERN = String.raw`\s*${POSITION_LIST_SEPARATOR_PATTERN}\s*`;
const POSITION_ALT_SEPARATOR_SPACED_PATTERN = String.raw`\s*${POSITION_ALT_SEPARATOR_PATTERN}\s*`;
const ROSTER_FLEX_POSITION_SEPARATOR_SPACED_PATTERN = String.raw`\s*${ROSTER_FLEX_POSITION_SEPARATOR_PATTERN}\s*`;
const PROGRESS_RE = /(?:从0|从零|开荒|补进度|清CD|消化|过本|见[^\s,，。；;、]{1,8}|P\d{1,2}[SP]?|一运|二运|三运|四运|狂暴|门神|本体)/gi;
const DUNGEON_HINT_RE =
  /(?:绝[^\s,，。；;、]{1,8}|零式|幻巧|极[^\s,，。；;、]{1,8}|[Mm]\d{1,2}[Ss]?|[Pp]\d[Ss]|[Tt][Oo][Pp]|[Dd][Ss][Rr]|[Uu][Cc][Oo][Bb]|[Uu][Ww][Uu])/g;
const CLOSED_RE =
  /(?:已招满|已招到|招满|招齐|满员|满了|人齐|人已齐|已齐|齐了|暂齐|暂时齐了|找齐人|暂时找齐|已满|已结束|停止招募|暂停招募|不招了|已找到|找到了|已关闭|关贴|结帖|封贴|删帖|先删|作废|放弃|已编辑|无了|closed)/i;
const NOISE_RE =
  /(?:绝区零|版务公告|游戏评测|签到|抽奖|广告|2\.8版本签到|玩转NGA|新手指南|生化危机|摄影|潮汕|雷神再临|魔兽|LPL|无畏契约|金铲铲|刺客信条|重返未来|鸣潮|海马云|手游|全球先锋赛|z9gt|太阳之井|识质存在)/i;
const FREE_COMPANY_RE =
  /(?:找|求|蹲|加入|收留|想找).{0,12}(?:部队|公会)|(?:部队|公会).{0,18}(?:一起玩|活跃|回归|萌新|新人|养老|收人|招人|招募)/i;
const CLEARED_EDITED_LINE_RE = /(?:^|\n)\s*(?:已?编辑|edit(?:ed)?)(?:\s*(?:\d+|\[?数字已隐藏\]?|[#:：_\-\s]+))*\s*$/im;
const SEEKING_RE = /(?:玩家求职|(?<!需)求职(?!业)|找队(?!长)|找(?:一|个|一个|只|个)?[^\s,，。；;、]{0,8}队|求队|蹲队|蹲[^\s,，。；;、]{0,8}队|自荐|求固定队)/i;
const RECRUIT_RE = /(?:招募|招人|缺[一二三四五六七八九十0-9]*|补人|替班|代班|固定队|临时|开荒|消化|清CD|过本|陪跑)/i;
const TITLE_RECRUIT_SIGNAL_RE = /(?:首月|次月|无攻略|有攻略|攻略|社畜队|晚间队|固定队|求职|招募|招人|缺|补|开荒|消化|清CD|过本|陪跑)/i;
const TEAM_SIZE_RE =
  /(?<![A-Za-z])[1-8]\s*(?:=|缺|\/|／)\s*(?:[1-8]|MT|ST|H[12]|D[1-4]|T|H|N|奶|治疗|坦克|盾|近战|近D|远敏|远程物理|法系|远程魔法)/i;
const FULL_PARTY_POSITION_KEYS = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"] as const;
const CORE_WARNING_LIMIT = 5;
const EVIDENCE_SNIPPET_RADIUS = 36;
const FIELD_TEXT_LIMIT = 180;
const STOP_WORDS = new Set([
  "招募",
  "固定队",
  "临时",
  "长期",
  "稳定",
  "时间",
  "要求",
  "联系",
  "企鹅",
  "群",
  "qq",
  "nga",
  "ff14",
  "最终幻想",
  "国服",
  "国际服",
  "绝区零",
  "read.php",
  "艾欧泽亚",
  "版务公告",
  "求职",
  "游戏评测",
  "2.8版本签到",
  "玩转nga",
  "新手指南",
  "生化危机",
  "摄影",
  "潮汕",
  "雷神再临",
  "魔兽",
  "lpl",
  "无畏契约",
  "金铲铲",
  "刺客信条",
  "重返未来",
  "鸣潮",
  "海马云",
  "手游",
  "全球先锋赛",
  "z9gt",
  "太阳之井",
  "识质存在"
]);

interface AliasEntry {
  value: string;
  aliases: string[];
  confidence?: NgaParseConfidence;
}

function createTeamSizeGlobalRegExp(): RegExp {
  return /(?<![A-Za-z])[1-8]\s*(?:=|缺|\/|／)\s*[1-8]/gi;
}

function parseMissingCountFromTeamSize(value: string): number | undefined {
  const match = /([1-8])\s*(?:=|缺|\/|／)\s*([1-8])/.exec(value);
  if (!match) {
    return undefined;
  }
  const current = Number(match[1]);
  const missing = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(missing) || current < 0 || missing < 0 || current + missing > 8) {
    return undefined;
  }
  return missing;
}

interface TeamSizeVacancyWindow {
  raw: string;
  normalized: string;
  currentCount: number;
  missingCount: number;
  index: number;
  start: number;
  length: number;
  window: string;
}

const EXISTING_ROSTER_MARKERS = [
  "已有",
  "现有",
  "当前配置",
  "当前阵容",
  "当前构成",
  "目前配置",
  "目前阵容",
  "目前构成",
  "队伍配置",
  "队伍阵容",
  "队伍构成",
  "当前队伍构成",
  "队伍组成",
  "当前队伍组成",
  "目前队伍组成",
  "队内配置",
  "队内构成",
  "队内阵容",
  "队内现有",
  "队内已有",
  "目前已有配置",
  "目前已有",
  "现有阵容",
  "职业构成",
  "职业配置",
  "队伍情况",
  "阵容",
  "配置"
];

const VACANCY_CONTEXT_MARKERS = [
  "需求职业",
  "招募职业",
  "招募情况",
  "目前需求",
  "需求",
  "招募",
  "招人",
  "缺",
  "补",
  "许愿",
  "希望",
  "倾向",
  "优先",
  "来",
  "找"
];

const ROSTER_CONTEXT_MARKER_RE_SOURCE = String.raw`(?:已有|现有|当前配置|当前阵容|当前构成|目前配置|目前阵容|目前构成|队伍配置|队伍阵容|队伍构成|当前队伍构成|队伍组成|当前队伍组成|目前队伍组成|队内配置|队内构成|队内阵容|队内现有|队内已有|目前已有配置|目前已有|现有阵容|职业构成|职业配置|队伍情况|阵容|配置|(?:^|[\s,，。；;\n])职业)[:：]?`;
const ROSTER_BOUNDARY_RE_SOURCE = String.raw`(?:需求职业|招募职业|招募情况|招募要求|目前需求|需求|招募|招人|缺|补|许愿|希望|倾向|优先|入队需知|希望你|要求|时间|活动时间|上班时间|攻略|联系|lxfs|联系方式)`;

function normalizeTeamSizeValue(current: number, missing: number): string {
  return `${current}=${missing}`;
}

function collectTeamSizeVacancyWindows(text: string): TeamSizeVacancyWindow[] {
  const windows: TeamSizeVacancyWindow[] = [];
  const seen = new Set<string>();
  const add = (teamSize: TeamSizeVacancyWindow) => {
    const key = `${teamSize.index}:${teamSize.normalized}:${teamSize.start}:${teamSize.window.slice(0, 32)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    windows.push(teamSize);
  };

  for (const match of text.matchAll(createTeamSizeGlobalRegExp())) {
    const raw = match[0] ?? "";
    const parsed = /([1-8])\s*(?:=|缺|\/|／)\s*([1-8])/.exec(raw);
    if (!parsed) {
      continue;
    }
    const currentCount = Number(parsed[1]);
    const missingCount = Number(parsed[2]);
    if (!Number.isFinite(currentCount) || !Number.isFinite(missingCount) || currentCount + missingCount > 8) {
      continue;
    }
    const index = match.index ?? 0;
    const start = index + raw.length;
    const rawWindow = text.slice(start, Math.min(text.length, start + 100)).split(/\n/)[0] ?? "";
    add({
      raw,
      normalized: normalizeTeamSizeValue(currentCount, missingCount),
      currentCount,
      missingCount,
      index,
      start,
      length: raw.length,
      window: trimVacancyWindowAtExistingRoster(rawWindow)
    });
  }

  const positionTailRe = /(?<![A-Za-z])([1-8])\s*(?:=|缺|\/|／)\s*(?![1-8])([^\n。；;]{1,100})/gi;
  for (const match of text.matchAll(positionTailRe)) {
    const currentCount = Number(match[1]);
    const missingCount = 8 - currentCount;
    if (!Number.isFinite(currentCount) || missingCount < 0 || missingCount > 7) {
      continue;
    }
    const tail = match[2] ?? "";
    const window = trimVacancyWindowAtExistingRoster(tail);
    const positions = collectPositionsFromLooseWindow(window, { includeRoles: true }).filter((position) =>
      FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)
    );
    if (!positions.length) {
      continue;
    }
    const index = match.index ?? 0;
    const tailStartOffset = match[0].indexOf(tail);
    const start = tailStartOffset >= 0 ? index + tailStartOffset : index + match[0].length;
    const rawTail = cleanText(window.slice(0, 32));
    add({
      raw: `${match[1]}=${rawTail}`,
      normalized: normalizeTeamSizeValue(currentCount, missingCount),
      currentCount,
      missingCount,
      index,
      start,
      length: Math.min(match[0].length, Math.max(1, start - index + rawTail.length)),
      window
    });
  }

  return windows.sort((left, right) => left.index - right.index);
}

function collectTeamSizeLikeParts(text: string): ParsedTextMatch[] {
  return collectTeamSizeVacancyWindows(text).map((teamSize) => ({
    value: teamSize.normalized,
    snippet: snippetAround(text, teamSize.index, teamSize.length),
    index: teamSize.index,
    confidence: "medium"
  }));
}

function matchesTeamSizeLike(text: string): boolean {
  return collectTeamSizeVacancyWindows(text).length > 0;
}

function findTeamSizeLikeIndex(text: string): number | undefined {
  return collectTeamSizeVacancyWindows(text)[0]?.index;
}

const DUNGEON_ALIASES: AliasEntry[] = [
  {
    value: "妖星乱舞绝境战",
    aliases: ["绝妖星乱舞", "妖星乱舞", "绝凯夫卡", "绝卡夫卡", "7.51新绝", "7.5新绝", "7.51绝本", "7.5绝本", "7.51绝", "7.5绝", "绝妖星", "新绝本", "新绝"]
  },
  {
    value: "欧米茄绝境验证战",
    aliases: ["绝欧米茄", "欧米茄绝境验证战", "绝欧", "绝O", "TOP", "欧米茄"]
  },
  {
    value: "光暗未来绝境战",
    aliases: ["光暗未来绝境战", "绝伊甸", "绝E", "ED", "ed"]
  },
  {
    value: "幻想龙诗绝境战",
    aliases: ["幻想龙诗绝境战", "绝龙诗", "龙诗", "DSR"]
  },
  {
    value: "亚历山大绝境战",
    aliases: ["亚历山大绝境战", "绝亚", "TEA"]
  },
  {
    value: "究极神兵绝境战",
    aliases: ["究极神兵绝境战", "绝神兵", "UWU"]
  },
  {
    value: "巴哈姆特绝境战",
    aliases: ["巴哈姆特绝境战", "绝巴哈", "巴哈", "UCOB"]
  }
];

const SERVER_ALIASES: AliasEntry[] = [
  { value: "陆行鸟", aliases: ["陆行鸟", "鸟区"] },
  { value: "猫小胖", aliases: ["猫小胖", "猫区"] },
  { value: "豆豆柴", aliases: ["豆豆柴", "狗区"] },
  { value: "莫古力", aliases: ["莫古力", "猪区"] }
];

const STRATEGY_ALIASES: AliasEntry[] = [
  { value: "猫猫窝/mmw", aliases: ["mmw", "猫猫窝"], confidence: "high" },
  { value: "T/N + DD 职能分组", aliases: ["tndd", "tn dd", "t/n dd", "T/N DD"], confidence: "high" },
  { value: "NOCCHH", aliases: ["NOCCHH"] },
  { value: "盗火", aliases: ["盗火"] },
  { value: "美式", aliases: ["美式"] },
  { value: "闲人直飞", aliases: ["闲人直飞"] },
  { value: "野队一套", aliases: ["野队一套"] },
  { value: "头部文档", aliases: ["头部文档"] },
  { value: "无攻略", aliases: ["无攻略"], confidence: "high" },
  { value: "有攻略", aliases: ["有攻略"], confidence: "high" }
];

const TEAM_TYPE_ALIASES: AliasEntry[] = [
  { value: "补人/替班/临时", aliases: ["补人", "补招", "替班", "代班", "救急", "临时"] },
  { value: "固定队/长期队", aliases: ["固定队", "长期", "稳定队"] },
  { value: "玩家求职", aliases: ["玩家求职", "找队", "求队", "蹲队", "自荐"] },
  { value: "爆肝队", aliases: ["爆肝队", "爆肝"] },
  { value: "时差队", aliases: ["时差队", "时差"] },
  { value: "休闲队", aliases: ["休闲队", "休闲"] },
  { value: "进度队", aliases: ["进度队"] },
  { value: "首月队", aliases: ["首月队"] },
  { value: "次月队", aliases: ["次月队"] },
  { value: "社畜/晚间队", aliases: ["社畜队", "社畜", "晚间队", "晚间"] }
];

const REQUIREMENT_PATTERNS: AliasEntry[] = [
  { value: "logs 要求", aliases: ["logs", "log", "fflogs", "FFLogs"] },
  { value: "median 紫色或以上", aliases: ["med紫", "median紫"] },
  { value: "不要 ranking 0 / 明显被带过本记录", aliases: ["非灰0", "不要灰0", "无灰0"] },
  { value: "无 ACT/Dalamud 等插件倾向", aliases: ["绿玩"] },
  { value: "纯净队/禁第三方", aliases: ["纯净队"], confidence: "high" },
  { value: "第三方工具/插件风险", aliases: ["红玩", "非绿玩", "科技"] },
  { value: "ACT 时间轴/TTS 辅助", aliases: ["轮椅"] },
  { value: "代打/工作室/带老板风险", aliases: ["装甲车"] },
  { value: "三灭散/团灭次数限制", aliases: ["33", "三灭散", "灭散"] }
];

const ANTI_TOOL_RE =
  /(?:禁止|禁用|严禁|拒绝|谢绝|婉拒|不(?:支持|接受|欢迎|允许|要)|不坐|不用|无|非).{0,8}(?:第三方|插件|外挂|宝宝椅|科技|脚本|轮椅|ACT|TTS|Triggernometry|PostNamazu|Dalamud|卫月)|(?:第三方|插件|外挂|宝宝椅|科技|脚本|轮椅|ACT|TTS|Triggernometry|PostNamazu|Dalamud|卫月).{0,8}(?:禁止|禁用|严禁|拒绝|谢绝|婉拒|不(?:支持|接受|欢迎|允许|要)|不用)/gi;
const ANTI_CARRY_RE =
  /(?:非|禁止|严禁|拒绝|谢绝|婉拒|不(?:支持|接受|欢迎|允许|要)|无|看不到|看不见|别来|请绕道|绕道|慎重).{0,10}(?:装甲车|代打|工作室|老板|车队|带过)|(?:装甲车|代打|工作室|老板|车队|带过).{0,12}(?:禁止|严禁|拒绝|谢绝|婉拒|不(?:支持|接受|欢迎|允许|要)|无|非|看不到|看不见|别来|请绕道|绕道|慎重)/gi;
const ANTI_CHEAT_RE =
  /(?:亚拉戈科技小子|科技小子|开挂|作弊|外挂|异常科技).{0,16}(?:请自重|慎重|别来|不要|请绕道)|(?:请自重|慎重|别来|不要|请绕道).{0,16}(?:亚拉戈科技小子|科技小子|开挂|作弊|外挂|异常科技)/gi;
const ALL_FEMALE_RE = /全妹队|全女队|女队|妹子队|女生队|只(?:招|收|要)女生|仅(?:限|收|招)?女生|女生限定/gi;
const FEMALE_PREFERRED_RE = /女生优先|妹子优先|女玩家优先/gi;
const PLUGIN_ECOSYSTEM_OPEN_RE =
  /(?:红玩.{0,6}绿玩|绿玩.{0,6}红玩|红绿).{0,8}(?:均可|都可|皆可|都行|不限|无所谓|可接受)|(?:不限|接受|可接受).{0,8}(?:红玩|绿玩).{0,8}(?:红玩|绿玩)/gi;
const PLUGIN_NEUTRAL_STANCE_RE =
  /(?:没有|无|不(?:是)?).{0,8}(?:插件|科技|红绿|绿玩|红玩)?洁癖|(?:插件|科技|红绿|绿玩|红玩)?洁癖.{0,8}(?:没有|无|不)|不强制.{0,10}(?:插件|科技|TTS|ACT|轮椅|开麦)|(?:不排斥|可接受|接受|允许|不拒绝|无异议).{0,12}(?:插件|科技|红玩|绿玩).{0,24}(?:但|但是|前提|不能影响|别影响|尊重|不影响)|(?:插件|科技|红玩|绿玩).{0,12}(?:无异议|随意|不限|都行|皆可|可接受).{0,24}(?:但|但是|前提|不能影响|别影响|尊重|不影响)|在不使用任何插件情况下保证水平不下降.{0,48}如果使用插件不能影响|如果使用插件不能影响.{0,24}(?:队友|其他成员|开荒|团队)|想开就开.{0,16}(?:别|不要|不能)影响/gi;
const PLUGIN_STANCE_DISLIKE_RE = /(?:婉拒|谢绝|拒绝|不(?:接受|欢迎|要)).{0,8}绿玩洁癖|绿玩洁癖.{0,8}(?:婉拒|谢绝|拒绝|不(?:接受|欢迎|要))/gi;
const PLUGIN_DEPENDENCE_RE =
  /(?:婉拒|谢绝|拒绝|不(?:接受|欢迎|要)).{0,14}(?:没|无|不(?:开|用)?).{0,6}(?:挂|插件|科技).{0,12}(?:水平.{0,4}下降|不会打本|打不了|玩不了)|(?:没|无|不(?:开|用)?).{0,6}(?:挂|插件|科技).{0,12}(?:水平.{0,4}下降|不会打本|打不了|玩不了).{0,14}(?:婉拒|谢绝|拒绝|不(?:接受|欢迎|要))/gi;
const HEAVY_ASSIST_DEPENDENCE_RE =
  /(?:婉拒|谢绝|拒绝|不(?:接受|欢迎|要)).{0,16}(?:(?:没|无|不(?:开|用)?).{0,8})?(?:绘图|轮椅|宝宝椅|科技).{0,16}(?:不会打本|打不了|玩不了|水平.{0,4}下降|不能打)|(?:(?:没|无|不(?:开|用)?).{0,8})?(?:绘图|轮椅|宝宝椅|科技).{0,16}(?:不会打本|打不了|玩不了|水平.{0,4}下降|不能打).{0,16}(?:婉拒|谢绝|拒绝|不(?:接受|欢迎|要))/gi;
const ACT_LOGS_RE =
  /\bACT\b.{0,14}(?:logs?|fflogs|输出|DPS|dps|伤害|记录|复盘|查(?:分|输出)|看(?:分|输出))|(?:logs?|fflogs|输出|DPS|dps|伤害|记录|复盘|查(?:分|输出)|看(?:分|输出)).{0,14}\bACT\b/gi;
const RISK_ASSIST_RE =
  /(?:\b(?:ACT|TTS|Triggernometry|PostNamazu)\b|轮椅|播报).{0,12}时间轴|时间轴.{0,12}(?:\b(?:ACT|TTS|Triggernometry|PostNamazu)\b|轮椅|播报)/gi;
const RISK_TOOL_RE =
  /(?:需要(?!时)|必须|要求|自备|必备|开|使用|会用|带|依赖).{0,8}(?:TTS|Triggernometry|PostNamazu|Dalamud|卫月|插件|脚本|宝宝椅|第三方|外挂|科技)|(?:TTS|Triggernometry|PostNamazu|Dalamud|卫月|插件|脚本|宝宝椅|第三方|外挂|科技).{0,8}(?:自备|必备|必须|需要|要求|辅助|依赖|开荒)/gi;
const RISK_TOOL_ALIAS_RE = /第三方工具\/插件风险|ACT 时间轴\/TTS 辅助/;
const RISK_CARRY_ALIAS_RE = /代打\/工作室\/带老板风险/;

const JOB_ALIASES: AliasEntry[] = [
  { value: "骑士", aliases: ["骑士", "PLD"] },
  { value: "战士", aliases: ["战士", "WAR", "战"] },
  { value: "暗黑骑士", aliases: ["暗黑骑士", "黑骑", "暗骑", "DK", "DRK"] },
  { value: "绝枪战士", aliases: ["绝枪战士", "绝枪", "枪刃", "GNB"] },
  { value: "蝰蛇剑士", aliases: ["蝰蛇剑士", "蝰蛇", "蛇", "VPR"] },
  { value: "武僧", aliases: ["武僧", "MNK", "僧"] },
  { value: "忍者", aliases: ["忍者", "NIN", "忍"] },
  { value: "绘灵法师", aliases: ["绘灵法师", "绘灵", "画家", "画", "PCT"] },
  { value: "钐镰客", aliases: ["钐镰客", "镰刀", "镰", "RPR"] },
  { value: "武士", aliases: ["武士", "侍", "盘子", "D1盘", "盘", "SAM"] },
  { value: "龙骑士", aliases: ["龙骑士", "龙骑", "龙", "DRG"] },
  { value: "黑魔法师", aliases: ["黑魔法师", "黑魔", "黑爷", "黑魔爷", "黑黑的爷", "黑黑", "BLM", "黑"] },
  { value: "召唤师", aliases: ["召唤师", "召唤", "SMN"] },
  { value: "赤魔法师", aliases: ["赤魔法师", "赤魔", "RDM"] },
  { value: "白魔法师", aliases: ["白魔法师", "白魔", "白膜", "WHM"] },
  { value: "贤者", aliases: ["贤者", "SGE"] },
  { value: "学者", aliases: ["学者", "SCH"] },
  { value: "占星术士", aliases: ["占星术士", "占星", "占", "AST"] },
  { value: "吟游诗人", aliases: ["吟游诗人", "诗人", "BRD"] },
  { value: "机工士", aliases: ["机工士", "机工", "MCH"] },
  { value: "舞者", aliases: ["舞者", "DNC"] }
];

const COMPACT_ROSTER_JOB_ALIASES: AliasEntry[] = [
  { value: "骑士", aliases: ["骑士", "PLD", "骑"] },
  { value: "战士", aliases: ["战士", "WAR", "战"] },
  { value: "暗黑骑士", aliases: ["暗黑骑士", "黑骑", "暗骑", "DK", "DRK"] },
  { value: "绝枪战士", aliases: ["绝枪战士", "绝枪", "枪刃", "GNB", "枪"] },
  { value: "蝰蛇剑士", aliases: ["蝰蛇剑士", "蝰蛇", "蛇", "VPR"] },
  { value: "武僧", aliases: ["武僧", "MNK", "僧"] },
  { value: "忍者", aliases: ["忍者", "NIN", "忍"] },
  { value: "绘灵法师", aliases: ["绘灵法师", "绘灵", "画家", "画", "PCT"] },
  { value: "钐镰客", aliases: ["钐镰客", "镰刀", "镰", "RPR"] },
  { value: "武士", aliases: ["武士", "侍", "盘子", "SAM", "武"] },
  { value: "龙骑士", aliases: ["龙骑士", "龙骑", "龙", "DRG"] },
  { value: "黑魔法师", aliases: ["黑魔法师", "黑魔", "黑爷", "黑魔爷", "黑黑的爷", "黑黑", "BLM", "黑"] },
  { value: "召唤师", aliases: ["召唤师", "召唤", "SMN"] },
  { value: "赤魔法师", aliases: ["赤魔法师", "赤魔", "RDM"] },
  { value: "白魔法师", aliases: ["白魔法师", "白魔", "白膜", "白"] },
  { value: "贤者", aliases: ["贤者", "贤", "SGE"] },
  { value: "学者", aliases: ["学者", "学", "SCH"] },
  { value: "占星术士", aliases: ["占星术士", "占星", "占", "AST"] },
  { value: "吟游诗人", aliases: ["吟游诗人", "诗人", "诗", "BRD"] },
  { value: "机工士", aliases: ["机工士", "机工", "机", "MCH"] },
  { value: "舞者", aliases: ["舞者", "舞", "DNC"] }
];

export interface NgaSampleSignal {
  isClosed: boolean;
  isNoise: boolean;
  recruitKind: "recruit" | "seeking" | "closed" | "noise" | "unknown";
  warnings: string[];
  tags: string[];
  parsedFields: Partial<NgaParsedFields>;
  parseConfidence: Partial<Record<keyof NgaParsedFields, NgaParseConfidence>>;
  evidence: NgaParseEvidence[];
}

export async function resolveKeepLoginPreference(
  currentValue: boolean,
  nextValue: boolean,
  confirmEnable: () => boolean | Promise<boolean>
): Promise<boolean> {
  if (!nextValue) {
    return false;
  }
  if (currentValue) {
    return true;
  }
  return Boolean(await confirmEnable());
}

export function normalizeNgaCollectionSettings(
  input: Partial<NgaCollectionSettings>
): NgaCollectionSettings {
  const startUrl = normalizeNgaStartUrl(input.startUrl);
  const allowMultipleBoards = Boolean(input.allowMultipleBoards);
  const selectedBoardUrls = normalizeNgaSelectedBoardUrls(input.selectedBoardUrls, startUrl, allowMultipleBoards);
  const windowMode = input.windowMode === "normal" ? "normal" : DEFAULT_NGA_COLLECTION_SETTINGS.windowMode;
  return {
    keepLogin: Boolean(input.keepLogin),
    startUrl,
    selectedBoardUrls,
    allowMultipleBoards,
    autoRefreshOnStart: input.autoRefreshOnStart ?? DEFAULT_NGA_COLLECTION_SETTINGS.autoRefreshOnStart,
    refreshIntervalHours: clampInteger(
      input.refreshIntervalHours ?? DEFAULT_NGA_COLLECTION_SETTINGS.refreshIntervalHours,
      MIN_REFRESH_INTERVAL_HOURS,
      MAX_REFRESH_INTERVAL_HOURS
    ),
    windowMode,
    requestIntervalMs: clampInteger(
      input.requestIntervalMs ?? DEFAULT_NGA_COLLECTION_SETTINGS.requestIntervalMs,
      MIN_REQUEST_INTERVAL_MS,
      MAX_REQUEST_INTERVAL_MS
    ),
    maxItems: clampInteger(input.maxItems ?? DEFAULT_NGA_COLLECTION_SETTINGS.maxItems, MIN_MAX_ITEMS, MAX_MAX_ITEMS),
    recentActiveDays: clampInteger(
      input.recentActiveDays ?? DEFAULT_NGA_COLLECTION_SETTINGS.recentActiveDays,
      MIN_RECENT_ACTIVE_DAYS,
      MAX_RECENT_ACTIVE_DAYS
    ),
    filterMode: input.filterMode ?? DEFAULT_NGA_COLLECTION_SETTINGS.filterMode,
    includeDetails: input.includeDetails ?? DEFAULT_NGA_COLLECTION_SETTINGS.includeDetails
  };
}

export function cleanNgaDisplayText(value: unknown): string {
  return stripNgaAuthorMetadata(cleanText(value));
}

export function sanitizeNgaSample<T extends Partial<Record<keyof NgaSample, unknown>>>(input: T): NgaSample {
  const sample = {
    title: cleanNgaTitle(input.title),
    body: cleanText(input.body),
    url: cleanUrl(input.url),
    author: cleanText(input.author),
    publishedAt: cleanText(input.publishedAt),
    updatedAt: cleanText(input.updatedAt),
    forumId: cleanIdentifier(input.forumId),
    topicId: cleanIdentifier(input.topicId),
    lastCheckedAt: cleanText(input.lastCheckedAt),
    lastSeenAt: cleanText(input.lastSeenAt),
    detailFetchedAt: cleanText(input.detailFetchedAt),
    contentHash: cleanIdentifier(input.contentHash),
    closedAt: cleanText(input.closedAt),
    sourceBoardUrl: cleanUrl(input.sourceBoardUrl),
    lastBoardSeenAt: cleanText(input.lastBoardSeenAt),
    lastBoardRank: cleanPositiveInteger(input.lastBoardRank),
    lastFullWindowScanAt: cleanText(input.lastFullWindowScanAt),
    archivedAt: cleanText(input.archivedAt),
    archiveReason: cleanText(input.archiveReason)
  };
  return {
    ...sample,
    contentHash: sample.contentHash || computeNgaSampleContentHash(sample)
  };
}

export function sanitizeNgaSamples<T extends Partial<Record<keyof NgaSample, unknown>>>(inputs: T[], maxItems: number): NgaSample[] {
  const limit = clampInteger(maxItems, MIN_MAX_ITEMS, MAX_MAX_ITEMS);
  const seen = new Set<string>();
  const samples: NgaSample[] = [];

  for (const input of inputs) {
    if (samples.length >= limit) {
      break;
    }
    const sample = sanitizeNgaSample(input);
    if (!shouldKeepNgaCollectedSample(sample)) {
      continue;
    }
    const key = sample.topicId || sample.url || `${sample.title}:${sample.author}`;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    samples.push(sample);
  }

  return samples;
}

export function mergeNgaSamples<T extends Partial<Record<keyof NgaSample, unknown>>>(inputs: T[], maxItems: number): NgaSample[] {
  const limit = clampInteger(maxItems, MIN_MAX_ITEMS, MAX_MAX_ITEMS);
  const indexByKey = new Map<string, number>();
  const samples: NgaSample[] = [];

  for (const input of inputs) {
    const sample = sanitizeNgaSample(input);
    if (!shouldKeepNgaCollectedSample(sample)) {
      continue;
    }
    const key = ngaSampleKey(sample);
    if (!key) {
      continue;
    }

    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      samples[existingIndex] = mergeNgaSamplePair(samples[existingIndex], sample);
      continue;
    }

    if (samples.length >= limit) {
      continue;
    }
    indexByKey.set(key, samples.length);
    samples.push(sample);
  }

  return samples;
}

export interface NgaSampleMergeResult {
  samples: NgaSample[];
  addedKeys: string[];
  updatedKeys: string[];
  checkedKeys: string[];
  softClosedKeys: string[];
}

export function mergeNgaSamplesWithDiff(
  currentSamples: NgaSample[],
  incomingSamples: NgaSample[],
  maxItems: number
): NgaSampleMergeResult {
  const current = mergeNgaSamples(currentSamples, maxItems);
  const currentByKey = new Map(current.map((sample) => [getNgaSampleKey(sample), sample]).filter(([key]) => Boolean(key)) as Array<[string, NgaSample]>);
  const incoming = mergeNgaSamples(incomingSamples, maxItems);
  const addedKeys: string[] = [];
  const updatedKeys: string[] = [];
  const checkedKeys: string[] = [];
  const softClosedKeys: string[] = [];

  for (const sample of incoming) {
    const key = getNgaSampleKey(sample);
    if (!key) {
      continue;
    }
    const previous = currentByKey.get(key);
    if (!previous) {
      addedKeys.push(key);
      if (isNgaSampleSoftClosed(sample)) {
        softClosedKeys.push(key);
      }
      continue;
    }
    if (isNgaSampleSoftClosed(sample) && !isNgaSampleSoftClosed(previous)) {
      softClosedKeys.push(key);
    }
    if (hasNgaSampleContentChanged(previous, sample)) {
      updatedKeys.push(key);
    } else if (sample.lastCheckedAt || sample.lastSeenAt) {
      checkedKeys.push(key);
    }
  }

  return {
    samples: mergeNgaSamples([...current, ...incoming], maxItems),
    addedKeys,
    updatedKeys,
    checkedKeys,
    softClosedKeys
  };
}

export function getNgaSampleKey(sample: NgaSample): string {
  return ngaSampleKey(sanitizeNgaSample(sample));
}

export function buildNgaCachedTopicIndex(samples: NgaSample[]): NgaCachedTopic[] {
  return mergeNgaSamples(samples, NGA_MAX_SAMPLE_STORE_ITEMS).map((sample) => ({
    title: sample.title,
    url: sample.url,
    topicId: sample.topicId,
    updatedAt: sample.updatedAt,
    lastCheckedAt: sample.lastCheckedAt,
    lastBoardSeenAt: sample.lastBoardSeenAt,
    lastBoardRank: sample.lastBoardRank,
    archivedAt: sample.archivedAt,
    hasBody: Boolean(sample.body),
    contentHash: sample.contentHash || computeNgaSampleContentHash(sample),
    sourceBoardUrl: sample.sourceBoardUrl
  }));
}

export function getNgaSamplesPendingRefresh(
  samples: NgaSample[],
  refreshIntervalHours = DEFAULT_NGA_COLLECTION_SETTINGS.refreshIntervalHours,
  now = new Date()
): NgaSample[] {
  const cutoff = now.getTime() - clampInteger(refreshIntervalHours, MIN_REFRESH_INTERVAL_HOURS, MAX_REFRESH_INTERVAL_HOURS) * 60 * 60 * 1000;
  return mergeNgaSamples(samples, NGA_MAX_SAMPLE_STORE_ITEMS).filter((sample) => {
    if (sample.archivedAt) {
      return false;
    }
    if (sample.closedAt || isNgaSampleSoftClosed(sample)) {
      return false;
    }
    if (!sample.body) {
      return true;
    }
    const checkedAt = Date.parse(sample.lastCheckedAt || sample.detailFetchedAt || sample.lastSeenAt || "");
    return !Number.isFinite(checkedAt) || checkedAt < cutoff;
  });
}

export function computeNgaSampleContentHash(sample: Partial<NgaSample>): string {
  const text = [sample.title, sample.body, sample.updatedAt, sample.author]
    .map((value) => cleanText(value))
    .join("\n");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

export function shouldContinueNgaCollection(collected: number, maxItems: number, cancelled: boolean): boolean {
  return !cancelled && collected < clampInteger(maxItems, MIN_MAX_ITEMS, MAX_MAX_ITEMS);
}

export function shouldKeepNgaCollectedSample(sample: NgaSample): boolean {
  const normalized = sanitizeNgaSample(sample);
  if (!normalized.title && !normalized.url) {
    return false;
  }

  if (normalized.body) {
    return true;
  }

  const text = normalized.title;
  if (isNgaNoiseText(text)) {
    return false;
  }

  return hasRecruitSignal(text);
}

export function classifyNgaSample(sample: NgaSample): NgaSampleSignal {
  const normalized = sanitizeNgaSample(sample);
  const text = `${normalized.title}\n${normalized.body}`;
  const initialNoise = isNgaNoiseText(text);
  const isClosed = matchesPattern(CLOSED_RE, text) || isClearedEditedPost(normalized);
  const isSeeking = hasSeekingSignal(normalized);
  const isRecruit = matchesPattern(RECRUIT_RE, text) || hasRecruitSignal(text);
  const parser = parseNgaSampleFields(normalized, { isClosed, isNoise: initialNoise, isSeeking });
  const lowInformationNoise = !isClosed && !isSeeking && isLowInformationParsedSample(normalized, parser.parsedFields, parser.parseConfidence);
  const isNoise = initialNoise || lowInformationNoise;

  const recruitKind: NgaSampleSignal["recruitKind"] = isNoise
    ? "noise"
    : isClosed
      ? "closed"
      : isSeeking
        ? "seeking"
        : isRecruit
          ? "recruit"
          : "unknown";

  return {
    isClosed,
    isNoise,
    recruitKind,
    warnings: lowInformationNoise
      ? uniqueValues([...parser.warnings, "正文和标题缺少可用招募信息，默认不展示。"]).slice(0, CORE_WARNING_LIMIT)
      : parser.warnings,
    tags: lowInformationNoise ? uniqueValues([...parser.tags, "疑似噪音"]) : parser.tags,
    parsedFields: parser.parsedFields,
    parseConfidence: parser.parseConfidence,
    evidence: [
      ...parser.evidence,
      ...(lowInformationNoise
        ? [
            {
              field: "warning" as const,
              value: "正文和标题缺少可用招募信息，默认不展示。",
              snippet: normalized.title || snippetAround(text, 0, 24),
              confidence: "high" as const
            }
          ]
        : []),
      ...buildRecruitKindEvidence(recruitKind, text)
    ]
  };
}

function isLowInformationParsedSample(
  sample: NgaSample,
  fields: Partial<NgaParsedFields>,
  confidence: Partial<Record<keyof NgaParsedFields, NgaParseConfidence>>
): boolean {
  const strippedText = stripNgaAuthorMetadata(`${sample.title}\n${sample.body}`).trim();
  const hasSpecificDungeon = Boolean(fields.dungeon && confidence.dungeon !== "low");
  const hasCoreField = Boolean(
    fields.positions?.length ||
      fields.playerAvailablePositions?.length ||
      fields.jobs?.length ||
      fields.playerAvailableJobs?.length ||
      fields.rosterSlots ||
      fields.vacancySlots ||
      fields.progress ||
      fields.time ||
      fields.clearGoal ||
      fields.contactDetails
  );
  if (hasCoreField || (hasSpecificDungeon && (matchesPattern(RECRUIT_RE, strippedText) || matchesTeamSizeLike(strippedText)))) {
    return false;
  }
  if (!strippedText || /^(?:零式|绝本|高难|幻巧|极本)?$/i.test(strippedText.replace(/\s+/g, ""))) {
    return true;
  }
  return strippedText.length <= 36 && !matchesTeamSizeLike(strippedText) && !matchesPattern(POSITION_RE, strippedText);
}

function hasSeekingSignal(sample: NgaSample): boolean {
  const titleSnippet = findSeekingSnippet(sample.title);
  if (titleSnippet) {
    return true;
  }

  const leadingBody = sample.body.slice(0, 260);
  return Boolean(findSeekingSnippet(leadingBody));
}

function findSeekingSnippet(text: string): string | undefined {
  for (const match of text.matchAll(toGlobalRegExp(SEEKING_RE))) {
    const index = match.index ?? 0;
    if (isFalseSeekingContext(text, index, match[0])) {
      continue;
    }
    return snippetAround(text, index, match[0].length);
  }
  return undefined;
}

function isFalseSeekingContext(text: string, index: number, value: string): boolean {
  const context = contextAround(text, index, 18, 28);
  if (/需求职业|招募情况|招募要求|应聘职业|备注.{0,8}求职|不要来求职|请不要来求职|来求职|求职\+/.test(context)) {
    return true;
  }
  if (/^找队/.test(value) && /找队长/.test(contextAround(text, index, 0, 4))) {
    return true;
  }
  return false;
}

function parseNgaSampleFields(
  sample: NgaSample,
  flags: { isClosed: boolean; isNoise: boolean; isSeeking: boolean }
): Pick<NgaSampleSignal, "warnings" | "tags" | "parsedFields" | "parseConfidence" | "evidence"> {
  const text = `${sample.title}\n${sample.body}`;
  const parsedFields: Partial<NgaParsedFields> = {};
  const parseConfidence: Partial<Record<keyof NgaParsedFields, NgaParseConfidence>> = {};
  const evidence: NgaParseEvidence[] = [];
  const warnings: string[] = [];
  const tags: string[] = [];

  const addWarning = (warning: string, snippet = warning) => {
    pushUnique(warnings, warning);
    evidence.push({ field: "warning", value: warning, snippet, confidence: "medium" });
  };
  const addTag = (tag: string, snippet = tag, confidence: NgaParseConfidence = "medium") => {
    pushUnique(tags, tag);
    evidence.push({ field: "tag", value: tag, snippet, confidence });
  };
  const setField = (field: keyof NgaParsedFields, value: string, confidence: NgaParseConfidence, snippet: string) => {
    if (!value) {
      return;
    }
    const nextValue = trimFieldText(value);
    const current = parsedFields[field];
    if (typeof current === "string" && current) {
      return;
    }
    parsedFields[field] = nextValue as never;
    parseConfidence[field] = confidence;
    evidence.push({ field, value: nextValue, snippet, confidence });
  };
  const addArrayField = (
    field: keyof Pick<
      NgaParsedFields,
      "jobs" | "positions" | "excludedJobs" | "excludedPositions" | "playerAvailableJobs" | "playerAvailablePositions"
    >,
    values: string[],
    confidence: NgaParseConfidence,
    snippet: string
  ) => {
    const existing = Array.isArray(parsedFields[field]) ? [...parsedFields[field]] : [];
    for (const value of values) {
      pushUnique(existing, value);
    }
    if (existing.length === 0) {
      return;
    }
    parsedFields[field] = existing as never;
    parseConfidence[field] = maxConfidence(parseConfidence[field], confidence);
    evidence.push({ field, value: existing.join("、"), snippet, confidence });
  };

  if (flags.isNoise) {
    addWarning("疑似非 FF14 招募内容，默认不展示。", findNoiseSnippet(text) ?? sample.title);
    addTag("疑似噪音", sample.title, "high");
  }
  if (!sample.body) {
    addWarning("缺少正文，建议开启“采集详情正文”后重新采集。", sample.title);
  }
  if (flags.isClosed) {
    setField("teamType", "已招满/关闭", "high", findClosedSnippet(text) ?? sample.title);
    addWarning("疑似已招满或已关闭，默认不展示。", findClosedSnippet(text) ?? sample.title);
    addTag("已关闭", findClosedSnippet(text) ?? sample.title, "high");
  }

  const dungeon = findFirstAlias(text, DUNGEON_ALIASES);
  if (dungeon) {
    setField("dungeon", dungeon.entry.value, dungeon.entry.confidence ?? "high", dungeon.snippet);
  } else {
    const arcadion = collectArcadionParts(text)[0];
    if (arcadion) {
      setField("dungeon", arcadion.value, arcadion.confidence, arcadion.snippet);
    } else {
      const genericSavage = matchPattern(text, /(?:零式|高难|绝本|绝境战)/);
      if (genericSavage) {
        setField("dungeon", genericSavage.value, "low", genericSavage.snippet);
      }
    }
  }

  const server = findFirstAlias(text, SERVER_ALIASES);
  if (server) {
    setField("server", server.entry.value, "high", server.snippet);
  }
  const crossRegion = matchPattern(text, /跨大区|跨区|支持跨区|支持跨大区/);
  if (crossRegion) {
    addTag("支持跨大区", crossRegion.snippet, "high");
  }

  const teamTypes = collectAliases(text, TEAM_TYPE_ALIASES).filter(
    (match) => match.entry.value !== "玩家求职" || !isFalseSeekingContext(text, match.index, match.alias)
  );
  const typeValues = teamTypes.map((match) => match.entry.value);
  if (flags.isSeeking) {
    const seekingSnippet = findSeekingSnippet(text) ?? sample.title;
    setField("teamType", "玩家求职", "high", seekingSnippet);
    addTag("玩家求职", seekingSnippet, "high");
  } else if (!flags.isClosed && typeValues.length) {
    setField("teamType", uniqueValues(typeValues).join("、"), bestMatchConfidence(teamTypes), teamTypes[0].snippet);
  }
  for (const match of teamTypes) {
    addTag(match.entry.value, match.snippet, match.confidence);
  }

  const clearGoals = collectClearGoalParts(text);
  if (clearGoals.length) {
    setField("clearGoal", uniqueValues(clearGoals.map((match) => match.value)).join("、"), bestMatchConfidence(clearGoals), clearGoals[0].snippet);
    for (const match of clearGoals) {
      addTag(match.value, match.snippet, match.confidence);
    }
  }

  const progress = collectProgressParts(text);
  if (progress.length) {
    setField("progress", uniqueValues(progress.map((item) => item.value)).join("、"), bestMatchConfidence(progress), progress[0].snippet);
  }

  const strategies = collectStrategyParts(text);
  if (strategies.length) {
    setField("strategy", uniqueValues(strategies.map((item) => item.value)).join("、"), bestMatchConfidence(strategies), strategies[0].snippet);
  }

  const time = collectTimeParts(text);
  if (time.length) {
    setField("time", uniqueValues(time.map((item) => item.value)).join("、"), bestMatchConfidence(time), time[0].snippet);
  }

  const timeSupplement = collectTimeSupplementParts(text);
  if (timeSupplement.length) {
    setField(
      "timeSupplement",
      uniqueValues(timeSupplement.map((item) => item.value)).join("、"),
      bestMatchConfidence(timeSupplement),
      timeSupplement[0].snippet
    );
  }

  const dailyDuration = collectPhasedDailyDurationParts(text);
  if (!dailyDuration.length) {
    dailyDuration.push(...collectDailyDurationParts(stripTimeSupplementWindows(text)));
  }
  if (dailyDuration.length) {
    setField(
      "dailyDuration",
      uniqueValues(dailyDuration.map((item) => item.value)).join("、"),
      bestMatchConfidence(dailyDuration),
      dailyDuration[0].snippet
    );
  } else if (parsedFields.time) {
    const inferredDailyDuration = formatRecruitDailyDuration(parsedFields.time, { inferFromRanges: true });
    if (inferredDailyDuration) {
      setField("dailyDuration", inferredDailyDuration, "high", time[0]?.snippet ?? sample.title);
    }
  }

  const rosterSlots = flags.isSeeking
    ? { slots: {}, matches: [], flexGroups: [], flexMatches: [] }
    : collectRosterSlotParts(text);

  const loosePositions = collectPositionParts(text, flags.isSeeking ? "availability" : "vacancy");
  const strongPositions = flags.isSeeking ? [] : collectStrongVacancyPositionParts(text, rosterSlots.slots);
  const positions = flags.isSeeking ? loosePositions : mergeVacancyPositionMatches(strongPositions, loosePositions);
  const positionValues = uniqueValues(positions.map((item) => item.value));
  const positionSnippet = positions[0]?.snippet ?? sample.title;
  if (positionValues.length) {
    addArrayField(flags.isSeeking ? "playerAvailablePositions" : "positions", positionValues, bestMatchConfidence(positions), positionSnippet);
  }

  const vacancyFlexGroups = flags.isSeeking ? { groups: [], matches: [] } : collectVacancyFlexGroups(text);
  const openPositionSet = createOpenPositionSet(positionValues, vacancyFlexGroups.groups);

  const vacancySlots = flags.isSeeking
    ? { slots: {}, matches: [] }
    : filterVacancySlotJobPartsByOpenPositions(collectVacancySlotJobParts(text), openPositionSet);
  const jobs = flags.isSeeking
    ? collectJobParts(text, "availability")
    : filterVacancyJobMatchesByOpenPositions(collectJobParts(text, "vacancy"), openPositionSet);
  const jobValues = uniqueValues([...jobs.map((item) => item.value), ...Object.values(vacancySlots.slots).flat()]);
  if (jobValues.length) {
    addArrayField(
      flags.isSeeking ? "playerAvailableJobs" : "jobs",
      jobValues,
      bestMatchConfidence([...jobs, ...vacancySlots.matches]),
      jobs[0]?.snippet ?? vacancySlots.matches[0]?.snippet ?? sample.title
    );
  }

  if (Object.keys(vacancySlots.slots).length) {
    parsedFields.vacancySlots = vacancySlots.slots;
    parseConfidence.vacancySlots = bestMatchConfidence(vacancySlots.matches);
    evidence.push({
      field: "vacancySlots",
      value: formatRosterSlots(vacancySlots.slots),
      snippet: vacancySlots.matches[0]?.snippet ?? sample.title,
      confidence: parseConfidence.vacancySlots
    });
  }
  if (vacancyFlexGroups.groups.length) {
    parsedFields.vacancyFlexGroups = vacancyFlexGroups.groups;
    parseConfidence.vacancyFlexGroups = bestMatchConfidence(vacancyFlexGroups.matches);
    evidence.push({
      field: "vacancyFlexGroups",
      value: vacancyFlexGroups.groups.map((group) => group.join("/")).join("、"),
      snippet: vacancyFlexGroups.matches[0]?.snippet ?? sample.title,
      confidence: parseConfidence.vacancyFlexGroups
    });
  }

  if (Object.keys(rosterSlots.slots).length) {
    parsedFields.rosterSlots = rosterSlots.slots;
    parseConfidence.rosterSlots = bestMatchConfidence(rosterSlots.matches);
    evidence.push({
      field: "rosterSlots",
      value: formatRosterSlots(rosterSlots.slots),
      snippet: rosterSlots.matches[0]?.snippet ?? sample.title,
      confidence: parseConfidence.rosterSlots
    });
  }
  if (rosterSlots.flexGroups.length) {
    parsedFields.rosterFlexGroups = rosterSlots.flexGroups;
    parseConfidence.rosterFlexGroups = bestMatchConfidence(rosterSlots.flexMatches);
    evidence.push({
      field: "rosterFlexGroups",
      value: rosterSlots.flexGroups.map((group) => group.join("/")).join("、"),
      snippet: rosterSlots.flexMatches[0]?.snippet ?? sample.title,
      confidence: parseConfidence.rosterFlexGroups
    });
  }

  const excluded = collectExclusionParts(text);
  if (excluded.jobs.length) {
    addArrayField("excludedJobs", uniqueValues(excluded.jobs.map((item) => item.value)), "medium", excluded.jobs[0].snippet);
    addWarning("包含排除职业条件，低置信筛选时不要只看缺口位置。", excluded.jobs[0].snippet);
  }
  if (excluded.positions.length) {
    const excludedPositionConfidence = bestMatchConfidence(excluded.positions);
    addArrayField("excludedPositions", uniqueValues(excluded.positions.map((item) => item.value)), excludedPositionConfidence, excluded.positions[0].snippet);
    if (excluded.positions.some((item) => item.confidence === "low")) {
      addWarning("包含机制/攻略站位上下文，排除位置需要按原帖人工确认。", excluded.positions[0].snippet);
    }
  }

  const roster = collectRosterParts(text);
  if (roster) {
    setField("rosterSize", roster.value, roster.confidence, roster.snippet);
    addTag(roster.value, roster.snippet, roster.confidence);
  }

  const requirements = collectRequirementParts(text);
  if (requirements.length) {
    setField("requirements", uniqueValues(requirements.map((item) => item.value)).join("、"), bestMatchConfidence(requirements), requirements[0].snippet);
    for (const item of requirements) {
      addTag(item.value, item.snippet, item.confidence);
      const isAntiRequirement = /禁止|拒绝|谢绝|婉拒|不要|不支持|不接受|不欢迎|不允许|非装甲车|纯净队|禁第三方|反/.test(item.value);
      const isRiskRequirement = /第三方工具\/插件风险|ACT 时间轴\/TTS 辅助|代打\/工作室\/带老板风险/.test(item.value);
      if (!isAntiRequirement && isRiskRequirement) {
        addWarning(`${item.value}：只作为风险/要求标签，不进入副本、进度或职业强判断。`, item.snippet);
      }
    }
  }

  const contact = collectContactPart(text);
  if (contact) {
    setField("contact", contact.value, "medium", contact.snippet);
  }
  const contactDetails = collectContactDetailPart(text);
  if (contactDetails) {
    setField("contactDetails", contactDetails.value, "high", contactDetails.snippet);
  }

  if (!flags.isNoise && !flags.isClosed && !parsedFields.dungeon && !parsedFields.progress && !parsedFields.positions && !parsedFields.playerAvailablePositions) {
    addWarning("低置信未识别：缺少明确副本、进度或位置证据。", sample.title || snippetAround(text, 0, 24));
    addTag("低置信未识别", sample.title || snippetAround(text, 0, 24), "low");
  }

  return {
    warnings: warnings.slice(0, CORE_WARNING_LIMIT),
    tags,
    parsedFields,
    parseConfidence,
    evidence: evidence.slice(0, 24)
  };
}

interface ParsedTextMatch {
  value: string;
  snippet: string;
  index: number;
  confidence: NgaParseConfidence;
}

interface PhasedSchedulePart {
  label: string;
  text: string;
  start: number;
  display?: string;
  duration?: string;
}

interface CompactRosterJob {
  value: string;
  alts?: string[];
  start: number;
  end: number;
}

interface ParsedAliasMatch extends ParsedTextMatch {
  entry: AliasEntry;
  alias: string;
}

const CONFIDENCE_RANK: Record<NgaParseConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3
};

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function lastIndexOfAny(text: string, needles: string[]): number {
  return needles.reduce((last, needle) => Math.max(last, text.lastIndexOf(needle)), -1);
}

function trimFieldText(value: string): string {
  return cleanText(value).slice(0, FIELD_TEXT_LIMIT);
}

function maxConfidence(
  current: NgaParseConfidence | undefined,
  next: NgaParseConfidence
): NgaParseConfidence {
  if (!current) {
    return next;
  }
  return CONFIDENCE_RANK[next] > CONFIDENCE_RANK[current] ? next : current;
}

function bestMatchConfidence(matches: Array<{ confidence?: NgaParseConfidence }>, fallback: NgaParseConfidence = "medium"): NgaParseConfidence {
  if (matches.length === 0) {
    return fallback;
  }
  return matches.reduce<NgaParseConfidence>((best, match) => maxConfidence(best, match.confidence ?? fallback), "unknown");
}

function buildRecruitKindEvidence(recruitKind: NgaSampleSignal["recruitKind"], text: string): NgaParseEvidence[] {
  if (recruitKind === "unknown") {
    return [
      {
        field: "recruitKind",
        value: "unknown",
        snippet: snippetAround(text, 0, 24),
        confidence: "low"
      }
    ];
  }

  const snippet =
    recruitKind === "closed"
      ? findClosedSnippet(text)
      : recruitKind === "noise"
        ? findNoiseSnippet(text)
        : recruitKind === "seeking"
          ? findSeekingSnippet(text)
          : recruitKind === "recruit"
            ? findPatternSnippet(text, RECRUIT_RE)
            : undefined;
  return [
    {
      field: "recruitKind",
      value: recruitKind,
      snippet: snippet ?? snippetAround(text, 0, 24),
      confidence: recruitKind === "recruit" ? "medium" : "high"
    }
  ];
}

function findPatternSnippet(text: string, pattern: RegExp): string | undefined {
  return matchPattern(text, pattern)?.snippet;
}

function findNoiseSnippet(text: string): string | undefined {
  return findPatternSnippet(text, NOISE_RE) ?? (isFreeCompanyNoise(text) ? findPatternSnippet(text, FREE_COMPANY_RE) : undefined);
}

function findClosedSnippet(text: string): string | undefined {
  return findPatternSnippet(text, CLOSED_RE) ?? findPatternSnippet(text, CLEARED_EDITED_LINE_RE);
}

function isNgaNoiseText(text: string): boolean {
  return matchesPattern(NOISE_RE, text) || isFreeCompanyNoise(text);
}

function isFreeCompanyNoise(text: string): boolean {
  return matchesPattern(FREE_COMPANY_RE, text) && !hasDutyContentSignal(text);
}

function hasDutyContentSignal(text: string): boolean {
  return (
    Boolean(findFirstAlias(text, DUNGEON_ALIASES)) ||
    matchesPattern(DUNGEON_HINT_RE, text) ||
    matchesPattern(PROGRESS_RE, text) ||
    matchesPattern(POSITION_RE, text) ||
    matchesTeamSizeLike(text)
  );
}

function isClearedEditedPost(sample: NgaSample): boolean {
  const parts = [sample.title, sample.body].map((part) => cleanText(part ?? "")).filter(Boolean);
  return parts.length > 0 && parts.every((part) => isClearedEditedText(part) || isClearedNumericPlaceholderText(part));
}

function isClearedEditedText(text: string): boolean {
  const normalized = cleanText(text)
    .replace(/\[?数字已隐藏\]?/g, "数字")
    .replace(/\d{4,}/g, "数字")
    .replace(/[【】\[\]()（）]/g, " ")
    .trim();
  return /^(?:已?编辑|edit(?:ed)?)(?:\s*(?:数字|\d+|[#号楼层:_\-.：])+)*$/i.test(normalized);
}

function isClearedNumericPlaceholderText(text: string): boolean {
  const normalized = cleanText(text).replace(/\[?数字已隐藏\]?/g, "0").trim();
  return /^\d[\d\s#号楼层:_\-.：,，。]*$/.test(normalized) && normalized.replace(/\D/g, "").length >= 6;
}

function matchPattern(text: string, pattern: RegExp): ParsedTextMatch | null {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  pattern.lastIndex = 0;
  if (!match?.[0]) {
    return null;
  }
  return {
    value: cleanText(match[1] ?? match[0]),
    snippet: snippetAround(text, match.index, match[0].length),
    index: match.index,
    confidence: "medium"
  };
}

function snippetAround(text: string, index: number, length = 0): string {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  const start = Math.max(0, safeIndex - EVIDENCE_SNIPPET_RADIUS);
  const end = Math.min(text.length, safeIndex + Math.max(length, 1) + EVIDENCE_SNIPPET_RADIUS);
  return cleanText(`${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`);
}

function findFirstAlias(text: string, entries: AliasEntry[]): ParsedAliasMatch | null {
  return collectAliases(text, entries)[0] ?? null;
}

function collectAliases(text: string, entries: AliasEntry[]): ParsedAliasMatch[] {
  const matches: ParsedAliasMatch[] = [];
  const seenValues = new Set<string>();

  for (const entry of entries) {
    const aliases = [...entry.aliases].sort((left, right) => right.length - left.length);
    for (const alias of aliases) {
      const match = findAliasMatch(text, alias);
      if (!match) {
        continue;
      }
      if (seenValues.has(entry.value)) {
        break;
      }
      seenValues.add(entry.value);
      matches.push({
        ...match,
        value: entry.value,
        entry,
        alias,
        confidence: entry.confidence ?? match.confidence
      });
      break;
    }
  }

  return matches.sort((left, right) => left.index - right.index || right.alias.length - left.alias.length);
}

function findAliasMatch(text: string, alias: string): ParsedTextMatch | null {
  if (!alias) {
    return null;
  }
  const asciiOnly = /^[A-Za-z0-9.+_-]+$/.test(alias);
  if (asciiOnly) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(alias)})(?![A-Za-z0-9])`, "i");
    const match = pattern.exec(text);
    if (!match?.[2]) {
      return null;
    }
    const index = match.index + match[1].length;
    return {
      value: match[2],
      snippet: snippetAround(text, index, match[2].length),
      index,
      confidence: "high"
    };
  }

  if (/^[\u4e00-\u9fa5]$/.test(alias)) {
    return findSingleCharacterAliasMatch(text, alias);
  }

  const index = text.toLowerCase().indexOf(alias.toLowerCase());
  if (index < 0) {
    return null;
  }
  return {
    value: text.slice(index, index + alias.length),
    snippet: snippetAround(text, index, alias.length),
    index,
    confidence: "high"
  };
}

function findSingleCharacterAliasMatch(text: string, alias: string): ParsedTextMatch | null {
  const context =
    alias === "盘"
      ? `(?:D[1-4]\\s*${alias}|${alias}子|(?:缺|招|补|求|任意|可切|切|非|来|找|排除|不要)\\s*${alias})`
      : `(?:D[1-4]\\s*${alias}|(?:缺|招|补|求|任意|可切|切|非|来|找|排除|不要)\\s*${alias}|${alias}\\s*(?:剑士|刀|家|D[1-4]|近战|可切))`;
  const pattern = new RegExp(context, "i");
  const match = pattern.exec(text);
  if (!match?.[0]) {
    return null;
  }
  const aliasOffset = match[0].indexOf(alias);
  const index = match.index + Math.max(0, aliasOffset);
  return {
    value: alias,
    snippet: snippetAround(text, index, alias.length),
    index,
    confidence: "medium"
  };
}

function collectProgressParts(text: string): ParsedTextMatch[] {
  const patterns: Array<{ pattern: RegExp; value?: string; confidence?: NgaParseConfidence }> = [
    { pattern: /从0|从零/g, value: "从零开荒", confidence: "high" },
    { pattern: /开荒|补进度|消化|过本|清CD|低保|渡劫|练习|复健|门神|本体|狂暴/g, confidence: "high" },
    { pattern: /(?:伐木|farm|FM)/gi, value: "伐木/Farm", confidence: "high" },
    { pattern: /P\d{1,2}[SP]?/gi, confidence: "high" },
    { pattern: /[一二三四五六七八九十]运/g, confidence: "high" },
    { pattern: /见[^\s,，。；;、]{1,8}/g }
  ];
  return collectPatternMatches(text, patterns);
}

function collectArcadionParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  const arcadionRe = /\b[Mm](\d{1,2})([Ss]?)(?:\s*(?:-|~|～|到|至)\s*(?:[Mm])?(\d{1,2})[Ss])?\b/g;
  for (const match of text.matchAll(arcadionRe)) {
    const start = Number(match[1]);
    const hasStartSuffix = Boolean(match[2]);
    const end = match[3] ? Number(match[3]) : undefined;
    if (!hasStartSuffix && end === undefined) {
      continue;
    }
    if (!Number.isFinite(start) || start < 1 || start > 12 || (end !== undefined && (end < 1 || end > 12))) {
      continue;
    }
    const label = end === undefined ? `M${start}S` : `M${start}S-M${end}S`;
    matches.push({
      value: `阿卡迪亚登天斗技场 ${label}`,
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "high"
    });
  }
  return dedupeMatches(matches);
}

function collectStrategyParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = collectAliases(text, STRATEGY_ALIASES);
  const strategyLine = /(?:攻略|打法|文档)[:：]\s*([^\n。；;]{1,40})/g;
  for (const match of text.matchAll(strategyLine)) {
    if (!match[1]) {
      continue;
    }
    const value = cleanText(
      match[1].split(
        /(?:语音(?:软件)?|预期进度|进度预期|招募要求|开荒要求|时间|联系方式|联系|lxfs|QQ|qq|企鹅|群号|神秘代码)[:：]/i
      )[0] ?? ""
    );
    if (!value) {
      continue;
    }
    matches.push({
      value,
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }
  return dedupeMatches(matches);
}

function collectClearGoalParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  const add = (value: string, index: number, length: number, confidence: NgaParseConfidence = "high") => {
    matches.push({
      value,
      snippet: snippetAround(text, index, length),
      index,
      confidence
    });
  };

  const explicitGoalRe =
    /(?:进度预期|预期进度|目标|预计|期望|争取|保底|进度要求|过本时间)[^\n。；;]{0,24}(首周|次周|三周|四周|首月|次月)|(?:首周|次周|三周|四周|首月|次月)[^\n。；;]{0,10}(?:目标|击破|打完)/gi;
  for (const match of text.matchAll(explicitGoalRe)) {
    if (/争.{0,8}保/.test(match[0])) {
      continue;
    }
    const goalContext = text.slice(match.index ?? 0, Math.min(text.length, (match.index ?? 0) + match[0].length + 12));
    if (/进本/.test(goalContext) && !/(?:过本|击破|通关|打完)/.test(goalContext)) {
      continue;
    }
    const raw = match[1] || /首周|次周|三周|四周|首月|次月/.exec(match[0])?.[0] || "";
    const value = normalizeClearGoalValue(raw);
    if (value) {
      add(value, match.index, match[0].length);
    }
  }

  const teamGoalRe = /(?:首月队|次月队|首月(?:社畜|休闲|固定|晚间|爆肝)?队|次月(?:社畜|休闲|固定|晚间|爆肝)?队|保首月|保次月|首月打完|次月打完)/gi;
  for (const match of text.matchAll(teamGoalRe)) {
    const raw = /次月/.test(match[0]) ? "次月" : "首月";
    add(normalizeClearGoalValue(raw), match.index, match[0].length, "medium");
  }

  for (const match of text.matchAll(/争次(?:周)?保三(?:周)?|争取?次周.{0,6}保(?:底)?三周/gi)) {
    add("次周目标、三周保底", match.index, match[0].length);
  }

  for (const match of text.matchAll(/争([首一二三四次])(?:周|月)?保([次二三四])(?:周|月)?/gi)) {
    const first = match[1];
    const second = match[2];
    if (!first || !second || /争次/.test(match[0])) {
      continue;
    }
    const unit = inferClearGoalUnit(text, match.index, match[0]);
    const firstValue = normalizeClearGoalValue(`${first}${unit}`);
    const secondValue = normalizeClearGoalValue(`${second}${unit}`, true);
    if (firstValue && secondValue) {
      add(`${firstValue}、${secondValue}`, match.index, match[0].length);
    }
  }

  return dedupeMatches(matches).filter((match) => !isPersonalClearExperienceContext(text, match.index, match.snippet.length));
}

function normalizeClearGoalValue(raw: string, isGuarantee = false): string {
  const normalized = raw.replace(/一/g, "首").replace(/二/g, "次");
  const suffix = isGuarantee ? "保底" : "目标";
  if (/首周/.test(normalized)) {
    return `首周${suffix}`;
  }
  if (/次周/.test(normalized)) {
    return `次周${suffix}`;
  }
  if (/三周/.test(normalized)) {
    return `三周${suffix}`;
  }
  if (/四周/.test(normalized)) {
    return `四周${suffix}`;
  }
  if (/首月/.test(normalized)) {
    return `首月${suffix}`;
  }
  if (/次月/.test(normalized)) {
    return `次月${suffix}`;
  }
  return "";
}

function inferClearGoalUnit(text: string, index: number, raw: string): "周" | "月" {
  if (/周/.test(raw)) {
    return "周";
  }
  if (/月/.test(raw)) {
    return "月";
  }
  const context = contextAround(text, index, 32, 32);
  if (/零式|[Mm]\d{1,2}[Ss]?|清CD/.test(context) && !/绝|绝境|妖星|欧米茄|伊甸|龙诗|亚历山大|巴哈|神兵/.test(context)) {
    return "周";
  }
  return "月";
}

function isPersonalClearExperienceContext(text: string, index: number, length: number): boolean {
  const context = text.slice(Math.max(0, index - 24), Math.min(text.length, index + length + 24));
  return /(?:履历|经验|记录|过本记录|本人|自己|打了|打过|打的|已过|过了|首周队友|首周开荒履历)/.test(context) && !/(?:目标|预期|预计|期望|争|保)/.test(context);
}

function collectTimeParts(text: string): ParsedTextMatch[] {
  const phased = collectPhasedTimeParts(text);
  if (phased.length) {
    return phased;
  }
  const regularText = stripTimeSupplementWindows(text);
  const parsed = parseRecruitTime(regularText);
  if (!parsed.display) {
    return [];
  }
  const evidence = findTimeEvidence(regularText);
  return [
    {
      value: parsed.display,
      snippet: snippetAround(regularText, evidence.index, evidence.length),
      index: evidence.index,
      confidence: parsed.ranges.length || parsed.days.length ? "high" : "medium"
    }
  ];
}

function collectPhasedTimeParts(text: string): ParsedTextMatch[] {
  const parts = collectPhasedScheduleParts(text).filter((part) => part.display);
  if (parts.length < 2) {
    return [];
  }
  return [
    {
      value: parts.map((part) => `${part.label} ${part.display}`).join("；"),
      snippet: snippetAround(text, parts[0].start, Math.min(text.length - parts[0].start, 96)),
      index: parts[0].start,
      confidence: "high"
    }
  ];
}

function collectTimeSupplementParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  for (const window of collectTimeSupplementWindows(text)) {
    const parsed = parseRecruitTime(window.text);
    const duration = formatRecruitDailyDuration(window.text, { inferFromRanges: false });
    if (!parsed.display && !duration) {
      continue;
    }
    const supplementValue = [parsed.display, duration].filter(Boolean).join("，");
    matches.push({
      value: `加班/加练：${supplementValue}`,
      snippet: snippetAround(text, window.start, window.text.length),
      index: window.start,
      confidence: "medium"
    });
  }
  return dedupeMatches(matches);
}

function stripTimeSupplementWindows(text: string): string {
  let result = text;
  for (const window of collectTimeSupplementWindows(text).sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, window.start)} ${result.slice(window.start + window.text.length)}`;
  }
  return result;
}

function collectTimeSupplementWindows(text: string): Array<{ text: string; start: number }> {
  const windows: Array<{ text: string; start: number }> = [];
  const supplementalRe =
    /(?:周[六日天](?!天)|星期[六日天]|礼拜[六日天]|周末|双休)[^\n。；;]{0,24}(?:加班|加练|补时|看情况加)[^\n。；;]{0,48}|(?:加班|加练|补时|额外加练|额外开荒|看情况加)[^\n。；;]{0,64}/gi;
  for (const match of text.matchAll(supplementalRe)) {
    if (!match[0] || (!parseRecruitTime(match[0]).display && !formatRecruitDailyDuration(match[0], { inferFromRanges: false }))) {
      continue;
    }
    windows.push({ text: match[0], start: match.index ?? 0 });
  }
  return windows;
}

function findTimeEvidence(text: string): { index: number; length: number } {
  TIME_RE.lastIndex = 0;
  for (const match of text.matchAll(TIME_RE)) {
    if (match[0] && isLikelyTimeCandidate(match[0])) {
      TIME_RE.lastIndex = 0;
      return { index: match.index, length: match[0].length };
    }
  }
  TIME_RE.lastIndex = 0;
  const dayMatch = /(?:工作日|平日|周末|双休|每天|今晚|明天|后天|社畜|晚间|晚[上]?|周[一二三四五六日天0-7、,，和及]+|星期[一二三四五六日天0-7、,，和及]+)/.exec(text);
  if (dayMatch) {
    return { index: dayMatch.index, length: dayMatch[0].length };
  }
  return { index: 0, length: Math.min(text.length, 24) };
}

function collectDailyDurationParts(text: string): ParsedTextMatch[] {
  const value = formatRecruitDailyDuration(text, { inferFromRanges: false });
  if (!value) {
    return [];
  }
  const match = /(?:\d{1,2})(?:\s*(?:-|—|–|~|～|到|至)\s*\d{1,2})?\s*(?:h|H|小时|个小时)/.exec(text);
  return [
    {
      value,
      snippet: snippetAround(text, match?.index ?? 0, match?.[0]?.length ?? Math.min(text.length, 24)),
      index: match?.index ?? 0,
      confidence: "high"
    }
  ];
}

function collectPhasedDailyDurationParts(text: string): ParsedTextMatch[] {
  const parts = collectPhasedScheduleParts(text).filter((part) => part.duration);
  if (parts.length < 2) {
    return [];
  }
  return [
    {
      value: parts.map((part) => `${part.label} ${part.duration}`).join("、"),
      snippet: snippetAround(text, parts[0].start, Math.min(text.length - parts[0].start, 96)),
      index: parts[0].start,
      confidence: "high"
    }
  ];
}

function collectPhasedScheduleParts(text: string): PhasedSchedulePart[] {
  const markers: Array<{ raw: string; label: string; index: number; length: number }> = [];
  const phaseRe = /首周|第一周|开荒首周|次周开始|次周后|第二周开始|第二周|后续|之后/g;
  for (const match of text.matchAll(phaseRe)) {
    const raw = match[0];
    markers.push({
      raw,
      label: normalizePhaseScheduleLabel(raw),
      index: match.index ?? 0,
      length: raw.length
    });
  }
  if (markers.length < 2) {
    return [];
  }

  const parts: PhasedSchedulePart[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const nextMarker = markers[i + 1];
    const end = nextMarker?.index ?? findPhaseScheduleEnd(text, marker.index);
    const segment = text.slice(marker.index, end).trim();
    if (!segment) {
      continue;
    }
    const parsed = parseRecruitTime(segment);
    const display = formatPhaseScheduleDisplay(segment, parsed.display);
    const duration = formatRecruitDailyDuration(segment, { inferFromRanges: false });
    if (!display && !duration) {
      continue;
    }
    const existing = parts.find((part) => part.label === marker.label);
    if (existing) {
      if (!existing.display && display) {
        existing.display = display;
      }
      if (!existing.duration && duration) {
        existing.duration = duration;
      }
      continue;
    }
    parts.push({
      label: marker.label,
      text: segment,
      start: marker.index,
      display: display || undefined,
      duration: duration || undefined
    });
  }

  return parts
    .filter((part) => part.display || part.duration)
    .sort((left, right) => phaseScheduleOrder(left.label) - phaseScheduleOrder(right.label) || left.start - right.start);
}

function normalizePhaseScheduleLabel(raw: string): string {
  if (/首|第一/.test(raw)) {
    return "首周";
  }
  if (/次|第二/.test(raw)) {
    return "次周开始";
  }
  return "后续";
}

function phaseScheduleOrder(label: string): number {
  if (label === "首周") {
    return 0;
  }
  if (label === "次周开始") {
    return 1;
  }
  return 2;
}

function findPhaseScheduleEnd(text: string, start: number): number {
  const limit = Math.min(text.length, start + 140);
  const tail = text.slice(start, limit);
  const boundary = /[。；;\n]/.exec(tail);
  return boundary ? start + boundary.index : limit;
}

function formatPhaseScheduleDisplay(segment: string, display: string): string {
  if (!display) {
    return "";
  }
  if (/^(?:每天|每日|工作日|周末|周[一二三四五六日天0-7])/.test(display)) {
    return display;
  }
  if (/(?:每天|每日|天天|无休)/.test(segment)) {
    return `每天 ${display}`;
  }
  return display;
}

function createPositionListRegExp(): RegExp {
  return new RegExp(String.raw`\b([HD])([1-4](?:${POSITION_LIST_SEPARATOR_SPACED_PATTERN}(?:\1)?[1-4]){2,})\b`, "gi");
}

function createPositionListPairRegExp(): RegExp {
  return new RegExp(String.raw`\b([HD])([1-4])${POSITION_LIST_SEPARATOR_SPACED_PATTERN}(?:\1)?([1-4])\b`, "gi");
}

function createPositionAltListRegExp(): RegExp {
  return new RegExp(String.raw`\b([HD])([1-4](?:${POSITION_ALT_SEPARATOR_SPACED_PATTERN}(?:\1)?[1-4]){2,})\b`, "gi");
}

function createPositionAltPairRegExp(): RegExp {
  return new RegExp(String.raw`\b([HD])([1-4])${POSITION_ALT_SEPARATOR_SPACED_PATTERN}(?:\1)?([1-4])\b`, "gi");
}

function collectPositionParts(text: string, mode: "vacancy" | "availability"): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  const addPosition = (value: string, index: number, length: number, confidence: NgaParseConfidence = "high") => {
    const normalized = normalizePositionToken(value);
    const hasContext =
      mode === "availability" ? isLikelyAvailablePositionContext(text, index) : isLikelyVacancyPositionContext(text, index);
    if (!normalized.length || isNegatedAt(text, index) || !hasContext) {
      return;
    }
    const localConfidence = hasMechanicPositionContext(text, index) ? "low" : confidence;
    for (const position of normalized) {
      matches.push({
        value: position,
        snippet: snippetAround(text, index, length),
        index,
        confidence: localConfidence
      });
    }
  };

  if (mode === "vacancy") {
    matches.push(...collectExplicitEmptyRosterVacancyPositionParts(text));
  }

  const listRe = createPositionListRegExp();
  for (const match of text.matchAll(listRe)) {
    const prefix = match[1].toUpperCase();
    const digits = match[2].match(/[1-4]/g) ?? [];
    for (const digit of digits) {
      addPosition(`${prefix}${digit}`, match.index, match[0].length);
    }
  }

  const adjacentRe = /\b([HD])([1-4])(?:\1)?([1-4])\b/gi;
  for (const match of text.matchAll(adjacentRe)) {
    const prefix = match[1].toUpperCase();
    addPosition(`${prefix}${match[2]}`, match.index, match[0].length);
    addPosition(`${prefix}${match[3]}`, match.index, match[0].length);
  }

  const rangeRe = createPositionListPairRegExp();
  for (const match of text.matchAll(rangeRe)) {
    const prefix = match[1].toUpperCase();
    const left = Number(match[2]);
    const right = Number(match[3]);
    for (const value of expandPositionRange(prefix, left, right, false)) {
      addPosition(value, match.index, match[0].length);
    }
  }

  const dashRangeRe = /\b([HD])([1-4])\s*(?:-|~|～|到|至)\s*(?:\1)?([1-4])\b/gi;
  for (const match of text.matchAll(dashRangeRe)) {
    const prefix = match[1].toUpperCase();
    const left = Number(match[2]);
    const right = Number(match[3]);
    for (const value of expandPositionRange(prefix, left, right, true)) {
      addPosition(value, match.index, match[0].length);
    }
  }

  const explicitRe = /(^|[^A-Za-z0-9])((?:MT|ST|H[12]|D[1-4]))(?![A-Za-z0-9])/gi;
  for (const match of text.matchAll(explicitRe)) {
    if (!match[2]) {
      continue;
    }
    const index = match.index + match[1].length;
    addPosition(match[2].toUpperCase(), index, match[2].length);
  }

  for (const teamSize of collectTeamSizeVacancyWindows(text)) {
    const start = teamSize.start;
    const window = teamSize.window.slice(0, 60);
    for (const value of collectPositionsFromLooseWindow(window, { includeRoles: mode === "vacancy" })) {
      addPosition(value, start, Math.min(window.length, 24), "high");
    }
  }

  const rolePatterns: Array<{ pattern: RegExp; positions: string[]; confidence?: NgaParseConfidence }> = [
    {
      pattern: /(?:缺|招|补|需求|招募|(?<!要)求|任意|可切|找|来)\s*(?:职位|位置|职业)?\s*[:：]?\s*(?:T(?![A-Za-z0-9])|坦克|盾|蓝职)/gi,
      positions: ["MT", "ST"]
    },
    {
      pattern: /(?:缺|招|补|需求|招募|(?<!要)求|任意|可切|找|来)\s*(?:职位|位置|职业)?\s*[:：]?\s*(?:H(?![A-Za-z0-9])|N(?![A-Za-z0-9])|奶|治疗|绿职)/gi,
      positions: ["H1", "H2"]
    },
    {
      pattern: /(?:缺|招|补|需求|招募|(?<!要)求|任意|可切|找|来)\s*(?:职位|位置|职业)?\s*[:：]?\s*(?:DPS|红职)/gi,
      positions: ["D1", "D2", "D3", "D4"]
    },
    {
      pattern: /(?:缺|招|补|需求|招募|(?<!要)求|任意|可切|找|来)\s*(?:职位|位置|职业)?\s*[:：]?\s*(?:近战|近D)/gi,
      positions: ["D1", "D2"]
    },
    {
      pattern: /(?:缺|招|补|需求|招募|(?<!要)求|任意|可切|找|来)\s*(?:职位|位置|职业)?\s*[:：]?\s*(?:远敏|远程物理)/gi,
      positions: ["D3"]
    },
    {
      pattern: /(?:缺|招|补|需求|招募|(?<!要)求|任意|可切|找|来)\s*(?:职位|位置|职业)?\s*[:：]?\s*(?:法系|远程魔法|法D|法职|远法)/gi,
      positions: ["D4"]
    }
  ];
  for (const { pattern, positions, confidence = "high" } of rolePatterns) {
    for (const match of text.matchAll(pattern)) {
      if (!isLikelyVacancyPositionContext(text, match.index)) {
        continue;
      }
      for (const position of positions) {
        addPosition(position, match.index, match[0].length, confidence);
      }
    }
  }

  return dedupeMatches(matches);
}

function collectExplicitTeamSizeVacancyPositionParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  for (const teamSize of collectTeamSizeVacancyWindows(text)) {
    const start = teamSize.start;
    const window = teamSize.window;
    const positions = collectPositionsFromLooseWindow(window, { includeRoles: true });
    for (const position of positions) {
      matches.push({
        value: position,
        snippet: snippetAround(text, start, Math.max(1, Math.min(window.length, 32))),
        index: start,
        confidence: "high"
      });
    }
  }
  return dedupeMatches(matches);
}

function collectExplicitEmptyRosterVacancyPositionParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  const explicitEmptyRe =
    /(^|[^A-Za-z0-9])(MT|ST|H[12]|D[1-4])\s*[:：]?\s*(?:空|缺|未定|未招|待定|暂无|招聘中|招募中)(?![A-Za-z0-9])/gi;
  for (const match of text.matchAll(explicitEmptyRe)) {
    const position = match[2].toUpperCase() as PositionKey;
    if (!FULL_PARTY_POSITION_KEYS.includes(position)) {
      continue;
    }
    const index = (match.index ?? 0) + match[1].length;
    matches.push({
      value: position,
      snippet: snippetAround(text, index, match[0].length - match[1].length),
      index,
      confidence: "high"
    });
  }
  return dedupeMatches(matches);
}

function collectDirectVacancyRolePositionParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  const directRoleRe =
    /(?:^|[\s,，。；;\n(（])((?:现(?:在)?|当前|目前)?(?:需求|招募|缺|补|来(?:个|点)?|找|许愿|希望|倾向|优先)(?:职位|位置|职业)?|需求职业|招募职业|招募职位|招募位置|需求位置)\s*[:：]?\s*(?:一个|1个?|一名|一位)?\s*(T(?![A-Za-z0-9])|H(?![A-Za-z0-9])|N(?![A-Za-z0-9])|DPS|坦克|盾|蓝职|奶|治疗|绿职|近战|近D|远敏|远程物理|法系|远程魔法|法D|法职|远法|红职)/gi;

  for (const match of text.matchAll(directRoleRe)) {
    const marker = match[1] ?? "";
    const token = match[2] ?? "";
    const markerIndex = (match.index ?? 0) + match[0].indexOf(marker);
    if (/^招募要求/.test(text.slice(markerIndex, markerIndex + 8))) {
      continue;
    }
    const tokenIndex = (match.index ?? 0) + match[0].lastIndexOf(token);
    for (const position of normalizePositionToken(token)) {
      matches.push({
        value: position,
        snippet: snippetAround(text, markerIndex, match[0].length - Math.max(0, markerIndex - (match.index ?? 0))),
        index: tokenIndex,
        confidence: "high"
      });
    }
  }

  return dedupeMatches(matches);
}

function collectStrongVacancyPositionParts(
  text: string,
  rosterSlots: Partial<Record<PositionKey, string[]>>
): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [
    ...collectExplicitEmptyRosterVacancyPositionParts(text),
    ...collectDirectVacancyRolePositionParts(text)
  ];
  for (const teamSize of collectTeamSizeVacancyWindows(text)) {
    const start = teamSize.start;
    const window = teamSize.window;
    const explicitPositions = uniqueValues(collectPositionsFromLooseWindow(window, { includeRoles: true })).filter((position) =>
      FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)
    ) as PositionKey[];

    if (explicitPositions.length) {
      for (const position of explicitPositions) {
        matches.push({
          value: position,
          snippet: snippetAround(text, start, Math.max(1, Math.min(window.length, 32))),
          index: start,
          confidence: "high"
        });
      }
      continue;
    }

    const inferredVacancies = inferVacancyPositionsFromRosterText(text, rosterSlots, teamSize.missingCount);
    if (inferredVacancies.length === teamSize.missingCount) {
      for (const position of inferredVacancies) {
        matches.push({
          value: position,
          snippet: snippetAround(text, teamSize.index, teamSize.length),
          index: teamSize.index,
          confidence: "high"
        });
      }
      continue;
    }

    const rosterVacancies = FULL_PARTY_POSITION_KEYS.filter((position) => !rosterSlots[position]?.length);
    if (rosterVacancies.length === teamSize.missingCount) {
      for (const position of rosterVacancies) {
        matches.push({
          value: position,
          snippet: snippetAround(text, teamSize.index, teamSize.length),
          index: teamSize.index,
          confidence: "high"
        });
      }
    }
  }
  return dedupeMatches(matches);
}

function inferVacancyPositionsFromRosterText(
  text: string,
  rosterSlots: Partial<Record<PositionKey, string[]>>,
  missingCount: number
): PositionKey[] {
  if (missingCount < 0 || missingCount > FULL_PARTY_POSITION_KEYS.length) {
    return [];
  }
  const occupied = inferOccupiedRosterPositions(text, rosterSlots);
  if (!occupied.size || occupied.size + missingCount !== FULL_PARTY_POSITION_KEYS.length) {
    return [];
  }
  return FULL_PARTY_POSITION_KEYS.filter((position) => !occupied.has(position));
}

function inferOccupiedRosterPositions(text: string, rosterSlots: Partial<Record<PositionKey, string[]>>): Set<PositionKey> {
  const occupied = new Set<PositionKey>();
  const occupiedJobs = new Set<string>();
  const addPosition = (position: PositionKey) => {
    if (FULL_PARTY_POSITION_KEYS.includes(position)) {
      occupied.add(position);
    }
  };
  const addJob = (job: string) => {
    if (occupiedJobs.has(job)) {
      return;
    }
    const preferred = preferredRosterPositionsForJob(job).filter((position) => !occupied.has(position));
    const role = rosterRoleForJob(job);
    const fallback = role ? rosterPositionsForRole(role).filter((position) => !occupied.has(position)) : [];
    const position = preferred[0] ?? fallback[0];
    if (position) {
      addPosition(position);
      occupiedJobs.add(job);
    }
  };

  for (const [position, jobs] of Object.entries(rosterSlots) as Array<[PositionKey, string[]]>) {
    if (jobs.length) {
      addPosition(position);
      for (const job of jobs) {
        occupiedJobs.add(job);
      }
    }
  }

  for (const segment of collectExistingRosterSegments(text)) {
    const body = stripRosterSwitchPhrases(segment.text.slice(segment.bodyStart));
    if (/(?:双|两|2)\s*(?:T|坦|坦克|盾|蓝职)/i.test(body)) {
      addPosition("MT");
      addPosition("ST");
    }
    if (/(?:双|两|2)\s*(?:H|N|奶|治疗|绿职)/i.test(body)) {
      addPosition("H1");
      addPosition("H2");
    }
    if (/(?:双|两|2)\s*(?:近战|近D|近)/i.test(body)) {
      addPosition("D1");
      addPosition("D2");
    }
    for (const position of collectPositionsFromLooseWindow(body, { includeRoles: false })) {
      if (FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)) {
        addPosition(position as PositionKey);
      }
    }
    for (const job of collectRosterJobMatches(body)) {
      addJob(job.value);
    }
  }

  return occupied;
}

function stripRosterSwitchPhrases(text: string): string {
  return text.replace(/(?:可切|能切|会切|可换|可转|可补|也可|可以切|可打|能打|会打)[^\n。；;,，、]{0,18}/gi, " ");
}

function rosterPositionsForRole(role: NonNullable<ReturnType<typeof rosterRoleForJob>>): PositionKey[] {
  if (role === "tank") {
    return ["MT", "ST"];
  }
  if (role === "healer") {
    return ["H1", "H2"];
  }
  if (role === "melee") {
    return ["D1", "D2"];
  }
  if (role === "ranged") {
    return ["D3"];
  }
  return ["D4"];
}

function mergeVacancyPositionMatches(strong: ParsedTextMatch[], loose: ParsedTextMatch[]): ParsedTextMatch[] {
  return strong.length ? strong : loose;
}

function collectJobParts(text: string, mode: "vacancy" | "availability"): ParsedTextMatch[] {
  const aliasMatches = collectAliases(text, JOB_ALIASES)
    .filter((match) => !isNegatedAt(text, match.index))
    .filter((match) =>
      mode === "availability" ? isLikelyAvailableJobContext(text, match.index) : isLikelyVacancyJobContext(text, match.index)
    )
    .map((match) => ({
      value: match.entry.value,
      snippet: match.snippet,
      index: match.index,
      confidence: match.confidence
    }));

  return dedupeMatches(
    mode === "vacancy"
      ? [...aliasMatches, ...collectDirectVacancyRoleJobParts(text), ...collectVacancyJobGroupParts(text), ...collectVacancyRequirementJobParts(text)]
      : aliasMatches
  );
}

function collectDirectVacancyRoleJobParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  const directRoleRe =
    /(?:^|[\s,，。；;\n(（])((?:现(?:在)?|当前|目前)?(?:需求|招募|缺|补|来(?:个|点)?|找|许愿|希望|倾向|优先)(?:职位|位置|职业)?|需求职业|招募职业|招募职位|招募位置|需求位置)\s*[:：]?\s*(?:一个|1个?|一名|一位)?\s*(近战|近D|远敏|远程物理|法系|远程魔法|法D|法职|远法)/gi;

  for (const match of text.matchAll(directRoleRe)) {
    const marker = match[1] ?? "";
    const token = match[2] ?? "";
    const markerIndex = (match.index ?? 0) + match[0].indexOf(marker);
    if (/^招募要求/.test(text.slice(markerIndex, markerIndex + 8))) {
      continue;
    }
    const value = genericVacancyJobForRoleToken(token);
    if (!value) {
      continue;
    }
    matches.push({
      value,
      snippet: snippetAround(text, markerIndex, match[0].length - Math.max(0, markerIndex - (match.index ?? 0))),
      index: (match.index ?? 0) + match[0].lastIndexOf(token),
      confidence: "high"
    });
  }

  return dedupeMatches(matches);
}

function genericVacancyJobForRoleToken(token: string): string | null {
  if (/近战|近D/.test(token)) {
    return "任意近战";
  }
  if (/远敏|远程物理/.test(token)) {
    return "任意远敏";
  }
  if (/法系|远程魔法|法D|法职|远法/.test(token)) {
    return "任意法系";
  }
  return null;
}

function collectVacancySlotJobParts(text: string): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];

  for (const window of collectVacancyJobWindows(text)) {
    const positionMatches = [...window.text.matchAll(/(^|[^A-Za-z0-9])(MT|ST|H[12]|D[1-4])(?![A-Za-z0-9])/gi)]
      .map((match) => ({
        position: match[2].toUpperCase() as PositionKey,
        index: (match.index ?? 0) + match[1].length,
        length: match[2].length
      }))
      .filter((match) => FULL_PARTY_POSITION_KEYS.includes(match.position));

    for (let index = 0; index < positionMatches.length; index += 1) {
      const current = positionMatches[index];
      const next = positionMatches[index + 1];
      const segmentStart = current.index + current.length;
      const segmentEnd = next ? next.index : window.text.length;
      const segmentText = window.text.slice(segmentStart, segmentEnd);
      const jobs = collectPreferredJobsForPosition(segmentText, current.position);
      if (!jobs.length) {
        continue;
      }
      const currentJobs = slots[current.position] ? [...slots[current.position]!] : [];
      for (const job of jobs) {
        pushUnique(currentJobs, job);
      }
      slots[current.position] = currentJobs;
      matches.push({
        value: `${current.position}: ${jobs.join("/")}`,
        snippet: snippetAround(text, window.start + current.index, Math.max(current.length + segmentText.length, current.length)),
        index: window.start + current.index,
        confidence: "high"
      });
    }
  }

  return { slots, matches: dedupeMatches(matches) };
}

function createOpenPositionSet(positionValues: readonly string[], flexGroups: readonly PositionKey[][]): Set<PositionKey> {
  const openPositions = new Set<PositionKey>();
  for (const position of positionValues) {
    if (FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)) {
      openPositions.add(position as PositionKey);
    }
  }
  for (const group of flexGroups) {
    for (const position of group) {
      if (FULL_PARTY_POSITION_KEYS.includes(position)) {
        openPositions.add(position);
      }
    }
  }
  return openPositions;
}

function filterVacancySlotJobPartsByOpenPositions(
  vacancySlots: {
    slots: Partial<Record<PositionKey, string[]>>;
    matches: ParsedTextMatch[];
  },
  openPositions: ReadonlySet<PositionKey>
): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
} {
  if (!openPositions.size) {
    return vacancySlots;
  }

  const slots: Partial<Record<PositionKey, string[]>> = {};
  for (const [position, jobs] of Object.entries(vacancySlots.slots) as Array<[PositionKey, string[]]>) {
    if (!openPositions.has(position)) {
      continue;
    }
    const compatibleJobs = jobs.filter((job) => isJobLikelyForPosition(job, position));
    if (compatibleJobs.length) {
      slots[position] = compatibleJobs;
    }
  }

  const matches = vacancySlots.matches.filter((match) => {
    const [position] = match.value.split(":");
    return Boolean(position && slots[position as PositionKey]?.length);
  });
  return { slots, matches };
}

function filterVacancyJobMatchesByOpenPositions(
  jobs: ParsedTextMatch[],
  openPositions: ReadonlySet<PositionKey>
): ParsedTextMatch[] {
  if (!openPositions.size) {
    return jobs;
  }
  return jobs.filter((job) => {
    const role = rosterRoleForJob(job.value);
    if (!role) {
      return true;
    }
    return [...openPositions].some((position) => isJobLikelyForPosition(job.value, position));
  });
}

function collectVacancyFlexGroups(text: string): { groups: PositionKey[][]; matches: ParsedTextMatch[] } {
  const groups: PositionKey[][] = [];
  const matches: ParsedTextMatch[] = [];
  const addGroup = (positions: PositionKey[], index: number, length: number, confidence: NgaParseConfidence = "high") => {
    const group = uniqueValues(positions).filter((position) => FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)) as PositionKey[];
    if (group.length < 2 || groups.some((existing) => existing.join("/") === group.join("/"))) {
      return;
    }
    groups.push(group);
    matches.push({
      value: group.join("/"),
      snippet: snippetAround(text, index, length),
      index,
      confidence
    });
  };

  const positionListRe = createPositionAltListRegExp();
  for (const match of text.matchAll(positionListRe)) {
    if (!isDirectVacancyFlexContext(text, match.index ?? 0)) {
      continue;
    }
    const prefix = match[1].toUpperCase();
    const positions = (match[2].match(/[1-4]/g) ?? []).map((digit) => `${prefix}${digit}` as PositionKey);
    addGroup(positions, match.index, match[0].length);
  }

  const positionGroupRe = createPositionAltPairRegExp();
  for (const match of text.matchAll(positionGroupRe)) {
    if (!isDirectVacancyFlexContext(text, match.index ?? 0)) {
      continue;
    }
    const positions = expandPositionRange(match[1].toUpperCase(), Number(match[2]), Number(match[3]), false) as PositionKey[];
    addGroup(positions, match.index, match[0].length);
  }

  const explicitPositionFlexRe = new RegExp(
    String.raw`(^|[^A-Za-z0-9])((?:MT|ST|H[12]|D[1-4]))${POSITION_ALT_SEPARATOR_SPACED_PATTERN}((?:MT|ST|H[12]|D[1-4]))(?![A-Za-z0-9])`,
    "gi"
  );
  for (const match of text.matchAll(explicitPositionFlexRe)) {
    const prefixLength = match[1]?.length ?? 0;
    const index = (match.index ?? 0) + prefixLength;
    if (!isDirectVacancyFlexContext(text, index)) {
      continue;
    }
    const positions = uniqueValues([match[2].toUpperCase(), match[3].toUpperCase()]).filter((position) =>
      FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)
    ) as PositionKey[];
    addGroup(positions, index, match[0].length - prefixLength);
  }

  for (const teamSize of collectTeamSizeVacancyWindows(text)) {
    const start = teamSize.start;
    const window = teamSize.window.slice(0, 80);
    const hasSingleRole = (pattern: string, pluralPattern: string) => {
      const countedRe = new RegExp(String.raw`(^|[^A-Za-z0-9])(?:1|一|一个|1个)\s*(?:${pattern})(?![A-Za-z])`, "i");
      const uncountedRe = new RegExp(String.raw`(^|[^A-Za-z0-9])(?:${pattern})(?![A-Za-z0-9])`, "i");
      return (countedRe.test(window) || uncountedRe.test(window)) && !new RegExp(pluralPattern, "i").test(window);
    };
    if (hasSingleRole(String.raw`T|坦克|盾|蓝职`, String.raw`(?:2|二|两|双)\s*(?:T|坦克|盾|蓝职)`)) {
      addGroup(["MT", "ST"], start, Math.min(window.length, 24));
    }
    if (hasSingleRole(String.raw`H|N|奶|治疗|绿职`, String.raw`(?:2|二|两|双)\s*(?:H|N|奶|治疗|绿职)`)) {
      addGroup(["H1", "H2"], start, Math.min(window.length, 24));
    }
    if (hasSingleRole(String.raw`近战|近D`, String.raw`(?:2|二|两|双)\s*(?:近战|近D)`)) {
      addGroup(["D1", "D2"], start, Math.min(window.length, 24));
    }
  }

  const directRoleFlexRe =
    /(?:^|[\s,，。；;\n(（])((?:现(?:在)?|当前|目前)?(?:需求|招募|缺|补|来(?:个|点)?|找|许愿|希望|倾向|优先)(?:职位|位置|职业)?|需求职业|招募职业|招募职位|招募位置|需求位置)\s*[:：]?\s*(?:一个|1个?|一名|一位)?\s*(T(?![A-Za-z0-9])|H(?![A-Za-z0-9])|N(?![A-Za-z0-9])|DPS|坦克|盾|蓝职|奶|治疗|绿职|近战|近D|红职)/gi;
  for (const match of text.matchAll(directRoleFlexRe)) {
    const marker = match[1] ?? "";
    const token = match[2] ?? "";
    const markerIndex = (match.index ?? 0) + match[0].indexOf(marker);
    if (/^招募要求/.test(text.slice(markerIndex, markerIndex + 8))) {
      continue;
    }
    const positions = normalizePositionToken(token) as PositionKey[];
    if (positions.length > 1) {
      addGroup(positions, markerIndex, match[0].length - Math.max(0, markerIndex - (match.index ?? 0)));
    }
  }

  const roleFlexRe =
    /(?:缺|招|补|需求|招募|任意|来|找)\s*(?:职位|位置|职业)?\s*[:：]?\s*(?:一个|1个?|一名|一位)?\s*(T(?![A-Za-z0-9])|H(?![A-Za-z0-9])|N(?![A-Za-z0-9])|坦克|盾|蓝职|奶|治疗|绿职|近战|近D|DPS|红职)/gi;
  for (const match of text.matchAll(roleFlexRe)) {
    if (!isDirectVacancyFlexContext(text, match.index ?? 0)) {
      continue;
    }
    const token = match[1];
    const positions = normalizePositionToken(token) as PositionKey[];
    if (positions.length > 1) {
      addGroup(positions, match.index, match[0].length);
    }
  }

  return { groups, matches: dedupeMatches(matches) };
}

function isDirectVacancyFlexContext(text: string, index: number): boolean {
  if (isExistingRosterContext(text, index) || isRosterReferencePositionContext(text, index) || !isLikelyVacancyPositionContext(text, index)) {
    return false;
  }
  const before = text.slice(Math.max(0, index - 120), index);
  const lastExisting = lastIndexOfAny(before, EXISTING_ROSTER_MARKERS);
  if (lastExisting < 0) {
    return true;
  }
  const afterExisting = before.slice(lastExisting);
  return lastIndexOfAny(afterExisting, VACANCY_CONTEXT_MARKERS) >= 0 || matchesTeamSizeLike(afterExisting);
}

function trimVacancyWindowAtExistingRoster(window: string): string {
  return window.split(new RegExp(ROSTER_CONTEXT_MARKER_RE_SOURCE, "i"))[0] ?? window;
}

function collectVacancyJobWindows(text: string): Array<{ text: string; start: number }> {
  const windows: Array<{ text: string; start: number }> = [];
  const demandWindowRe =
    /(?:许愿|希望|最好|倾向|优先|需求职业|招募职业|招募情况|目前需求|(?:^|[\s,，。；;\n(（])(?:需求|招募|缺|补|来(?:个|点)?|找))[^\n。；;]{0,120}/gi;
  for (const match of text.matchAll(demandWindowRe)) {
    if (!match[0] || /招募要求/.test(match[0])) {
      continue;
    }
    windows.push({ text: trimVacancyJobWindow(match[0]), start: match.index ?? 0 });
  }
  return windows;
}

function collectPreferredJobsForPosition(text: string, position: PositionKey): string[] {
  const positiveText = stripNegatedJobText(text);
  const jobs = collectRosterJobs(positiveText);
  const add = (value: string) => pushUnique(jobs, value);

  if (position === "MT" || position === "ST") {
    if (/黑(?!魔|魔法师|爷)/.test(positiveText)) {
      add("暗黑骑士");
    }
    if (/枪|枪刃|绝枪/.test(positiveText)) {
      add("绝枪战士");
    }
    if (/战士|(?<!近)战(?!D)/.test(positiveText)) {
      add("战士");
    }
    if (/骑士|(?<!黑|暗)骑/.test(positiveText)) {
      add("骑士");
    }
  }
  if (position === "H1" || position === "H2") {
    if (/白/.test(positiveText)) {
      add("白魔法师");
    }
    if (/学/.test(positiveText)) {
      add("学者");
    }
    if (/占/.test(positiveText)) {
      add("占星术士");
    }
    if (/贤/.test(positiveText)) {
      add("贤者");
    }
  }
  if (position === "D1" || position === "D2") {
    if (/侍|武士|盘/.test(positiveText)) {
      add("武士");
    }
    if (/龙/.test(positiveText)) {
      add("龙骑士");
    }
    if (/忍/.test(positiveText)) {
      add("忍者");
    }
    if (/僧|武僧/.test(positiveText)) {
      add("武僧");
    }
    if (/蛇|蝰/.test(positiveText)) {
      add("蝰蛇剑士");
    }
    if (/镰/.test(positiveText)) {
      add("钐镰客");
    }
  }
  if (position === "D3") {
    if (/诗/.test(positiveText)) {
      add("吟游诗人");
    }
    if (/舞/.test(positiveText)) {
      add("舞者");
    }
    if (/机/.test(positiveText)) {
      add("机工士");
    }
  }
  if (position === "D4") {
    if (/黑(?!骑)|黑魔|黑爷|黑黑/.test(positiveText)) {
      add("黑魔法师");
    }
    if (/画|绘灵/.test(positiveText)) {
      add("绘灵法师");
    }
    if (/赤|吃馍/.test(positiveText)) {
      add("赤魔法师");
    }
    if (/召/.test(positiveText)) {
      add("召唤师");
    }
  }

  return uniqueValues(jobs).filter((job) => isJobLikelyForPosition(job, position));
}

function stripNegatedJobText(text: string): string {
  return text.replace(/(?:但|、|，|,|;|；|\s|^)(?:非|不要|不接受|排除)[^,，。；;、\s]{0,12}/g, " ");
}

function collectRosterSlotParts(text: string): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
  flexGroups: PositionKey[][];
  flexMatches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const flexGroups: PositionKey[][] = [];
  const flexMatches: ParsedTextMatch[] = [];
  const strongGlobalVacancyPositionParts = collectExplicitTeamSizeVacancyPositionParts(text);
  const globalVacancyPositionSource = strongGlobalVacancyPositionParts.length
    ? strongGlobalVacancyPositionParts
    : collectPositionParts(text, "vacancy");
  const globalVacancyPositions = new Set(
    globalVacancyPositionSource
      .filter((match) => match.confidence !== "low")
      .map((match) => match.value as PositionKey)
      .filter((position) => FULL_PARTY_POSITION_KEYS.includes(position))
  );

  const declaredRoster = collectRosterSlotsFromDeclaredPositionListAndMembers(text);
  for (const [position, jobs] of Object.entries(declaredRoster.slots) as Array<[PositionKey, string[]]>) {
    mergeRosterSlotJobs(slots, position, jobs);
  }
  matches.push(...declaredRoster.matches);
  for (const group of declaredRoster.flexGroups) {
    if (!flexGroups.some((existing) => existing.join("/") === group.join("/"))) {
      flexGroups.push(group);
    }
  }
  flexMatches.push(...declaredRoster.flexMatches);

  const roleOrderedRoster = collectRoleOrderedRosterCompositionParts(text, globalVacancyPositions);
  for (const [position, jobs] of Object.entries(roleOrderedRoster.slots) as Array<[PositionKey, string[]]>) {
    mergeRosterSlotJobs(slots, position, jobs);
  }
  matches.push(...roleOrderedRoster.matches);
  for (const group of roleOrderedRoster.flexGroups) {
    if (!flexGroups.some((existing) => existing.join("/") === group.join("/"))) {
      flexGroups.push(group);
    }
  }
  flexMatches.push(...roleOrderedRoster.flexMatches);

  for (const segment of collectExistingRosterSegments(text)) {
    const listedRoster = collectRosterSlotsFromPositionListAndMemberJobs(text, segment);
    for (const [position, jobs] of Object.entries(listedRoster.slots) as Array<[PositionKey, string[]]>) {
      mergeRosterSlotJobs(slots, position, jobs);
    }
    matches.push(...listedRoster.matches);
    for (const group of listedRoster.flexGroups) {
      if (!flexGroups.some((existing) => existing.join("/") === group.join("/"))) {
        flexGroups.push(group);
      }
    }
    flexMatches.push(...listedRoster.flexMatches);
    const hasListedRosterSlots = Object.keys(listedRoster.slots).length > 0;

    if (!hasListedRosterSlots) {
      const inlineFlexSlots = collectInlineRosterFlexSlotParts(text, segment);
      for (const [position, jobs] of Object.entries(inlineFlexSlots.slots) as Array<[PositionKey, string[]]>) {
        mergeRosterSlotJobs(slots, position, jobs);
      }
      matches.push(...inlineFlexSlots.matches);
      for (const group of inlineFlexSlots.flexGroups) {
        if (!flexGroups.some((existing) => existing.join("/") === group.join("/"))) {
          flexGroups.push(group);
        }
      }
      flexMatches.push(...inlineFlexSlots.flexMatches);
    }

    const countedRoleRosterSlots = collectCountedRoleRosterSlotParts(text, segment, globalVacancyPositions);
    for (const [position, jobs] of Object.entries(countedRoleRosterSlots.slots) as Array<[PositionKey, string[]]>) {
      mergeRosterSlotJobs(slots, position, jobs);
    }
    matches.push(...countedRoleRosterSlots.matches);
    const hasCountedRoleRosterSlots = Object.keys(countedRoleRosterSlots.slots).length > 0;

    if (!hasListedRosterSlots) {
      const compactPrefixSlots = collectCompactPositionPrefixRosterParts(text, segment, globalVacancyPositions);
      for (const [position, jobs] of Object.entries(compactPrefixSlots.slots) as Array<[PositionKey, string[]]>) {
        mergeRosterSlotJobs(slots, position, jobs);
      }
      matches.push(...compactPrefixSlots.matches);

      const positionMatches = [...segment.text.matchAll(/(^|[^A-Za-z0-9])(MT|ST|H[12]|D[1-4])(?![A-Za-z0-9])/gi)]
        .map((match) => ({
          position: match[2].toUpperCase() as PositionKey,
          index: (match.index ?? 0) + match[1].length,
          length: match[2].length
        }))
        .filter((match) => FULL_PARTY_POSITION_KEYS.includes(match.position));

      for (const suffixMatch of collectPositionSuffixRosterSlotParts(text, segment, positionMatches)) {
        const currentJobs = slots[suffixMatch.position] ? [...slots[suffixMatch.position]!] : [];
        for (const job of suffixMatch.jobs) {
          pushUnique(currentJobs, job);
        }
        slots[suffixMatch.position] = currentJobs;
        matches.push({
          value: `${suffixMatch.position}: ${suffixMatch.jobs.join("/")}`,
          snippet: suffixMatch.snippet,
          index: suffixMatch.index,
          confidence: "high"
        });
      }

      for (let index = 0; index < positionMatches.length; index += 1) {
        const current = positionMatches[index];
        if (globalVacancyPositions.has(current.position) || isPositionSuffixMarker(segment.text, current.index, current.length)) {
          continue;
        }
        const next = positionMatches[index + 1];
        const slotStart = current.index + current.length;
        const slotEnd = next ? next.index : segment.text.length;
        const slotText = extractRosterSlotJobText(segment.text.slice(slotStart, slotEnd));
        const jobs = collectRosterJobsForPosition(slotText, current.position);
        if (!jobs.length) {
          continue;
        }
        mergeRosterSlotJobs(slots, current.position, jobs);
        matches.push({
          value: `${current.position}: ${jobs.join("/")}`,
          snippet: snippetAround(text, segment.start + current.index, Math.max(current.length + slotText.length, current.length)),
          index: segment.start + current.index,
          confidence: "high"
        });
      }

      if (!hasCountedRoleRosterSlots) {
        const compactRoster = collectCompactRosterSlotParts(text, segment, globalVacancyPositions);
        for (const [position, jobs] of Object.entries(compactRoster.slots) as Array<[PositionKey, string[]]>) {
          if (slots[position]?.length) {
            continue;
          }
          mergeRosterSlotJobs(slots, position, jobs);
        }
        matches.push(...compactRoster.matches);
      }
    }

    const localFlexGroups = collectRosterFlexGroupsFromSegment(text, segment);
    for (const group of localFlexGroups.groups) {
      if (!flexGroups.some((existing) => existing.join("/") === group.join("/"))) {
        flexGroups.push(group);
      }
    }
    flexMatches.push(...localFlexGroups.matches);
  }

  const dualTankD34 = collectDualTankD34RosterParts(text);
  for (const [position, jobs] of Object.entries(dualTankD34.slots) as Array<[PositionKey, string[]]>) {
    if (slots[position]?.length) {
      continue;
    }
    slots[position] = jobs;
  }
  matches.push(...dualTankD34.matches);

  return { slots, matches: dedupeMatches(matches), flexGroups, flexMatches: dedupeMatches(flexMatches) };
}

function extractRosterSlotJobText(text: string): string {
  const trimmed = text.replace(/^[\s:：]+/, "");
  if (!trimmed || /^[,，、;；\n/\\]/.test(trimmed)) {
    return "";
  }
  if (/^(?:均可|都可|都可以|可切|可以打|可打|任意)/.test(trimmed)) {
    return "";
  }
  const firstJob = collectRosterJobMatches(trimmed)[0];
  if (!firstJob || firstJob.index > 4) {
    return "";
  }
  return trimmed;
}

function mergeRosterSlotJobs(slots: Partial<Record<PositionKey, string[]>>, position: PositionKey, jobs: string[]): void {
  const currentJobs = slots[position] ? [...slots[position]!] : [];
  for (const job of jobs) {
    pushUnique(currentJobs, job);
  }
  slots[position] = currentJobs;
}

function collectRosterJobsForPosition(text: string, position: PositionKey): string[] {
  const role = positionToRosterRole(position);
  const jobs = uniqueValues([...collectRosterJobs(text), ...(role ? collectRoleCompactJobs(text, role) : [])]);
  if (!jobs.length) {
    const crossRoleJobs = collectAnyRoleCompactJobs(text);
    if (crossRoleJobs.length && isSpecificRosterJobText(text)) {
      return crossRoleJobs;
    }
    return collectGenericRosterJobsForPosition(text, position);
  }
  const filteredJobs = jobs.filter((job) => isJobLikelyForPosition(job, position));
  if (filteredJobs.length) {
    return uniqueValues([...filteredJobs, ...collectRoleWideRosterAltJobs(text, role)]);
  }
  if (jobs.length && isSpecificRosterJobText(text)) {
    return jobs;
  }
  const crossRoleJobs = collectAnyRoleCompactJobs(text);
  if (crossRoleJobs.length && isSpecificRosterJobText(text)) {
    return crossRoleJobs;
  }
  return collectGenericRosterJobsForPosition(text, position);
}

function isSpecificRosterJobText(text: string): boolean {
  const cleaned = cleanText(text).replace(/[\/\\|、,，;；（）()\[\]【】]/g, "");
  return cleaned.length > 0 && cleaned.length <= 12 && !/(?:近战|近D|远敏|远程|法系|法D|法职|红职|蓝职|绿职|坦克|治疗|奶|盾|DPS)/i.test(text);
}

function collectAnyRoleCompactJobs(text: string): string[] {
  return uniqueValues([
    ...collectRoleCompactJobs(text, "tank"),
    ...collectRoleCompactJobs(text, "healer"),
    ...collectRoleCompactJobs(text, "melee"),
    ...collectRoleCompactJobs(text, "ranged"),
    ...collectRoleCompactJobs(text, "caster")
  ]);
}

function collectRoleWideRosterAltJobs(
  text: string,
  role: "tank" | "healer" | "melee" | "ranged" | "caster" | null
): string[] {
  if (!role || !/(?:其[他它]|其他|其它|同职能|本职能|全职业|全职|任意|都可|均可|皆可)/.test(text)) {
    return [];
  }
  return rosterJobsForRole(role);
}

function collectGenericRosterJobsForPosition(text: string, position: PositionKey): string[] {
  if ((position === "D1" || position === "D2") && /近战|近D/.test(text)) {
    return ["任意近战"];
  }
  if (position === "D3" && /远敏|远程物理/.test(text)) {
    return ["任意远敏"];
  }
  if (position === "D4" && /法系|远法|远程魔法/.test(text)) {
    return ["任意法系"];
  }
  return [];
}

function positionToRosterRole(position: PositionKey): "tank" | "healer" | "melee" | "ranged" | "caster" | null {
  if (position === "MT" || position === "ST") {
    return "tank";
  }
  if (position === "H1" || position === "H2") {
    return "healer";
  }
  if (position === "D1" || position === "D2") {
    return "melee";
  }
  if (position === "D3") {
    return "ranged";
  }
  if (position === "D4") {
    return "caster";
  }
  return null;
}

function rosterRoleForJob(job: string): "tank" | "healer" | "melee" | "ranged" | "caster" | null {
  if (["骑士", "战士", "暗黑骑士", "绝枪战士"].includes(job)) {
    return "tank";
  }
  if (["白魔法师", "学者", "占星术士", "贤者"].includes(job)) {
    return "healer";
  }
  if (["武士", "龙骑士", "忍者", "武僧", "蝰蛇剑士", "钐镰客", "任意近战"].includes(job)) {
    return "melee";
  }
  if (["吟游诗人", "舞者", "机工士", "任意远敏"].includes(job)) {
    return "ranged";
  }
  if (["黑魔法师", "绘灵法师", "赤魔法师", "召唤师", "任意法系"].includes(job)) {
    return "caster";
  }
  return null;
}

function isJobLikelyForPosition(job: string, position: PositionKey): boolean {
  if (position === "MT" || position === "ST") {
    return ["骑士", "战士", "暗黑骑士", "绝枪战士"].includes(job);
  }
  if (position === "H1" || position === "H2") {
    return ["白魔法师", "学者", "占星术士", "贤者"].includes(job);
  }
  if (position === "D1" || position === "D2") {
    return ["武士", "龙骑士", "忍者", "武僧", "蝰蛇剑士", "钐镰客", "任意近战"].includes(job);
  }
  if (position === "D3") {
    return ["吟游诗人", "舞者", "机工士", "任意远敏"].includes(job);
  }
  if (position === "D4") {
    return ["黑魔法师", "绘灵法师", "赤魔法师", "召唤师", "任意法系"].includes(job);
  }
  return true;
}

function collectRosterSlotsFromDeclaredPositionListAndMembers(text: string): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
  flexGroups: PositionKey[][];
  flexMatches: ParsedTextMatch[];
} {
  const memberMarker = /(?:已有队员|现有队员|队员|成员)[:：]?/i.exec(text);
  if (!memberMarker) {
    return { slots: {}, matches: [], flexGroups: [], flexMatches: [] };
  }
  const memberStart = memberMarker.index + memberMarker[0].length;
  const before = text.slice(Math.max(0, memberMarker.index - 1600), memberMarker.index);
  const markerMatches = [
    ...before.matchAll(/(?:队伍情况|队伍配置|队内配置|当前配置|当前阵容|目前配置|目前阵容|现有阵容|已有|现有)[:：]?/gi)
  ];
  const beforeAbsoluteStart = Math.max(0, memberMarker.index - 1600);
  let positionGroups: Array<{ positions: PositionKey[]; index: number; length: number }> = [];
  for (const marker of markerMatches.reverse()) {
    const headerStart = marker.index ?? 0;
    const headerAbsoluteStart = beforeAbsoluteStart + headerStart;
    const header = before.slice(headerStart);
    const groups = collectRosterPositionGroups(header, headerAbsoluteStart);
    if (groups.length >= 2) {
      positionGroups = groups;
      break;
    }
  }
  if (!positionGroups.length) {
    return { slots: {}, matches: [], flexGroups: [], flexMatches: [] };
  }
  const memberText = text.slice(memberStart, Math.min(text.length, memberStart + 520));
  let memberJobs = collectRosterMemberJobMatches(memberText);
  if (memberJobs.length < Math.min(3, positionGroups.length)) {
    memberJobs = collectLooseRosterMemberJobMatches(memberText).slice(0, positionGroups.length);
  }
  return assignRosterMemberJobsToPositionGroups(text, positionGroups, memberJobs, memberStart);
}

function collectRosterSlotsFromPositionListAndMemberJobs(
  fullText: string,
  segment: { text: string; start: number; end: number; bodyStart: number }
): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
  flexGroups: PositionKey[][];
  flexMatches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const flexGroups: PositionKey[][] = [];
  const flexMatches: ParsedTextMatch[] = [];
  const header = segment.text.slice(segment.bodyStart, findRosterHeaderEnd(segment.text, segment.bodyStart));
  const positionGroups = collectRosterPositionGroups(header, segment.start + segment.bodyStart);
  if (!positionGroups.length) {
    return { slots, matches, flexGroups, flexMatches };
  }

  const headerMemberList = extractRosterMemberListFromHeader(header);
  const memberMarker = /(?:已有队员|现有队员|队员|成员)[:：]?/i.exec(segment.text);
  if (!memberMarker && !headerMemberList) {
    return { slots, matches, flexGroups, flexMatches };
  }
  const memberStart = memberMarker ? (memberMarker.index ?? 0) + memberMarker[0].length : 0;
  const memberText = headerMemberList?.text ?? segment.text.slice(memberStart);
  const memberAbsoluteStart = headerMemberList
    ? segment.start + segment.bodyStart + headerMemberList.index
    : segment.start + memberStart;
  let memberJobs = headerMemberList
    ? collectLooseRosterMemberJobMatches(memberText).slice(0, positionGroups.length)
    : collectRosterMemberJobMatches(memberText).slice(0, positionGroups.length);
  if (!headerMemberList && memberJobs.length < Math.min(3, positionGroups.length)) {
    memberJobs = collectLooseRosterMemberJobMatches(memberText).slice(0, positionGroups.length);
  }
  if (memberJobs.length < Math.min(3, positionGroups.length)) {
    return { slots, matches, flexGroups, flexMatches };
  }

  const assigned = assignRosterMemberJobsToPositionGroups(fullText, positionGroups, memberJobs, memberAbsoluteStart);
  return assigned;
}

interface RosterMemberJobMatch {
  value: string;
  values?: string[];
  index: number;
  length: number;
}

function assignRosterMemberJobsToPositionGroups(
  fullText: string,
  positionGroups: Array<{ positions: PositionKey[]; index: number; length: number }>,
  memberJobs: RosterMemberJobMatch[],
  memberAbsoluteStart: number
): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
  flexGroups: PositionKey[][];
  flexMatches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const flexGroups: PositionKey[][] = [];
  const flexMatches: ParsedTextMatch[] = [];
  if (memberJobs.length < Math.min(3, positionGroups.length)) {
    return { slots, matches, flexGroups, flexMatches };
  }

  const usedJobs = new Set<number>();
  for (const group of positionGroups) {
    const jobIndex = findBestRosterMemberJobIndex(group.positions, memberJobs, usedJobs);
    if (jobIndex < 0) {
      continue;
    }
    usedJobs.add(jobIndex);
    const job = memberJobs[jobIndex];
    const jobs = job.values?.length ? job.values : [job.value];
    for (const position of group.positions) {
      mergeRosterSlotJobs(slots, position, jobs);
    }
    matches.push({
      value: `${group.positions.join("/")}: ${jobs.join("/")}`,
      snippet: snippetAround(fullText, memberAbsoluteStart + job.index, job.length),
      index: memberAbsoluteStart + job.index,
      confidence: "high"
    });
    if (group.positions.length > 1) {
      flexGroups.push(group.positions);
      flexMatches.push({
        value: group.positions.join("/"),
        snippet: snippetAround(fullText, group.index, group.length),
        index: group.index,
        confidence: "high"
      });
    }
  }

  return { slots, matches, flexGroups, flexMatches };
}

function findBestRosterMemberJobIndex(
  positions: PositionKey[],
  memberJobs: RosterMemberJobMatch[],
  usedJobs: Set<number>
): number {
  const roleFitIndex = memberJobs.findIndex(
    (job, index) =>
      !usedJobs.has(index) &&
      positions.some((position) => (job.values?.length ? job.values : [job.value]).some((value) => isJobLikelyForPosition(value, position)))
  );
  if (roleFitIndex >= 0) {
    return roleFitIndex;
  }
  return memberJobs.findIndex((_, index) => !usedJobs.has(index));
}

function collectInlineRosterFlexSlotParts(
  fullText: string,
  segment: { text: string; start: number; end: number; bodyStart: number }
): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
  flexGroups: PositionKey[][];
  flexMatches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const flexGroups: PositionKey[][] = [];
  const flexMatches: ParsedTextMatch[] = [];
  const flexRe = new RegExp(
    String.raw`\b([HD])([1-4])${POSITION_ALT_SEPARATOR_SPACED_PATTERN}(?:\1)?([1-4])\b\s*([^,，。；;\n]{0,24})`,
    "gi"
  );
  const roleFlexRe = new RegExp(
    String.raw`\b(MT|ST|H[12]|D[1-4])${POSITION_ALT_SEPARATOR_SPACED_PATTERN}(MT|ST|H[12]|D[1-4])\b\s*[（(]([^）)\n]{1,36})[)）]`,
    "gi"
  );

  for (const match of segment.text.matchAll(roleFlexRe)) {
    const positions = uniqueValues([match[1].toUpperCase(), match[2].toUpperCase()]).filter((position) =>
      FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)
    ) as PositionKey[];
    if (positions.length < 2) {
      continue;
    }
    const role = positionToRosterRole(positions[0]);
    if (!role || positions.some((position) => positionToRosterRole(position) !== role)) {
      continue;
    }
    const jobs = collectCompactAltJobs(match[3] ?? "", role);
    if (!jobs.length) {
      continue;
    }
    for (const position of positions) {
      mergeRosterSlotJobs(slots, position, jobs);
    }
    flexGroups.push(positions);
    const absoluteIndex = segment.start + (match.index ?? 0);
    matches.push({
      value: `${positions.join("/")}: ${jobs.join("/")}`,
      snippet: snippetAround(fullText, absoluteIndex, match[0].length),
      index: absoluteIndex,
      confidence: "high"
    });
    flexMatches.push({
      value: positions.join("/"),
      snippet: snippetAround(fullText, absoluteIndex, match[0].length),
      index: absoluteIndex,
      confidence: "high"
    });
  }

  for (const match of segment.text.matchAll(flexRe)) {
    const positions = expandPositionRange(match[1].toUpperCase(), Number(match[2]), Number(match[3]), false) as PositionKey[];
    const jobs = collectRosterJobsForPosition(match[4] ?? "", positions[0]);
    if (positions.length < 2 || !jobs.length) {
      continue;
    }
    for (const position of positions) {
      mergeRosterSlotJobs(slots, position, jobs);
    }
    flexGroups.push(positions);
    const absoluteIndex = segment.start + (match.index ?? 0);
    matches.push({
      value: `${positions.join("/")}: ${jobs.join("/")}`,
      snippet: snippetAround(fullText, absoluteIndex, match[0].length),
      index: absoluteIndex,
      confidence: "high"
    });
    flexMatches.push({
      value: positions.join("/"),
      snippet: snippetAround(fullText, absoluteIndex, match[0].length),
      index: absoluteIndex,
      confidence: "high"
    });
  }

  return { slots, matches, flexGroups, flexMatches };
}

function collectCompactPositionPrefixRosterParts(
  fullText: string,
  segment: { text: string; start: number; end: number; bodyStart: number },
  globalVacancyPositions: Set<PositionKey>
): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const parenPrefixRe = /\b(MT|ST|H[12]|D[1-4])\s*[（(]([^）)\n]{1,48})[)）]/gi;
  const prefixRe = new RegExp(
    String.raw`\b(MT|ST|H[12]|D[1-4])\s*([A-Za-z\u4e00-\u9fa5]+(?:${POSITION_LIST_SEPARATOR_SPACED_PATTERN}[A-Za-z\u4e00-\u9fa5]+)*?)(?=\s*(?:MT|ST|H[12]|D[1-4])\b|[,，。；;\n]|$)`,
    "gi"
  );

  for (const match of segment.text.matchAll(parenPrefixRe)) {
    const position = match[1].toUpperCase() as PositionKey;
    if (!FULL_PARTY_POSITION_KEYS.includes(position) || globalVacancyPositions.has(position)) {
      continue;
    }
    const role = positionToRosterRole(position);
    const rawJobs = match[2] ?? "";
    const jobs = role ? collectCompactAltJobs(rawJobs, role) : collectRosterJobsForPosition(rawJobs, position);
    if (!jobs.length) {
      continue;
    }
    mergeRosterSlotJobs(slots, position, jobs);
    matches.push({
      value: `${position}: ${jobs.join("/")}`,
      snippet: snippetAround(fullText, segment.start + (match.index ?? 0), match[0].length),
      index: segment.start + (match.index ?? 0),
      confidence: "high"
    });
  }

  for (const match of segment.text.matchAll(prefixRe)) {
    const position = match[1].toUpperCase() as PositionKey;
    if (!FULL_PARTY_POSITION_KEYS.includes(position)) {
      continue;
    }
    const rawJobs = match[2] ?? "";
    const jobs = collectRosterJobsForPosition(rawJobs, position);
    if (globalVacancyPositions.has(position)) {
      continue;
    }
    if (!jobs.length) {
      continue;
    }
    mergeRosterSlotJobs(slots, position, jobs);
    matches.push({
      value: `${position}: ${jobs.join("/")}`,
      snippet: snippetAround(fullText, segment.start + (match.index ?? 0), match[0].length),
      index: segment.start + (match.index ?? 0),
      confidence: "high"
    });
  }

  return { slots, matches: dedupeMatches(matches) };
}

function collectCountedRoleRosterSlotParts(
  fullText: string,
  segment: { text: string; start: number; end: number; bodyStart: number },
  globalVacancyPositions: Set<PositionKey>
): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const countedRoleRe =
    /((?:双|两|2)\s*(?:T(?![A-Za-z0-9])|坦克|坦|盾|蓝职|H(?![A-Za-z0-9])|N(?![A-Za-z0-9])|奶|治疗|绿职|近战|近D|近))\s*([^,，。；;\n]{1,72})/gi;

  for (const match of segment.text.matchAll(countedRoleRe)) {
    const positions = expandCountedRosterPositions(match[1]).filter((position) => !globalVacancyPositions.has(position));
    if (positions.length < 2) {
      continue;
    }
    const role = positionToRosterRole(positions[0]);
    if (!role || positions.some((position) => positionToRosterRole(position) !== role)) {
      continue;
    }
    const rawJobs = (match[2] ?? "").replace(/^(?:[:：\s+＋、,，/／|｜&~～或和及与同])+/, "").trim();
    const assignments = assignCountedRoleRosterJobs(rawJobs, positions, role);
    if (!assignments.length) {
      continue;
    }

    for (const assignment of assignments) {
      mergeRosterSlotJobs(slots, assignment.position, assignment.jobs);
    }
    matches.push({
      value: assignments.map((assignment) => `${assignment.position}: ${assignment.jobs.join("/")}`).join("、"),
      snippet: snippetAround(fullText, segment.start + (match.index ?? 0), match[0].length),
      index: segment.start + (match.index ?? 0),
      confidence: "high"
    });
  }

  return { slots, matches: dedupeMatches(matches) };
}

function assignCountedRoleRosterJobs(
  rawJobs: string,
  positions: PositionKey[],
  role: NonNullable<ReturnType<typeof positionToRosterRole>>
): Array<{ position: PositionKey; jobs: string[] }> {
  const chunks = rawJobs
    .split(/[+＋]/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length >= positions.length) {
    const assignments: Array<{ position: PositionKey; jobs: string[] }> = [];
    for (let index = 0; index < positions.length; index += 1) {
      const jobs = collectCompactAltJobs(chunks[index], role).filter((job) => isJobLikelyForPosition(job, positions[index]));
      if (!jobs.length) {
        return [];
      }
      assignments.push({ position: positions[index], jobs });
    }
    return assignments;
  }

  const jobs = collectRoleCompactJobs(rawJobs, role).filter((job) =>
    positions.some((position) => isJobLikelyForPosition(job, position))
  );
  if (jobs.length === positions.length) {
    return positions.map((position, index) => ({ position, jobs: [jobs[index]] }));
  }

  return [];
}

function findRosterHeaderEnd(text: string, start: number): number {
  const tail = text.slice(start);
  const boundary = /(?:队内无|无CP|招募要求|需求|要求|开荒时间|活动时间|上班时间|时间|联系|lxfs|攻略|进度)/i.exec(tail);
  return boundary ? start + boundary.index : Math.min(text.length, start + 120);
}

function collectRosterPositionGroups(header: string, absoluteStart: number): Array<{ positions: PositionKey[]; index: number; length: number }> {
  const groups: Array<{ positions: PositionKey[]; index: number; length: number }> = [];
  const coveredRanges: Array<{ start: number; end: number }> = [];
  const longListRe = createPositionListRegExp();
  for (const match of header.matchAll(longListRe)) {
    const prefix = match[1].toUpperCase();
    const digits = match[2].match(/[1-4]/g) ?? [];
    if (digits.length < 3) {
      continue;
    }
    const index = absoluteStart + (match.index ?? 0);
    for (const digit of digits) {
      const position = `${prefix}${digit}` as PositionKey;
      if (FULL_PARTY_POSITION_KEYS.includes(position)) {
        groups.push({ positions: [position], index, length: match[0].length });
      }
    }
    coveredRanges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }

  const groupRe = new RegExp(
    String.raw`\b(MT|ST|H[12]|D[1-4])${POSITION_ALT_SEPARATOR_SPACED_PATTERN}(MT|ST|H[12]|D[1-4])\b|\b([HD])([1-4])${POSITION_ALT_SEPARATOR_SPACED_PATTERN}(?:\3)?([1-4])\b|\b(MT|ST|H[12]|D[1-4])\b|((?:双|两|2)\s*(?:T|坦克|坦|盾|蓝职|H|N|奶|治疗|绿职|近战|近D|近))`,
    "gi"
  );
  for (const match of header.matchAll(groupRe)) {
    const localIndex = match.index ?? 0;
    if (coveredRanges.some((range) => localIndex >= range.start && localIndex < range.end)) {
      continue;
    }
    const index = absoluteStart + (match.index ?? 0);
    let positions: PositionKey[] = [];
    if (match[1] && match[2]) {
      positions = [match[1].toUpperCase() as PositionKey, match[2].toUpperCase() as PositionKey];
    } else if (match[3] && match[4] && match[5]) {
      positions = expandPositionRange(match[3].toUpperCase(), Number(match[4]), Number(match[5]), false) as PositionKey[];
    } else if (match[6]) {
      positions = [match[6].toUpperCase() as PositionKey];
    } else if (match[7]) {
      positions = expandCountedRosterPositions(match[7]);
    }
    positions = uniqueValues(positions).filter((position) => FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)) as PositionKey[];
    if (positions.length) {
      const firstRole = positionToRosterRole(positions[0]);
      const isCrossRoleSequence = positions.length > 1 && positions.some((position) => positionToRosterRole(position) !== firstRole);
      if (isCrossRoleSequence) {
        for (const position of positions) {
          groups.push({ positions: [position], index, length: match[0].length });
        }
        continue;
      }
      const shouldSplitCountedGroup = Boolean(match[7]) && positions.length > 1;
      if (shouldSplitCountedGroup) {
        for (const position of positions) {
          groups.push({ positions: [position], index, length: match[0].length });
        }
      } else {
        groups.push({ positions, index, length: match[0].length });
      }
    }
  }
  return groups;
}

function expandCountedRosterPositions(raw: string): PositionKey[] {
  if (/(?:T|坦|盾|蓝职)/i.test(raw)) {
    return ["MT", "ST"];
  }
  if (/(?:H|N|奶|治疗|绿职)/i.test(raw)) {
    return ["H1", "H2"];
  }
  if (/(?:近战|近D|近)/i.test(raw)) {
    return ["D1", "D2"];
  }
  return [];
}

function extractRosterMemberListFromHeader(header: string): { text: string; index: number } | null {
  const parenMatches = [...header.matchAll(/[（(]([^）)\n]{3,140})[)）]/g)];
  if (parenMatches.length !== 1) {
    return null;
  }
  const match = parenMatches[0];
  const body = match[1] ?? "";
  if (collectLooseRosterMemberJobMatches(body).length >= 4 || /[+＋]/.test(body)) {
    const localIndex = (match.index ?? 0) + match[0].indexOf(body);
    return { text: body, index: localIndex };
  }
  return null;
}

function collectRosterMemberJobMatches(text: string): RosterMemberJobMatch[] {
  const matches: RosterMemberJobMatch[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const match = matchCompactRosterJobAt(text, index);
    if (!match) {
      continue;
    }
    const after = text.slice(index + match.length, index + match.length + 2);
    if (!/^\s*[:：]/.test(after)) {
      continue;
    }
    matches.push({ value: match.value, index, length: match.length });
    index += match.length;
  }
  return matches;
}

function collectLooseRosterMemberJobMatches(text: string): RosterMemberJobMatch[] {
  return parseCompactRosterJobGroups(text)
    .filter((group) => group.jobs.length > 0)
    .map((group) => ({
      value: group.jobs[0],
      values: group.jobs,
      index: group.start,
      length: Math.max(1, group.end - group.start)
    }));
}

function collectRosterFlexGroupsFromSegment(
  fullText: string,
  segment: { text: string; start: number; end: number; bodyStart: number }
): { groups: PositionKey[][]; matches: ParsedTextMatch[] } {
  const groups: PositionKey[][] = [];
  const matches: ParsedTextMatch[] = [];
  const flexRe = new RegExp(
    String.raw`\b(MT|ST|H[12]|D[1-4])${ROSTER_FLEX_POSITION_SEPARATOR_SPACED_PATTERN}(MT|ST|H[12]|D[1-4])\b`,
    "gi"
  );

  for (const match of segment.text.matchAll(flexRe)) {
    const positions = uniqueValues([match[1].toUpperCase(), match[2].toUpperCase()]).filter((position) =>
      FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)
    ) as PositionKey[];
    if (positions.length < 2) {
      continue;
    }
    groups.push(positions);
    matches.push({
      value: positions.join("/"),
      snippet: snippetAround(fullText, segment.start + (match.index ?? 0), match[0].length),
      index: segment.start + (match.index ?? 0),
      confidence: "high"
    });
  }

  return { groups, matches };
}

function collectDualTankD34RosterParts(text: string): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const pattern = /(?:目前有|已有|现有|队内(?:已有|现有)?|配置|阵容).{0,12}双\s*T\s*\+\s*D?3\s*4\s*[（(]([^）)\n]{2,40})[)）]/gi;

  for (const match of text.matchAll(pattern)) {
    const raw = match[1] ?? "";
    const parsed = parseDualTankD34CompactJobs(raw);
    if (!Object.keys(parsed).length) {
      continue;
    }
    for (const [position, jobs] of Object.entries(parsed) as Array<[PositionKey, string[]]>) {
      slots[position] = jobs;
    }
    matches.push({
      value: formatRosterSlots(parsed),
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }

  return { slots, matches };
}

function parseDualTankD34CompactJobs(raw: string): Partial<Record<PositionKey, string[]>> {
  const compact = raw.replace(/\s+/g, "");
  if (!compact) {
    return {};
  }
  const slots: Partial<Record<PositionKey, string[]>> = {};
  let cursor = 0;
  const tankOne = matchRoleCompactJobAt(compact, cursor, "tank");
  if (!tankOne) {
    return {};
  }
  slots.MT = [tankOne.value];
  cursor += tankOne.length;

  const tankTwo = matchRoleCompactJobAt(compact, cursor, "tank");
  if (!tankTwo) {
    return {};
  }
  slots.ST = [tankTwo.value];
  cursor += tankTwo.length;

  const rest = compact.slice(cursor);
  const d4 = matchRoleCompactJobAtEnd(rest, "caster");
  if (!d4) {
    return slots;
  }
  slots.D4 = [d4.value];
  const d3Text = rest.slice(0, Math.max(0, rest.length - d4.length));
  const d3Jobs = collectRoleCompactJobs(d3Text, "ranged");
  if (d3Jobs.length) {
    slots.D3 = d3Jobs;
  }
  return slots;
}

function collectRoleCompactJobs(text: string, role: "tank" | "healer" | "melee" | "ranged" | "caster"): string[] {
  const jobs: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (/[\s,，、;；/\\／|｜+＋&~～或和及与同]+/.test(text[cursor])) {
      cursor += 1;
      continue;
    }
    const match = matchRoleCompactJobAt(text, cursor, role);
    if (!match) {
      cursor += 1;
      continue;
    }
    pushUnique(jobs, match.value);
    cursor += match.length;
  }
  return jobs;
}

function matchRoleCompactJobAtEnd(text: string, role: "tank" | "healer" | "melee" | "ranged" | "caster"): { value: string; length: number } | null {
  for (let start = Math.max(0, text.length - 4); start < text.length; start += 1) {
    const match = matchRoleCompactJobAt(text, start, role);
    if (match && start + match.length === text.length) {
      return match;
    }
  }
  return null;
}

function matchRoleCompactJobAt(
  text: string,
  index: number,
  role: "tank" | "healer" | "melee" | "ranged" | "caster"
): { value: string; length: number } | null {
  const roleAliases: Record<typeof role, Array<{ value: string; aliases: string[] }>> = {
    tank: [
      { value: "暗黑骑士", aliases: ["黑骑", "暗骑", "暗黑", "DRK", "DK", "黑"] },
      { value: "绝枪战士", aliases: ["绝枪", "枪刃", "GNB", "枪"] },
      { value: "战士", aliases: ["战士", "WAR", "战"] },
      { value: "骑士", aliases: ["骑士", "PLD", "骑"] }
    ],
    healer: [
      { value: "白魔法师", aliases: ["白魔", "WHM", "白"] },
      { value: "学者", aliases: ["学者", "SCH", "学"] },
      { value: "占星术士", aliases: ["占星", "AST", "占"] },
      { value: "贤者", aliases: ["贤者", "SGE", "贤"] }
    ],
    melee: [
      { value: "武士", aliases: ["武士", "SAM", "侍", "盘"] },
      { value: "龙骑士", aliases: ["龙骑", "DRG", "龙"] },
      { value: "忍者", aliases: ["忍者", "NIN", "忍"] },
      { value: "武僧", aliases: ["武僧", "MNK", "僧"] },
      { value: "蝰蛇剑士", aliases: ["蝰蛇", "VPR", "蛇"] },
      { value: "钐镰客", aliases: ["钐镰", "镰刀", "RPR", "镰"] }
    ],
    ranged: [
      { value: "吟游诗人", aliases: ["吟游诗人", "诗人", "BRD", "诗"] },
      { value: "舞者", aliases: ["舞者", "DNC", "舞"] },
      { value: "机工士", aliases: ["机工士", "机工", "MCH", "机"] }
    ],
    caster: [
      { value: "黑魔法师", aliases: ["黑魔", "黑爷", "BLM", "黑"] },
      { value: "绘灵法师", aliases: ["绘灵", "画家", "PCT", "画"] },
      { value: "赤魔法师", aliases: ["赤魔", "吃馍", "RDM", "赤"] },
      { value: "召唤师", aliases: ["召唤", "SMN", "召"] }
    ]
  };
  for (const entry of roleAliases[role]) {
    for (const alias of [...entry.aliases].sort((left, right) => right.length - left.length)) {
      if (text.slice(index).toLowerCase().startsWith(alias.toLowerCase())) {
        return { value: entry.value, length: alias.length };
      }
    }
  }
  return null;
}

function collectPositionSuffixRosterSlotParts(
  fullText: string,
  segment: { text: string; start: number; end: number; bodyStart: number },
  positionMatches: Array<{ position: PositionKey; index: number; length: number }>
): Array<{ position: PositionKey; jobs: string[]; snippet: string; index: number }> {
  const matches: Array<{ position: PositionKey; jobs: string[]; snippet: string; index: number }> = [];
  for (const positionMatch of positionMatches) {
    if (!isPositionSuffixMarker(segment.text, positionMatch.index, positionMatch.length)) {
      continue;
    }
    const chunkStart = findRosterChunkStart(segment.text, segment.bodyStart, positionMatch.index);
    const chunk = segment.text.slice(chunkStart, positionMatch.index).replace(/[()（）]/g, " ");
    const jobs = collectRosterJobsForPosition(chunk, positionMatch.position);
    if (!jobs.length) {
      continue;
    }
    matches.push({
      position: positionMatch.position,
      jobs,
      snippet: snippetAround(fullText, segment.start + chunkStart, positionMatch.index + positionMatch.length - chunkStart),
      index: segment.start + chunkStart
    });
  }
  return matches;
}

function isPositionSuffixMarker(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 3), index);
  const after = text.slice(index + length, index + length + 3);
  return /[（(]\s*$/.test(before) && /^\s*[)）]/.test(after);
}

function findRosterChunkStart(text: string, minIndex: number, endIndex: number): number {
  const before = text.slice(minIndex, endIndex);
  const separatorIndexes = ["、", "，", ",", ";", "；", "\n"].map((separator) => before.lastIndexOf(separator));
  const separator = Math.max(...separatorIndexes);
  return separator >= 0 ? minIndex + separator + 1 : minIndex;
}

function collectCompactRosterSlotParts(
  fullText: string,
  segment: { text: string; start: number; end: number; bodyStart: number },
  globalVacancyPositions: Set<PositionKey>
): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const parsed = parseCompactRosterJobs(segment.text, segment.bodyStart);
  if (parsed.jobs.length < 4) {
    return { slots, matches };
  }

  const localVacancyPositions = collectRosterVacancyPositions(segment.text);
  const vacancyPositions = new Set<PositionKey>([...globalVacancyPositions, ...localVacancyPositions]);
  const assignablePositions = FULL_PARTY_POSITION_KEYS.filter((position) => !vacancyPositions.has(position));
  const inferredMissingCount = collectRosterMissingCount(segment.text);
  const expectedFilledCount =
    inferredMissingCount !== undefined && inferredMissingCount >= 0 && inferredMissingCount <= FULL_PARTY_POSITION_KEYS.length
      ? FULL_PARTY_POSITION_KEYS.length - inferredMissingCount
      : undefined;

  const rosterJobs =
    expectedFilledCount !== undefined && parsed.jobs.length > expectedFilledCount
      ? parsed.jobs.slice(0, expectedFilledCount)
      : parsed.jobs;

  const confidence: NgaParseConfidence =
    vacancyPositions.size > 0 && (expectedFilledCount === undefined || rosterJobs.length + vacancyPositions.size === FULL_PARTY_POSITION_KEYS.length)
      ? "high"
      : rosterJobs.length >= 7
        ? "high"
        : "medium";

  for (const assignment of assignCompactRosterJobsToPositions(rosterJobs, assignablePositions)) {
    slots[assignment.position] = uniqueValues([assignment.job.value, ...(assignment.job.alts ?? [])]);
  }

  if (Object.keys(slots).length) {
    matches.push({
      value: formatRosterSlots(slots),
      snippet: snippetAround(fullText, segment.start + parsed.start, parsed.end - parsed.start),
      index: segment.start + parsed.start,
      confidence
    });
  }

  return { slots, matches };
}

function collectRoleOrderedRosterCompositionParts(
  fullText: string,
  globalVacancyPositions: ReadonlySet<PositionKey> = new Set()
): {
  slots: Partial<Record<PositionKey, string[]>>;
  matches: ParsedTextMatch[];
  flexGroups: PositionKey[][];
  flexMatches: ParsedTextMatch[];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const matches: ParsedTextMatch[] = [];
  const flexGroups: PositionKey[][] = [];
  const flexMatches: ParsedTextMatch[] = [];
  const markerRe = new RegExp(ROSTER_CONTEXT_MARKER_RE_SOURCE, "gi");

  for (const marker of fullText.matchAll(markerRe)) {
    const markerIndex = marker.index ?? 0;
    const bodyStart = markerIndex + marker[0].length;
    const tail = fullText.slice(bodyStart, Math.min(fullText.length, bodyStart + 180));
    const explicitBoundary = /(?:招募情况|招募要求|招募职业|需求职业|目前需求|需求|招募|缺|补|来|找|要求|时间|活动时间|上班时间|攻略|联系|lxfs|联系方式)/i.exec(tail);
    const teamSizeBoundary = findTeamSizeLikeIndex(tail);
    const boundaryIndexes = [explicitBoundary?.index, teamSizeBoundary].filter((index): index is number => index !== undefined && index >= 0);
    const boundaryIndex = boundaryIndexes.length ? Math.min(...boundaryIndexes) : tail.length;
    const window = tail.slice(0, boundaryIndex);
    const compact = (window.split(/[，,。；;\n]/)[0] ?? "").trim();
    if (!compact || hasExplicitRosterPositionMarkers(compact) || hasCountedRosterPositionMarkers(compact)) {
      continue;
    }

    const parsed = parseRoleOrderedRosterComposition(compact, globalVacancyPositions);
    if (!Object.keys(parsed.slots).length) {
      continue;
    }
    for (const [position, jobs] of Object.entries(parsed.slots) as Array<[PositionKey, string[]]>) {
      mergeRosterSlotJobs(slots, position, jobs);
    }
    matches.push({
      value: formatRosterSlots(parsed.slots),
      snippet: snippetAround(fullText, bodyStart, compact.length),
      index: bodyStart,
      confidence: "high"
    });
    for (const group of parsed.flexGroups) {
      if (!flexGroups.some((existing) => existing.join("/") === group.join("/"))) {
        flexGroups.push(group);
        flexMatches.push({
          value: group.join("/"),
          snippet: snippetAround(fullText, bodyStart, compact.length),
          index: bodyStart,
          confidence: "high"
        });
      }
    }
  }

  return { slots, matches: dedupeMatches(matches), flexGroups, flexMatches: dedupeMatches(flexMatches) };
}

function hasExplicitRosterPositionMarkers(text: string): boolean {
  return /(^|[^A-Za-z0-9])(?:MT|ST|H[12]|D[1-4])(?![A-Za-z0-9])/i.test(text);
}

function hasCountedRosterPositionMarkers(text: string): boolean {
  return /(^|[^A-Za-z0-9])(?:双|两|2)\s*(?:T|坦克|坦|盾|蓝职|H|N|奶|治疗|绿职|近战|近D|近)(?![A-Za-z0-9])/i.test(text);
}

function parseRoleOrderedRosterComposition(
  raw: string,
  globalVacancyPositions: ReadonlySet<PositionKey> = new Set()
): {
  slots: Partial<Record<PositionKey, string[]>>;
  flexGroups: PositionKey[][];
} {
  const slots: Partial<Record<PositionKey, string[]>> = {};
  const flexGroups: PositionKey[][] = [];
  const roleSlots: Record<"tank" | "healer" | "melee" | "ranged" | "caster", PositionKey[]> = {
    tank: ["MT", "ST"],
    healer: ["H1", "H2"],
    melee: ["D1", "D2"],
    ranged: ["D3"],
    caster: ["D4"]
  };
  const usedByRole: Record<"tank" | "healer" | "melee" | "ranged" | "caster", Set<PositionKey>> = {
    tank: new Set(),
    healer: new Set(),
    melee: new Set(),
    ranged: new Set(),
    caster: new Set()
  };
  const [main, ...tails] = raw.replace(/\s+/g, "").split(/[+＋]/);

  for (const group of parseCompactRosterJobGroups(main ?? "")) {
    const role = rosterRoleForJob(group.jobs[0] ?? "");
    if (!role) {
      continue;
    }
    const nonVacancyPosition = roleSlots[role].find((slot) => !usedByRole[role].has(slot) && !globalVacancyPositions.has(slot));
    const position = nonVacancyPosition ?? roleSlots[role].find((slot) => !usedByRole[role].has(slot));
    if (!position) {
      continue;
    }
    slots[position] = uniqueValues(group.jobs);
    usedByRole[role].add(position);
  }

  for (const tail of tails) {
    for (const role of Object.keys(roleSlots) as Array<keyof typeof roleSlots>) {
      const jobs = collectRoleCompactJobs(tail, role);
      if (!jobs.length) {
        continue;
      }
      const remainingPositions = roleSlots[role].filter((position) => !usedByRole[role].has(position));
      const nonVacancyPositions = remainingPositions.filter((position) => !globalVacancyPositions.has(position));
      const positions = nonVacancyPositions.length ? nonVacancyPositions : remainingPositions;
      if (!positions.length) {
        continue;
      }
      const flexPositions = positions.length > 1 && /任意|均可|都可|可切|皆可/.test(tail) ? positions : [positions[0]];
      for (const position of flexPositions) {
        slots[position] = uniqueValues(jobs);
        usedByRole[role].add(position);
      }
      if (flexPositions.length > 1) {
        flexGroups.push(flexPositions);
      }
      break;
    }
  }

  return { slots, flexGroups };
}

function chooseRoleOrderedRosterPosition(
  positions: readonly PositionKey[],
  usedPositions: ReadonlySet<PositionKey>,
  jobs: readonly string[]
): PositionKey | undefined {
  return (
    positions.find(
      (position) => !usedPositions.has(position) && jobs.some((job) => isPreferredRosterJobForPosition(job, position))
    ) ?? positions.find((position) => !usedPositions.has(position))
  );
}

function rosterJobsForRole(role: "tank" | "healer" | "melee" | "ranged" | "caster"): string[] {
  if (role === "tank") {
    return ["骑士", "战士", "暗黑骑士", "绝枪战士"];
  }
  if (role === "healer") {
    return ["白魔法师", "学者", "占星术士", "贤者"];
  }
  if (role === "melee") {
    return ["武士", "龙骑士", "忍者", "武僧", "蝰蛇剑士", "钐镰客"];
  }
  if (role === "ranged") {
    return ["吟游诗人", "舞者", "机工士"];
  }
  return ["黑魔法师", "绘灵法师", "赤魔法师", "召唤师"];
}

function collectCompactAltJobs(text: string, role: ReturnType<typeof rosterRoleForJob>): string[] {
  if (!role) {
    return collectRosterJobs(text);
  }
  if (/(?:其[他它]|其他|其它|同职能|本职能|全职业|全职|任意|都可|均可|皆可|可切)/.test(text)) {
    return rosterJobsForRole(role);
  }
  return collectRoleCompactJobs(text, role);
}

function parseCompactRosterJobGroups(text: string): Array<{ jobs: string[]; start: number; end: number }> {
  const groups: Array<{ jobs: string[]; start: number; end: number }> = [];
  let index = 0;
  while (index < text.length) {
    while (index < text.length && /[\s,，、;；/\\／|｜+＋&~～或和及与同]+/.test(text[index])) {
      index += 1;
    }
    const match = matchCompactRosterJobAt(text, index);
    if (!match) {
      index += 1;
      continue;
    }
    const jobs = [match.value];
    const start = index;
    index += match.length;
    const role = rosterRoleForJob(match.value);
    if (/[（(]/.test(text[index] ?? "")) {
      const close = text.indexOf(text[index] === "（" ? "）" : ")", index + 1);
      if (close > index) {
        const altText = text.slice(index + 1, close);
        for (const job of role ? collectCompactAltJobs(altText, role) : collectRosterJobs(altText)) {
          pushUnique(jobs, job);
        }
        index = close + 1;
      }
    }
    const switchMatch = /^\s*(?:可切|能切|会切|可换|可转|可补|也可)\s*([^\s,，、。；;()（）/\\／|｜+＋&~～]{1,12})/.exec(
      text.slice(index, Math.min(text.length, index + 18))
    );
    if (role && switchMatch) {
      for (const job of collectRoleCompactJobs(switchMatch[1], role)) {
        pushUnique(jobs, job);
      }
      index += switchMatch[0].length;
    }
    groups.push({ jobs, start, end: index });
  }
  return groups;
}

function assignCompactRosterJobsToPositions(
  jobs: CompactRosterJob[],
  positions: readonly PositionKey[]
): Array<{ position: PositionKey; job: CompactRosterJob }> {
  const assignments: Array<{ position: PositionKey; job: CompactRosterJob }> = [];
  const usedJobs = new Set<number>();

  for (let positionIndex = 0; positionIndex < positions.length; positionIndex += 1) {
    const position = positions[positionIndex];
    const laterPositions = positions.slice(positionIndex + 1);
    const preferredIndex = jobs.findIndex(
      (job, index) =>
        !usedJobs.has(index) && isJobLikelyForPosition(job.value, position) && isPreferredRosterJobForPosition(job.value, position)
    );
    const fitIndex =
      preferredIndex >= 0
        ? preferredIndex
        : jobs.findIndex(
            (job, index) =>
              !usedJobs.has(index) &&
              isJobLikelyForPosition(job.value, position) &&
              !shouldReserveRosterJobForLaterPosition(job.value, position, laterPositions)
          );
    const reservedFitExists =
      fitIndex < 0 &&
      jobs.some(
        (job, index) =>
          !usedJobs.has(index) &&
          isJobLikelyForPosition(job.value, position) &&
          shouldReserveRosterJobForLaterPosition(job.value, position, laterPositions)
      );
    const fallbackIndex =
      fitIndex >= 0 || reservedFitExists
        ? fitIndex
        : jobs.findIndex((job, index) => !usedJobs.has(index) && isJobLikelyForPosition(job.value, position));
    if (fallbackIndex < 0) {
      continue;
    }
    usedJobs.add(fallbackIndex);
    assignments.push({ position, job: jobs[fallbackIndex] });
  }

  return assignments;
}

function preferredRosterPositionsForJob(job: string): PositionKey[] {
  if (job === "战士" || job === "暗黑骑士") {
    return ["MT"];
  }
  if (job === "骑士" || job === "绝枪战士") {
    return ["ST"];
  }
  if (job === "白魔法师" || job === "占星术士") {
    return ["H1"];
  }
  if (job === "学者" || job === "贤者") {
    return ["H2"];
  }
  if (job === "武士" || job === "武僧" || job === "龙骑士" || job === "忍者") {
    return ["D1", "D2"];
  }
  if (job === "蝰蛇剑士" || job === "钐镰客") {
    return ["D2", "D1"];
  }
  if (job === "吟游诗人" || job === "舞者" || job === "机工士") {
    return ["D3"];
  }
  if (job === "黑魔法师" || job === "绘灵法师" || job === "赤魔法师" || job === "召唤师") {
    return ["D4"];
  }
  return [];
}

function isPreferredRosterJobForPosition(job: string, position: PositionKey): boolean {
  return preferredRosterPositionsForJob(job).includes(position);
}

function shouldReserveRosterJobForLaterPosition(job: string, position: PositionKey, laterPositions: readonly PositionKey[]): boolean {
  if (position === "H1" && laterPositions.includes("H2")) {
    return job === "学者" || job === "贤者";
  }
  if (position === "H2" && laterPositions.includes("H1")) {
    return job === "白魔法师" || job === "占星术士";
  }
  if (position === "MT" && laterPositions.includes("ST")) {
    return job === "骑士" || job === "绝枪战士";
  }
  if (position === "ST" && laterPositions.includes("MT")) {
    return job === "战士" || job === "暗黑骑士";
  }
  if (position === "D1" && laterPositions.includes("D2")) {
    return job === "蝰蛇剑士" || job === "钐镰客";
  }
  if (position === "D2" && laterPositions.includes("D1")) {
    return job === "武士" || job === "武僧";
  }
  return false;
}

function parseCompactRosterJobs(text: string, bodyStart: number): {
  jobs: CompactRosterJob[];
  start: number;
  end: number;
} {
  let index = bodyStart;
  while (index < text.length && /[\s:：,，、;；/\\／|｜+＋&~～]+/.test(text[index])) {
    index += 1;
  }

  const start = index;
  const first = matchCompactRosterJobAt(text, index);
  if (!first) {
    return { jobs: [], start, end: start };
  }

  const jobs: CompactRosterJob[] = [];
  while (index < text.length) {
    while (index < text.length && /[\s,，、;；/\\／|｜+＋&~～或和及与同]+/.test(text[index])) {
      index += 1;
    }
    const match = matchCompactRosterJobAt(text, index);
    if (!match) {
      break;
    }
    const startIndex = index;
    index += match.length;
    const role = rosterRoleForJob(match.value);
    const altJobs: string[] = [];
    if (/[（(]/.test(text[index] ?? "")) {
      const close = text.indexOf(text[index] === "（" ? "）" : ")", index + 1);
      if (close > index) {
        for (const job of collectCompactAltJobs(text.slice(index + 1, close), role)) {
          pushUnique(altJobs, job);
        }
        index = close + 1;
      }
    }
    const switchMatch = /^\s*(?:可切|能切|会切|可换|可转|可补|也可)\s*([^\s,，、。；;()（）/\\／|｜+＋&~～]{1,12})/.exec(
      text.slice(index, Math.min(text.length, index + 18))
    );
    if (role && switchMatch) {
      for (const job of collectRoleCompactJobs(switchMatch[1], role)) {
        pushUnique(altJobs, job);
      }
      index += switchMatch[0].length;
    }
    const tail = text.slice(index, Math.min(text.length, index + 12));
    if (role && /^\s*(?:\/|／|、|\||｜|\+|＋|&|~|～|或|和|及|与|同)\s*(?:其[他它]|其他|其它|同职能|本职能)?\s*(?:可切|都可|均可|皆可|也可|全职业|全职)/.test(tail)) {
      for (const job of rosterJobsForRole(role)) {
        pushUnique(altJobs, job);
      }
    }
    jobs.push({ value: match.value, alts: uniqueValues(altJobs.filter((job) => job !== match.value)), start: startIndex, end: index });
  }

  return { jobs, start, end: jobs.at(-1)?.end ?? start };
}

function matchCompactRosterJobAt(text: string, index: number): { value: string; length: number } | null {
  const fixed = matchFixedCompactRosterJobAt(text, index);
  if (fixed) {
    return fixed;
  }
  if (isSkippedFixedCompactRosterAlias(text, index)) {
    return null;
  }
  for (const entry of COMPACT_ROSTER_JOB_ALIASES) {
    const aliases = [...entry.aliases].sort((left, right) => right.length - left.length);
    for (const alias of aliases) {
      if (!text.slice(index).toLowerCase().startsWith(alias.toLowerCase())) {
        continue;
      }
      if (/^[A-Za-z0-9.+_-]+$/.test(alias)) {
        const before = index > 0 ? text[index - 1] : "";
        const after = text[index + alias.length] ?? "";
        if ((before && /[A-Za-z0-9]/.test(before)) || (after && /[A-Za-z0-9]/.test(after))) {
          continue;
        }
      }
      return { value: entry.value, length: alias.length };
    }
  }
  return null;
}

function matchFixedCompactRosterJobAt(text: string, index: number): { value: string; length: number } | null {
  const slice = text.slice(index);
  if (slice.startsWith("黑白骑")) {
    return { value: "暗黑骑士", length: 1 };
  }
  if (index >= 2 && text.slice(index - 2, index + 1) === "黑白骑") {
    return { value: "骑士", length: 1 };
  }
  if (slice.startsWith("暗骑") && isLikelyCompactSingleJobContinuation(text[index + 2])) {
    return { value: "暗黑骑士", length: 1 };
  }
  if (index >= 1 && text[index - 1] === "暗" && text[index] === "骑" && isLikelyCompactSingleJobContinuation(text[index + 1])) {
    return { value: "骑士", length: 1 };
  }
  return null;
}

function isLikelyCompactSingleJobContinuation(char: string | undefined): boolean {
  return Boolean(char && /[白学占贤镰舞诗机画黑赤召武侍忍僧蛇龙战骑枪绝暗]/.test(char));
}

function isSkippedFixedCompactRosterAlias(text: string, index: number): boolean {
  return index > 0 && text.slice(index - 1, index + 2) === "黑白骑";
}

function collectRosterVacancyPositions(text: string): PositionKey[] {
  const positions: PositionKey[] = [];
  const add = (value: string) => {
    for (const position of normalizePositionToken(value)) {
      if (FULL_PARTY_POSITION_KEYS.includes(position as PositionKey)) {
        pushUnique(positions, position as PositionKey);
      }
    }
  };

  for (const part of collectExplicitEmptyRosterVacancyPositionParts(text)) {
    add(part.value);
  }

  for (const teamSize of collectTeamSizeVacancyWindows(text)) {
    const window = teamSize.window.slice(0, 80);
    collectPositionsFromLooseWindow(window, { includeRoles: true }).forEach(add);
  }

  const demandWindowRe = /(?:需求职业|招募职业|需求|招募|招人|缺|补|来|找)[^\n。；;]{0,80}/gi;
  for (const match of text.matchAll(demandWindowRe)) {
    const window = trimVacancyWindowAtExistingRoster(match[0]);
    collectPositionsFromLooseWindow(window, { includeRoles: true }).forEach(add);
  }

  return positions;
}

function collectPositionsFromLooseWindow(text: string, options: { includeRoles?: boolean } = {}): string[] {
  const values: string[] = [];
  const addRange = (prefix: string, left: string, right: string, asRange: boolean) => {
    for (const position of expandPositionRange(prefix.toUpperCase(), Number(left), Number(right), asRange)) {
      pushUnique(values, position);
    }
  };

  const listRe = createPositionListRegExp();
  for (const match of text.matchAll(listRe)) {
    const prefix = match[1].toUpperCase();
    const digits = match[2].match(/[1-4]/g) ?? [];
    for (const digit of digits) {
      pushUnique(values, `${prefix}${digit}`);
    }
  }

  const adjacentRe = /\b([HD])([1-4])(?:\1)?([1-4])\b/gi;
  for (const match of text.matchAll(adjacentRe)) {
    pushUnique(values, `${match[1].toUpperCase()}${match[2]}`);
    pushUnique(values, `${match[1].toUpperCase()}${match[3]}`);
  }

  const rangeRe = createPositionListPairRegExp();
  for (const match of text.matchAll(rangeRe)) {
    addRange(match[1], match[2], match[3], false);
  }

  const dashRangeRe = /\b([HD])([1-4])\s*(?:-|~|～|到|至)\s*(?:\1)?([1-4])\b/gi;
  for (const match of text.matchAll(dashRangeRe)) {
    addRange(match[1], match[2], match[3], true);
  }

  const compactExplicitRe = /(^|[^A-Za-z0-9])((?:(?:MT|ST|H[12]|D[1-4])){2,})(?![A-Za-z0-9])/gi;
  for (const match of text.matchAll(compactExplicitRe)) {
    const compact = match[2] ?? "";
    for (const token of compact.match(/MT|ST|H[12]|D[1-4]/gi) ?? []) {
      pushUnique(values, token.toUpperCase());
    }
  }

  const explicitTokens = options.includeRoles
    ? "MT|ST|H[12]|D[1-4]|T|坦克|盾|蓝职|H|N|奶|治疗|绿职|DPS|红职|近战|近D|远敏|远程物理|法系|远程魔法|法D|法职|远法"
    : "MT|ST|H[12]|D[1-4]|近战|近D|远敏|远程物理|法系|远程魔法|法D|法职|远法";
  const explicitRe = new RegExp(`(^|[^A-Za-z0-9])((?:${explicitTokens}))(?![A-Za-z0-9])`, "gi");
  for (const match of text.matchAll(explicitRe)) {
    for (const position of normalizePositionToken(match[2])) {
      pushUnique(values, position);
    }
  }

  if (options.includeRoles) {
    const countedRoleRe =
      /([一二两三四五六七八九十0-9]+)\s*(T(?![A-Za-z0-9])|坦克|盾|蓝职|H(?![A-Za-z0-9])|N(?![A-Za-z0-9])|奶|治疗|绿职|DPS|红职|近战|近D|远敏|远程物理|法系|远程魔法|法D|法职|远法)(?![A-Za-z])/gi;
    for (const match of text.matchAll(countedRoleRe)) {
      const before = text[(match.index ?? 0) - 1] ?? "";
      if (/[A-Za-z]/.test(before)) {
        continue;
      }
      const countToken = match[1] ?? "";
      const roleToken = match[2] ?? "";
      if (roleToken === "h" && /^[0-9]+$/.test(countToken)) {
        continue;
      }
      for (const position of normalizePositionToken(match[2])) {
        pushUnique(values, position);
      }
    }
  }

  return values;
}

function collectRosterMissingCount(text: string): number | undefined {
  return collectTeamSizeVacancyWindows(text)[0]?.missingCount;
}

function collectExistingRosterSegments(text: string): Array<{ text: string; start: number; end: number; bodyStart: number }> {
  const segments: Array<{ text: string; start: number; end: number; bodyStart: number }> = [];
  const markerRe = new RegExp(ROSTER_CONTEXT_MARKER_RE_SOURCE, "gi");
  const boundaryRe = new RegExp(ROSTER_BOUNDARY_RE_SOURCE, "gi");

  for (const marker of text.matchAll(markerRe)) {
    const start = marker.index ?? 0;
    const searchStart = start + marker[0].length;
    const tail = text.slice(searchStart);
    boundaryRe.lastIndex = 0;
    const boundary = boundaryRe.exec(tail);
    const end = boundary ? searchStart + boundary.index : Math.min(text.length, searchStart + 260);
    const segmentText = text.slice(start, end);
    if (cleanText(segmentText)) {
      segments.push({ text: segmentText, start, end, bodyStart: searchStart - start });
    }
  }

  return segments;
}

function collectRosterJobs(text: string): string[] {
  return uniqueValues(collectRosterJobMatches(text).map((match) => match.value));
}

function collectRosterJobMatches(text: string): Array<{ value: string; index: number; length: number }> {
  const matches: Array<{ value: string; index: number; length: number }> = [...collectFixedRosterJobMatches(text)];
  for (const entry of JOB_ALIASES) {
    const aliases = [...entry.aliases].sort((left, right) => right.length - left.length);
    for (const alias of aliases) {
      const index = findRosterAliasIndex(text, alias, entry.value);
      if (index < 0) {
        continue;
      }
      matches.push({ value: entry.value, index, length: alias.length });
      break;
    }
  }
  const seen = new Set<string>();
  return matches
    .filter((match) => {
      const key = `${match.value}:${match.index}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.index - right.index || right.length - left.length);
}

function collectVacancyJobGroupParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  const demandWindowRe =
    /(?:需求职业|招募职业|招募情况|目前需求|(?:^|[\s,，。；;\n(（])(?:需求|招募|缺|补|来(?:个|点)?|找))[^\n。；;]{0,100}/gi;
  for (const windowMatch of text.matchAll(demandWindowRe)) {
    if (!windowMatch[0] || /招募要求/.test(windowMatch[0])) {
      continue;
    }
    const windowStart = windowMatch.index ?? 0;
    const localWindow = trimVacancyJobWindow(windowMatch[0]);
    if (!matchesPattern(/(?:需求|招募|缺|补|来|找|MT|ST|H[12]|D[1-4]|近战|远敏|法系|T|H|DPS|奶|盾)/i, localWindow)) {
      continue;
    }
    for (const job of collectRosterJobMatches(localWindow)) {
      const absoluteIndex = windowStart + job.index;
      if (isNegatedAt(text, absoluteIndex)) {
        continue;
      }
      matches.push({
        value: job.value,
        snippet: snippetAround(text, absoluteIndex, job.length),
        index: absoluteIndex,
        confidence: "high"
      });
    }
  }
  return dedupeMatches(matches);
}

function collectVacancyRequirementJobParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  const requirementRe = /(招募要求|需求职业|招募职业)[:：]\s*([^。\n；;]{0,80})/gi;
  for (const match of text.matchAll(requirementRe)) {
    const marker = match[1] ?? "";
    const raw = match[2] ?? "";
    const segment = raw.split(/[，,。；;\n]/)[0]?.trim() ?? "";
    if (marker === "招募要求" && !/(?:MT|ST|H[12]|D[1-4]|职业|位置|缺|补|来|找|任意|or|\/|或)/i.test(segment)) {
      continue;
    }
    if (!segment || !/(?:MT|ST|H[12]|D[1-4]|T|H|N|DPS|奶|治疗|坦克|盾|近战|远敏|法系|骑|战|黑|枪|白|学|占|贤|侍|武|龙|忍|僧|蛇|蝰|镰|诗|舞|机|画|赤|召|or|\/|或)/i.test(segment)) {
      continue;
    }
    const positiveSegment = stripNegatedJobText(segment);
    const jobs = uniqueValues([
      ...collectRosterJobMatches(segment)
        .filter((job) => !isNegatedAt(segment, job.index))
        .map((job) => job.value),
      ...collectRoleCompactJobs(positiveSegment, "tank"),
      ...collectRoleCompactJobs(positiveSegment, "healer"),
      ...collectRoleCompactJobs(positiveSegment, "melee"),
      ...collectRoleCompactJobs(positiveSegment, "ranged"),
      ...collectRoleCompactJobs(positiveSegment, "caster")
    ]);
    const start = (match.index ?? 0) + match[0].indexOf(raw);
    for (const job of jobs) {
      matches.push({
        value: job,
        snippet: snippetAround(text, start, segment.length),
        index: start,
        confidence: "high"
      });
    }
  }
  return dedupeMatches(matches);
}

function trimVacancyJobWindow(text: string): string {
  const beforeNextSection = text.split(/(?:招募要求|要求|队伍详情|队伍情况|时间|活动时间|上班|联系|lxfs|攻略|进度)/i)[0] ?? text;
  return trimVacancyWindowAtExistingRoster(beforeNextSection);
}

function collectFixedRosterJobMatches(text: string): Array<{ value: string; index: number; length: number }> {
  const matches: Array<{ value: string; index: number; length: number }> = [];
  for (const match of text.matchAll(/黑白骑/g)) {
    const index = match.index ?? 0;
    matches.push({ value: "暗黑骑士", index, length: 1 });
    matches.push({ value: "骑士", index: index + 2, length: 1 });
  }
  return matches;
}

function findRosterAliasIndex(text: string, alias: string, value?: string): number {
  if (!alias) {
    return -1;
  }
  if (/^[A-Za-z0-9.+_-]+$/.test(alias)) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(alias)})(?![A-Za-z0-9])`, "i");
    const match = pattern.exec(text);
    const index = match?.[2] ? match.index + match[1].length : -1;
    return index >= 0 && !isFalseRosterAliasHit(text, index, alias, value) ? index : -1;
  }
  const index = text.toLowerCase().indexOf(alias.toLowerCase());
  return index >= 0 && !isFalseRosterAliasHit(text, index, alias, value) ? index : -1;
}

function isFalseRosterAliasHit(text: string, index: number, alias: string, value?: string): boolean {
  const around = text.slice(Math.max(0, index - 3), Math.min(text.length, index + alias.length + 3));
  if (value === "战士" && alias === "战" && /近战|近D/i.test(around)) {
    return true;
  }
  if ((value === "黑魔法师" || value === "白魔法师" || value === "骑士") && /黑白骑/.test(around)) {
    return true;
  }
  if (value === "黑魔法师" && alias === "黑" && /黑骑|暗骑|黑白骑/.test(around)) {
    return true;
  }
  if (value === "骑士" && alias === "骑" && /黑骑|暗骑/.test(around)) {
    return true;
  }
  return false;
}

function formatRosterSlots(slots: Partial<Record<PositionKey, string[]>>): string {
  return FULL_PARTY_POSITION_KEYS
    .filter((position) => slots[position]?.length)
    .map((position) => `${position} ${slots[position]!.join("/")}`)
    .join("、");
}

function isLikelyAvailablePositionContext(text: string, index: number): boolean {
  if (isExistingRosterContext(text, index)) {
    return false;
  }
  return true;
}

function isLikelyAvailableJobContext(text: string, index: number): boolean {
  if (isExistingRosterContext(text, index)) {
    return false;
  }
  return true;
}

function isLikelyVacancyPositionContext(text: string, index: number): boolean {
  if (isExistingRosterContext(text, index)) {
    return false;
  }
  if (isRosterReferencePositionContext(text, index)) {
    return false;
  }
  const before = text.slice(Math.max(0, index - 40), index);
  const context = text.slice(Math.max(0, index - 40), Math.min(text.length, index + 18));
  return (
    matchesTeamSizeLike(context) ||
    /(?:缺|招|补|需求|招募|任意|可来|来|找|(?<!要)求)[^\n。；;]{0,18}$/i.test(before)
  );
}

function isLikelyVacancyJobContext(text: string, index: number): boolean {
  if (isExistingRosterContext(text, index)) {
    return false;
  }
  const before = text.slice(Math.max(0, index - 44), index);
  const context = text.slice(Math.max(0, index - 44), Math.min(text.length, index + 18));
  return (
    matchesTeamSizeLike(context) ||
    /(?:缺|招|补|需求|招募|任意|可来|来|找|(?<!要)求)[^\n。；;]{0,18}$/i.test(before)
  );
}

function isRosterReferencePositionContext(text: string, index: number): boolean {
  const after = text.slice(index, Math.min(text.length, index + 36));
  return /^(?:MT|ST|H[12]|D[1-4])(?:\s*(?:和|或|及|与|同|\/|／|、|\+|＋|&|\||｜|~|～)\s*(?:MT|ST|H[12]|D[1-4]))?\s*(?:为|是)?(?:之前|此前|原(?:来|本)?|已有|现有|队内|队友|搭档|已搭档)/i.test(
    after
  );
}

function isExistingRosterContext(text: string, index: number): boolean {
  const boundaryMarkers = [
    ...VACANCY_CONTEXT_MARKERS,
    "招募要求",
    "入队需知",
    "希望你",
    "要求",
    "时间",
    "活动时间",
    "上班时间",
    "攻略",
    "联系",
    "lxfs",
    "联系方式"
  ];
  const containingSegment = collectExistingRosterSegments(text).find((segment) => index >= segment.start && index < segment.end);
  if (containingSegment) {
    const beforeInsideSegment = text.slice(containingSegment.start, index);
    return lastIndexOfAny(beforeInsideSegment, boundaryMarkers) < 0;
  }
  const before = text.slice(Math.max(0, index - 120), index);
  const lastExisting = lastIndexOfAny(before, EXISTING_ROSTER_MARKERS);
  if (lastExisting < 0) {
    return false;
  }
  const afterExisting = before.slice(lastExisting);
  const lastDemand = lastIndexOfAny(afterExisting, boundaryMarkers);
  return lastDemand < 0;
}

function collectExclusionParts(text: string): { jobs: ParsedTextMatch[]; positions: ParsedTextMatch[] } {
  const aliasJobs = collectAliases(text, JOB_ALIASES)
    .filter((match) => isNegatedAt(text, match.index))
    .filter((match) => !isFalseRosterAliasHit(text, match.index, match.alias, match.entry.value))
    .map((match) => ({
      value: match.entry.value,
      snippet: match.snippet,
      index: match.index,
      confidence: match.confidence
    }));
  const phraseJobs: ParsedTextMatch[] = [];
  const exclusionJobRe = /(?:非|不要|不接受|排除)\s*[^,，。；;、\s]{1,16}/gi;
  for (const match of text.matchAll(exclusionJobRe)) {
    const start = match.index ?? 0;
    const phrase = match[0] ?? "";
    for (const job of collectRosterJobs(phrase)) {
      phraseJobs.push({
        value: job,
        snippet: snippetAround(text, start, phrase.length),
        index: start,
        confidence: "high"
      });
    }
  }
  const jobs = dedupeMatches([...aliasJobs, ...phraseJobs]);
  const positions: ParsedTextMatch[] = [];
  const exclusionRe =
    /(?:非|不要|不接受|排除)\s*(?:[^,，。；;、\s]{0,8}?)?(MT|ST|H[12]|D[1-4]|近战|远敏|远程物理|法系|远程魔法|T|坦克|H|N|奶|治疗)/gi;
  for (const match of text.matchAll(exclusionRe)) {
    if (!match[1]) {
      continue;
    }
    const matchedText = match[0];
    if (collectRosterJobs(matchedText).length) {
      continue;
    }
    for (const position of normalizePositionToken(match[1])) {
      const confidence: NgaParseConfidence = hasMechanicPositionContext(text, match.index) ? "low" : "high";
      positions.push({
        value: position,
        snippet: snippetAround(text, match.index, match[0].length),
        index: match.index,
        confidence
      });
    }
  }
  return {
    jobs,
    positions: dedupeMatches(positions)
  };
}

function collectRosterParts(text: string): ParsedTextMatch | null {
  const ninth = matchPattern(text, /8\s*\/\s*9|正式第九人|九人轮换|9人轮换|第九人/i);
  if (ninth) {
    return {
      ...ninth,
      value: "9人轮换/第九人",
      confidence: /第九人/i.test(ninth.value) && !/正式第九人|8\s*\/\s*9|九人轮换|9人轮换/i.test(ninth.value) ? "low" : "high"
    };
  }
  const teamSize = collectTeamSizeLikeParts(text)[0];
  if (!teamSize) {
    return null;
  }
  return {
    ...teamSize,
    value: cleanText(teamSize.value),
    confidence: "medium"
  };
}

function collectRequirementParts(text: string): ParsedTextMatch[] {
  const antiMatches = collectAntiRequirementParts(text);
  const aliasMatches = collectAliases(text, REQUIREMENT_PATTERNS)
    .filter((match) => !(match.alias === "绿玩" && text.slice(Math.max(0, match.index - 2), match.index).includes("非")))
    .filter((match) => !(match.alias === "绿玩" && (isPluginEcosystemOpenContext(text, match.index) || isPluginStanceDislikeContext(text, match.index))))
    .filter((match) => !(match.alias === "红玩" && isPluginEcosystemOpenContext(text, match.index)))
    .filter((match) => !(match.alias === "轮椅" && isHeavyAssistDependenceContext(text, match.index)))
    .filter((match) => !(match.alias === "科技" && isTechnologyHeadingContext(text, match.index)))
    .filter((match) => !(match.alias === "科技" && isAntiCheatContext(text, match.index)))
    .filter((match) => !(RISK_TOOL_ALIAS_RE.test(match.entry.value) && isPluginNeutralContext(text, match.index)))
    .filter((match) => !(RISK_CARRY_ALIAS_RE.test(match.entry.value) && isAntiCarryRiskContext(text, match.index)))
    .filter((match) => match.alias === "非绿玩" || !isAntiRequirementContext(text, match.index) || (!RISK_TOOL_ALIAS_RE.test(match.entry.value) && !RISK_CARRY_ALIAS_RE.test(match.entry.value)))
    .map((match) => ({
      value: match.entry.value,
      snippet: match.snippet,
      index: match.index,
      confidence: match.confidence
    }));
  const matches: ParsedTextMatch[] = [...antiMatches, ...aliasMatches];

  for (const match of text.matchAll(PLUGIN_ECOSYSTEM_OPEN_RE)) {
    matches.push({
      value: "插件生态均可",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }

  for (const match of text.matchAll(PLUGIN_NEUTRAL_STANCE_RE)) {
    matches.push({
      value: "插件态度中性",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }

  for (const match of text.matchAll(ACT_LOGS_RE)) {
    if (isRiskAssistContext(text, match.index)) {
      continue;
    }
    matches.push({
      value: "ACT/logs 记录复盘",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }

  const logColorRe =
    /(?:logs?|fflogs|榜|分|颜色|色)\s*.{0,10}(灰|绿|蓝|紫|橙|粉|金)|(?:灰|绿|蓝|紫|橙|粉|金)\s*(?:色|分|logs?)/gi;
  for (const match of text.matchAll(logColorRe)) {
    matches.push({
      value: "logs 颜色/分数要求",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }

  const ultimateExperienceRe = /(?:[1-9]|[一二两三四五六七八九十])\s*绝(?:及以上|以上|经验)?/gi;
  for (const match of text.matchAll(ultimateExperienceRe)) {
    matches.push({
      value: cleanText(match[0]),
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "high"
    });
  }

  for (const match of text.matchAll(RISK_ASSIST_RE)) {
    if (isAntiRequirementContext(text, match.index)) {
      continue;
    }
    matches.push({
      value: "ACT 时间轴/TTS 辅助",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }

  for (const match of text.matchAll(RISK_TOOL_RE)) {
    if (isAntiToolRiskContext(text, match.index) || isPluginNeutralContext(text, match.index)) {
      continue;
    }
    matches.push({
      value: "第三方工具/插件风险",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }

  return dedupeMatches(matches);
}

function collectAntiRequirementParts(text: string): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  for (const match of text.matchAll(HEAVY_ASSIST_DEPENDENCE_RE)) {
    matches.push({
      value: "拒绝绘图轮椅依赖",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "high"
    });
  }
  for (const match of text.matchAll(PLUGIN_DEPENDENCE_RE)) {
    if (isHeavyAssistDependenceContext(text, match.index)) {
      continue;
    }
    matches.push({
      value: "拒绝插件依赖",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }
  for (const match of text.matchAll(PLUGIN_STANCE_DISLIKE_RE)) {
    matches.push({
      value: "拒绝极端插件立场",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }
  for (const match of text.matchAll(ANTI_TOOL_RE)) {
    if (isHeavyAssistDependenceContext(text, match.index) || isPluginNeutralContext(text, match.index)) {
      continue;
    }
    matches.push({
      value: "纯净队/禁第三方",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "high"
    });
  }
  for (const match of text.matchAll(ANTI_CARRY_RE)) {
    matches.push({
      value: "拒绝装甲车/代打记录",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "high"
    });
  }
  for (const match of text.matchAll(ANTI_CHEAT_RE)) {
    matches.push({
      value: "反作弊/异常科技提醒",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }
  for (const match of text.matchAll(ALL_FEMALE_RE)) {
    matches.push({
      value: "全妹队/女生限定",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "high"
    });
  }
  for (const match of text.matchAll(FEMALE_PREFERRED_RE)) {
    matches.push({
      value: "女生优先",
      snippet: snippetAround(text, match.index, match[0].length),
      index: match.index,
      confidence: "medium"
    });
  }
  return dedupeMatches(matches);
}

function isAntiRequirementContext(text: string, index: number): boolean {
  const context = text.slice(Math.max(0, index - 12), Math.min(text.length, index + 18));
  return /禁止|禁用|严禁|拒绝|谢绝|婉拒|不支持|不接受|不欢迎|不允许|不要|不坐|不用|不(?:依赖|使用|开|用)|无|非/.test(
    context
  );
}

function isAntiToolRiskContext(text: string, index: number): boolean {
  const immediateBefore = text.slice(Math.max(0, index - 2), index);
  const before = text.slice(Math.max(0, index - 14), index);
  const after = text.slice(index, Math.min(text.length, index + 18));
  return (
    /不\s*$/.test(immediateBefore) ||
    /禁止|禁用|严禁|拒绝|谢绝|婉拒|不支持|不接受|不欢迎|不允许|不要|不坐|不用|不(?:依赖|使用|开|用)|无|非/.test(before) ||
    /禁止|禁用|严禁|拒绝|谢绝|婉拒|不支持|不接受|不欢迎|不允许|不要|不坐|不用|不(?:依赖|使用|开|用)/.test(after)
  );
}

function isAntiCarryRiskContext(text: string, index: number): boolean {
  return matchesPattern(ANTI_CARRY_RE, contextAround(text, index, 18, 24));
}

function isPluginEcosystemOpenContext(text: string, index: number): boolean {
  return matchesPattern(PLUGIN_ECOSYSTEM_OPEN_RE, contextAround(text, index, 28, 36));
}

function isPluginStanceDislikeContext(text: string, index: number): boolean {
  return matchesPattern(PLUGIN_STANCE_DISLIKE_RE, contextAround(text, index, 18, 24));
}

function isPluginNeutralContext(text: string, index: number): boolean {
  return matchesPattern(PLUGIN_NEUTRAL_STANCE_RE, contextAround(text, index, 36, 72));
}

function isHeavyAssistDependenceContext(text: string, index: number): boolean {
  return matchesPattern(HEAVY_ASSIST_DEPENDENCE_RE, contextAround(text, index, 24, 36));
}

function isTechnologyHeadingContext(text: string, index: number): boolean {
  return /科技\s*(?:方面|上|相关|要求)/.test(contextAround(text, index, 0, 12));
}

function isAntiCheatContext(text: string, index: number): boolean {
  return matchesPattern(ANTI_CHEAT_RE, contextAround(text, index, 24, 36));
}

function isRiskAssistContext(text: string, index: number): boolean {
  return matchesPattern(RISK_ASSIST_RE, contextAround(text, index, 18, 24));
}

function contextAround(text: string, index: number, before: number, after: number): string {
  return text.slice(Math.max(0, index - before), Math.min(text.length, index + after));
}

function collectContactPart(text: string): ParsedTextMatch | null {
  const contactPatterns: Array<{ pattern: RegExp; value: string }> = [
    { pattern: /lxfs|联系方式|联系/i, value: "联系方式" },
    { pattern: /企鹅|\bQQ\b|\bq\b/i, value: "QQ/企鹅" },
    { pattern: /群|群号/i, value: "群" },
    { pattern: /神秘代码/i, value: "神秘代码" },
    { pattern: /站内|私信|nga私信/i, value: "站内/私信" },
    { pattern: /微信|vx/i, value: "微信/VX" }
  ];
  const values: string[] = [];
  let first: ParsedTextMatch | null = null;

  for (const item of contactPatterns) {
    const match = matchPattern(text, item.pattern);
    if (!match) {
      continue;
    }
    pushUnique(values, item.value);
    if (!first || match.index < first.index) {
      first = match;
    }
  }

  if (!first || values.length === 0) {
    return null;
  }
  return {
    value: values.join("、"),
    snippet: maskContactSnippet(first.snippet),
    index: first.index,
    confidence: "medium"
  };
}

function collectContactDetailPart(text: string): ParsedTextMatch | null {
  const windows = collectContactWindows(text);
  const details: string[] = [];
  const seenIds = new Set<string>();
  let firstIndex = -1;
  let firstLength = 0;

  const addDetail = (value: string, index: number, length: number) => {
    const cleanValue = sanitizeContactDetail(value);
    if (!cleanValue) {
      return;
    }
    const identity = getContactDetailIdentity(cleanValue);
    if (seenIds.has(identity)) {
      return;
    }
    seenIds.add(identity);
    details.push(cleanValue);
    if (firstIndex < 0 || index < firstIndex) {
      firstIndex = index;
      firstLength = length;
    }
  };

  for (const window of windows) {
    const qqLikeRe = /(?:lxfs|联系方式|联系|QQ|qq|企鹅|群号|群|神秘代码)\s*[:：]?\s*(\d{5,14})/gi;
    for (const match of window.text.matchAll(qqLikeRe)) {
      const label = /群/.test(match[0]) ? "群" : /神秘代码/i.test(match[0]) ? "神秘代码" : /(?:QQ|qq|企鹅)/.test(match[0]) ? "QQ" : "联系方式";
      addDetail(`${label} ${match[1]}`, window.start + (match.index ?? 0), match[0].length);
    }

    for (const match of window.text.matchAll(/\b\d{5,14}\b/g)) {
      addDetail(`联系方式 ${match[0]}`, window.start + (match.index ?? 0), match[0].length);
    }

    const wechatRe = /(?:微信|vx)\s*[:：]?\s*([A-Za-z][A-Za-z0-9_-]{4,31})/gi;
    for (const match of window.text.matchAll(wechatRe)) {
      addDetail(`微信 ${match[1]}`, window.start + (match.index ?? 0), match[0].length);
    }

    if (/站内|私信|nga私信/i.test(window.text)) {
      addDetail("站内/私信", window.start, Math.min(window.text.length, 12));
    }
  }

  if (!details.length) {
    return null;
  }

  return {
    value: details.slice(0, 4).join("、"),
    snippet: maskContactSnippet(snippetAround(text, firstIndex, firstLength)),
    index: firstIndex,
    confidence: "high"
  };
}

function collectContactWindows(text: string): Array<{ text: string; start: number }> {
  const windows: Array<{ text: string; start: number }> = [];
  const contactLineRe = /(?:lxfs|联系方式|联系|QQ|qq|企鹅|群号|神秘代码|微信|vx|站内|私信|nga私信)[^\n。；;]{0,80}/gi;
  for (const match of text.matchAll(contactLineRe)) {
    windows.push({ text: match[0], start: match.index ?? 0 });
  }
  return windows;
}

function sanitizeContactDetail(value: string): string {
  const trimmed = cleanText(value).replace(/\s+/g, " ");
  if (!trimmed || /cookie|token|password|密码|localStorage|sessionStorage/i.test(trimmed)) {
    return "";
  }
  return trimmed.slice(0, 48);
}

function getContactDetailIdentity(value: string): string {
  const digits = value.match(/\d{5,14}/)?.[0];
  if (digits) {
    return digits;
  }
  return value.toLowerCase();
}

function collectPatternMatches(
  text: string,
  patterns: Array<{ pattern: RegExp; value?: string; confidence?: NgaParseConfidence }>
): ParsedTextMatch[] {
  const matches: ParsedTextMatch[] = [];
  for (const { pattern, value, confidence = "medium" } of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (!match[0]) {
        continue;
      }
      matches.push({
        value: value ?? normalizePatternValue(match[0]),
        snippet: snippetAround(text, match.index, match[0].length),
        index: match.index,
        confidence
      });
    }
    pattern.lastIndex = 0;
  }
  return dedupeMatches(matches);
}

function normalizePatternValue(value: string): string {
  if (/^p\d/i.test(value)) {
    return value.toUpperCase();
  }
  return cleanText(value);
}

function dedupeMatches<T extends ParsedTextMatch>(matches: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const match of matches.sort((left, right) => left.index - right.index || left.value.localeCompare(right.value))) {
    const key = match.value;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(match);
  }
  return result;
}

function normalizePositionToken(value: string): string[] {
  const token = cleanText(value).toUpperCase();
  if (FULL_PARTY_POSITION_KEYS.includes(token as (typeof FULL_PARTY_POSITION_KEYS)[number])) {
    return [token];
  }
  if (token === "T" || /坦克|盾|蓝职/.test(value)) {
    return ["MT", "ST"];
  }
  if (token === "H" || token === "N" || /奶|治疗|绿职/.test(value)) {
    return ["H1", "H2"];
  }
  if (/近战|近D/.test(value)) {
    return ["D1", "D2"];
  }
  if (/远敏|远程物理/.test(value)) {
    return ["D3"];
  }
  if (/法系|远程魔法|法D|法职|远法/.test(value)) {
    return ["D4"];
  }
  if (token === "DPS" || /红职/.test(value)) {
    return ["D1", "D2", "D3", "D4"];
  }
  return [];
}

function expandPositionRange(prefix: string, left: number, right: number, asRange: boolean): string[] {
  const max = prefix === "H" ? 2 : 4;
  if (left < 1 || right < 1 || left > max || right > max) {
    return [];
  }
  if (!asRange) {
    return [`${prefix}${left}`, `${prefix}${right}`];
  }
  const [start, end] = left <= right ? [left, right] : [right, left];
  return Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${start + index}`);
}

function isNegatedAt(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 8), index);
  return /(?:非|不要|不接受|排除)\s*$/.test(before);
}

function hasMechanicPositionContext(text: string, index: number): boolean {
  const left = text.slice(0, index).search(/[^,，。；;\n]*$/);
  const start = left >= 0 ? left : Math.max(0, index - 30);
  const right = text.slice(index).search(/[,，。；;\n]/);
  const end = right >= 0 ? index + right : Math.min(text.length, index + 30);
  const context = text.slice(start, end);
  return /机制位|攻略位|站位|塔位|分摊|散开|左右刀|引导|点名/.test(context);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskContactSnippet(snippet: string): string {
  return snippet
    .replace(/\b\d{5,14}\b/g, "[数字已隐藏]")
    .replace(/((?:QQ|群号|企鹅|神秘代码|微信|vx)[:：\s]*)[A-Za-z0-9_-]{5,}/gi, "$1[已隐藏]");
}

export function shouldShowNgaSample(sample: NgaSample, mode: NgaFilterMode): boolean {
  const signal = classifyNgaSample(sample);
  if (mode === "unrecognized") {
    return true;
  }
  if (signal.isClosed || signal.isNoise) {
    return false;
  }
  if (mode === "strict") {
    return signal.recruitKind === "recruit" || signal.recruitKind === "seeking";
  }
  return true;
}

export function analyzeNgaSamples(samples: NgaSample[], now = new Date()): NgaSampleAnalysisReport {
  const normalizedSamples = samples.map((sample) => sanitizeNgaSample(sample));
  const warnings: string[] = [];
  if (normalizedSamples.length === 0) {
    warnings.push("没有可分析的 NGA 样本。");
  }
  const signals = normalizedSamples.map((sample) => classifyNgaSample(sample));
  const noiseCount = signals.filter((signal) => signal.isNoise).length;
  const closedCount = signals.filter((signal) => signal.isClosed).length;

  const report: NgaSampleAnalysisReport = {
    sampleCount: normalizedSamples.length,
    generatedAt: now.toISOString(),
    fieldPresence: buildFieldPresence(normalizedSamples),
    titleStructures: summarizeCandidates(normalizedSamples.map((sample) => classifyTitleStructure(sample.title))),
    bodyStructures: summarizeCandidates(normalizedSamples.map((sample) => classifyBodyStructure(sample.body))),
    dungeonAliases: collectDungeonCandidates(normalizedSamples),
    progressExpressions: collectPatternCandidates(normalizedSamples, PROGRESS_RE),
    jobPositionExpressions: collectPatternCandidates(normalizedSamples, POSITION_RE),
    timeExpressions: collectTimeCandidates(normalizedSamples),
    unknownExpressions: collectUnknownExpressions(normalizedSamples),
    confirmationQuestions: [],
    warnings
  };

  if (report.fieldPresence.body.missingRate >= 0.8 && normalizedSamples.length > 0) {
    warnings.push("正文缺失率很高；当前样本更像列表页标题快照，建议开启“采集详情正文”补采。");
  }
  if (noiseCount > 0) {
    warnings.push(`发现 ${noiseCount} 条疑似广告、公告或非招募内容，默认不会进入招募卡片。`);
  }
  if (closedCount > 0) {
    warnings.push(`发现 ${closedCount} 条疑似已招满或已关闭招募，默认不会进入招募卡片。`);
  }
  report.confirmationQuestions = buildConfirmationQuestions(report);
  return report;
}

function buildFieldPresence(samples: NgaSample[]): NgaSampleAnalysisReport["fieldPresence"] {
  return Object.fromEntries(
    NGA_SAMPLE_FIELDS.map((field) => {
      const present = samples.filter((sample) => {
        const value = sample[field];
        return typeof value === "number" ? Number.isFinite(value) && value > 0 : Boolean(cleanText(value));
      }).length;
      const missing = samples.length - present;
      return [
        field,
        {
          present,
          missing,
          presentRate: samples.length ? present / samples.length : 0,
          missingRate: samples.length ? missing / samples.length : 0
        }
      ];
    })
  ) as NgaSampleAnalysisReport["fieldPresence"];
}

function classifyTitleStructure(title: string): string {
  const text = title.trim();
  if (!text) {
    return "标题缺失";
  }
  const hasPosition = matchesPattern(POSITION_RE, text);
  const hasTime = matchesPattern(TIME_RE, text);
  const hasProgress = matchesPattern(PROGRESS_RE, text);
  const separators = (text.match(/[|｜/\\\-—–【】[\]()（）]/g) ?? []).length;
  if (hasPosition && hasTime && hasProgress) {
    return "标题强结构型";
  }
  if (separators >= 2 && (hasPosition || hasProgress)) {
    return "标题分隔符结构型";
  }
  if (text.length >= 36) {
    return "标题长句型";
  }
  return "标题短语型";
}

function classifyBodyStructure(body: string): string {
  const text = body.trim();
  if (!text) {
    return "正文缺失";
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labeledLines = lines.filter((line) => /^(时间|进度|攻略|缺|招|要求|联系|职业|服务器|大区|目的)[:：]/.test(line));
  if (labeledLines.length >= 3) {
    return "正文表格型";
  }
  if (/代班|替班|补人|临时|救急/.test(text)) {
    return "补人/替班型";
  }
  if (/固定队|长期|稳定|磨合|氛围|出勤/.test(text)) {
    return "固定队招募型";
  }
  if (lines.length >= 6 || text.length >= 240) {
    return "口语长文型";
  }
  return "未结构化短文型";
}

function collectPatternCandidates(samples: NgaSample[], pattern: RegExp): NgaSampleCandidate[] {
  const matches: string[] = [];
  for (const sample of samples) {
    const text = `${sample.title}\n${sample.body}`;
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = cleanText(match[0]);
      if (value) {
        matches.push(value);
      }
    }
  }
  pattern.lastIndex = 0;
  return summarizeCandidates(matches);
}

function collectDungeonCandidates(samples: NgaSample[]): NgaSampleCandidate[] {
  const matches: string[] = [];
  for (const sample of samples) {
    const text = `${sample.title}\n${sample.body}`;
    DUNGEON_HINT_RE.lastIndex = 0;
    for (const match of text.matchAll(DUNGEON_HINT_RE)) {
      const value = normalizeDungeonCandidate(match[0]);
      if (value && isLikelyDungeonCandidate(value)) {
        matches.push(value);
      }
    }
  }
  DUNGEON_HINT_RE.lastIndex = 0;
  return summarizeCandidates(matches);
}

function collectTimeCandidates(samples: NgaSample[]): NgaSampleCandidate[] {
  const matches: string[] = [];
  for (const sample of samples) {
    const text = `${sample.title}\n${sample.body}`;
    const parsed = parseRecruitTime(text);
    if (parsed.display) {
      matches.push(parsed.display);
    }
  }
  return summarizeCandidates(matches);
}

function normalizeDungeonCandidate(value: string): string {
  const trimmed = cleanText(value).replace(/^[\s[【《(（]+|[\s\]】》)），。；;、]+$/g, "");
  if (/^[a-z]+\d*s$/i.test(trimmed) || /^(top|dsr|ucob|uwu)$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

function isLikelyDungeonCandidate(value: string): boolean {
  if (!value) {
    return false;
  }
  if (/^(?:绝本|绝本经验|绝以上|绝及以上|绝.*经验|极复盘|极沟通|极参与|极.*复盘|极.*沟通)$/i.test(value)) {
    return false;
  }
  return true;
}

function isLikelyTimeCandidate(value: string): boolean {
  if (/(?:晚|晚上|下午|上午|凌晨|周|星期|工作日|平日|周末|双休|每天|今晚|明天|后天|点|[:：])/.test(value)) {
    return true;
  }
  const numbers = value.match(/\d{1,2}/g)?.map(Number) ?? [];
  if (numbers.length < 2) {
    return false;
  }
  const [start, end] = numbers;
  return start >= 6 && start <= 24 && end >= 6 && end <= 24;
}

function collectUnknownExpressions(samples: NgaSample[]): NgaSampleCandidate[] {
  const tokens: string[] = [];
  for (const sample of samples) {
    const text = `${sample.title} ${sample.body}`;
    for (const rawToken of text.split(TOKEN_SPLIT_RE)) {
      const token = rawToken.trim();
      if (!isPotentialUnknownToken(token)) {
        continue;
      }
      tokens.push(token);
    }
  }
  return summarizeCandidates(tokens).filter((candidate) => candidate.count >= 2).slice(0, HIGH_FREQUENCY_LIMIT);
}

function summarizeCandidates(values: string[]): NgaSampleCandidate[] {
  const counts = new Map<string, { count: number; examples: string[] }>();
  for (const rawValue of values) {
    const value = cleanText(rawValue);
    if (!value) {
      continue;
    }
    const current = counts.get(value) ?? { count: 0, examples: [] };
    current.count += 1;
    if (current.examples.length < EXAMPLE_LIMIT) {
      current.examples.push(value);
    }
    counts.set(value, current);
  }

  return [...counts.entries()]
    .map(([value, data]) => ({ value, count: data.count, examples: data.examples }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "zh-CN"))
    .slice(0, HIGH_FREQUENCY_LIMIT);
}

function buildConfirmationQuestions(report: NgaSampleAnalysisReport): string[] {
  const questions: string[] = [];
  for (const candidate of report.dungeonAliases.slice(0, 8)) {
    if (!shouldAskCandidate(candidate.value)) {
      continue;
    }
    questions.push(`副本简称“${candidate.value}”应映射到哪个正式副本？`);
  }
  for (const candidate of report.progressExpressions.slice(0, 8)) {
    if (!shouldAskCandidate(candidate.value)) {
      continue;
    }
    questions.push(`进度表达“${candidate.value}”在筛选中应如何归类？`);
  }
  for (const candidate of report.jobPositionExpressions.slice(0, 8)) {
    if (!shouldAskCandidate(candidate.value)) {
      continue;
    }
    questions.push(`职业/位置表达“${candidate.value}”是否有固定含义或等价位置？`);
  }
  for (const candidate of report.unknownExpressions.slice(0, 8)) {
    if (!shouldAskCandidate(candidate.value)) {
      continue;
    }
    questions.push(`高频表达“${candidate.value}”是否是 NGA/FF14 招募黑话？`);
  }
  return [...new Set(questions)].slice(0, 24);
}

function shouldAskCandidate(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && !STOP_WORDS.has(normalized) && !isNgaNoiseText(normalized);
}

function hasRecruitSignal(text: string): boolean {
  return (
    matchesPattern(RECRUIT_RE, text) ||
    Boolean(findSeekingSnippet(text)) ||
    matchesPattern(CLOSED_RE, text) ||
    matchesPattern(TITLE_RECRUIT_SIGNAL_RE, text) ||
    matchesTeamSizeLike(text) ||
    matchesPattern(DUNGEON_HINT_RE, text) ||
    matchesPattern(PROGRESS_RE, text) ||
    matchesPattern(POSITION_RE, text)
  );
}

function matchesPattern(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  const result = pattern.test(text);
  pattern.lastIndex = 0;
  return result;
}

function toGlobalRegExp(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

function normalizeNgaStartUrl(value: unknown): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_NGA_COLLECTION_SETTINGS.startUrl;
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)) {
      return DEFAULT_NGA_COLLECTION_SETTINGS.startUrl;
    }
    if (!isNgaHost(url.hostname)) {
      return DEFAULT_NGA_COLLECTION_SETTINGS.startUrl;
    }
    url.protocol = "https:";
    const boardUrl = canonicalizeNgaRecruitBoardUrl(url);
    if (boardUrl) {
      return boardUrl;
    }
    return url.toString();
  } catch {
    return DEFAULT_NGA_COLLECTION_SETTINGS.startUrl;
  }
}

function normalizeNgaSelectedBoardUrls(value: unknown, fallback: string, allowMultipleBoards: boolean): string[] {
  const candidates = Array.isArray(value) ? value : [];
  const selected: string[] = [];
  for (const candidate of candidates) {
    const url = normalizeNgaBoardUrl(candidate);
    if (url && !selected.includes(url)) {
      selected.push(url);
    }
  }
  if (!selected.length && NGA_RECRUIT_BOARD_URL_SET.has(fallback)) {
    selected.push(fallback);
  }
  const normalized = selected.length ? selected : [...DEFAULT_NGA_SELECTED_BOARD_URLS];
  return allowMultipleBoards ? normalized : [normalized[0]];
}

function normalizeNgaBoardUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || !isNgaHost(url.hostname)) {
      return "";
    }
    url.protocol = "https:";
    const normalized = canonicalizeNgaRecruitBoardUrl(url) ?? url.toString();
    return NGA_RECRUIT_BOARD_URL_SET.has(normalized) ? normalized : "";
  } catch {
    return "";
  }
}

function canonicalizeNgaRecruitBoardUrl(url: URL): string | null {
  const pathFile = url.pathname.toLowerCase().split("/").pop();
  if (pathFile !== "thread.php") {
    return null;
  }
  const stid = url.searchParams.get("stid")?.trim();
  if (!stid) {
    return null;
  }
  for (const boardUrl of Object.values(NGA_RECRUIT_BOARD_URLS)) {
    const board = new URL(boardUrl);
    if (board.searchParams.get("stid") === stid) {
      return boardUrl;
    }
  }
  return null;
}

export function isSameNgaTargetUrl(currentUrl: string | undefined, expectedUrl: string): boolean {
  try {
    const current = new URL(currentUrl || "");
    const expected = new URL(expectedUrl);
    const currentFile = current.pathname.toLowerCase().split("/").pop();
    const expectedFile = expected.pathname.toLowerCase().split("/").pop();
    if (currentFile !== expectedFile) {
      return false;
    }
    if (expectedFile === "thread.php") {
      return (
        current.searchParams.get("stid") === expected.searchParams.get("stid") &&
        normalizeNgaBoardPage(current.searchParams.get("page")) === normalizeNgaBoardPage(expected.searchParams.get("page"))
      );
    }
    if (expectedFile === "read.php") {
      return current.searchParams.get("tid") === expected.searchParams.get("tid");
    }
  } catch {
    return false;
  }
  return false;
}

function normalizeNgaBoardPage(value: string | null): string {
  const raw = value?.trim();
  if (!raw) {
    return "1";
  }
  const page = Number(raw);
  if (!Number.isFinite(page) || page < 1) {
    return raw;
  }
  return String(Math.trunc(page));
}

function isNgaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "bbs.nga.cn" || host === "nga.178.com" || host === "ngabbs.com" || host.endsWith(".nga.cn");
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 8000);
}

function stripNgaAuthorMetadata(value: string): string {
  let text = value.trim();
  const metadata =
    /(?:^|[\s_·\-—|｜])\/?#\S+\s+\d+\S*.*?(?:级别[:：]|声望[:：]?|威望[:：]?|注册[:：]\s*\d{2}-\d{2}-\d{2}).*$/i.exec(text) ??
    /\/?#\S+\s+\d+\S*.*?(?:注册[:：]\s*\d{2}-\d{2}-\d{2}).*$/i.exec(text) ??
    /\/?#\S+\s+\d+\s*级别[:：].*?(?:注册[:：]\s*\d{2}-\d{2}-\d{2})?.*$/i.exec(text);
  if (metadata?.index !== undefined) {
    text = text.slice(0, metadata.index).replace(/\s*[·\-—|｜]\s*[^·\-—|｜/]{1,24}$/u, "").trim();
    return text;
  }
  return text.replace(/\s*(?:[·\-—|｜]\s*)?级别[:：].*?(?:注册[:：]\s*\d{2}-\d{2}-\d{2})?.*$/i, "").trim();
}

function cleanNgaTitle(value: unknown): string {
  return stripNgaAuthorMetadata(cleanText(value));
}

function cleanUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  try {
    const url = new URL(value, DEFAULT_NGA_COLLECTION_SETTINGS.startUrl);
    if (!isNgaHost(url.hostname)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function cleanIdentifier(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  const text = String(value).trim();
  return /^[\w-]{1,40}$/.test(text) ? text : "";
}

function cleanPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return Math.round(parsed);
}

function ngaSampleKey(sample: NgaSample): string {
  return sample.topicId || sample.url || `${sample.title}:${sample.author}`;
}

function mergeNgaSamplePair(current: NgaSample, incoming: NgaSample): NgaSample {
  const currentScore = ngaSampleCompletenessScore(current);
  const incomingScore = ngaSampleCompletenessScore(incoming);
  const primary = incomingScore > currentScore ? incoming : current;
  const fallback = primary === incoming ? current : incoming;
  const seenAgainAfterArchive = Boolean(incoming.lastBoardSeenAt && !incoming.archivedAt && current.archivedAt);
  return {
    title: primary.title || fallback.title,
    body: primary.body || fallback.body,
    url: primary.url || fallback.url,
    author: primary.author || fallback.author,
    publishedAt: primary.publishedAt || fallback.publishedAt,
    updatedAt: primary.updatedAt || fallback.updatedAt,
    forumId: primary.forumId || fallback.forumId,
    topicId: primary.topicId || fallback.topicId,
    lastCheckedAt: latestIsoish(primary.lastCheckedAt, fallback.lastCheckedAt),
    lastSeenAt: latestIsoish(primary.lastSeenAt, fallback.lastSeenAt),
    detailFetchedAt: latestIsoish(primary.detailFetchedAt, fallback.detailFetchedAt),
    contentHash: primary.contentHash || fallback.contentHash || computeNgaSampleContentHash(primary),
    closedAt: latestIsoish(primary.closedAt, fallback.closedAt),
    sourceBoardUrl: primary.sourceBoardUrl || fallback.sourceBoardUrl,
    lastBoardSeenAt: latestIsoish(primary.lastBoardSeenAt, fallback.lastBoardSeenAt),
    lastBoardRank: primary.lastBoardRank ?? fallback.lastBoardRank,
    lastFullWindowScanAt: latestIsoish(primary.lastFullWindowScanAt, fallback.lastFullWindowScanAt),
    archivedAt: seenAgainAfterArchive ? "" : latestIsoish(primary.archivedAt, fallback.archivedAt),
    archiveReason: seenAgainAfterArchive ? "" : primary.archiveReason || fallback.archiveReason
  };
}

function hasNgaSampleContentChanged(previous: NgaSample, next: NgaSample): boolean {
  const previousHash = previous.contentHash || computeNgaSampleContentHash(previous);
  const nextHash = next.contentHash || computeNgaSampleContentHash(next);
  if (previousHash !== nextHash) {
    return true;
  }
  return Boolean(next.body && previous.body && next.body !== previous.body);
}

export function isNgaSampleSoftClosed(sample: NgaSample): boolean {
  return Boolean(sample.closedAt) || classifyNgaSample(sample).isClosed;
}

export function normalizeNgaCacheReviewSamples<T extends Partial<Record<keyof NgaSample, unknown>>>(
  inputs: T[],
  maxItems: number,
  now = new Date()
): NgaSample[] {
  const nowIso = now.toISOString();
  return mergeNgaSamples(inputs, maxItems).map((sample) => {
    if (!sample.closedAt && isNgaSampleSoftClosed(sample)) {
      return {
        ...sample,
        closedAt: nowIso
      };
    }
    return sample;
  });
}

export interface NgaCacheLifecycleOptions {
  activeWindowSize: number;
  scannedCount: number;
  scannedAt?: string | Date;
  now?: Date;
  archiveAfterDays?: number;
  deleteAfterDays?: number;
}

export interface NgaCacheLifecycleResult {
  samples: NgaSample[];
  archivedCount: number;
  deletedCount: number;
  archivedKeys: string[];
  deletedKeys: string[];
}

export function isNgaSampleArchived(sample: NgaSample): boolean {
  return Boolean(sanitizeNgaSample(sample).archivedAt);
}

export function applyNgaCacheLifecycle(
  inputs: NgaSample[],
  options: NgaCacheLifecycleOptions
): NgaCacheLifecycleResult {
  const now = options.now ?? new Date();
  const scanAt =
    options.scannedAt instanceof Date ? options.scannedAt : new Date(options.scannedAt || now.toISOString());
  const scanTime = Number.isFinite(scanAt.getTime()) ? scanAt.getTime() : now.getTime();
  const scanIso = new Date(scanTime).toISOString();
  const activeWindowSize = clampInteger(options.activeWindowSize, MIN_MAX_ITEMS, MAX_MAX_ITEMS);
  const scannedCount = Math.max(0, Math.round(Number(options.scannedCount) || 0));
  const fullWindowScanned = scannedCount >= activeWindowSize;
  const archiveAfterDays = options.archiveAfterDays ?? NGA_ARCHIVE_AFTER_DAYS;
  const archiveEnabled = archiveAfterDays > 0;
  const archiveCutoff = now.getTime() - archiveAfterDays * 24 * 60 * 60 * 1000;
  const deleteCutoff = now.getTime() - (options.deleteAfterDays ?? NGA_DELETE_AFTER_DAYS) * 24 * 60 * 60 * 1000;
  const archivedKeys: string[] = [];
  const deletedKeys: string[] = [];
  const kept: NgaSample[] = [];

  for (const sample of mergeNgaSamples(inputs, NGA_MAX_SAMPLE_STORE_ITEMS)) {
    const key = getNgaSampleKey(sample);
    const archivedAt = parseNgaCacheTime(sample.archivedAt);
    const lastActivity = getNgaSampleLastActivityTime(sample);
    const seenAt = parseNgaCacheTime(sample.lastBoardSeenAt);
    const seenInThisFullWindow = fullWindowScanned && seenAt !== undefined && seenAt >= scanTime - 60_000;
    const deleteByArchiveAge = archivedAt !== undefined && archivedAt < deleteCutoff;
    const deleteByInactiveAge =
      archiveEnabled && fullWindowScanned && !seenInThisFullWindow && lastActivity !== undefined && lastActivity < deleteCutoff;

    if (deleteByArchiveAge || deleteByInactiveAge) {
      if (key) {
        deletedKeys.push(key);
      }
      continue;
    }

    let next = sample;
    const shouldArchive =
      fullWindowScanned &&
      archiveEnabled &&
      !sample.archivedAt &&
      !seenInThisFullWindow &&
      lastActivity !== undefined &&
      lastActivity < archiveCutoff;
    if (shouldArchive) {
      next = {
        ...next,
        archivedAt: scanIso,
        archiveReason: `超过 ${archiveAfterDays} 天未在活跃窗口出现`
      };
      if (key) {
        archivedKeys.push(key);
      }
    }
    if (fullWindowScanned) {
      next = {
        ...next,
        lastFullWindowScanAt: scanIso
      };
    }
    kept.push(next);
  }

  return {
    samples: mergeNgaSamples(kept, NGA_MAX_SAMPLE_STORE_ITEMS),
    archivedCount: archivedKeys.length,
    deletedCount: deletedKeys.length,
    archivedKeys,
    deletedKeys
  };
}

function latestIsoish(a?: string, b?: string): string {
  const first = cleanText(a);
  const second = cleanText(b);
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  const firstTime = Date.parse(first);
  const secondTime = Date.parse(second);
  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) {
    return first || second;
  }
  return firstTime >= secondTime ? first : second;
}

function parseNgaCacheTime(value?: string): number | undefined {
  const text = cleanText(value);
  if (!text) {
    return undefined;
  }
  const native = Date.parse(text);
  if (Number.isFinite(native)) {
    return native;
  }
  const match = text.match(/(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})(?:\s+(\d{1,2})[:：](\d{2}))?/);
  if (!match) {
    return undefined;
  }
  const timestamp = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] || 0),
    Number(match[5] || 0)
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function getNgaSampleLastActivityTime(sample: NgaSample): number | undefined {
  return [
    sample.lastBoardSeenAt,
    sample.updatedAt,
    sample.lastSeenAt,
    sample.detailFetchedAt,
    sample.lastCheckedAt,
    sample.publishedAt
  ]
    .map(parseNgaCacheTime)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => b - a)[0];
}

function ngaSampleCompletenessScore(sample: NgaSample): number {
  return (
    (sample.body ? Math.min(sample.body.length, 8000) : 0) +
    (sample.title ? 80 : 0) +
    (sample.author ? 20 : 0) +
    (sample.publishedAt ? 20 : 0) +
    (sample.updatedAt ? 30 : 0) +
    (sample.forumId ? 10 : 0) +
    (sample.topicId ? 10 : 0) +
    (sample.lastCheckedAt ? 2 : 0) +
    (sample.lastSeenAt ? 2 : 0) +
    (sample.lastBoardSeenAt ? 1 : 0)
  );
}

function clampInteger(value: unknown, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function isPotentialUnknownToken(token: string): boolean {
  if (token.length < 2 || token.length > 16) {
    return false;
  }
  const normalized = token.toLowerCase();
  if (STOP_WORDS.has(normalized) || /^\d+$/.test(normalized)) {
    return false;
  }
  if (/qq|微信|vx|群号|http|www|com|cn/i.test(token)) {
    return false;
  }
  return /[A-Za-z]{2,}|[\u4e00-\u9fa5]{2,}/.test(token);
}
