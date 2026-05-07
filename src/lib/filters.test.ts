import { describe, expect, it } from "vitest";
import { filterRecruitRows } from "./filters";
import { jobCanEnter, matchesOpenPositions } from "./jobs";
import { matchesKeywordFilter, parseKeywordFilter } from "./keywords";
import { buildOfficialRecruitParams, collectPaginatedRows } from "./pagination";
import { describeTimeParse, matchesTimeFilter, parseRecruitTime } from "./time";
import type { MetaPayload, RecruitRow } from "../types";

const meta: MetaPayload = {
  fbConfigs: [],
  labels: [],
  areas: [],
  jobConfig: {},
  jobMeta: {
    jobs: [
      { id: "5", value: "治疗职业", job_type: "职能分类" },
      { id: "10", value: "白魔法师", job_type: "治疗职业" },
      { id: "12", value: "学者", job_type: "治疗职业" },
      { id: "13", value: "贤者", job_type: "治疗职业" },
      { id: "32", value: "任意职业", job_type: "职能分类" }
    ],
    jobsById: {
      "5": { id: "5", value: "治疗职业", job_type: "职能分类" },
      "10": { id: "10", value: "白魔法师", job_type: "治疗职业" },
      "12": { id: "12", value: "学者", job_type: "治疗职业" },
      "13": { id: "13", value: "贤者", job_type: "治疗职业" },
      "32": { id: "32", value: "任意职业", job_type: "职能分类" }
    },
    childIdsByCategoryId: {
      "5": ["10", "12", "13"],
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
    expect(describeTimeParse("晚8—11")).toContain("20-23");
  });

  it("matches requested hour overlaps and day filters", () => {
    expect(
      matchesTimeFilter("周末 晚8-11", {
        timeText: "",
        timeStart: "20",
        timeEnd: "23",
        timeDays: ["6"],
        showUnparsedTime: false
      })
    ).toBe(true);
    expect(
      matchesTimeFilter("周一 18-20", {
        timeText: "",
        timeStart: "21",
        timeEnd: "23",
        timeDays: ["1"],
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
        progressText: "从0 -清cd",
        strategyText: "菓子",
        timeText: "",
        excludeText: "",
        timeStart: "20",
        timeEnd: "23",
        timeDays: ["6"],
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
        progressText: "",
        strategyText: "",
        timeText: "",
        excludeText: "保次",
        timeStart: "",
        timeEnd: "",
        timeDays: [],
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
