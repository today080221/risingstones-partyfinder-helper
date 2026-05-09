import { describe, expect, it } from "vitest";
import { filterRecruitRows, filterRecruitRowsByDataRange } from "./filters";
import { buildJobMeta, buildJobPickerGroups, jobCanEnter, matchesOpenPositions } from "./jobs";
import { matchesKeywordFilter, parseKeywordFilter } from "./keywords";
import { buildOfficialRecruitParams, collectPaginatedRows } from "./pagination";
import {
  describeTimeParse,
  formatRecruitDailyDuration,
  formatRecruitTimeDisplay,
  matchesTimeFilter,
  parseRecruitTime
} from "./time";
import type { MetaPayload, RecruitRow } from "../types";

const meta: MetaPayload = {
  fbConfigs: [],
  labels: [],
  areas: [],
  jobConfig: {},
  jobMeta: {
    jobs: [
      { id: "1", value: "防护职业", job_type: "职能分类" },
      { id: "2", value: "战士", job_type: "防护职业" },
      { id: "5", value: "治疗职业", job_type: "职能分类" },
      { id: "10", value: "白魔法师", job_type: "治疗职业" },
      { id: "12", value: "学者", job_type: "治疗职业" },
      { id: "13", value: "贤者", job_type: "治疗职业" },
      { id: "20", value: "近战职业", job_type: "职能分类" },
      { id: "21", value: "武僧", job_type: "近战职业" },
      { id: "22", value: "远程物理职业", job_type: "职能分类" },
      { id: "23", value: "吟游诗人", job_type: "远程物理职业" },
      { id: "24", value: "远程魔法职业", job_type: "职能分类" },
      { id: "25", value: "黑魔法师", job_type: "远程魔法职业" },
      { id: "32", value: "任意职业", job_type: "职能分类" }
    ],
    jobsById: {
      "1": { id: "1", value: "防护职业", job_type: "职能分类" },
      "2": { id: "2", value: "战士", job_type: "防护职业" },
      "5": { id: "5", value: "治疗职业", job_type: "职能分类" },
      "10": { id: "10", value: "白魔法师", job_type: "治疗职业" },
      "12": { id: "12", value: "学者", job_type: "治疗职业" },
      "13": { id: "13", value: "贤者", job_type: "治疗职业" },
      "20": { id: "20", value: "近战职业", job_type: "职能分类" },
      "21": { id: "21", value: "武僧", job_type: "近战职业" },
      "22": { id: "22", value: "远程物理职业", job_type: "职能分类" },
      "23": { id: "23", value: "吟游诗人", job_type: "远程物理职业" },
      "24": { id: "24", value: "远程魔法职业", job_type: "职能分类" },
      "25": { id: "25", value: "黑魔法师", job_type: "远程魔法职业" },
      "32": { id: "32", value: "任意职业", job_type: "职能分类" }
    },
    childIdsByCategoryId: {
      "1": ["2"],
      "5": ["10", "12", "13"],
      "20": ["21"],
      "22": ["23"],
      "24": ["25"],
      "32": []
    }
  },
  fetchedAt: "2026-05-07T00:00:00.000Z"
};

describe("keyword filters", () => {
  it("requires include terms and rejects negative terms", () => {
    const filter = parseKeywordFilter("从0 菓子 -清cd");
    expect(matchesKeywordFilter("从0开始 菓子攻略", filter)).toBe(true);
    expect(matchesKeywordFilter("从0开始 清cd 菓子攻略", filter)).toBe(false);
    expect(matchesKeywordFilter("从零开始 菓子攻略", filter)).toBe(false);
  });
});

describe("time parsing", () => {
  it("parses evening hour ranges", () => {
    const parsed = parseRecruitTime("晚8—11");
    expect(parsed.ranges[0]).toMatchObject({ start: 20, end: 23 });
    expect(describeTimeParse("晚8—11")).toContain("20:00-23:00");
  });

  it("deduplicates time words and keeps rest days out of active days", () => {
    expect(formatRecruitTimeDisplay("晚间、周二、晚上、晚上8-10点")).toBe("周二 20:00-22:00");
    expect(formatRecruitTimeDisplay("社畜、晚、晚9-12点、暂定休周日、19-6")).toBe("21:00-24:00");

    const restOnly = parseRecruitTime("周二清CD，周末休");
    expect(restOnly.days).toEqual(["2"]);
    expect(restOnly.excludedDays).toEqual(expect.arrayContaining(["6", "0"]));
    expect(formatRecruitTimeDisplay("周二清CD，周末休")).toBe("周二");
  });

  it("keeps daily duration separate from clock time", () => {
    expect(formatRecruitTimeDisplay("每天至少10-12h，美西19-21，美东22-24，国内10-12")).toBe(
      "19:00-21:00、22:00-24:00、10:00-12:00"
    );
    expect(formatRecruitDailyDuration("每天至少10-12h，美西19-21，美东22-24，国内10-12")).toBe("10-12小时/天");
    expect(formatRecruitDailyDuration("每晚8-11之间打2-3小时")).toBe("2-3小时/天");
    expect(formatRecruitTimeDisplay("M1-4S首周，晚8-11")).toBe("20:00-23:00");
    expect(formatRecruitTimeDisplay("版本6.0-7.2，时间晚上9.30-11.30")).toBe("21:30-23:30");
    expect(formatRecruitTimeDisplay("下午1-6 晚上8点半-11点半")).toBe("13:00-18:00、20:30-23:30");
    expect(formatRecruitTimeDisplay("国内时间14:00?17:00 六休一")).toBe("14:00-17:00");
    expect(formatRecruitTimeDisplay("早上10:00-14:00，晚上21:00-1:00，早上11:00-14:00")).toBe(
      "10:00-14:00、21:00-次日01:00"
    );
    expect(formatRecruitTimeDisplay("晚12：00-2：00")).toBe("00:00-02:00");
  });

  it("matches requested hour overlaps and day filters", () => {
    expect(
      matchesTimeFilter("周末 晚8-11", {
        timeText: "",
        timeStart: "20",
        timeEnd: "23",
        dailyMaxHours: "",
        timeDays: ["6"],
        showUnparsedTime: false
      })
    ).toBe(true);
    expect(
      matchesTimeFilter("周一 18-20", {
        timeText: "",
        timeStart: "21",
        timeEnd: "23",
        dailyMaxHours: "",
        timeDays: ["1"],
        showUnparsedTime: false
      })
    ).toBe(false);
    expect(
      matchesTimeFilter("晚12：00-2：00", {
        timeText: "",
        timeStart: "0",
        timeEnd: "2",
        dailyMaxHours: "",
        timeDays: [],
        showUnparsedTime: false
      })
    ).toBe(true);
  });

  it("treats time constraints as hard limits", () => {
    expect(
      matchesTimeFilter("周二 20:00-23:00", {
        timeText: "",
        timeStart: "20",
        timeEnd: "23",
        dailyMaxHours: "3",
        timeDays: [],
        showUnparsedTime: false
      })
    ).toBe(true);
    expect(
      matchesTimeFilter("周二 19:30-23:00", {
        timeText: "",
        timeStart: "20",
        timeEnd: "23",
        dailyMaxHours: "",
        timeDays: [],
        showUnparsedTime: false
      })
    ).toBe(false);
    expect(
      matchesTimeFilter("周二 20:00-23:30", {
        timeText: "",
        timeStart: "",
        timeEnd: "23",
        dailyMaxHours: "",
        timeDays: [],
        showUnparsedTime: false
      })
    ).toBe(false);
    expect(
      matchesTimeFilter("周二 20:00-24:00", {
        timeText: "",
        timeStart: "",
        timeEnd: "",
        dailyMaxHours: "3",
        timeDays: [],
        showUnparsedTime: false
      })
    ).toBe(false);
  });
});

describe("job and position filters", () => {
  it("matches concrete jobs through role categories", () => {
    expect(jobCanEnter(["12"], ["5"], meta.jobMeta)).toBe(true);
    expect(jobCanEnter(["12"], ["13"], meta.jobMeta)).toBe(false);
    expect(jobCanEnter(["12"], ["32"], meta.jobMeta)).toBe(true);
    expect(jobCanEnter(["5"], ["13"], meta.jobMeta)).toBe(true);
  });

  it("rejects concrete duplicate jobs when no-duplicate mode is enabled", () => {
    const row = recruit({ H1: 10, H2: 0, need_job: ["5"] });
    expect(jobCanEnter(["10"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(false);
    expect(jobCanEnter(["10"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: false })).toBe(true);
    expect(jobCanEnter(["12"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(true);
  });

  it("allows role categories when at least one accepted concrete job is not duplicated", () => {
    const row = recruit({ H1: 10, H2: 12, need_job: ["5"] });
    expect(jobCanEnter(["5"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(true);
    expect(jobCanEnter(["10"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(false);
  });

  it("falls back to open tank and healer positions when need jobs are empty", () => {
    const healerRow = recruit({ H1: 12, H2: 0, need_job: [] });
    expect(jobCanEnter(["10"], healerRow.need_job, meta.jobMeta, { row: healerRow, noDuplicateJobs: true })).toBe(true);
    expect(jobCanEnter(["13"], healerRow.need_job, meta.jobMeta, { row: healerRow, noDuplicateJobs: true })).toBe(true);

    const tankRow = recruit({ ST: 0, need_job: [] });
    expect(jobCanEnter(["2"], tankRow.need_job, meta.jobMeta, { row: tankRow, noDuplicateJobs: true })).toBe(true);
  });

  it("keeps dps position fallback flexible", () => {
    const row = recruit({ D1: 0, D2: 15, D3: 16, D4: 17, need_job: [] });
    expect(jobCanEnter(["21"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(true);
    expect(jobCanEnter(["23"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(true);
    expect(jobCanEnter(["25"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(true);
  });

  it("uses selected alliance when matching job fallback positions", () => {
    const row = recruit({
      team_composition: "团队",
      team_position: {
        A: { MT: 1, ST: 2, H1: 10, H2: 0, D1: 14, D2: 15, D3: 16, D4: 17 },
        B: { MT: 1, ST: 2, H1: 10, H2: 12, D1: 14, D2: 15, D3: 16, D4: 17 }
      },
      need_job: []
    });
    expect(jobCanEnter(["13"], row.need_job, meta.jobMeta, { row, alliance: "A", noDuplicateJobs: true })).toBe(true);
    expect(jobCanEnter(["13"], row.need_job, meta.jobMeta, { row, alliance: "B", noDuplicateJobs: true })).toBe(false);
  });

  it("sorts picker groups by role order", () => {
    const groups = buildJobPickerGroups({
      远程魔法职业: [{ id: "25", value: "黑魔法师", job_type: "远程魔法职业" }],
      限制职业: [{ id: "99", value: "限制", job_type: "限制职业" }],
      治疗职业: [{ id: "13", value: "贤者", job_type: "治疗职业" }],
      远程物理职业: [{ id: "23", value: "吟游诗人", job_type: "远程物理职业" }],
      职能分类: [{ id: "5", value: "治疗职业", job_type: "职能分类" }],
      防护职业: [{ id: "2", value: "战士", job_type: "防护职业" }],
      近战职业: [{ id: "21", value: "武僧", job_type: "近战职业" }],
      进攻职业: [{ id: "21", value: "武僧", job_type: "近战职业" }]
    });

    expect(groups.map((group) => group.label)).toEqual([
      "职能分类",
      "防护职业（T）",
      "治疗职业（奶）",
      "近战职业（近战）",
      "远程物理职业（远敏）",
      "远程魔法职业（法系）"
    ]);
  });

  it("expands official short ranged role labels to concrete jobs", () => {
    const officialMeta = buildJobMeta({
      职能分类: [
        { id: "20", value: "近战职业", job_type: "职能分类" },
        { id: "22", value: "远程物理", job_type: "职能分类" },
        { id: "24", value: "远程魔法", job_type: "职能分类" }
      ],
      近战职业: [{ id: "21", value: "武僧", job_type: "近战职业" }],
      远程物理职业: [{ id: "23", value: "吟游诗人", job_type: "远程物理职业" }],
      远程魔法职业: [{ id: "25", value: "黑魔法师", job_type: "远程魔法职业" }]
    });

    expect(officialMeta.childIdsByCategoryId["22"]).toEqual(["23"]);
    expect(officialMeta.childIdsByCategoryId["24"]).toEqual(["25"]);
  });

  it("detects empty full-party positions", () => {
    const row = recruit({ H2: 0, D4: 23 });
    expect(matchesOpenPositions(row, ["H2"])).toBe(true);
    expect(matchesOpenPositions(row, ["D4"])).toBe(false);
  });

  it("detects alliance positions", () => {
    const row = recruit({
      team_composition: "团队",
      team_position: {
        A: { MT: 1, ST: 0, H1: 10, H2: 0, D1: 14, D2: 0, D3: 0, D4: 0 },
        B: { MT: 1, ST: 2, H1: 10, H2: 11, D1: 14, D2: 15, D3: 16, D4: 17 }
      }
    });
    expect(matchesOpenPositions(row, ["ST"], "A")).toBe(true);
    expect(matchesOpenPositions(row, ["ST"], "B")).toBe(false);
  });

  it("uses NGA parsed positions and job names instead of assuming every slot is open", () => {
    const recruitRow = recruit({
      source: "nga",
      sourceMeta: { platform: "nga", recruitKind: "recruit" },
      parsedFields: { positions: ["D3"], jobs: ["吟游诗人"], excludedJobs: ["黑魔法师"] },
      need_job: []
    });
    expect(matchesOpenPositions(recruitRow, ["D3"])).toBe(true);
    expect(matchesOpenPositions(recruitRow, ["H2"])).toBe(false);
    expect(jobCanEnter(["23"], recruitRow.need_job, meta.jobMeta, { row: recruitRow })).toBe(true);
    expect(jobCanEnter(["25"], recruitRow.need_job, meta.jobMeta, { row: recruitRow })).toBe(false);

    const seekingRow = recruit({
      source: "nga",
      sourceMeta: { platform: "nga", recruitKind: "seeking" },
      parsedFields: { playerAvailablePositions: ["H1", "H2"], playerAvailableJobs: ["贤者"] },
      need_job: []
    });
    expect(matchesOpenPositions(seekingRow, ["H2"])).toBe(true);
    expect(matchesOpenPositions(seekingRow, ["D1"])).toBe(false);
    expect(jobCanEnter(["13"], seekingRow.need_job, meta.jobMeta, { row: seekingRow })).toBe(true);
  });

  it("uses NGA parsed roster slots for duplicate-job filtering without rejecting all flexible selected jobs", () => {
    const row = recruit({
      source: "nga",
      sourceMeta: { platform: "nga", recruitKind: "recruit" },
      parsedFields: {
        positions: ["H2"],
        rosterSlots: {
          H1: ["白魔法师"]
        }
      },
      need_job: []
    });

    expect(jobCanEnter(["10"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(false);
    expect(jobCanEnter(["12"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(true);
    expect(jobCanEnter(["10", "12"], row.need_job, meta.jobMeta, { row, noDuplicateJobs: true })).toBe(true);
  });
});

describe("local recruit filtering", () => {
  it("combines progress, strategy, time, job, and position filters", () => {
    const rows = [
      recruit({ id: 1, progress: "从0", strategy: "菓子", fb_time: "周末 晚8-11", need_job: ["5"], H2: 0 }),
      recruit({ id: 2, progress: "清cd", strategy: "菓子", fb_time: "周末 晚8-11", need_job: ["5"], H2: 0 })
    ];
    const result = filterRecruitRows(
      rows,
      {
        ngaRecruitView: "teams",
        progressText: "从0 -清cd",
        strategyText: "菓子",
        timeText: "",
        excludeText: "",
        timeStart: "20",
        timeEnd: "23",
        dailyMaxHours: "",
        areaPreferenceId: "",
        timeDays: ["6"],
        selectedLabelIds: [],
        selectedJobIds: ["12"],
        noDuplicateJobs: true,
        selectedPositions: ["H2"],
        alliance: "",
        showUnparsedTime: false
      },
      meta
    );

    expect(result.rows.map((row) => row.id)).toEqual([1]);
    expect(result.rejected).toBe(1);
  });

  it("excludes rows containing global not-keywords across recruit text", () => {
    const rows = [
      recruit({ id: 1, progress: "从0", strategy: "菓子", fb_time: "晚8-11" }),
      recruit({ id: 2, progress: "保次清cd", strategy: "菓子", fb_time: "晚8-11" }),
      recruit({ id: 3, progress: "从0", strategy: "保次", fb_time: "晚8-11" })
    ];

    const result = filterRecruitRows(
      rows,
      {
        ngaRecruitView: "teams",
        progressText: "",
        strategyText: "",
        timeText: "",
        excludeText: "保次",
        timeStart: "",
        timeEnd: "",
        dailyMaxHours: "",
        areaPreferenceId: "",
        timeDays: [],
        selectedLabelIds: [],
        selectedJobIds: [],
        noDuplicateJobs: true,
        selectedPositions: [],
        alliance: "",
        showUnparsedTime: false
      },
      meta
    );

    expect(result.rows.map((row) => row.id)).toEqual([1]);
    expect(result.rejected).toBe(2);
  });

  it("filters local labels across official labels and NGA parser tags", () => {
    const rows = [
      recruit({
        id: 1,
        labelInfo: [{ id: "seeking", name: "求职", weight: 1 }]
      }),
      recruit({
        id: 2,
        source: "nga",
        parseTags: ["社畜/晚间队"],
        parsedFields: { requirements: "logs 要求" }
      }),
      recruit({ id: 3, labelInfo: [{ id: "practice", name: "开荒", weight: 1 }] })
    ];

    const result = filterRecruitRows(
      rows,
      {
        ngaRecruitView: "all",
        progressText: "",
        strategyText: "",
        timeText: "",
        excludeText: "",
        timeStart: "",
        timeEnd: "",
        dailyMaxHours: "",
        areaPreferenceId: "",
        timeDays: [],
        selectedLabelIds: ["求职", "社畜"],
        selectedJobIds: [],
        noDuplicateJobs: true,
        selectedPositions: [],
        alliance: "",
        showUnparsedTime: true
      },
      meta
    );

    expect(result.rows.map((row) => row.id)).toEqual([1, 2]);
    expect(result.rejected).toBe(1);
  });

  it("filters derived official and NGA goal tags with one label vocabulary", () => {
    const rows = [
      recruit({ id: 1, progress: "首月过本，当前从0开荒" }),
      recruit({ id: 2, source: "nga", parseTags: ["次月目标"], progress: "开荒" }),
      recruit({ id: 3, progress: "清CD" })
    ];

    const result = filterRecruitRows(
      rows,
      {
        ngaRecruitView: "all",
        progressText: "",
        strategyText: "",
        timeText: "",
        excludeText: "",
        timeStart: "",
        timeEnd: "",
        dailyMaxHours: "",
        areaPreferenceId: "",
        timeDays: [],
        selectedLabelIds: ["首月目标"],
        selectedJobIds: [],
        noDuplicateJobs: true,
        selectedPositions: [],
        alliance: "",
        showUnparsedTime: true
      },
      meta
    );

    expect(result.rows.map((row) => row.id)).toEqual([1]);
    expect(result.rejected).toBe(2);
  });

  it("filters area preference locally across official and NGA rows", () => {
    const rows = [
      recruit({ id: 1, area_name: "陆行鸟", group_name: "红玉海" }),
      recruit({ id: 2, area_name: "莫古力", group_name: "白银乡" }),
      recruit({ id: 3, source: "nga", area_name: "NGA", parsedFields: { server: "陆行鸟" } })
    ];
    const metaWithAreas: MetaPayload = {
      ...meta,
      areas: [{ AreaID: 1, AreaName: "陆行鸟" }]
    };

    const result = filterRecruitRows(
      rows,
      {
        ngaRecruitView: "all",
        progressText: "",
        strategyText: "",
        timeText: "",
        excludeText: "",
        timeStart: "",
        timeEnd: "",
        dailyMaxHours: "",
        areaPreferenceId: "1",
        timeDays: [],
        selectedLabelIds: [],
        selectedJobIds: [],
        noDuplicateJobs: true,
        selectedPositions: [],
        alliance: "",
        showUnparsedTime: true
      },
      metaWithAreas
    );

    expect(result.rows.map((row) => row.id)).toEqual([1, 3]);
    expect(result.rejected).toBe(1);
  });

  it("applies dungeon type and name range to cached NGA rows", () => {
    const rows = [
      recruit({ id: 1, source: "official", fb_type: "绝境战", fb_name: "巴哈姆特绝境战" }),
      recruit({ id: 2, source: "nga", fb_type: "NGA", fb_name: "巴哈姆特绝境战" }),
      recruit({ id: 3, source: "nga", fb_type: "NGA", fb_name: "妖星乱舞绝境战" }),
      recruit({ id: 4, source: "nga", fb_type: "NGA", fb_name: "阿卡迪亚登天斗技场 M1S" })
    ];
    const metaWithDungeons: MetaPayload = {
      ...meta,
      fbConfigs: [
        { id: "ucob", fb_type: "绝境战", fb_name: "巴哈姆特绝境战", team_composition: "满编小队", weight: 1 },
        { id: "fru", fb_type: "绝境战", fb_name: "妖星乱舞绝境战", team_composition: "满编小队", weight: 1 },
        { id: "m1s", fb_type: "零式", fb_name: "阿卡迪亚登天斗技场 M1S", team_composition: "满编小队", weight: 1 }
      ]
    };

    expect(filterRecruitRowsByDataRange(rows, { fbType: "绝境战", fbName: "" }, metaWithDungeons).map((row) => row.id)).toEqual([
      1,
      2,
      3
    ]);
    expect(filterRecruitRowsByDataRange(rows, { fbType: "绝境战", fbName: "巴哈姆特绝境战" }, metaWithDungeons).map((row) => row.id)).toEqual([
      1,
      2
    ]);
  });
});

describe("pagination helpers", () => {
  it("collects pages until count is reached", async () => {
    const pages = new Map([
      [2, { count: 3, rows: ["b"] }],
      [3, { count: 3, rows: ["c"] }]
    ]);
    const result = await collectPaginatedRows({
      firstPage: { count: "3", rows: ["a"] },
      maxPages: 10,
      fetchPage: async (page) => pages.get(page) ?? { count: 3, rows: [] }
    });

    expect(result.rows).toEqual(["a", "b", "c"]);
    expect(result.warnings).toEqual([]);
  });

  it("keeps official params and removes empty filters", () => {
    expect(
      buildOfficialRecruitParams(
        {
          fb_name: "巴哈姆特绝境战",
          fb_type: "绝境战",
          target_area_id: "",
          label: "22,25",
          position: "H2"
        },
        1,
        100
      )
    ).toEqual({
      page: "1",
      limit: "100",
      fb_name: "巴哈姆特绝境战",
      fb_type: "绝境战",
      label: "22,25",
      position: "H2"
    });
  });
});

function recruit(patch: Partial<RecruitRow>): RecruitRow {
  return {
    id: 1,
    uuid: "u1",
    character_name: "测试角色",
    area_name: "陆行鸟",
    group_name: "红玉海",
    fb_type: "绝境战",
    fb_name: "巴哈姆特绝境战",
    fb_time: "晚8-11",
    team_composition: "满编小队",
    progress: "从0",
    strategy: "菓子",
    MT: 1,
    ST: 2,
    H1: 10,
    H2: 0,
    D1: 14,
    D2: 15,
    D3: 16,
    D4: 0,
    team_position: null,
    need_job: ["5"],
    ...patch
  };
}
