import fs from "node:fs";
import path from "node:path";
import { classifyNgaSample, sanitizeNgaSample } from "../src/lib/nga";
import type { NgaSample, NgaSampleSignal, PositionKey } from "../src/types";

const DEFAULT_SAMPLE_PATH =
  "C:\\Users\\12553\\AppData\\Roaming\\com.today080221.risingstones.partyfinderhelper\\nga-samples.json";
const EXPECTED_SAMPLE_COUNT = 396;

type FieldKey = keyof NonNullable<NgaSampleSignal["parsedFields"]>;

interface Fixture {
  name: string;
  sample: Partial<NgaSample>;
  expect: {
    recruitKind?: NgaSampleSignal["recruitKind"];
    isNoise?: boolean;
    isClosed?: boolean;
    positionsExact?: string[];
    positionsInclude?: string[];
    jobsExact?: string[];
    jobsInclude?: string[];
    jobsAbsent?: string[];
    excludedJobsInclude?: string[];
    excludedPositionsAbsent?: string[];
    rosterSlots?: Partial<Record<PositionKey, string[]>>;
    vacancyFlexGroupsInclude?: PositionKey[][];
    rosterFlexGroupsInclude?: PositionKey[][];
    vacancyFlexGroupsAbsent?: PositionKey[][];
    rosterFlexGroupsAbsent?: PositionKey[][];
    time?: string;
    dailyDuration?: string;
    dungeon?: string;
    requirements?: string;
    requirementsIncludes?: string[];
    tagsInclude?: string[];
    warningsInclude?: string[];
    fieldUndefined?: FieldKey[];
    strategyNotIncludes?: string[];
  };
}

interface CheckResult {
  fixture: string;
  check: string;
  pass: boolean;
  actual?: unknown;
  expected?: unknown;
}

const FIXTURES: Fixture[] = [
  {
    name: "compact roster with 7=1 D4 vacancy",
    sample: {
      title: "[7.51新绝本]绝妖星乱舞美西时差/国内下午争次周保三队7=1 d4",
      body: "队内配置 战骑白学僧镰诗7=1 d4 (来个黑黑的爷，画家亦可)。"
    },
    expect: {
      recruitKind: "recruit",
      positionsExact: ["D4"],
      jobsInclude: ["黑魔法师", "绘灵法师"],
      rosterSlots: {
        MT: ["战士"],
        ST: ["骑士"],
        H1: ["白魔法师"],
        H2: ["学者"],
        D1: ["武僧"],
        D2: ["钐镰客"],
        D3: ["吟游诗人"]
      }
    }
  },
  {
    name: "role ordered composition keeps healer flex vacancy",
    sample: {
      title: "[陆行鸟区]绝妖星上2休1，7=1奶，预计1~1.5月通关，可跨区",
      body: "职业构成：骑枪蛇龙(镰)机画(赤)+任意占学，六个队友均为队长内推。招募要求：占or学，零式logs清CD不灰不绿即可。"
    },
    expect: {
      positionsInclude: ["H1", "H2"],
      jobsInclude: ["占星术士", "学者"],
      vacancyFlexGroupsInclude: [["H1", "H2"]],
      rosterFlexGroupsInclude: [["H1", "H2"]],
      rosterSlots: {
        MT: ["骑士"],
        ST: ["绝枪战士"],
        H1: ["占星术士", "学者"],
        H2: ["占星术士", "学者"],
        D1: ["蝰蛇剑士"],
        D2: ["龙骑士", "钐镰客"],
        D3: ["机工士"],
        D4: ["绘灵法师", "赤魔法师"]
      }
    }
  },
  {
    name: "job before position roster and D2 alternatives",
    sample: {
      title: "[猫小胖/猫区][绝凯夫卡]固定队5=3招募D2",
      body: "固定队情况：配置武士/蛇(d1)、舞者/机工(d3)、画家/黑魔(d4)、白魔/占(h1)、学者(h2)守时不咕。招募情况：招募D2(侍、龙、忍、武僧)要求logs紫以上。"
    },
    expect: {
      positionsExact: ["D2"],
      jobsInclude: ["武士", "龙骑士", "忍者", "武僧"],
      rosterSlots: {
        H1: ["白魔法师", "占星术士"],
        H2: ["学者"],
        D1: ["武士", "蝰蛇剑士"],
        D3: ["舞者", "机工士"],
        D4: ["绘灵法师", "黑魔法师"]
      }
    }
  },
  {
    name: "pure 4=4 open slots without roster jobs leaking into demand",
    sample: {
      title: "[绝凯夫卡][猫区打]纯净首月队4=4 (MTSTD3D4)",
      body: "纯净首月队4=4(需求双T双远)现有:占(H1)，贤/学(H2)，盘/侍(D1)，龙/镰(D2)。招募位置：MT、ST、D3、D4，职业不限定。每天20:30-23:30。"
    },
    expect: {
      positionsInclude: ["MT", "ST", "D3", "D4"],
      fieldUndefined: ["jobs"],
      rosterSlots: {
        H1: ["占星术士"],
        H2: ["贤者", "学者"],
        D1: ["武士"],
        D2: ["龙骑士", "钐镰客"]
      }
    }
  },
  {
    name: "dedupe schedule and duration",
    sample: {
      title: "妖星乱舞 次月社畜队 7=1 D1/2",
      body: "晚间队，周二晚上8-10点开荒，周末休，每天打2-3小时。"
    },
    expect: {
      time: "周二 20:00-22:00",
      dailyDuration: "2-3小时/天"
    }
  },
  {
    name: "fixed rest day exclusion",
    sample: {
      title: "[绝凯夫卡] 6月中旬开打，次月队7=1 d3或d4",
      body: "上班时间：上6休1，固定休周一，每晚2小时，北京时间 21:30 - 23:30。"
    },
    expect: {
      positionsExact: ["D3", "D4"],
      vacancyFlexGroupsInclude: [["D3", "D4"]],
      time: "周二-周日 21:30-23:30",
      dailyDuration: "2小时/天"
    }
  },
  {
    name: "multiple rest day exclusion with counted roster groups",
    sample: {
      title: "绝凯夫卡首月保次月，社畜晚间9-12队7=1 d4",
      body: "目前已有：2T战/dk+骑；双奶白/占+学；2近龙+镰；d3诗人/机工。上班时间：晚9-12，周休2天，休周二周五。"
    },
    expect: {
      positionsExact: ["D4"],
      time: "周一/周三/周四/周六/周日 21:00-24:00",
      rosterSlots: {
        MT: ["战士", "暗黑骑士"],
        ST: ["骑士"],
        H1: ["白魔法师", "占星术士"],
        H2: ["学者"],
        D1: ["龙骑士"],
        D2: ["钐镰客"],
        D3: ["吟游诗人", "机工士"]
      }
    }
  },
  {
    name: "D1/2 vacancy stays one melee flex group",
    sample: {
      title: "绝妖星六月4=4双奶+d1/2+d3",
      body: "要求五绝，晚9-11，缺 d1/2、d3、h1、h2。"
    },
    expect: {
      positionsInclude: ["D1", "D2", "D3", "H1", "H2"],
      vacancyFlexGroupsInclude: [["D1", "D2"]]
    }
  },
  {
    name: "counted role vacancies after 6=2",
    sample: {
      title: "7.5新绝 首月 晚间 社畜队6=2 (1近战1法系)",
      body: "队伍配置：暗骑白学镰舞。要求：紫色以上，时间19:30-23:30。"
    },
    expect: {
      positionsInclude: ["D1", "D2", "D4"],
      vacancyFlexGroupsInclude: [["D1", "D2"]],
      rosterSlots: {
        MT: ["暗黑骑士"],
        ST: ["骑士"],
        H1: ["白魔法师"],
        H2: ["学者"],
        D1: ["钐镰客"],
        D3: ["舞者"]
      }
    }
  },
  {
    name: "latin DK roster abbreviation",
    sample: {
      title: "7.51 绝本晚间固定队招募 6=2 st d4",
      body: "队伍说明现有阵容：MTdk H1白/占 H2学者 D1近战可切 D2武僧 D3舞者需求职业：ST D4。"
    },
    expect: {
      positionsExact: ["D4", "ST"],
      rosterSlots: {
        MT: ["暗黑骑士"],
        H1: ["占星术士", "白魔法师"],
        H2: ["学者"],
        D1: ["任意近战"],
        D2: ["武僧"],
        D3: ["舞者"]
      }
    }
  },
  {
    name: "flexible existing member plus open flex slots",
    sample: {
      title: "7.5绝凯夫卡开荒队招募5=3",
      body: "现有：MT/ST(战士/骑士/DK)，H2(学者)，D1/2(忍者/武僧)，D3(诗人/其他可切)，D4(黑魔/画家)招募：MT/ST、H1、D1/2。时间20:00-24:00。"
    },
    expect: {
      positionsInclude: ["MT", "ST", "H1", "D1", "D2"],
      vacancyFlexGroupsInclude: [["MT", "ST"], ["D1", "D2"]],
      rosterFlexGroupsInclude: [["MT", "ST"], ["D1", "D2"]],
      rosterSlots: {
        MT: ["战士", "骑士", "暗黑骑士"],
        ST: ["战士", "骑士", "暗黑骑士"],
        H2: ["学者"],
        D1: ["忍者", "武僧"],
        D2: ["忍者", "武僧"],
        D3: ["吟游诗人", "舞者", "机工士"],
        D4: ["黑魔法师", "绘灵法师"]
      }
    }
  },
  {
    name: "7=1 title overrides roster labels",
    sample: {
      title: "次月队绝妖星乱舞7=1 D4",
      body: "职业：MT 战士ST 骑士H1 白魔/占星H2 学者D1 镰刀D2 龙骑D3 舞者D4 攻略：国服主流攻略。时间：周一到周五晚上8点半-10点半。要求：logs紫。"
    },
    expect: {
      positionsExact: ["D4"],
      fieldUndefined: ["jobs"],
      rosterSlots: {
        MT: ["战士"],
        ST: ["骑士"],
        H1: ["白魔法师", "占星术士"],
        H2: ["学者"],
        D1: ["钐镰客"],
        D2: ["龙骑士"],
        D3: ["舞者"]
      }
    }
  },
  {
    name: "shield healer remains H2 when H1 vacancy exists",
    sample: {
      title: "绝凯夫卡进度队6=2H1,D1&2",
      body: "目前队伍构成:战 枪 学 龙 诗 画现缺D1or2，H1许愿占星上班时间:晚上8:30/9-11:30/12，打5休1视情况加班。使用攻略:攻略野队一套，熟读攻略并提前了解下p机制语音软件:oopz联系方式:QQ652366726，请备注职业及位置"
    },
    expect: {
      positionsInclude: ["H1", "D1", "D2"],
      jobsExact: ["占星术士"],
      vacancyFlexGroupsInclude: [["D1", "D2"]],
      rosterSlots: {
        MT: ["战士"],
        ST: ["绝枪战士"],
        H2: ["学者"],
        D3: ["吟游诗人"],
        D4: ["绘灵法师"]
      },
      strategyNotIncludes: ["联系方式"]
    }
  },
  {
    name: "separate H1 H2 vacancies do not merge",
    sample: {
      title: "[跨大区]零式清cd队招募h1h2和d4队友，5=3",
      body: "零式清cd队招募h1h2和d4队友，5=3，在鸟区打招募职位：h1，h2和d4已有职位：ST骑，MT战，D1赤，D2僧，D3舞招募要求：机制熟练网络稳定打本时间：周二的晚上8点~10点攻略：10层美式11层闲人直飞tndd"
    },
    expect: {
      positionsInclude: ["H1", "H2", "D4"],
      vacancyFlexGroupsAbsent: [["H1", "H2"]],
      rosterSlots: {
        MT: ["战士"],
        ST: ["骑士"],
        D1: ["赤魔法师"],
        D2: ["武僧"],
        D3: ["舞者"]
      }
    }
  },
  {
    name: "neutral risk and anti-cheat wording",
    sample: {
      title: "绝妖星 7=1 D3",
      body: "日常掉线/游戏崩溃/电脑死机/莫名其妙的亚拉戈科技小子请慎重。"
    },
    expect: {
      positionsExact: ["D3"],
      requirements: "反作弊/异常科技提醒"
    }
  },
  {
    name: "armored carry invisible wording is anti-carry",
    sample: {
      title: "[新绝][猫区打] 绝妖星乱舞-开放后第二周开打，6=2 招1近战D4，计划攻略时间3-4周",
      body: "队内使用TTS及科技。装甲车过本看不到我。"
    },
    expect: {
      positionsInclude: ["D4"],
      requirements: "第三方工具/插件风险、拒绝装甲车/代打记录",
      tagsInclude: ["第三方工具/插件风险", "拒绝装甲车/代打记录"],
      warningsInclude: ["第三方工具/插件风险"]
    }
  },
  {
    name: "no technology wording stays clean stance",
    sample: {
      title: "绝妖星无科技首月队",
      body: "队内不使用科技，希望你有无科技绝本经验，打本不依赖科技。"
    },
    expect: {
      requirements: "纯净队/禁第三方"
    }
  },
  {
    name: "tool timeline only when explicit tools are nearby",
    sample: {
      title: "绝欧固定队 招H2",
      body: "允许 ACT 时间轴和 TTS 播报，轮椅可自备。"
    },
    expect: {
      requirementsIncludes: ["ACT 时间轴/TTS 辅助"],
      warningsInclude: ["ACT 时间轴/TTS 辅助"]
    }
  },
  {
    name: "standalone timeline is neutral",
    sample: {
      title: "绝妖星 7=1 D4",
      body: "减伤：出详细时间轴后奶妈会安排全队减伤，希望你可以严格执行。"
    },
    expect: {
      positionsExact: ["D4"],
      fieldUndefined: ["requirements"]
    }
  },
  {
    name: "edited post is closed",
    sample: {
      title: "编辑123456",
      body: "编辑[数字已隐藏]"
    },
    expect: {
      recruitKind: "closed",
      isClosed: true,
      tagsInclude: ["已关闭"]
    }
  },
  {
    name: "low information metadata-only post is noise",
    sample: {
      title: "零式/#0小鸡毛的小白 66506801声望: 30(lv0)威望: 1(学徒)注册: 24-12-31财富: 3",
      body: "#0小鸡毛的小白 66506801声望: 30(lv0)威望: 1(学徒)注册: 24-12-31财富: 3"
    },
    expect: {
      recruitKind: "noise",
      isNoise: true,
      tagsInclude: ["疑似噪音"]
    }
  },
  {
    name: "explicit empty roster table",
    sample: {
      title: "[跨大区] [7.51绝妖星乱舞]首月晚间队开招 9~12点打6休1",
      body: "目前队伍组成 MT:空 ST:空 H1:白魔 H2:学者 D1:空 D2:空 D3:舞者 D4:赤魔/画家可切。晚上8:45开组，9点进本，打本时间9:00-12:00。"
    },
    expect: {
      positionsInclude: ["MT", "ST", "D1", "D2"],
      time: "21:00-24:00",
      rosterSlots: {
        H1: ["白魔法师"],
        H2: ["学者"],
        D3: ["舞者"],
        D4: ["赤魔法师", "绘灵法师"]
      }
    }
  },
  {
    name: "simple 7=1 D3 override",
    sample: {
      title: "7.51绝凯夫卡保次周爆肝队7=1 d3",
      body: "目前已有：MT ST H1 H2 D1 D2 D4。北京时间12:00-18:00，欢迎D3。"
    },
    expect: {
      positionsExact: ["D3"],
      excludedPositionsAbsent: ["MT", "ST"]
    }
  },
  {
    name: "non-job wording excludes job not position",
    sample: {
      title: "[豆豆柴/狗区] 绝凯夫卡次月晚间队9-11，7=1非绝枪MT",
      body: "目前配置：枪 战 武士 蝰蛇 舞者 黑魔 白魔 学者，首月伊甸。保底次月过本，要求非绝枪MT。"
    },
    expect: {
      positionsExact: ["MT"],
      excludedJobsInclude: ["绝枪战士"],
      excludedPositionsAbsent: ["MT"]
    }
  },
  {
    name: "plus separated roster list with title H2",
    sample: {
      title: "7.51绝妖星乱舞休闲队(7=1 H2)",
      body: "队伍概述：目前构成 2T+H1+D1+D2+D3+D4(骑士+黑骑+占星+龙骑+忍者+舞者+画家)，招H2。"
    },
    expect: {
      positionsExact: ["H2"],
      rosterSlots: {
        MT: ["骑士"],
        ST: ["暗黑骑士"],
        H1: ["占星术士"],
        D1: ["龙骑士"],
        D2: ["忍者"],
        D3: ["舞者"],
        D4: ["绘灵法师"]
      },
      rosterFlexGroupsAbsent: [["H1", "D1"], ["D2", "D3"]]
    }
  },
  {
    name: "direct role demand with colon locks melee vacancy",
    sample: {
      title: "绝卡卡首月无休晚8:40-11:40 队7=1",
      body:
        "立刻开打的首月队，无休无休无休。时间晚8:40~11:40周六周日下午或者晚上会有1~3小时的加班时间。预计70小时过本阵容：坦 占学 忍 舞 黑/画 一人补位队内除奶妈和D3外都有国际服经验。现招募：近战，要求绝亚特欧经验。"
    },
    expect: {
      positionsExact: ["D1", "D2"],
      jobsInclude: ["任意近战"],
      vacancyFlexGroupsInclude: [["D1", "D2"]]
    }
  },
  {
    name: "full-width midnight range",
    sample: {
      title: "巴哈姆特绝境战 7=1 D4",
      body: "夜班子队，晚12：00-2:00，缺D4。"
    },
    expect: {
      positionsExact: ["D4"],
      time: "00:00-02:00"
    }
  },
  {
    name: "phased first-week and second-week schedule",
    sample: {
      title: "妖星乱舞绝境战 时差队 5=3 双近战一远敏 保首月 首周爆肝次周后国内时间中午3h",
      body:
        "时间：首周每天6-8h，国内时间早上10:00-14:00，晚上21:00-1:00次周开始每天3h，国内时间早上11:00-14:00。招募职业：d1 d2 d3要求：1封m1-4s或首周/6绝/零式无攻略经验以上三选一。"
    },
    expect: {
      positionsExact: ["D1", "D2", "D3"],
      time: "首周 每天 10:00-14:00、21:00-次日01:00；次周开始 每天 11:00-14:00",
      dailyDuration: "首周 6-8小时/天、次周开始 3小时/天"
    }
  },
  {
    name: "known existing roles infer missing DPS slots",
    sample: {
      title: "[首月队5=3]凌晨11-2绝卡夫卡首月进度队5=3",
      body: "本队时间：晚间11-凌晨2点，无休职业：已有双T双奶d3；需求：D1 D2 D4。"
    },
    expect: {
      positionsInclude: ["D1", "D2", "D4"]
    }
  },
  {
    name: "plus q contact with useful body",
    sample: {
      title: "[跨大区] 绝妖星5=3 晚8-11",
      body: "绝妖星5=3，现有h1d3双t和武士，t可以切忍者，首日进本，看难度预计60-80小时过本。要求6绝或者任意9-12s首周，有较好的图文攻略理解能力，能自己录屏复盘。每天晚上8-11，无休或者上6休1，周末看情况加班，力求早日过本。时间充裕能加练的看情况放宽要求。➕q455670793"
    },
    expect: {
      recruitKind: "recruit",
      positionsInclude: ["D2", "D4", "H2"],
      time: "每天 20:00-23:00",
      dailyDuration: "约3小时/天",
      requirementsIncludes: ["6绝"]
    }
  }
];

function main() {
  const samplePath = process.env.NGA_SAMPLES_PATH || DEFAULT_SAMPLE_PATH;
  const store = readSampleStore(samplePath);
  const samples = store.samples.map((sample) => sanitizeNgaSample(sample));
  const signals = samples.map((sample) => classifyNgaSample(sample));
  const samplePool = summarizeSamplePool(store, samples, signals, samplePath);
  const curated = runFixtures();
  const report = {
    generatedAt: new Date().toISOString(),
    samplePool,
    curated,
    notes: [
      "samplePool coverage is parser coverage over all local samples, not human-labeled correctness.",
      "curated accuracy is measured on hand-labeled edge cases from the NGA parser review thread."
    ]
  };

  console.log(JSON.stringify(report, null, 2));
  console.log(
    `NGA parser curated checks: ${curated.passed}/${curated.total} (${formatPercent(curated.accuracy)}), ` +
      `95% CI ${formatPercent(curated.wilson95[0])}-${formatPercent(curated.wilson95[1])}.`
  );
  console.log(
    `Sample pool: ${samplePool.total} total, ${samplePool.withBody} with body, ` +
      `${samplePool.highConfidenceEffective} high-confidence effective rows.`
  );

  const shouldFail = !samplePool.expectedCountOk || !samplePool.allBodiesOk || curated.failed > 0;
  if (shouldFail) {
    process.exitCode = 1;
  }
}

function readSampleStore(samplePath: string): { count?: number; samples: Partial<NgaSample>[] } {
  const resolved = path.resolve(samplePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as { count?: number; samples?: Partial<NgaSample>[] } | Partial<NgaSample>[];
  if (Array.isArray(parsed)) {
    return { count: parsed.length, samples: parsed };
  }
  return { count: parsed.count, samples: Array.isArray(parsed.samples) ? parsed.samples : [] };
}

function summarizeSamplePool(
  store: { count?: number; samples: Partial<NgaSample>[] },
  samples: NgaSample[],
  signals: NgaSampleSignal[],
  samplePath: string
) {
  const withBody = samples.filter((sample) => sample.body.trim()).length;
  const outcomeCounts = countBy(signals, (signal) => signal.recruitKind);
  const tagCounts = countFlat(signals.flatMap((signal) => signal.tags));
  const warningCounts = countFlat(signals.flatMap((signal) => signal.warnings));
  const effective = signals.filter((signal) => signal.recruitKind === "recruit" || signal.recruitKind === "seeking");
  const hasFields = (field: FieldKey) => effective.filter((signal) => hasParsedField(signal, field)).length;
  const highConfidenceEffective = effective.filter((signal) =>
    Object.values(signal.parseConfidence).some((confidence) => confidence === "high")
  ).length;

  return {
    path: samplePath,
    countProp: store.count,
    total: samples.length,
    withBody,
    expectedCount: EXPECTED_SAMPLE_COUNT,
    expectedCountOk: samples.length === EXPECTED_SAMPLE_COUNT && store.count === EXPECTED_SAMPLE_COUNT,
    allBodiesOk: withBody === samples.length,
    outcomeCounts,
    effectiveRows: effective.length,
    highConfidenceEffective,
    extractionCoverage: {
      positions: hasFields("positions"),
      rosterSlots: hasFields("rosterSlots"),
      vacancyFlexGroups: hasFields("vacancyFlexGroups"),
      time: hasFields("time"),
      dailyDuration: hasFields("dailyDuration"),
      contactDetails: hasFields("contactDetails"),
      requirements: hasFields("requirements"),
      strategy: hasFields("strategy"),
      progress: hasFields("progress")
    },
    topTags: topEntries(tagCounts, 18),
    topWarnings: topEntries(warningCounts, 12)
  };
}

function runFixtures() {
  const checks = FIXTURES.flatMap((fixture) => evaluateFixture(fixture));
  const failedChecks = checks.filter((check) => !check.pass);
  const passed = checks.length - failedChecks.length;
  return {
    fixtures: FIXTURES.length,
    total: checks.length,
    passed,
    failed: failedChecks.length,
    accuracy: checks.length ? passed / checks.length : 0,
    wilson95: wilsonInterval(passed, checks.length, 1.96),
    failures: failedChecks.slice(0, 30).map((check) => ({
      fixture: check.fixture,
      check: check.check,
      expected: check.expected,
      actual: check.actual
    }))
  };
}

function evaluateFixture(fixture: Fixture): CheckResult[] {
  const sample = sanitizeNgaSample({
    url: `https://bbs.nga.cn/read.php?tid=fixture-${encodeURIComponent(fixture.name)}`,
    topicId: `fixture-${fixture.name}`,
    ...fixture.sample
  });
  const signal = classifyNgaSample(sample);
  const checks: CheckResult[] = [];
  const add = (check: string, pass: boolean, expected?: unknown, actual?: unknown) => {
    checks.push({ fixture: fixture.name, check, pass, expected, actual });
  };
  const fields = signal.parsedFields;

  if (fixture.expect.recruitKind) {
    add("recruitKind", signal.recruitKind === fixture.expect.recruitKind, fixture.expect.recruitKind, signal.recruitKind);
  }
  if (fixture.expect.isNoise !== undefined) {
    add("isNoise", signal.isNoise === fixture.expect.isNoise, fixture.expect.isNoise, signal.isNoise);
  }
  if (fixture.expect.isClosed !== undefined) {
    add("isClosed", signal.isClosed === fixture.expect.isClosed, fixture.expect.isClosed, signal.isClosed);
  }
  if (fixture.expect.positionsExact) {
    add("positionsExact", sameSet(fields.positions, fixture.expect.positionsExact), fixture.expect.positionsExact, fields.positions);
  }
  if (fixture.expect.positionsInclude) {
    for (const position of fixture.expect.positionsInclude) {
      add(`positions include ${position}`, includesValue(fields.positions, position), position, fields.positions);
    }
  }
  if (fixture.expect.jobsExact) {
    add("jobsExact", sameSet(fields.jobs, fixture.expect.jobsExact), fixture.expect.jobsExact, fields.jobs);
  }
  if (fixture.expect.jobsInclude) {
    for (const job of fixture.expect.jobsInclude) {
      add(`jobs include ${job}`, includesValue(fields.jobs, job), job, fields.jobs);
    }
  }
  if (fixture.expect.jobsAbsent) {
    for (const job of fixture.expect.jobsAbsent) {
      add(`jobs absent ${job}`, !includesValue(fields.jobs, job), job, fields.jobs);
    }
  }
  if (fixture.expect.excludedJobsInclude) {
    for (const job of fixture.expect.excludedJobsInclude) {
      add(`excludedJobs include ${job}`, includesValue(fields.excludedJobs, job), job, fields.excludedJobs);
    }
  }
  if (fixture.expect.excludedPositionsAbsent) {
    for (const position of fixture.expect.excludedPositionsAbsent) {
      add(
        `excludedPositions absent ${position}`,
        !includesValue(fields.excludedPositions, position),
        position,
        fields.excludedPositions
      );
    }
  }
  if (fixture.expect.rosterSlots) {
    for (const [slot, expectedJobs] of Object.entries(fixture.expect.rosterSlots)) {
      for (const job of expectedJobs) {
        add(`roster ${slot} includes ${job}`, includesValue(fields.rosterSlots?.[slot as PositionKey], job), job, {
          [slot]: fields.rosterSlots?.[slot as PositionKey]
        });
      }
    }
  }
  if (fixture.expect.vacancyFlexGroupsInclude) {
    for (const group of fixture.expect.vacancyFlexGroupsInclude) {
      add(
        `vacancyFlexGroups include ${group.join("/")}`,
        includesGroup(fields.vacancyFlexGroups, group),
        group,
        fields.vacancyFlexGroups
      );
    }
  }
  if (fixture.expect.rosterFlexGroupsInclude) {
    for (const group of fixture.expect.rosterFlexGroupsInclude) {
      add(`rosterFlexGroups include ${group.join("/")}`, includesGroup(fields.rosterFlexGroups, group), group, fields.rosterFlexGroups);
    }
  }
  if (fixture.expect.vacancyFlexGroupsAbsent) {
    for (const group of fixture.expect.vacancyFlexGroupsAbsent) {
      add(
        `vacancyFlexGroups absent ${group.join("/")}`,
        !includesGroup(fields.vacancyFlexGroups, group),
        group,
        fields.vacancyFlexGroups
      );
    }
  }
  if (fixture.expect.rosterFlexGroupsAbsent) {
    for (const group of fixture.expect.rosterFlexGroupsAbsent) {
      add(
        `rosterFlexGroups absent ${group.join("/")}`,
        !includesGroup(fields.rosterFlexGroups, group),
        group,
        fields.rosterFlexGroups
      );
    }
  }
  if (fixture.expect.time) {
    add("time", fields.time === fixture.expect.time, fixture.expect.time, fields.time);
  }
  if (fixture.expect.dailyDuration) {
    add("dailyDuration", fields.dailyDuration === fixture.expect.dailyDuration, fixture.expect.dailyDuration, fields.dailyDuration);
  }
  if (fixture.expect.dungeon) {
    add("dungeon", fields.dungeon === fixture.expect.dungeon, fixture.expect.dungeon, fields.dungeon);
  }
  if (fixture.expect.requirements) {
    add("requirements", fields.requirements === fixture.expect.requirements, fixture.expect.requirements, fields.requirements);
  }
  if (fixture.expect.requirementsIncludes) {
    for (const value of fixture.expect.requirementsIncludes) {
      add(`requirements include ${value}`, Boolean(fields.requirements?.includes(value)), value, fields.requirements);
    }
  }
  if (fixture.expect.tagsInclude) {
    for (const tag of fixture.expect.tagsInclude) {
      add(`tags include ${tag}`, includesValue(signal.tags, tag), tag, signal.tags);
    }
  }
  if (fixture.expect.warningsInclude) {
    for (const warning of fixture.expect.warningsInclude) {
      add(
        `warnings include ${warning}`,
        signal.warnings.some((actual) => actual.includes(warning)),
        warning,
        signal.warnings
      );
    }
  }
  if (fixture.expect.fieldUndefined) {
    for (const field of fixture.expect.fieldUndefined) {
      add(`${field} undefined`, fields[field] === undefined, undefined, fields[field]);
    }
  }
  if (fixture.expect.strategyNotIncludes) {
    for (const value of fixture.expect.strategyNotIncludes) {
      add(`strategy excludes ${value}`, !fields.strategy?.includes(value), value, fields.strategy);
    }
  }

  return checks;
}

function hasParsedField(signal: NgaSampleSignal, field: FieldKey): boolean {
  const value = signal.parsedFields[field];
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

function countBy<T>(values: T[], keyOf: (value: T) => string): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = keyOf(value);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function countFlat(values: string[]): Record<string, number> {
  return countBy(values, (value) => value);
}

function topEntries(counts: Record<string, number>, limit: number) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function sameSet(actual: string[] | undefined, expected: string[]): boolean {
  const normalizedActual = normalizeList(actual);
  const normalizedExpected = normalizeList(expected);
  return normalizedActual.length === normalizedExpected.length && normalizedExpected.every((item, index) => item === normalizedActual[index]);
}

function includesValue(actual: string[] | undefined, expected: string): boolean {
  return normalizeList(actual).includes(expected);
}

function includesGroup(actual: PositionKey[][] | undefined, expected: PositionKey[]): boolean {
  const expectedKey = normalizeList(expected).join("/");
  return (actual ?? []).some((group) => normalizeList(group).join("/") === expectedKey);
}

function normalizeList(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function wilsonInterval(successes: number, total: number, z: number): [number, number] {
  if (!total) {
    return [0, 0];
  }
  const phat = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = phat + z2 / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return [Math.max(0, (center - margin) / denominator), Math.min(1, (center + margin) / denominator)];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

main();
