import { describe, expect, it, vi } from "vitest";
import type { MetaPayload, NgaCollectionSettings } from "../types";
import {
  DEFAULT_NGA_COLLECTION_SETTINGS,
  analyzeNgaSamples,
  applyNgaCacheLifecycle,
  buildNgaCachedTopicIndex,
  classifyNgaSample,
  cleanNgaDisplayText,
  getNgaSamplesPendingDetailBackfill,
  getNgaSamplesForDungeonForceRefresh,
  getNgaSamplesPendingRefresh,
  getNgaRefreshableTopicSamples,
  isNgaSampleArchived,
  mergeNgaSamplesWithDiff,
  NGA_RECRUIT_BOARD_URLS,
  normalizeNgaCacheReviewSamples,
  normalizeNgaCollectionSettings,
  resolveAutoHandleInterstitialPreference,
  resolveKeepLoginPreference,
  isSameNgaTargetUrl,
  mergeNgaSamples,
  sanitizeNgaSample,
  sanitizeNgaSamples,
  shouldContinueNgaCollection,
  shouldKeepNgaCollectedSample,
  shouldNavigateNgaBoardBeforeScan,
  shouldShowNgaSample
} from "./nga";

describe("nga safety preferences", () => {
  it("keeps login disabled by default", () => {
    expect(DEFAULT_NGA_COLLECTION_SETTINGS.keepLogin).toBe(false);
  });

  it("keeps ordinary continue-page assistance disabled by default", () => {
    expect(DEFAULT_NGA_COLLECTION_SETTINGS.autoHandleInterstitial).toBe(false);
    expect(normalizeNgaCollectionSettings({}).autoHandleInterstitial).toBe(false);
  });

  it("ignores old saved public quick reading settings", () => {
    expect("preferPublicBackgroundFetch" in DEFAULT_NGA_COLLECTION_SETTINGS).toBe(false);
    expect("preferPublicBackgroundFetch" in normalizeNgaCollectionSettings({})).toBe(false);
    expect(
      "preferPublicBackgroundFetch" in
        normalizeNgaCollectionSettings({ preferPublicBackgroundFetch: true } as Partial<NgaCollectionSettings> & {
          preferPublicBackgroundFetch: boolean;
        })
    ).toBe(false);
  });

  it("requires explicit confirmation before enabling keep-login", async () => {
    const confirm = vi.fn(() => false);
    await expect(resolveKeepLoginPreference(false, true, confirm)).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("enables keep-login after explicit confirmation", async () => {
    const confirm = vi.fn(() => true);
    await expect(resolveKeepLoginPreference(false, true, confirm)).resolves.toBe(true);
  });

  it("turns keep-login off without confirmation", async () => {
    const confirm = vi.fn(() => true);
    await expect(resolveKeepLoginPreference(true, false, confirm)).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before enabling ordinary continue-page assistance", async () => {
    const confirm = vi.fn(() => false);
    await expect(resolveAutoHandleInterstitialPreference(false, true, confirm)).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("turns ordinary continue-page assistance off without confirmation", async () => {
    const confirm = vi.fn(() => true);
    await expect(resolveAutoHandleInterstitialPreference(true, false, confirm)).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("nga collection controls", () => {
  it("uses cache refresh defaults for startup review", () => {
    expect(DEFAULT_NGA_COLLECTION_SETTINGS.autoRefreshOnStart).toBe(true);
    expect(DEFAULT_NGA_COLLECTION_SETTINGS.refreshIntervalHours).toBe(12);
    expect(DEFAULT_NGA_COLLECTION_SETTINGS.windowMode).toBe("minimized");
  });

  it("normalizes request interval and maximum item limits", () => {
    expect(
      normalizeNgaCollectionSettings({
        startUrl: "https://bbs.nga.cn/thread.php?fid=321",
        requestIntervalMs: 20,
        maxItems: 999
      })
    ).toMatchObject({
      startUrl: "https://bbs.nga.cn/thread.php?fid=321",
      requestIntervalMs: 500,
      maxItems: 999,
      recentActiveDays: 14,
      includeDetails: true
    });
  });

  it("clamps cache refresh interval and preserves minimized window mode", () => {
    expect(
      normalizeNgaCollectionSettings({
        refreshIntervalHours: 0,
        windowMode: "normal"
      })
    ).toMatchObject({
      refreshIntervalHours: 1,
      windowMode: "normal"
    });
    expect(normalizeNgaCollectionSettings({ refreshIntervalHours: 999 }).refreshIntervalHours).toBe(168);
  });

  it("allows half-second request interval for advanced users", () => {
    expect(normalizeNgaCollectionSettings({ requestIntervalMs: 500 }).requestIntervalMs).toBe(500);
  });

  it("defaults to the CN recruit board, one-second interval, 500 items, and detail collection", () => {
    expect(normalizeNgaCollectionSettings({})).toMatchObject({
      selectedBoardUrls: [DEFAULT_NGA_COLLECTION_SETTINGS.startUrl],
      allowMultipleBoards: false,
      requestIntervalMs: 1000,
      maxItems: 500,
      recentActiveDays: 14,
      includeDetails: true
    });
  });

  it("keeps only supported recruit boards in selected board URLs", () => {
    expect(
      normalizeNgaCollectionSettings({
        selectedBoardUrls: ["https://example.com/", "https://bbs.nga.cn/thread.php?stid=30742904"]
      }).selectedBoardUrls
    ).toEqual(["https://bbs.nga.cn/thread.php?stid=30742904"]);
  });

  it("removes volatile board URL parameters from selected board URLs", () => {
    expect(
      normalizeNgaCollectionSettings({
        allowMultipleBoards: true,
        startUrl: "https://bbs.nga.cn/thread.php?stid=44366746&rand=321",
        selectedBoardUrls: [
          "https://bbs.nga.cn/thread.php?stid=44366746&rand=321",
          "https://bbs.nga.cn/thread.php?stid=30742918&rand=88"
        ]
      })
    ).toMatchObject({
      startUrl: "https://bbs.nga.cn/thread.php?stid=44366746",
      selectedBoardUrls: [
        "https://bbs.nga.cn/thread.php?stid=44366746",
        "https://bbs.nga.cn/thread.php?stid=30742918"
      ]
    });
  });

  it("repairs board ids accidentally saved as read topic URLs", () => {
    expect(
      normalizeNgaCollectionSettings({
        startUrl: "https://bbs.nga.cn/read.php?tid=44366746",
        selectedBoardUrls: ["https://bbs.nga.cn/read.php?tid=44366746"]
      })
    ).toMatchObject({
      startUrl: "https://bbs.nga.cn/thread.php?stid=44366746",
      selectedBoardUrls: ["https://bbs.nga.cn/thread.php?stid=44366746"]
    });
  });

  it("skips board ids accidentally saved as topic URLs during single-topic refresh", () => {
    expect(
      getNgaRefreshableTopicSamples([
        { url: "https://bbs.nga.cn/read.php?tid=44366746" },
        { url: "https://bbs.nga.cn/read.php?tid=46723623" },
        { url: "" }
      ])
    ).toEqual([{ url: "https://bbs.nga.cn/read.php?tid=46723623" }]);
  });

  it("uses single-board selection unless multi-board mode is enabled", () => {
    expect(
      normalizeNgaCollectionSettings({
        selectedBoardUrls: [
          "https://bbs.nga.cn/thread.php?stid=44366746",
          "https://bbs.nga.cn/thread.php?stid=30742918"
        ]
      }).selectedBoardUrls
    ).toEqual(["https://bbs.nga.cn/thread.php?stid=44366746"]);
  });

  it("rejects non-NGA start URLs", () => {
    expect(normalizeNgaCollectionSettings({ startUrl: "https://example.com/" }).startUrl).toBe(
      DEFAULT_NGA_COLLECTION_SETTINGS.startUrl
    );
  });

  it("requires the expected board page before treating a reused NGA board as ready", () => {
    expect(
      isSameNgaTargetUrl(
        "https://bbs.nga.cn/thread.php?stid=44366746",
        "https://bbs.nga.cn/thread.php?stid=44366746"
      )
    ).toBe(true);
    expect(
      isSameNgaTargetUrl(
        "https://bbs.nga.cn/thread.php?stid=44366746&page=1&rand=321",
        "https://bbs.nga.cn/thread.php?stid=44366746"
      )
    ).toBe(true);
    expect(
      isSameNgaTargetUrl(
        "https://bbs.nga.cn/thread.php?stid=44366746&page=3",
        "https://bbs.nga.cn/thread.php?stid=44366746"
      )
    ).toBe(false);
    expect(
      isSameNgaTargetUrl(
        "https://bbs.nga.cn/thread.php?stid=44366746&page=3",
        "https://bbs.nga.cn/thread.php?stid=44366746&page=3"
      )
    ).toBe(true);
  });

  it("still matches NGA detail pages by topic id", () => {
    expect(
      isSameNgaTargetUrl(
        "https://bbs.nga.cn/read.php?tid=46723623&page=2",
        "https://bbs.nga.cn/read.php?tid=46723623"
      )
    ).toBe(true);
    expect(
      isSameNgaTargetUrl(
        "https://bbs.nga.cn/read.php?tid=46723624",
        "https://bbs.nga.cn/read.php?tid=46723623"
      )
    ).toBe(false);
  });

  it("stops when cancelled or maximum collection count is reached", () => {
    expect(shouldContinueNgaCollection(0, 2, false)).toBe(true);
    expect(shouldContinueNgaCollection(2, 2, false)).toBe(false);
    expect(shouldContinueNgaCollection(0, 2, true)).toBe(false);
  });
});

describe("nga display cleanup", () => {
  it("removes NGA author metadata from card display strings", () => {
    expect(cleanNgaDisplayText("7.5绝亚卡开荒招募5=3 - 猫小胖/#0amria 43205080级别: 学徒威望: 1注册: 18-08-21")).toBe(
      "7.5绝亚卡开荒招募5=3"
    );
  });
});

describe("nga recruit visibility", () => {
  it("hides already-full and noise samples by default while keeping seeking posts", () => {
    const full = sanitizeNgaSample({
      title: "绝欧固定队已招满",
      url: "https://bbs.nga.cn/read.php?tid=201",
      topicId: "201"
    });
    const fullByRecruitDone = sanitizeNgaSample({
      title: "零式清CD队已招募齐",
      url: "https://bbs.nga.cn/read.php?tid=204",
      topicId: "204"
    });
    const noise = sanitizeNgaSample({
      title: "绝区零2.8版本签到",
      url: "https://bbs.nga.cn/read.php?tid=202",
      topicId: "202"
    });
    const seeking = sanitizeNgaSample({
      title: "求职 绝妖星乱舞 D1/2",
      url: "https://bbs.nga.cn/read.php?tid=203",
      topicId: "203"
    });

    expect(classifyNgaSample(full)).toMatchObject({ isClosed: true, recruitKind: "closed" });
    expect(classifyNgaSample(fullByRecruitDone)).toMatchObject({ isClosed: true, recruitKind: "closed" });
    expect(classifyNgaSample(noise)).toMatchObject({ isNoise: true, recruitKind: "noise" });
    expect(classifyNgaSample(seeking)).toMatchObject({ recruitKind: "seeking" });
    expect(shouldShowNgaSample(full, "balanced")).toBe(false);
    expect(shouldShowNgaSample(noise, "balanced")).toBe(false);
    expect(shouldShowNgaSample(seeking, "balanced")).toBe(true);
    expect(shouldShowNgaSample(full, "unrecognized")).toBe(true);
  });
});

describe("nga parser v1", () => {
  it("extracts confirmed dungeon aliases and position ranges with evidence", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[绝妖星] 次月社畜队 7=1 D1/2",
        body: "时间：工作日晚 20-23。进度：P3开荒。缺 D1/2，支持跨区。",
        url: "https://bbs.nga.cn/read.php?tid=301",
        topicId: "301"
      })
    );

    expect(signal.recruitKind).toBe("recruit");
    expect(signal.parsedFields.dungeon).toBe("妖星乱舞绝境战");
    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["D1", "D2"]));
    expect(signal.parsedFields.clearGoal).toBe("次月目标");
    expect(signal.parseConfidence.dungeon).toBe("high");
    expect(signal.evidence.some((item) => item.field === "dungeon" && item.snippet.includes("绝妖星"))).toBe(true);
  });

  it("routes player seeking posts into available jobs and positions", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "求职 绝妖星 任意N或镰刀可切",
        body: "玩家求职，晚间可打，练习到P2。",
        url: "https://bbs.nga.cn/read.php?tid=302",
        topicId: "302"
      })
    );

    expect(signal.recruitKind).toBe("seeking");
    expect(signal.parsedFields.teamType).toBe("玩家求职");
    expect(signal.parsedFields.playerAvailablePositions).toEqual(expect.arrayContaining(["H1", "H2"]));
    expect(signal.parsedFields.playerAvailableJobs).toContain("钐镰客");
  });

  it("recognizes loose seeking title wording without treating team instructions as seeking", () => {
    const seeking = classifyNgaSample(
      sanitizeNgaSample({
        title: "学者蹲个新绝队",
        body: "老玩家，会排减伤，可以打的时间每天晚上9点半往后。",
        url: "https://bbs.nga.cn/read.php?tid=336",
        topicId: "336"
      })
    );
    const recruit = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝卡夫卡首月队 7=1 D3",
        body: "现招募：近战。请找队长积极沟通，备注绝求职+你的职业。",
        url: "https://bbs.nga.cn/read.php?tid=337",
        topicId: "337"
      })
    );

    expect(seeking.recruitKind).toBe("seeking");
    expect(recruit.recruitKind).toBe("recruit");
    expect(recruit.parsedFields.teamType ?? "").not.toContain("玩家求职");
  });

  it("routes already found or filled posts into the closed stream", () => {
    const foundSample = sanitizeNgaSample({
      title: "[7.51]新绝本7=1远敏 晚8-11 已招到",
      body: "队伍详情：新绝本固定队。",
      url: "https://bbs.nga.cn/read.php?tid=338",
      topicId: "338"
    });
    const found = classifyNgaSample(foundSample);
    const filled = classifyNgaSample(
      sanitizeNgaSample({
        title: "[绝妖星乱舞]争首保次社畜队(已齐)",
        body: "队伍组成 MT骑士 ST黑骑。",
        url: "https://bbs.nga.cn/read.php?tid=339",
        topicId: "339"
      })
    );

    expect(found.recruitKind).toBe("closed");
    expect(filled.recruitKind).toBe("closed");
    expect(shouldShowNgaSample(foundSample, "balanced")).toBe(false);
  });

  it("does not close posts only because they mention waiting until the party is full", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "神兵从零7=1ST 晚8-10开打",
        body: "从零开荒，缺ST。猫区上班，不强制开麦，等人齐后再确定具体开打日期，以及过本是否++。",
        url: "https://bbs.nga.cn/read.php?tid=340",
        topicId: "340"
      })
    );

    expect(signal.recruitKind).toBe("recruit");
    expect(signal.isClosed).toBe(false);
    expect(signal.parsedFields.dungeon).toBe("究极神兵绝境战");
    expect(signal.parsedFields.positions).toEqual(["ST"]);
  });

  it("still closes explicit original-poster follow-up completion text", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "神兵从零7=1ST 晚8-10开打",
        body: "从零开荒，缺ST。猫区上班，不强制开麦。\n\n人已齐，感谢大家。",
        url: "https://bbs.nga.cn/read.php?tid=341",
        topicId: "341"
      })
    );

    expect(signal.recruitKind).toBe("closed");
    expect(signal.isClosed).toBe(true);
  });

  it("keeps cached closedAt rows hidden even if current text no longer matches closed wording", () => {
    const sample = sanitizeNgaSample({
      title: "神兵从零7=1ST 晚8-10开打",
      body: "从零开荒，缺ST。猫区上班，不强制开麦，等人齐后再确定具体开打日期，以及过本是否++。",
      closedAt: "2026-05-10T00:26:33.090Z",
      url: "https://bbs.nga.cn/read.php?tid=342",
      topicId: "342"
    });

    expect(classifyNgaSample(sample).isClosed).toBe(false);
    expect(shouldShowNgaSample(sample, "balanced")).toBe(false);
  });

  it("keeps roster rotation separate from normal vacancy positions", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[猫区][无攻略] 无攻略绝欧补招，8/9",
        body: "此次补员虽是第九人，但同样作为正式成员对待，并非替补。",
        url: "https://bbs.nga.cn/read.php?tid=303",
        topicId: "303"
      })
    );

    expect(signal.parsedFields.rosterSize).toBe("9人轮换/第九人");
    expect(signal.parsedFields.positions).toBeUndefined();
    expect(signal.parseConfidence.rosterSize).toBe("high");
  });

  it("treats tool and carry slang as warning tags instead of core fields", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝欧固定队 招H2",
        body: "要求绿玩，也接受红玩；允许使用轮椅，需要科技，装甲车另议。",
        url: "https://bbs.nga.cn/read.php?tid=304",
        topicId: "304"
      })
    );

    expect(signal.parsedFields.requirements).toContain("无 ACT/Dalamud 等插件倾向");
    expect(signal.parsedFields.requirements).toContain("ACT 时间轴/TTS 辅助");
    expect(signal.parsedFields.requirements).toContain("第三方工具/插件风险");
    expect(signal.parsedFields.requirements).toContain("代打/工作室/带老板风险");
    expect(signal.warnings.some((warning) => warning.includes("只作为风险/要求标签"))).toBe(true);
  });

  it("keeps non-green-player wording as a positive risk requirement", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝欧固定队 招H2",
        body: "只收非绿玩，能接受时间轴和TTS。",
        url: "https://bbs.nga.cn/read.php?tid=314",
        topicId: "314"
      })
    );

    expect(signal.parsedFields.requirements).toContain("第三方工具/插件风险");
    expect(signal.warnings.some((warning) => warning.includes("只作为风险/要求标签"))).toBe(true);
  });

  it("treats red/green-open wording as neutral plugin ecosystem rather than pure or risk", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝欧固定队 招H2",
        body: "红玩绿玩均可，婉拒绿玩洁癖，婉拒没挂水平严重下降。",
        url: "https://bbs.nga.cn/read.php?tid=320",
        topicId: "320"
      })
    );

    expect(signal.parsedFields.requirements).toContain("插件生态均可");
    expect(signal.parsedFields.requirements).toContain("拒绝极端插件立场");
    expect(signal.parsedFields.requirements).toContain("拒绝插件依赖");
    expect(signal.parsedFields.requirements).not.toContain("无 ACT/Dalamud 等插件倾向");
    expect(signal.parsedFields.requirements).not.toContain("第三方工具/插件风险");
    expect(signal.warnings.some((warning) => warning.includes("风险/要求标签"))).toBe(false);
  });

  it("keeps tolerated plugin wording neutral instead of positive risk", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[跨大区] 绝妖星首月社畜队H1、D4招募",
        body: "对于辅助欢迎一起绿色游戏。若有开插件习惯也无异议，但要尊重其他绿玩的游戏体验，不影响开荒节奏即可。",
        url: "https://bbs.nga.cn/read.php?tid=322",
        topicId: "322"
      })
    );

    expect(signal.parsedFields.requirements).toContain("插件态度中性");
    expect(signal.parsedFields.requirements).not.toContain("第三方工具/插件风险");
    expect(signal.warnings.some((warning) => warning.includes("风险/要求标签"))).toBe(false);
  });

  it("downgrades ACT output/log usage and distinguishes rejection of heavy assist dependence", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星固定队 招D1",
        body: "科技方面，ACT 仅用于 logs 记录与个人复盘，婉拒无绘图轮椅不会打本选手。",
        url: "https://bbs.nga.cn/read.php?tid=321",
        topicId: "321"
      })
    );

    expect(signal.parsedFields.requirements).toContain("logs 要求");
    expect(signal.parsedFields.requirements).toContain("ACT/logs 记录复盘");
    expect(signal.parsedFields.requirements).toContain("拒绝绘图轮椅依赖");
    expect(signal.parsedFields.requirements).not.toContain("第三方工具/插件风险");
    expect(signal.parsedFields.requirements).not.toContain("ACT 时间轴/TTS 辅助");
    expect(signal.parsedFields.requirements).not.toContain("纯净队/禁第三方");
    expect(signal.warnings.some((warning) => warning.includes("风险/要求标签"))).toBe(false);
  });

  it("does not expand ambiguous latin aliases inside longer tokens", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "edT 求职 任意N",
        body: "只是一段履历文本，不应把这个履历词拆成副本。",
        url: "https://bbs.nga.cn/read.php?tid=305",
        topicId: "305"
      })
    );

    expect(signal.parsedFields.dungeon).toBeUndefined();
    expect(signal.parsedFields.playerAvailablePositions).toEqual(expect.arrayContaining(["H1", "H2"]));
  });

  it("separates excluded jobs and mechanic-position exclusions", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星补人 非蛇D1",
        body: "缺 D1，但非蛇D1；非D4按机制位谨慎处理。",
        url: "https://bbs.nga.cn/read.php?tid=306",
        topicId: "306"
      })
    );

    expect(signal.parsedFields.excludedJobs).toContain("蝰蛇剑士");
    expect(signal.parsedFields.excludedPositions).toEqual(["D4"]);
    expect(signal.parseConfidence.excludedPositions).toBe("low");
    expect(signal.parsedFields.jobs ?? []).not.toContain("蝰蛇剑士");
    expect(signal.warnings.some((warning) => warning.includes("机制/攻略站位"))).toBe(true);
  });

  it("keeps vacancy position when a negative phrase excludes only a job", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[豆豆柴/狗区][跨大区]绝凯夫卡次月晚间队9-11，7=1非绝枪MT",
        body:
          "绝凯夫卡次月晚间队9-11，7=1非绝枪MT。目前配置：枪 武蛇可切龙 舞 黑 白 学。要求五绝，联系 845836965。",
        url: "https://bbs.nga.cn/read.php?tid=3061",
        topicId: "3061"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["MT"]);
    expect(signal.parsedFields.excludedJobs).toContain("绝枪战士");
    expect(signal.parsedFields.excludedPositions).toBeUndefined();
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      ST: ["绝枪战士"],
      H1: ["白魔法师"],
      H2: ["学者"],
      D1: ["武士"],
      D2: ["蝰蛇剑士", "龙骑士"],
      D3: ["舞者"],
      D4: ["黑魔法师"]
    });
  });

  it("keeps structured contact output to method labels and masks long identifiers in evidence", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝欧固定队招H2",
        body: "联系 QQ：123456789，群号 987654321。",
        url: "https://bbs.nga.cn/read.php?tid=307",
        topicId: "307"
      })
    );
    const contactEvidence = signal.evidence.find((item) => item.field === "contact");

    expect(signal.parsedFields.contact).toBe("联系方式、QQ/企鹅、群");
    expect(contactEvidence?.snippet).toContain("[数字已隐藏]");
    expect(contactEvidence?.snippet).not.toContain("123456789");
    expect(contactEvidence?.snippet).not.toContain("987654321");
  });

  it("parses anti-risk wording as clean-team requirements instead of risk tags", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星纯净队招D4",
        body: "禁止插件/第三方/外挂/宝宝椅，谢绝科技轮椅，非装甲车，婉拒代打工作室拖过去的记录。",
        url: "https://bbs.nga.cn/read.php?tid=312",
        topicId: "312"
      })
    );

    expect(signal.parsedFields.requirements).toContain("纯净队/禁第三方");
    expect(signal.parsedFields.requirements).toContain("拒绝装甲车/代打记录");
    expect(signal.parsedFields.requirements).not.toContain("第三方工具/插件风险");
    expect(signal.parsedFields.requirements).not.toContain("代打/工作室/带老板风险");
    expect(signal.warnings.some((warning) => warning.includes("风险/要求标签"))).toBe(false);
    expect(signal.tags).toEqual(expect.arrayContaining(["纯净队/禁第三方", "拒绝装甲车/代打记录"]));
  });

  it("treats armored-carry invisible wording as anti-carry instead of carry risk", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[新绝][猫区打] 绝妖星乱舞-开放后第二周开打，6=2 招1近战D4，计划攻略时间3-4周",
        body: "队内使用TTS及科技及攻略商议。装甲车过本看不到我，提供游戏ID准备LOGS。",
        url: "https://bbs.nga.cn/read.php?tid=315",
        topicId: "315"
      })
    );

    expect(signal.parsedFields.requirements).toContain("第三方工具/插件风险");
    expect(signal.parsedFields.requirements).toContain("拒绝装甲车/代打记录");
    expect(signal.parsedFields.requirements).not.toContain("代打/工作室/带老板风险");
    expect(signal.tags).toEqual(expect.arrayContaining(["第三方工具/插件风险", "拒绝装甲车/代打记录"]));
  });

  it("parses social team constraints as colored requirement tags", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝欧全妹队招H2",
        body: "全妹队，仅限女生加入，时间晚8-11。",
        url: "https://bbs.nga.cn/read.php?tid=313",
        topicId: "313"
      })
    );

    expect(signal.parsedFields.requirements).toContain("全妹队/女生限定");
    expect(signal.tags).toContain("全妹队/女生限定");
    expect(signal.parseConfidence.requirements).toBe("high");
  });

  it("maps M-series savage shorthand to Arcadion with high confidence", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[跨大区] M9S-M12S 5=3非龙近战，H1，H2",
        body: "攻略：野队一套。时间：21.30-23.30。",
        url: "https://bbs.nga.cn/read.php?tid=308",
        topicId: "308"
      })
    );

    expect(signal.parsedFields.dungeon).toBe("阿卡迪亚登天斗技场 M9S-M12S");
    expect(signal.parseConfidence.dungeon).toBe("high");
  });

  it("keeps current savage layer shorthand as contextual dungeon evidence", () => {
    const floor = classifyNgaSample(
      sanitizeNgaSample({
        title: "[跨大区] 零式4层门神开荒 7=1 H2",
        body: "晚8-11，攻略野队一套。",
        url: "https://bbs.nga.cn/read.php?tid=342",
        topicId: "342"
      })
    );
    const range = classifyNgaSample(
      sanitizeNgaSample({
        title: "零式1-4清cd队招募 D4",
        body: "周二晚清CD。",
        url: "https://bbs.nga.cn/read.php?tid=343",
        topicId: "343"
      })
    );

    expect(floor.parsedFields.dungeon).toBe("当前零式4层");
    expect(floor.parseConfidence.dungeon).toBe("medium");
    expect(range.parsedFields.dungeon).toBe("当前零式1-4层");
    expect(range.parseConfidence.dungeon).toBe("medium");
  });

  it("does not let savage resume wording override an explicit ultimate dungeon", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[跨大区] 绝妖星首月队 6=2 MT D4",
        body: "要求有零式4层或 M9S-M12S 首周经验，晚8-11。",
        url: "https://bbs.nga.cn/read.php?tid=344",
        topicId: "344"
      })
    );

    expect(signal.parsedFields.dungeon).toBe("妖星乱舞绝境战");
    expect(signal.parseConfidence.dungeon).toBe("high");
  });

  it("normalizes tndd as T/N plus DD strategy grouping", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "M11S 固定队补人",
        body: "攻略：11 mmw文档 tndd L改美圈。",
        url: "https://bbs.nga.cn/read.php?tid=309",
        topicId: "309"
      })
    );

    expect(signal.parsedFields.strategy).toContain("T/N + DD 职能分组");
    expect(signal.parseConfidence.strategy).toBe("high");
  });

  it("does not treat existing roster positions as vacancies", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[绝卡夫卡]次月休闲队7=1 d1",
        body:
          "已有mt黑骑 st骑士 h1白魔，看具体副本情况可切占星 h2学者 d2龙骑 d3诗人/机工可切 d4黑魔要求 五绝及以上，有零式首周经验，循环正常，减伤对h2要求奶轴可以协商，时间晚上9.30-11.30，打5休2，固定周四休息。",
        url: "https://bbs.nga.cn/read.php?tid=315",
        topicId: "315"
      })
    );

    expect(signal.recruitKind).toBe("recruit");
    expect(signal.parsedFields.positions).toEqual(["D1"]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["暗黑骑士"],
      ST: ["骑士"],
      H1: ["白魔法师", "占星术士"],
      H2: ["学者"],
      D2: ["龙骑士"],
      D3: ["吟游诗人", "机工士"],
      D4: ["黑魔法师"]
    });
    expect(signal.parsedFields.positions).not.toEqual(expect.arrayContaining(["H1", "H2", "D2", "D3", "D4"]));
    expect(signal.parsedFields.jobs ?? []).not.toEqual(
      expect.arrayContaining(["暗黑骑士", "白魔法师", "占星术士", "龙骑士", "吟游诗人", "机工士", "黑魔法师"])
    );
  });

  it("fills compact roster shorthand with vacancy placeholders", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[7.51新绝本]绝妖星乱舞美西时差/国内下午争次周保三队7=1 d4",
        body: "队内配置 战骑白学僧镰诗7=1 d4 (来个黑黑的爷，画家亦可)。",
        url: "https://bbs.nga.cn/read.php?tid=327",
        topicId: "327"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D4"]);
    expect(signal.parsedFields.jobs).toEqual(expect.arrayContaining(["黑魔法师", "绘灵法师"]));
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["战士"],
      ST: ["骑士"],
      H1: ["白魔法师"],
      H2: ["学者"],
      D1: ["武僧"],
      D2: ["钐镰客"],
      D3: ["吟游诗人"]
    });
    expect(signal.parsedFields.rosterSlots?.D4).toBeUndefined();
  });

  it("parses role-ordered composition and keeps healer vacancy alternatives", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[陆行鸟区]绝妖星上2休1，7=1奶，预计1~1.5月通关，可跨区",
        body:
          "职业构成：骑枪蛇龙(镰)机画(赤)+任意占学，六个队友均为队长内推。招募要求：占or学，零式logs清CD不灰不绿即可。",
        url: "https://bbs.nga.cn/read.php?tid=340",
        topicId: "340"
      })
    );

    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["H1", "H2"]));
    expect(signal.parsedFields.vacancyFlexGroups).toEqual([["H1", "H2"]]);
    expect(signal.parsedFields.jobs).toEqual(expect.arrayContaining(["占星术士", "学者"]));
    expect(signal.parsedFields.rosterFlexGroups).toEqual([["H1", "H2"]]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["骑士"],
      ST: ["绝枪战士"],
      H1: ["占星术士", "学者"],
      H2: ["占星术士", "学者"],
      D1: ["蝰蛇剑士"],
      D2: ["龙骑士", "钐镰客"],
      D3: ["机工士"],
      D4: ["绘灵法师", "赤魔法师"]
    });
  });

  it("parses job-before-position roster groups and keeps all vacancy job options", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[猫小胖/猫区][绝凯夫卡]固定队5=3招募D2",
        body:
          "固定队情况：配置武士/蛇(d1)、舞者/机工(d3)、画家/黑魔(d4)、白魔/占(h1)、学者(h2)守时不咕。招募情况：招募D2(侍、龙、忍、武僧)要求logs紫以上。",
        url: "https://bbs.nga.cn/read.php?tid=328",
        topicId: "328"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D2"]);
    expect(signal.parsedFields.jobs).toEqual(expect.arrayContaining(["武士", "龙骑士", "忍者", "武僧"]));
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      H1: ["白魔法师", "占星术士"],
      H2: ["学者"],
      D1: ["武士", "蝰蛇剑士"],
      D3: ["舞者", "机工士"],
      D4: ["绘灵法师", "黑魔法师"]
    });
  });

  it("keeps roster-only job hints out of demand jobs when open slots are different roles", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[绝凯夫卡][猫区打]纯净首月队4=4 (MTSTD3D4)",
        body:
          "纯净首月队4=4(需求双T双远)现有:占(H1)，贤/学(H2)，盘/侍(D1)，龙/镰(D2)。招募位置：MT、ST、D3、D4，职业不限定。每天20:30-23:30。",
        url: "https://bbs.nga.cn/read.php?tid=342",
        topicId: "342"
      })
    );

    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["MT", "ST", "D3", "D4"]));
    expect(signal.parsedFields.jobs).toBeUndefined();
    expect(signal.parsedFields.vacancySlots).toBeUndefined();
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      H1: ["占星术士"],
      H2: ["贤者", "学者"],
      D1: ["武士"],
      D2: ["龙骑士", "钐镰客"]
    });
  });

  it("normalizes time display without treating rest days as active days", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "妖星乱舞 次月社畜队 7=1 D1/2",
        body: "晚间队，周二晚上8-10点开荒，周末休，每天打2-3小时。",
        url: "https://bbs.nga.cn/read.php?tid=325",
        topicId: "325"
      })
    );

    expect(signal.parsedFields.time).toBe("周二 20:00-22:00");
    expect(signal.parsedFields.dailyDuration).toBe("2-3小时/天");
  });

  it("keeps phased schedules and does not treat hour suffixes as healer vacancies", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "妖星乱舞绝境战 时差队 5=3 双近战一远敏 保首月 首周爆肝次周后国内时间中午3h",
        body:
          "时间：首周每天6-8h，国内时间早上10:00-14:00，晚上21:00-1:00次周开始每天3h，国内时间早上11:00-14:00。招募职业：d1 d2 d3要求：1封m1-4s或首周/6绝/零式无攻略经验以上三选一。",
        url: "https://bbs.nga.cn/read.php?tid=360",
        topicId: "360"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D1", "D2", "D3"]);
    expect(signal.parsedFields.time).toBe("首周 每天 10:00-14:00、21:00-次日01:00；次周开始 每天 11:00-14:00");
    expect(signal.parsedFields.dailyDuration).toBe("首周 6-8小时/天、次周开始 3小时/天");
  });

  it("infers active days from fixed rest days without turning rest days into play days", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[绝凯夫卡] 6月中旬开打，次月队7=1 d3或d4",
        body: "上班时间：上6休1，固定休周一，每晚2小时，北京时间 21:30 - 23:30。",
        url: "https://bbs.nga.cn/read.php?tid=329",
        topicId: "329"
      })
    );

    expect(signal.parsedFields.time).toBe("周二-周日 21:30-23:30");
    expect(signal.parsedFields.dailyDuration).toBe("2小时/天");
    expect(signal.parsedFields.positions).toEqual(["D3", "D4"]);
    expect(signal.parsedFields.vacancyFlexGroups).toEqual([["D3", "D4"]]);
  });

  it("keeps multiple listed rest days excluded from inferred active days", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝凯夫卡首月保次月，社畜晚间9-12队7=1 d4",
        body: "目前已有：2T战/dk+骑；双奶白/占+学；2近龙+镰；d3诗人/机工。上班时间：晚9-12，周休2天，休周二周五。",
        url: "https://bbs.nga.cn/read.php?tid=3291",
        topicId: "3291"
      })
    );

    expect(signal.parsedFields.time).toBe("周一/周三/周四/周六/周日 21:00-24:00");
    expect(signal.parsedFields.dailyDuration).toBe("约3小时/天");
  });

  it("records d1/2 as a single melee vacancy flex group", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星六月4=4双奶+d1/2+d3",
        body: "要求五绝，晚9-11，缺 d1/2、d3、h1、h2。",
        url: "https://bbs.nga.cn/read.php?tid=341",
        topicId: "341"
      })
    );

    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["D1", "D2", "D3", "H1", "H2"]));
    expect(signal.parsedFields.vacancyFlexGroups).toContainEqual(["D1", "D2"]);
  });

  it("parses counted role vacancies after team size as flex open slots", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "7.5新绝 首月 晚间 社畜队6=2 (1近战1法系)",
        body: "队伍配置：暗骑白学镰舞。要求：紫色以上，时间19:30-23:30。",
        url: "https://bbs.nga.cn/read.php?tid=3411",
        topicId: "3411"
      })
    );

    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["D1", "D2", "D4"]));
    expect(signal.parsedFields.vacancyFlexGroups).toContainEqual(["D1", "D2"]);
  });

  it("keeps current configuration positions out of vacancy extraction", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[绝凯夫卡] 新绝7=1 D2 次月队",
        body: "目前配置 MT ST H1 H2 D1 D3 D4需求：D2时间：周一-周四 8:30-10:30，周五六可稍微延迟到11点。",
        url: "https://bbs.nga.cn/read.php?tid=330",
        topicId: "330"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D2"]);
  });

  it("parses compact latin job abbreviations inside roster positions", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "7.51 绝本晚间固定队招募 6=2 st d4",
        body: "队伍说明现有阵容：MTdk H1白/占 H2学者 D1近战可切 D2武僧 D3舞者需求职业：ST D4。",
        url: "https://bbs.nga.cn/read.php?tid=331",
        topicId: "331"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D4", "ST"]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["暗黑骑士"],
      H1: ["占星术士", "白魔法师"],
      H2: ["学者"],
      D1: ["任意近战"],
      D2: ["武僧"],
      D3: ["舞者"]
    });
  });

  it("assigns declared member jobs by role fit instead of raw member order", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星乱舞纯净队5=3 t .h1. d3",
        body:
          "队伍情况：已有MT/ST，H2，D1，D2，D4。已有队员：黑骑：6绝，MT/ST均可 学者：6绝 武士：6绝 黑魔：6绝 蝰蛇：6绝。招募要求：纯净。",
        url: "https://bbs.nga.cn/read.php?tid=332",
        topicId: "332"
      })
    );

    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["MT", "ST", "H1", "D3"]));
    expect(signal.parsedFields.vacancyFlexGroups).toEqual([["MT", "ST"]]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["暗黑骑士"],
      ST: ["暗黑骑士"],
      H2: ["学者"],
      D1: ["武士"],
      D2: ["蝰蛇剑士"],
      D4: ["黑魔法师"]
    });
  });

  it("keeps one flexible member on merged roster slots while exposing one open slot", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "7.5绝凯夫卡开荒队招募5=3",
        body:
          "现有：MT/ST(战士/骑士/DK)，H2(学者)，D1/2(忍者/武僧)，D3(诗人/其他可切)，D4(黑魔/画家)招募：MT/ST、H1、D1/2。时间20:00-24:00。",
        url: "https://bbs.nga.cn/read.php?tid=3321",
        topicId: "3321"
      })
    );

    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["MT", "ST", "H1", "D1", "D2"]));
    expect(signal.parsedFields.vacancyFlexGroups).toEqual(expect.arrayContaining([["MT", "ST"], ["D1", "D2"]]));
    expect(signal.parsedFields.rosterFlexGroups).toEqual(expect.arrayContaining([["MT", "ST"], ["D1", "D2"]]));
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["战士", "骑士", "暗黑骑士"],
      ST: ["战士", "骑士", "暗黑骑士"],
      H2: ["学者"],
      D1: ["忍者", "武僧"],
      D2: ["忍者", "武僧"],
      D3: ["吟游诗人", "舞者", "机工士"],
      D4: ["黑魔法师", "绘灵法师"]
    });
  });

  it("does not treat roster position labels as vacancies after a 7=1 title", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "次月队绝妖星乱舞7=1 D4",
        body:
          "职业：MT 战士ST 骑士H1 白魔/占星H2 学者D1 镰刀D2 龙骑D3 舞者D4 攻略：国服主流攻略。时间：周一到周五晚上8点半-10点半。要求：logs紫。",
        url: "https://bbs.nga.cn/read.php?tid=3330",
        topicId: "3330"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D4"]);
    expect(signal.parsedFields.jobs).toBeUndefined();
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["战士"],
      ST: ["骑士"],
      H1: ["白魔法师", "占星术士"],
      H2: ["学者"],
      D1: ["钐镰客"],
      D2: ["龙骑士"],
      D3: ["舞者"]
    });
  });

  it("keeps shield healers in H2 when compact roster also advertises an H1 vacancy", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝凯夫卡进度队6=2H1,D1&2",
        body:
          "目前队伍构成:战 枪 学 龙 诗 画现缺D1or2，H1许愿占星上班时间:晚上8:30/9-11:30/12，打5休1视情况加班。使用攻略:攻略野队一套，熟读攻略并提前了解下p机制语音软件:oopz联系方式:QQ652366726，请备注职业及位置",
        url: "https://bbs.nga.cn/read.php?tid=3334",
        topicId: "3334"
      })
    );

    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["H1", "D1", "D2"]));
    expect(signal.parsedFields.vacancyFlexGroups).toEqual(expect.arrayContaining([["D1", "D2"]]));
    expect(signal.parsedFields.jobs).toEqual(["占星术士"]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["战士"],
      ST: ["绝枪战士"],
      H2: ["学者"],
      D3: ["吟游诗人"],
      D4: ["绘灵法师"]
    });
    expect(signal.parsedFields.rosterSlots?.H1).toBeUndefined();
    expect(signal.parsedFields.strategy).not.toContain("联系方式");
  });

  it("does not merge explicitly separate H1 and H2 vacancies from h1h2 text", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[跨大区]零式清cd队招募h1h2和d4队友，5=3",
        body:
          "零式清cd队招募h1h2和d4队友，5=3，在鸟区打招募职位：h1，h2和d4已有职位：ST骑，MT战，D1赤，D2僧，D3舞招募要求：机制熟练网络稳定打本时间：周二的晚上8点~10点攻略：10层美式11层闲人直飞tndd",
        url: "https://bbs.nga.cn/read.php?tid=3335",
        topicId: "3335"
      })
    );

    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["H1", "H2", "D4"]));
    expect(signal.parsedFields.vacancyFlexGroups ?? []).not.toContainEqual(["H1", "H2"]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["战士"],
      ST: ["骑士"],
      D1: ["赤魔法师"],
      D2: ["武僧"],
      D3: ["舞者"]
    });
  });

  it("ignores explanatory previous-teammate position references", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝伊甸p3初见 招d2 晚8-10 周末休",
        body:
          "已有：MT黑骑 ST骑士 H1白魔 H2学者 D1武士 D3舞者 D4画家 需求：D2。注意：H1和H2为之前的零式队友，已搭档3期零式原d2时间冲突退队，现招募d2。",
        url: "https://bbs.nga.cn/read.php?tid=3331",
        topicId: "3331"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D2"]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      H1: ["白魔法师"],
      H2: ["学者"],
      D4: ["绘灵法师"]
    });
  });

  it("recognizes bare bahamut shorthand before later new-ultimate mentions", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "巴哈从零 7=1 mt",
        body: "队伍有复盘和排轴能力，打到新绝本开本，没过散队。时间晚9-11。",
        url: "https://bbs.nga.cn/read.php?tid=3332",
        topicId: "3332"
      })
    );

    expect(signal.parsedFields.dungeon).toBe("巴哈姆特绝境战");
  });

  it("recognizes common ultimate weapon shorthands", () => {
    const recruit = classifyNgaSample(
      sanitizeNgaSample({
        title: "神兵复健队2=5",
        body: "晚8-10，缺MT ST H1 H2 D1，过本复健。",
        url: "https://bbs.nga.cn/read.php?tid=3336",
        topicId: "3336"
      })
    );
    const seeking = classifyNgaSample(
      sanitizeNgaSample({
        title: "H1复健人神兵求职",
        body: "可打 H1，跨大区，神兵复健/从零都可。",
        url: "https://bbs.nga.cn/read.php?tid=3337",
        topicId: "3337"
      })
    );
    const bingbing = classifyNgaSample(
      sanitizeNgaSample({
        title: "兵兵从零7=1ST 晚8-10开打",
        body: "已有队友稳定，缺ST，攻略自查。",
        url: "https://bbs.nga.cn/read.php?tid=3338",
        topicId: "3338"
      })
    );

    expect(recruit.recruitKind).toBe("recruit");
    expect(recruit.parsedFields.dungeon).toBe("究极神兵绝境战");
    expect(recruit.parsedFields.positions).toEqual(expect.arrayContaining(["MT", "ST", "H1", "H2", "D1"]));
    expect(seeking.recruitKind).toBe("seeking");
    expect(seeking.parsedFields.dungeon).toBe("究极神兵绝境战");
    expect(seeking.parsedFields.playerAvailablePositions).toEqual(["H1"]);
    expect(bingbing.parsedFields.dungeon).toBe("究极神兵绝境战");
    expect(bingbing.parsedFields.positions).toEqual(["ST"]);
  });

  it("distinguishes neutral plugin stance, positive tech use, and anti-cheat wording", () => {
    const neutral = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星 6=2 h2 d4",
        body: "没有科技洁癖，不影响队友就行。",
        url: "https://bbs.nga.cn/read.php?tid=333",
        topicId: "333"
      })
    );
    const risk = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星 7=1 D2",
        body: "有需要时会适当使用科技，非纯绿。",
        url: "https://bbs.nga.cn/read.php?tid=334",
        topicId: "334"
      })
    );
    const antiCheat = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星 7=1 D3",
        body: "日常掉线/游戏崩溃/电脑死机/莫名其妙的亚拉戈科技小子请慎重。",
        url: "https://bbs.nga.cn/read.php?tid=335",
        topicId: "335"
      })
    );
    const noTech = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星无科技首月队",
        body: "队内不使用科技，希望你有无科技绝本经验，打本不依赖科技。",
        url: "https://bbs.nga.cn/read.php?tid=336",
        topicId: "336"
      })
    );

    expect(neutral.parsedFields.requirements).toBe("插件态度中性");
    expect(risk.parsedFields.requirements).toBe("第三方工具/插件风险");
    expect(antiCheat.parsedFields.requirements).toBe("反作弊/异常科技提醒");
    expect(noTech.parsedFields.requirements).toBe("纯净队/禁第三方");
  });

  it("does not classify demand-job headings as player seeking", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "重量级零式清cd非绿晚间队 5=3D",
        body: "队伍配置：MT战ST，H1白H2学，D2蝰蛇，需求职业：非蛇D1、D3远敏、D4法系时间：周二晚上8-10点。",
        url: "https://bbs.nga.cn/read.php?tid=316",
        topicId: "316"
      })
    );

    expect(signal.recruitKind).toBe("recruit");
    expect(signal.parsedFields.teamType ?? "").not.toContain("玩家求职");
    expect(signal.parsedFields.playerAvailablePositions).toBeUndefined();
    expect(signal.parsedFields.positions).toEqual(expect.arrayContaining(["D1", "D3", "D4"]));
    expect(signal.parsedFields.excludedJobs).toContain("蝰蛇剑士");
    expect(signal.parsedFields.jobs ?? []).not.toContain("蝰蛇剑士");
  });

  it("does not treat standalone schedule timelines as plugin risk", () => {
    const officialSchedule = classifyNgaSample(
      sanitizeNgaSample({
        title: "求职/招募 国服跨大区",
        body: "进行跨大区招募前，请务必根据官方时间轴确认跨大区功能开放时间与副本开放时间是否冲突。",
        url: "https://bbs.nga.cn/read.php?tid=317",
        topicId: "317"
      })
    );
    const mitigationPlan = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星 7=1 D4",
        body: "减伤：出详细时间轴后奶妈会安排全队减伤，希望你可以严格执行。",
        url: "https://bbs.nga.cn/read.php?tid=318",
        topicId: "318"
      })
    );

    expect(officialSchedule.parsedFields.requirements).toBeUndefined();
    expect(mitigationPlan.parsedFields.requirements).toBeUndefined();
  });

  it("marks timeline assistance only when explicit tool wording is nearby", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝欧固定队 招H2",
        body: "允许 ACT 时间轴和 TTS 播报，轮椅可自备。",
        url: "https://bbs.nga.cn/read.php?tid=319",
        topicId: "319"
      })
    );

    expect(signal.parsedFields.requirements).toContain("ACT 时间轴/TTS 辅助");
    expect(signal.warnings.some((warning) => warning.includes("ACT 时间轴/TTS 辅助"))).toBe(true);
  });

  it("treats free-company social posts without duty evidence as noise", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[鸟区][神意之地]回归老咸鱼携友找个每日活跃的部队一起玩！",
        body: "想找个每日有人说话的部队一起玩，主要休闲日常。",
        url: "https://bbs.nga.cn/read.php?tid=322",
        topicId: "322"
      })
    );

    expect(signal.recruitKind).toBe("noise");
    expect(signal.isNoise).toBe(true);
    expect(signal.tags).toContain("疑似噪音");
  });

  it("treats cleared edited-only posts as closed", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "编辑123456",
        body: "编辑[数字已隐藏]",
        url: "https://bbs.nga.cn/read.php?tid=323",
        topicId: "323"
      })
    );

    expect(signal.recruitKind).toBe("closed");
    expect(signal.isClosed).toBe(true);
    expect(signal.parsedFields.teamType).toBe("已招满/关闭");
    expect(signal.tags).toContain("已关闭");

    const numericOnly = classifyNgaSample(
      sanitizeNgaSample({
        title: "1111111111",
        body: "11111111111111111111",
        url: "https://bbs.nga.cn/read.php?tid=324",
        topicId: "324"
      })
    );
    expect(numericOnly.recruitKind).toBe("closed");
    expect(numericOnly.isClosed).toBe(true);
  });

  it("only downgrades D-position confidence when mechanic-position context is nearby", () => {
    const vacancy = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星 7=1 D4",
        body: "缺D4，时间晚8-11。",
        url: "https://bbs.nga.cn/read.php?tid=310",
        topicId: "310"
      })
    );
    const mechanic = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝妖星 讨论攻略站位D4",
        body: "不是招募缺口，只是攻略站位D4需要人工确认。",
        url: "https://bbs.nga.cn/read.php?tid=311",
        topicId: "311"
      })
    );

    expect(vacancy.parseConfidence.positions).toBe("high");
    expect(mechanic.parseConfidence.positions).toBe("low");
  });

  it("uses explicit empty slots in a roster table as vacancy signals", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[跨大区] [7.51绝妖星乱舞]首月晚间队开招 9~12点打6休1",
        body:
          "目前队伍组成 MT:空 ST:空 H1:白魔 H2:学者 D1:空 D2:空 D3:舞者 D4:赤魔/画家可切。晚上8:45开组，9点进本，打本时间9:00-12:00。",
        url: "https://bbs.nga.cn/read.php?tid=350",
        topicId: "350"
      })
    );

    expect(signal.parsedFields.positions?.sort()).toEqual(["D1", "D2", "MT", "ST"].sort());
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      H1: ["白魔法师"],
      H2: ["学者"],
      D3: ["舞者"],
      D4: ["赤魔法师", "绘灵法师"]
    });
    expect(signal.parsedFields.time).toBe("21:00-24:00");
  });

  it("lets a 7=1 explicit D slot override generic roster mentions", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "7.51绝凯夫卡保次周爆肝队7=1 d3",
        body: "目前已有：MT ST H1 H2 D1 D2 D4。北京时间12:00-18:00，欢迎D3。",
        url: "https://bbs.nga.cn/read.php?tid=351",
        topicId: "351"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D3"]);
    expect(signal.parsedFields.excludedPositions ?? []).toEqual([]);
  });

  it("treats non-job wording as a job exclusion instead of excluding the position", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[豆豆柴/狗区] 绝凯夫卡次月晚间队9-11，7=1非绝枪MT",
        body: "目前配置：枪 战 武士 蝰蛇 舞者 黑魔 白魔 学者，首月伊甸。保底次月过本，要求非绝枪MT。",
        url: "https://bbs.nga.cn/read.php?tid=352",
        topicId: "352"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["MT"]);
    expect(signal.parsedFields.excludedJobs).toContain("绝枪战士");
    expect(signal.parsedFields.excludedPositions ?? []).not.toContain("MT");
  });

  it("maps plus-separated roster lists to occupied slots before applying 7=1", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "7.51绝妖星乱舞休闲队(7=1 H2)",
        body: "队伍概述：目前构成 2T+H1+D1+D2+D3+D4(骑士+黑骑+占星+龙骑+忍者+舞者+画家)，招H2。",
        url: "https://bbs.nga.cn/read.php?tid=353",
        topicId: "353"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["H2"]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["骑士"],
      ST: ["暗黑骑士"],
      H1: ["占星术士"],
      D1: ["龙骑士"],
      D2: ["忍者"],
        D3: ["舞者"],
        D4: ["绘灵法师"]
      });
    expect(signal.parsedFields.rosterFlexGroups).toBeUndefined();
  });

  it("lets direct role demand with colon lock a melee vacancy", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝卡卡首月无休晚8:40-11:40 队7=1",
        body:
          "立刻开打的首月队，无休无休无休。时间晚8:40~11:40周六周日下午或者晚上会有1~3小时的加班时间。预计70小时过本阵容：坦 占学 忍 舞 黑/画 一人补位队内除奶妈和D3外都有国际服经验。现招募：近战，要求绝亚特欧经验。",
        url: "https://bbs.nga.cn/read.php?tid=356",
        topicId: "356"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D1", "D2"]);
    expect(signal.parsedFields.vacancyFlexGroups).toEqual(expect.arrayContaining([["D1", "D2"]]));
    expect(signal.parsedFields.jobs).toContain("任意近战");
  });

  it("parses full-width midnight ranges as overnight time", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "巴哈姆特绝境战 7=1 D4",
        body: "夜班子队，晚12：00-2:00，缺D4。",
        url: "https://bbs.nga.cn/read.php?tid=354",
        topicId: "354"
      })
    );

    expect(signal.parsedFields.time).toBe("00:00-02:00");
  });

  it("understands counted role roster groups and rest-day exclusions", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "绝凯夫卡争首月保次月，社畜晚间9-12队7=1 d4",
        body: "目前已有：2T战/dk+骑；双奶白/占+学；2近龙+镰；d3诗人/机工。上班时间：晚9-12，周休2天，休周二周五。",
        url: "https://bbs.nga.cn/read.php?tid=355",
        topicId: "355"
      })
    );

    expect(signal.parsedFields.positions).toEqual(["D4"]);
    expect(signal.parsedFields.rosterSlots).toMatchObject({
      MT: ["战士", "暗黑骑士"],
      ST: ["骑士"],
      H1: ["白魔法师", "占星术士"],
      H2: ["学者"],
      D1: ["龙骑士"],
      D2: ["钐镰客"],
      D3: ["吟游诗人", "机工士"]
    });
    expect(signal.parsedFields.time).toBe("周一/周三/周四/周六/周日 21:00-24:00");
  });

  it("keeps separate explicit healer vacancies instead of merging H1 and H2", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "零式 5=3",
        body: "已有ST骑、MT战、D1赤、D2侍、D3舞，招募职位：h1，h2和d4已有职位。",
        url: "https://bbs.nga.cn/read.php?tid=356",
        topicId: "356"
      })
    );

    expect(signal.parsedFields.positions?.sort()).toEqual(["D4", "H1", "H2"].sort());
    expect(signal.parsedFields.vacancyFlexGroups ?? []).toEqual([]);
  });

  it("uses known existing roles to infer missing DPS slots in 5=3 posts", () => {
    const signal = classifyNgaSample(
      sanitizeNgaSample({
        title: "[首月队5=3]凌晨11-2绝卡夫卡首月进度队5=3",
        body: "本队时间：晚间11-凌晨2点，无休职业：已有双T双奶d3；需求：D1 D2 D4。",
        url: "https://bbs.nga.cn/read.php?tid=357",
        topicId: "357"
      })
    );

    expect(signal.parsedFields.positions?.sort()).toEqual(["D1", "D2", "D4"].sort());
  });
});

describe("nga sample whitelist", () => {
  it("keeps only parser whitelist fields and drops credential-like payloads", () => {
    const sample = sanitizeNgaSample({
      title: "绝欧固定队招募",
      body: "缺H2 周末晚8-11",
      url: "https://bbs.nga.cn/read.php?tid=123",
      author: "楼主",
      publishedAt: "2026-05-08",
      updatedAt: "2026-05-09",
      forumId: "321",
      topicId: "123",
      cookie: "should-not-exist",
      token: "should-not-exist",
      password: "should-not-exist",
      localStorage: "should-not-exist"
    });

    expect(Object.keys(sample).sort()).toEqual([
      "archiveReason",
      "archivedAt",
      "author",
      "body",
      "closedAt",
      "contentHash",
      "detailFetchedAt",
      "forumId",
      "lastBoardRank",
      "lastBoardSeenAt",
      "lastCheckedAt",
      "lastFullWindowScanAt",
      "lastSeenAt",
      "publishedAt",
      "sourceBoardUrl",
      "title",
      "topicId",
      "updatedAt",
      "url"
    ]);
    expect(JSON.stringify(sample)).not.toContain("should-not-exist");
  });

  it("removes accidental NGA author metadata from collected titles", () => {
    const sample = sanitizeNgaSample({
      title: "7.5绝凯夫卡开荒队招募5=3 · 猫小胖/#0amria 43205080级别: 学徒威望: 1注册: 18-08-21",
      body: "缺D1，时间晚8-11。",
      url: "https://bbs.nga.cn/read.php?tid=326",
      topicId: "326"
    });

    expect(sample.title).toBe("7.5绝凯夫卡开荒队招募5=3");
  });

  it("removes Chinese author metadata and hides low-information generic posts", () => {
    const sample = sanitizeNgaSample({
      title: "零式/#0小鸡毛的小白 66506801声望: 30(lv0)威望: 1(学徒)注册: 24-12-31财富: 3",
      body: "#0小鸡毛的小白 66506801声望: 30(lv0)威望: 1(学徒)注册: 24-12-31财富: 3",
      url: "https://bbs.nga.cn/read.php?tid=341",
      topicId: "341"
    });

    expect(sample.title).toBe("零式");
    const signal = classifyNgaSample(sample);
    expect(signal.recruitKind).toBe("noise");
    expect(shouldShowNgaSample(sample, "balanced")).toBe(false);
  });

  it("deduplicates samples and enforces maximum count", () => {
    const samples = sanitizeNgaSamples(
      [
        { title: "绝欧固定队招募 缺H2", url: "https://bbs.nga.cn/read.php?tid=1", topicId: "1" },
        { title: "绝欧固定队招募 duplicate", url: "https://bbs.nga.cn/read.php?tid=1", topicId: "1" },
        { title: "绝妖星乱舞 7=1 D1", url: "https://bbs.nga.cn/read.php?tid=2", topicId: "2" }
      ],
      1
    );
    expect(samples).toHaveLength(1);
    expect(samples[0].topicId).toBe("1");
  });

  it("updates an existing title-only sample when a body-rich detail sample arrives", () => {
    const samples = mergeNgaSamples(
      [
        { title: "绝妖星乱舞 7=1 D1/2", url: "https://bbs.nga.cn/read.php?tid=1", topicId: "1" },
        {
          title: "绝妖星乱舞 7=1 D1/2",
          body: "时间：工作日晚 20-23\n缺 D1/D2\n联系：站内",
          url: "https://bbs.nga.cn/read.php?tid=1",
          topicId: "1",
          author: "楼主"
        }
      ],
      1500
    );

    expect(samples).toHaveLength(1);
    expect(samples[0].body).toContain("工作日晚");
    expect(samples[0].author).toBe("楼主");
  });

  it("drops title-only homepage noise but keeps title-only recruit candidates", () => {
    expect(
      shouldKeepNgaCollectedSample(
        sanitizeNgaSample({
          title: "玩转NGA！NGA新手指南！",
          url: "https://bbs.nga.cn/read.php?tid=999",
          topicId: "999"
        })
      )
    ).toBe(false);
    expect(
      shouldKeepNgaCollectedSample(
        sanitizeNgaSample({
          title: "[鸟区][神意之地]回归老咸鱼携友找个每日活跃的部队一起玩！",
          url: "https://bbs.nga.cn/read.php?tid=998",
          topicId: "998"
        })
      )
    ).toBe(false);
    expect(
      shouldKeepNgaCollectedSample(
        sanitizeNgaSample({
          title: "[绝妖星乱舞] 次月社畜队7=1 D1/2",
          url: "https://bbs.nga.cn/read.php?tid=1000",
          topicId: "1000"
        })
      )
    ).toBe(true);

    const samples = mergeNgaSamples(
      [
        { title: "玩转NGA！NGA新手指南！", url: "https://bbs.nga.cn/read.php?tid=999", topicId: "999" },
        { title: "[绝妖星乱舞] 次月社畜队7=1 D1/2", url: "https://bbs.nga.cn/read.php?tid=1000", topicId: "1000" }
      ],
      1500
    );
    expect(samples).toHaveLength(1);
    expect(samples[0].topicId).toBe("1000");
  });
});

describe("nga cache refresh", () => {
  it("marks old cached samples as pending refresh without dropping them", () => {
    const samples = [
      sanitizeNgaSample({
        title: "绝欧固定队招募",
        body: "缺H2 周末晚8-11",
        url: "https://bbs.nga.cn/read.php?tid=123",
        topicId: "123",
        lastCheckedAt: "2026-05-08T08:00:00.000Z"
      }),
      sanitizeNgaSample({
        title: "绝亚固定队招募",
        body: "缺D1 周末晚8-11",
        url: "https://bbs.nga.cn/read.php?tid=124",
        topicId: "124",
        lastCheckedAt: "2026-05-09T14:00:00.000Z"
      })
    ];

    const pending = getNgaSamplesPendingRefresh(samples, 12, new Date("2026-05-09T22:00:00.000Z"));
    expect(pending.map((sample) => sample.topicId)).toEqual(["123"]);
    expect(samples).toHaveLength(2);
  });

  it("keeps confirmed closed cached samples out of pending refresh", () => {
    const samples = [
      sanitizeNgaSample({
        title: "绝欧固定队招募",
        body: "已招满，招募结束",
        url: "https://bbs.nga.cn/read.php?tid=125",
        topicId: "125",
        lastCheckedAt: "2026-05-08T08:00:00.000Z"
      }),
      sanitizeNgaSample({
        title: "绝亚固定队招募",
        body: "",
        url: "https://bbs.nga.cn/read.php?tid=126",
        topicId: "126",
        lastCheckedAt: "2026-05-09T14:00:00.000Z"
      }),
      sanitizeNgaSample({
        title: "绝龙诗固定队招募",
        body: "缺D1 周末晚8-11",
        url: "https://bbs.nga.cn/read.php?tid=127",
        topicId: "127"
      })
    ];

    const pending = getNgaSamplesPendingRefresh(samples, 12, new Date("2026-05-09T22:00:00.000Z"));
    expect(pending.map((sample) => sample.topicId)).toEqual(["126", "127"]);
  });

  it("keeps archived cached samples out of pending refresh", () => {
    const samples = [
      sanitizeNgaSample({
        title: "绝欧固定队招募",
        body: "缺H2 周末晚8-11",
        url: "https://bbs.nga.cn/read.php?tid=129",
        topicId: "129",
        lastCheckedAt: "2026-05-08T08:00:00.000Z",
        archivedAt: "2026-05-09T08:00:00.000Z"
      })
    ];

    expect(getNgaSamplesPendingRefresh(samples, 12, new Date("2026-05-09T22:00:00.000Z"))).toHaveLength(0);
  });

  it("selects current dungeon cached samples for force refresh without fine filters", () => {
    const samples = [
      sanitizeNgaSample({
        title: "神兵从零7=1ST 晚8-10开打",
        body: "从零开荒，缺ST。等人齐后再确定具体开打日期。",
        url: "https://bbs.nga.cn/read.php?tid=130",
        topicId: "130",
        closedAt: "2026-05-10T00:26:33.090Z",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      }),
      sanitizeNgaSample({
        title: "H1复健人神兵求职",
        body: "可打 H1，晚上八点后都可以。",
        url: "https://bbs.nga.cn/read.php?tid=131",
        topicId: "131",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      }),
      sanitizeNgaSample({
        title: "绝妖星 7=1 D2",
        body: "晚8-10，缺D2。",
        url: "https://bbs.nga.cn/read.php?tid=132",
        topicId: "132",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      }),
      sanitizeNgaSample({
        title: "兵兵从零7=1ST",
        body: "缺ST。",
        url: "https://bbs.nga.cn/read.php?tid=133",
        topicId: "133",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.jp
      }),
      sanitizeNgaSample({
        title: "绝神兵 已归档",
        body: "缺D3。",
        url: "https://bbs.nga.cn/read.php?tid=134",
        topicId: "134",
        archivedAt: "2026-05-09T00:00:00.000Z",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      })
    ];

    const selected = getNgaSamplesForDungeonForceRefresh(samples, "究极神兵绝境战", [NGA_RECRUIT_BOARD_URLS.cn], 20);

    expect(selected.map((sample) => sample.topicId)).toEqual(["130", "131"]);
  });

  it("limits current dungeon force refresh candidates", () => {
    const samples = [
      sanitizeNgaSample({
        title: "神兵复健队2=5",
        body: "缺MT ST H1 H2 D1。",
        url: "https://bbs.nga.cn/read.php?tid=135",
        topicId: "135",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      }),
      sanitizeNgaSample({
        title: "绝神兵 D3",
        body: "缺D3。",
        url: "https://bbs.nga.cn/read.php?tid=136",
        topicId: "136",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      })
    ];

    const selected = getNgaSamplesForDungeonForceRefresh(samples, "究极神兵绝境战", [NGA_RECRUIT_BOARD_URLS.cn], 1);

    expect(selected.map((sample) => sample.topicId)).toEqual(["135"]);
  });

  it("restores the first NGA board navigation after force-refreshing cached details", () => {
    expect(shouldNavigateNgaBoardBeforeScan(0, false)).toBe(false);
    expect(shouldNavigateNgaBoardBeforeScan(0, true)).toBe(true);
    expect(shouldNavigateNgaBoardBeforeScan(1, false)).toBe(true);
    expect(shouldNavigateNgaBoardBeforeScan(1, true)).toBe(true);
  });

  it("includes current savage aliases in current dungeon force refresh candidates", () => {
    const metaWithSavage: MetaPayload = {
      fbConfigs: [
        { id: "m12s", fb_type: "零式", fb_name: "阿卡狄亚零式登天斗技场 重量级4", team_composition: "满编小队", weight: 65 },
        { id: "m11s", fb_type: "零式", fb_name: "阿卡狄亚零式登天斗技场 重量级3", team_composition: "满编小队", weight: 64 },
        { id: "m10s", fb_type: "零式", fb_name: "阿卡狄亚零式登天斗技场 重量级2", team_composition: "满编小队", weight: 63 },
        { id: "m9s", fb_type: "零式", fb_name: "阿卡狄亚零式登天斗技场 重量级1", team_composition: "满编小队", weight: 62 },
        { id: "m8s", fb_type: "零式", fb_name: "阿卡狄亚零式登天斗技场 中量级4", team_composition: "满编小队", weight: 60 }
      ],
      labels: [],
      areas: [],
      jobConfig: {},
      jobMeta: { jobs: [], jobsById: {}, childIdsByCategoryId: {} },
      fetchedAt: "2026-05-10T00:00:00.000Z"
    };
    const samples = [
      sanitizeNgaSample({
        title: "M9S 开荒队 7=1 D4",
        body: "缺D4，晚8-11。",
        url: "https://bbs.nga.cn/read.php?tid=137",
        topicId: "137",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      }),
      sanitizeNgaSample({
        title: "零式1层清CD 6=2",
        body: "缺H2 D3。",
        url: "https://bbs.nga.cn/read.php?tid=138",
        topicId: "138",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      }),
      sanitizeNgaSample({
        title: "零式1-4清CD 5=3",
        body: "缺近战和奶。",
        url: "https://bbs.nga.cn/read.php?tid=139",
        topicId: "139",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      }),
      sanitizeNgaSample({
        title: "零式4层清CD 7=1",
        body: "缺D4。",
        url: "https://bbs.nga.cn/read.php?tid=140",
        topicId: "140",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.cn
      }),
      sanitizeNgaSample({
        title: "M9S 日服招募",
        body: "缺D4。",
        url: "https://bbs.nga.cn/read.php?tid=141",
        topicId: "141",
        sourceBoardUrl: NGA_RECRUIT_BOARD_URLS.jp
      })
    ];

    const selected = getNgaSamplesForDungeonForceRefresh(
      samples,
      "阿卡狄亚零式登天斗技场 重量级1",
      [NGA_RECRUIT_BOARD_URLS.cn],
      20,
      metaWithSavage
    );

    expect(selected.map((sample) => sample.topicId)).toEqual(["137", "138", "139"]);
  });

  it("fills closed metadata for legacy cached samples without refreshing check time", () => {
    const normalized = normalizeNgaCacheReviewSamples(
      [
        sanitizeNgaSample({
          title: "绝欧固定队招募",
          body: "已满，关闭招募",
          url: "https://bbs.nga.cn/read.php?tid=128",
          topicId: "128",
          lastCheckedAt: "2026-05-08T08:00:00.000Z"
        })
      ],
      20,
      new Date("2026-05-09T22:00:00.000Z")
    );

    expect(normalized[0].closedAt).toBe("2026-05-09T22:00:00.000Z");
    expect(normalized[0].lastCheckedAt).toBe("2026-05-08T08:00:00.000Z");
    expect(getNgaSamplesPendingRefresh(normalized, 12, new Date("2026-05-09T22:00:00.000Z"))).toHaveLength(0);
  });

  it("builds compact cache index without body text", () => {
    const index = buildNgaCachedTopicIndex([
      sanitizeNgaSample({
        title: "绝欧固定队招募",
        body: "正文内容",
        url: "https://bbs.nga.cn/read.php?tid=123",
        topicId: "123",
        lastCheckedAt: "2026-05-09T08:00:00.000Z",
        lastBoardSeenAt: "2026-05-09T09:00:00.000Z",
        lastBoardRank: 12
      })
    ]);

    expect(index).toEqual([
      expect.objectContaining({
        topicId: "123",
        hasBody: true,
        lastBoardRank: 12
      })
    ]);
    expect(JSON.stringify(index)).not.toContain("正文内容");
  });

  it("keeps metadata fast-scan hits out of detail review timestamps", () => {
    const result = mergeNgaSamplesWithDiff(
      [
        sanitizeNgaSample({
          title: "绝欧固定队招募",
          body: "缺H2",
          url: "https://bbs.nga.cn/read.php?tid=123",
          topicId: "123",
          lastCheckedAt: "2026-05-09T08:00:00.000Z",
          contentHash: "same"
        })
      ],
      [
        sanitizeNgaSample({
          title: "绝欧固定队招募",
          url: "https://bbs.nga.cn/read.php?tid=123",
          topicId: "123",
          lastSeenAt: "2026-05-09T20:00:00.000Z",
          lastBoardSeenAt: "2026-05-09T20:00:00.000Z",
          lastBoardRank: 8,
          contentHash: "same"
        })
      ],
      20
    );

    expect(result.checkedKeys).toContain("123");
    expect(result.updatedKeys).toHaveLength(0);
    expect(result.samples[0].lastCheckedAt).toBe("2026-05-09T08:00:00.000Z");
    expect(result.samples[0].lastBoardSeenAt).toBe("2026-05-09T20:00:00.000Z");
    expect(result.samples[0].lastBoardRank).toBe(8);
  });

  it("applies changed board titles without dropping cached detail bodies", () => {
    const result = mergeNgaSamplesWithDiff(
      [
        sanitizeNgaSample({
          title: "绝欧固定队招募 缺H2",
          body: "正文里保留旧详情和联系方式",
          url: "https://bbs.nga.cn/read.php?tid=123",
          topicId: "123",
          lastCheckedAt: "2026-05-09T08:00:00.000Z",
          contentHash: "same"
        })
      ],
      [
        sanitizeNgaSample({
          title: "绝欧固定队招募 缺D4",
          url: "https://bbs.nga.cn/read.php?tid=123",
          topicId: "123",
          lastSeenAt: "2026-05-09T20:00:00.000Z",
          lastBoardSeenAt: "2026-05-09T20:00:00.000Z",
          lastBoardRank: 5,
          contentHash: "same"
        })
      ],
      20
    );

    expect(result.updatedKeys).toContain("123");
    expect(result.samples[0].title).toBe("绝欧固定队招募 缺D4");
    expect(result.samples[0].body).toContain("旧详情");
    expect(result.samples[0].lastCheckedAt).toBe("2026-05-09T08:00:00.000Z");
    expect(result.samples[0].lastBoardRank).toBe(5);
  });

  it("archives inactive cache entries only after a full active-window scan", () => {
    const stale = sanitizeNgaSample({
      title: "绝欧固定队招募",
      body: "缺H2",
      url: "https://bbs.nga.cn/read.php?tid=123",
      topicId: "123",
      updatedAt: "2026-04-20 12:00",
      lastBoardSeenAt: "2026-04-20T12:00:00.000Z"
    });

    const partial = applyNgaCacheLifecycle([stale], {
      activeWindowSize: 500,
      scannedCount: 300,
      scannedAt: "2026-05-10T00:00:00.000Z",
      now: new Date("2026-05-10T00:00:00.000Z")
    });
    expect(partial.archivedCount).toBe(0);
    expect(isNgaSampleArchived(partial.samples[0])).toBe(false);

    const full = applyNgaCacheLifecycle([stale], {
      activeWindowSize: 500,
      scannedCount: 500,
      scannedAt: "2026-05-10T00:00:00.000Z",
      now: new Date("2026-05-10T00:00:00.000Z")
    });
    expect(full.archivedCount).toBe(1);
    expect(full.samples[0].archivedAt).toBe("2026-05-10T00:00:00.000Z");
    expect(full.samples[0].lastFullWindowScanAt).toBe("2026-05-10T00:00:00.000Z");
  });

  it("does not archive topics seen during the current full active-window scan", () => {
    const seen = sanitizeNgaSample({
      title: "绝欧固定队招募",
      body: "缺H2",
      url: "https://bbs.nga.cn/read.php?tid=123",
      topicId: "123",
      updatedAt: "2026-04-20 12:00",
      lastBoardSeenAt: "2026-05-10T00:00:00.000Z",
      lastBoardRank: 88
    });

    const result = applyNgaCacheLifecycle([seen], {
      activeWindowSize: 500,
      scannedCount: 500,
      scannedAt: "2026-05-10T00:00:00.000Z",
      now: new Date("2026-05-10T00:00:00.000Z")
    });

    expect(result.archivedCount).toBe(0);
    expect(result.samples[0].archivedAt).toBe("");
  });

  it("scopes lifecycle archive decisions to boards scanned in the current run", () => {
    const cnBoard = "https://bbs.nga.cn/thread.php?stid=44366746";
    const usBoard = "https://bbs.nga.cn/thread.php?stid=30742904";
    const now = new Date("2026-05-10T00:00:00.000Z");
    const samples = [
      sanitizeNgaSample({
        title: "国服旧招募",
        body: "缺H2",
        url: "https://bbs.nga.cn/read.php?tid=123",
        topicId: "123",
        sourceBoardUrl: cnBoard,
        lastBoardSeenAt: "2026-04-20T00:00:00.000Z"
      }),
      sanitizeNgaSample({
        title: "美区旧招募",
        body: "缺D4",
        url: "https://bbs.nga.cn/read.php?tid=124",
        topicId: "124",
        sourceBoardUrl: usBoard,
        lastBoardSeenAt: "2026-04-20T00:00:00.000Z"
      })
    ];

    const result = applyNgaCacheLifecycle(samples, {
      activeWindowSize: 500,
      scannedCount: 500,
      scannedAt: now,
      now,
      archiveAfterDays: 14,
      scopedBoardUrls: [cnBoard]
    });

    expect(result.archivedKeys).toEqual(["123"]);
    expect(result.samples.find((sample) => sample.topicId === "123")?.archivedAt).toBe(now.toISOString());
    expect(result.samples.find((sample) => sample.topicId === "124")?.archivedAt).toBe("");
  });

  it("archives only boards with a fully covered active window when several boards share one budget", () => {
    const cnBoard = "https://bbs.nga.cn/thread.php?stid=44366746";
    const usBoard = "https://bbs.nga.cn/thread.php?stid=30742904";
    const now = new Date("2026-05-10T00:00:00.000Z");
    const samples = [
      sanitizeNgaSample({
        title: "国服旧招募",
        body: "缺H2",
        url: "https://bbs.nga.cn/read.php?tid=123",
        topicId: "123",
        sourceBoardUrl: cnBoard,
        lastBoardSeenAt: "2026-04-20T00:00:00.000Z"
      }),
      sanitizeNgaSample({
        title: "美区旧招募",
        body: "缺D4",
        url: "https://bbs.nga.cn/read.php?tid=124",
        topicId: "124",
        sourceBoardUrl: usBoard,
        lastBoardSeenAt: "2026-04-20T00:00:00.000Z"
      })
    ];

    const partialAcrossBoards = applyNgaCacheLifecycle(samples, {
      activeWindowSize: 500,
      scannedCount: 500,
      scannedAt: now,
      now,
      archiveAfterDays: 14,
      scopedBoardUrls: [cnBoard, usBoard],
      fullScannedBoardUrls: []
    });
    expect(partialAcrossBoards.archivedCount).toBe(0);

    const cnCovered = applyNgaCacheLifecycle(samples, {
      activeWindowSize: 500,
      scannedCount: 500,
      scannedAt: now,
      now,
      archiveAfterDays: 14,
      scopedBoardUrls: [cnBoard, usBoard],
      fullScannedBoardUrls: [cnBoard]
    });

    expect(cnCovered.archivedKeys).toEqual(["123"]);
    expect(cnCovered.samples.find((sample) => sample.topicId === "123")?.archivedAt).toBe(now.toISOString());
    expect(cnCovered.samples.find((sample) => sample.topicId === "124")?.archivedAt).toBe("");
  });

  it("can disable automatic archival with a zero archive window", () => {
    const stale = sanitizeNgaSample({
      title: "绝欧固定队招募",
      body: "缺H2",
      url: "https://bbs.nga.cn/read.php?tid=123",
      topicId: "123",
      updatedAt: "2026-03-01 12:00",
      lastBoardSeenAt: "2026-03-01T12:00:00.000Z"
    });

    const result = applyNgaCacheLifecycle([stale], {
      activeWindowSize: 500,
      scannedCount: 500,
      scannedAt: "2026-05-10T00:00:00.000Z",
      now: new Date("2026-05-10T00:00:00.000Z"),
      archiveAfterDays: 0
    });

    expect(result.archivedCount).toBe(0);
    expect(result.deletedCount).toBe(0);
    expect(result.samples).toHaveLength(1);
  });

  it("cleans archived cache entries after the lifecycle retention window", () => {
    const archived = sanitizeNgaSample({
      title: "绝欧固定队招募",
      body: "缺H2",
      url: "https://bbs.nga.cn/read.php?tid=123",
      topicId: "123",
      updatedAt: "2026-03-01 12:00",
      lastBoardSeenAt: "2026-03-01T12:00:00.000Z",
      archivedAt: "2026-04-01T00:00:00.000Z"
    });

    const result = applyNgaCacheLifecycle([archived], {
      activeWindowSize: 500,
      scannedCount: 500,
      scannedAt: "2026-05-10T00:00:00.000Z",
      now: new Date("2026-05-10T00:00:00.000Z")
    });

    expect(result.deletedCount).toBe(1);
    expect(result.samples).toHaveLength(0);
  });

  it("separates added, updated, checked, and soft-closed merge outcomes", () => {
    const current = [
      sanitizeNgaSample({
        title: "绝欧固定队招募",
        body: "缺H2",
        url: "https://bbs.nga.cn/read.php?tid=123",
        topicId: "123",
        contentHash: "same"
      }),
      sanitizeNgaSample({
        title: "绝亚固定队招募",
        body: "缺D1",
        url: "https://bbs.nga.cn/read.php?tid=124",
        topicId: "124",
        contentHash: "old"
      })
    ];
    const result = mergeNgaSamplesWithDiff(current, [
      sanitizeNgaSample({
        title: "绝欧固定队招募",
        url: "https://bbs.nga.cn/read.php?tid=123",
        topicId: "123",
        lastCheckedAt: "2026-05-09T08:00:00.000Z",
        contentHash: "same"
      }),
      sanitizeNgaSample({
        title: "绝亚固定队招募",
        body: "缺D2",
        url: "https://bbs.nga.cn/read.php?tid=124",
        topicId: "124"
      }),
      sanitizeNgaSample({
        title: "绝龙诗固定队招募",
        body: "缺H1",
        url: "https://bbs.nga.cn/read.php?tid=125",
        topicId: "125"
      }),
      sanitizeNgaSample({
        title: "已关闭 招募结束",
        body: "已关闭",
        url: "https://bbs.nga.cn/read.php?tid=126",
        topicId: "126"
      })
    ], 20);

    expect(result.checkedKeys).toContain("123");
    expect(result.updatedKeys).toContain("124");
    expect(result.addedKeys).toEqual(expect.arrayContaining(["125", "126"]));
    expect(result.softClosedKeys).toContain("126");
    expect(result.samples).toHaveLength(4);
  });

  it("preserves incoming active-window samples when the cache is already full", () => {
    const result = mergeNgaSamplesWithDiff(
      [
        sanitizeNgaSample({
          title: "旧招募 1",
          body: "缺H2",
          url: "https://bbs.nga.cn/read.php?tid=1",
          topicId: "1"
        }),
        sanitizeNgaSample({
          title: "旧招募 2",
          body: "缺D1",
          url: "https://bbs.nga.cn/read.php?tid=2",
          topicId: "2"
        }),
        sanitizeNgaSample({
          title: "旧招募 3",
          body: "缺D4",
          url: "https://bbs.nga.cn/read.php?tid=3",
          topicId: "3"
        })
      ],
      [
        sanitizeNgaSample({
          title: "新招募 4",
          body: "缺H1",
          url: "https://bbs.nga.cn/read.php?tid=4",
          topicId: "4",
          lastBoardSeenAt: "2026-05-10T08:00:00.000Z",
          lastBoardRank: 1
        })
      ],
      3
    );

    expect(result.samples).toHaveLength(3);
    expect(result.addedKeys).toContain("4");
    expect(result.samples.map((sample) => sample.topicId)).toContain("4");
    expect(result.samples.map((sample) => sample.topicId)).not.toContain("3");
  });

  it("returns only bodyless active samples for detail backfill", () => {
    const pending = getNgaSamplesPendingDetailBackfill(
      [
        sanitizeNgaSample({
          title: "已有正文招募",
          body: "缺H2",
          url: "https://bbs.nga.cn/read.php?tid=1",
          topicId: "1"
        }),
        sanitizeNgaSample({
          title: "待补正文招募",
          body: "",
          url: "https://bbs.nga.cn/read.php?tid=2",
          topicId: "2"
        }),
        sanitizeNgaSample({
          title: "已关闭招募",
          body: "",
          url: "https://bbs.nga.cn/read.php?tid=3",
          topicId: "3",
          closedAt: "2026-05-10T08:00:00.000Z"
        }),
        sanitizeNgaSample({
          title: "已归档招募",
          body: "",
          url: "https://bbs.nga.cn/read.php?tid=4",
          topicId: "4",
          archivedAt: "2026-05-10T08:00:00.000Z"
        })
      ],
      20
    );

    expect(pending.map((sample) => sample.topicId)).toEqual(["2"]);
  });
});

describe("nga sample analysis", () => {
  it("generates parser training report and confirmation questions", () => {
    const report = analyzeNgaSamples(
      [
        {
          title: "绝欧 P5 固定队招募 缺H2 周二四六晚8-11",
          body: "时间：周二四六 20-23\n进度：P5狂暴\n攻略：菓子\n联系：QQ",
          url: "https://bbs.nga.cn/read.php?tid=100",
          author: "A",
          publishedAt: "2026-05-08",
          updatedAt: "2026-05-08",
          forumId: "321",
          topicId: "100"
        },
        {
          title: "TOP 从0 开荒 缺远敏",
          body: "固定队长期招募，工作日20-23，要求稳定出勤。",
          url: "https://bbs.nga.cn/read.php?tid=101",
          author: "B",
          publishedAt: "2026-05-08",
          updatedAt: "2026-05-08",
          forumId: "321",
          topicId: "101"
        }
      ],
      new Date("2026-05-08T00:00:00.000Z")
    );

    expect(report.sampleCount).toBe(2);
    expect(report.generatedAt).toBe("2026-05-08T00:00:00.000Z");
    expect(report.fieldPresence.body.present).toBe(2);
    expect(report.titleStructures.map((item) => item.value)).toContain("标题强结构型");
    expect(report.bodyStructures.length).toBeGreaterThan(0);
    expect(report.progressExpressions.length).toBeGreaterThan(0);
    expect(report.jobPositionExpressions.length).toBeGreaterThan(0);
    expect(report.timeExpressions.length).toBeGreaterThan(0);
    expect(report.confirmationQuestions.length).toBeGreaterThan(0);
  });

  it("keeps report candidates focused by filtering obvious extraction noise", () => {
    const report = analyzeNgaSamples([
      {
        title: "[绝妖星乱舞] 次月社畜队7=1 D1-2",
        body: "要求积极复盘、积极沟通。时间：晚8-11。缺 D1-2。",
        url: "https://bbs.nga.cn/read.php?tid=200",
        author: "A",
        publishedAt: "2026-05-08",
        updatedAt: "2026-05-08",
        forumId: "321",
        topicId: "200"
      }
    ]);
    const dungeons = report.dungeonAliases.map((candidate) => candidate.value);
    const times = report.timeExpressions.map((candidate) => candidate.value);

    expect(dungeons).toContain("绝妖星乱舞");
    expect(dungeons).not.toContain("极复盘");
    expect(dungeons).not.toContain("极沟通");
    expect(times).toContain("20:00-23:00");
    expect(times).not.toContain("1-2");
  });
});
