import { expect, test, type Page } from "@playwright/test";

const fetchedAt = "2026-05-08T10:00:00.000Z";

async function mockLocalApi(page: Page) {
  await page.route("**/api/meta", async (route) => {
    await route.fulfill({
      json: {
        fbConfigs: [
          {
            id: "1",
            fb_type: "绝境战",
            fb_name: "巴哈姆特绝境战",
            team_composition: "8人",
            weight: 1
          }
        ],
        labels: [
          { id: "practice", name: "开荒", weight: 1 },
          { id: "seeking", name: "求职", weight: 2 }
        ],
        areas: [
          {
            AreaID: 1,
            AreaName: "陆行鸟",
            vGroup: [{ AreaID: 1, AreaName: "陆行鸟", GroupID: 101, GroupName: "红玉海", UniName: "红玉海" }]
          }
        ],
        jobConfig: {},
        jobMeta: {
          jobs: [],
          jobsById: {},
          childIdsByCategoryId: {}
        },
        fetchedAt
      }
    });
  });

  await page.route("**/api/version", async (route) => {
    await route.fulfill({
      json: {
        name: "risingstones-partyfinder-helper",
        version: "0.1.11",
        builtAt: fetchedAt,
        portable: false,
        platform: "e2e",
        runtime: "development"
      }
    });
  });

  await page.route("**/api/geoip", async (route) => {
    await route.fulfill({
      json: {
        countryCode: "CN",
        countryName: "China",
        recommendedProvider: "gitee",
        source: "e2e",
        fallback: true,
        fetchedAt
      }
    });
  });

  await page.route("**/api/update/check?**", async (route) => {
    const provider = new URL(route.request().url()).searchParams.get("provider") ?? "gitee";
    await route.fulfill({
      json: {
        provider,
        sourceLabel: "E2E",
        currentVersion: "0.1.11",
        latestVersion: "0.1.11",
        latestName: "v0.1.11",
        latestUrl: "https://example.invalid/releases/v0.1.11",
        publishedAt: fetchedAt,
        body: "",
        assets: [],
        isNewer: false,
        fetchedAt
      }
    });
  });

  await page.route("**/api/recruits?**", async (route) => {
    await route.fulfill({
      json: {
        count: 2,
        fetched: 2,
        pageSize: 100,
        fetchedAt,
        warnings: [],
        query: {
          fb_name: "巴哈姆特绝境战"
        },
        rows: [
          {
            id: 101,
            uuid: "official-101",
            character_name: "测试招募人",
            area_name: "陆行鸟",
            group_name: "红玉海",
            fb_type: "绝境战",
            fb_name: "巴哈姆特绝境战",
            fb_time: "20:00-23:00",
            team_composition: "满编小队",
            progress: "开荒",
            strategy: "有攻略",
            response_num: 0,
            need_job: [],
            label: [],
            labelInfo: [{ id: "practice", name: "开荒", weight: 1 }],
            status: 1
          },
          {
            id: 102,
            uuid: "official-102",
            character_name: "测试求职人",
            area_name: "陆行鸟",
            group_name: "求职专用",
            fb_type: "绝境战",
            fb_name: "巴哈姆特绝境战",
            fb_time: "21:00-23:00",
            team_composition: "满编小队",
            progress: "开荒",
            strategy: "有攻略",
            response_num: 0,
            need_job: [],
            label: ["seeking"],
            labelInfo: [{ id: "seeking", name: "求职", weight: 2 }],
            status: 1
          }
        ]
      }
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockLocalApi(page);
});

test("renders the first screen and NGA panel without runtime errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(page).toHaveTitle("FF14 副本招募筛选器");
  await expect(page.getByRole("heading", { name: "副本招募筛选器" })).toBeVisible();
  await expect(page.getByText("数据来源")).toBeVisible();
  await expect(page.locator(".source-toggle-grid input")).toHaveCount(0);
  await expect(page.locator(".nga-board-grid input")).toHaveCount(0);
  await expect(page.locator(".source-toggle-grid").getByRole("button", { name: "石之家" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".source-toggle-grid").getByRole("button", { name: "NGA" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "国服" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "日服" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "欧区" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "大洋洲" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "美区" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("数据范围")).toBeVisible();
  await expect(page.locator(".field").filter({ hasText: "招募大区" })).toHaveCount(0);
  await expect(page.locator(".field").filter({ hasText: "队伍构成" })).toHaveCount(0);
  await expect(page.locator(".field").filter({ hasText: "拉取位置" })).toHaveCount(0);
  await expect(page.getByText("标签/类型")).toBeVisible();
  await expect(page.locator(".field").filter({ hasText: "进度关键词" })).toHaveCount(0);
  await expect(page.locator(".field").filter({ hasText: "大区偏好" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /高级筛选/ })).toBeVisible();
  await page.getByRole("button", { name: /高级筛选/ }).click();
  await expect(page.locator(".field").filter({ hasText: "进度关键词" })).toBeVisible();
  await expect(page.locator(".field").filter({ hasText: "大区偏好" })).toBeVisible();
  await expect(page.getByText("NGA 招募板地址")).toHaveCount(0);
  await expect(page.getByLabel("保持本机网页会话")).toHaveCount(0);
  await expect(page.getByText(/保存位置/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /高级设置/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /开发诊断/ })).toBeVisible();
  await page.getByRole("button", { name: /高级设置/ }).click();
  await expect(page.getByLabel("保持本机网页会话")).not.toBeChecked();
  await expect(page.locator(".field").filter({ hasText: "NGA 招募板地址" }).locator("input")).toHaveValue(
    "https://bbs.nga.cn/thread.php?stid=44366746"
  );
  await expect(page.getByRole("button", { name: /打开 NGA/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /打开后读取/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /读取当前页/ })).toBeDisabled();
  await page.getByRole("button", { name: /开发诊断/ }).click();
  await expect(page.getByText(/保存位置/)).toBeVisible();
  await expect(page.getByText("先选择石之家副本，或读取 NGA 招募帖")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("source panel collapses to a compact summary", async ({ page }) => {
  await page.goto("/");

  const sourcePanel = page.locator(".source-panel");
  await expect(sourcePanel.getByText("NGA 地区")).toBeVisible();
  await sourcePanel.getByRole("button", { name: "收起" }).click();

  await expect(sourcePanel.getByText("结果来源")).toHaveCount(0);
  await expect(sourcePanel.getByText("来源", { exact: true })).toBeVisible();
  await expect(sourcePanel.getByText("石之家 + NGA")).toBeVisible();
  await expect(sourcePanel.getByText("视图", { exact: true })).toBeVisible();
  await expect(sourcePanel.getByText("队伍招募")).toBeVisible();
  await expect(sourcePanel.getByText("NGA地区")).toBeVisible();
  await expect(sourcePanel.getByText("NGA已保存")).toBeVisible();
  await expect(sourcePanel.getByText("待刷新")).toBeVisible();

  await sourcePanel.getByRole("button", { name: "展开" }).click();
  await expect(sourcePanel.getByText("NGA 地区")).toBeVisible();
});

test("tag filter preview shows four rows and expands", async ({ page }) => {
  await page.goto("/");

  const tagField = page.locator(".field").filter({ hasText: "标签/类型" });
  const clip = tagField.locator(".tag-filter-clip");
  const expandButton = tagField.getByRole("button", { name: /展开更多/ });
  await expect(expandButton).toBeVisible();

  const collapsedBox = await clip.boundingBox();
  await expandButton.click();
  await expect(tagField.getByRole("button", { name: /收起标签/ })).toBeVisible();
  const expandedBox = await clip.boundingBox();
  expect(expandedBox?.height ?? 0).toBeGreaterThan((collapsedBox?.height ?? 0) + 8);
});

test("selects NGA regions and advanced board presets", async ({ page }) => {
  await page.goto("/");

  await page.locator(".nga-board-grid").getByRole("button", { name: "欧区" }).click();
  await page.locator(".nga-board-grid").getByRole("button", { name: "美区" }).click();
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "国服" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "欧区" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "美区" })).toHaveAttribute("aria-pressed", "true");

  const multiRegion = page.getByRole("button", { name: "多区读取" });
  await expect(multiRegion).toHaveAttribute("aria-pressed", "false");
  await multiRegion.click();
  await expect(multiRegion).toHaveAttribute("aria-pressed", "true");
  await page.locator(".nga-board-grid").getByRole("button", { name: "欧区" }).click();
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "欧区" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".nga-board-grid").getByRole("button", { name: "美区" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /高级设置/ }).click();
  const ngaStartUrl = page.locator(".field").filter({ hasText: "NGA 招募板地址" }).locator("input");
  await page.locator(".preset-row").getByRole("button", { name: "欧区" }).click();
  await expect(ngaStartUrl).toHaveValue("https://bbs.nga.cn/thread.php?stid=30742918");

  await page.locator(".preset-row").getByRole("button", { name: "大洋洲" }).click();
  await expect(ngaStartUrl).toHaveValue("https://bbs.nga.cn/thread.php?stid=30742942");

  await page.locator(".preset-row").getByRole("button", { name: "美区" }).click();
  await expect(ngaStartUrl).toHaveValue("https://bbs.nga.cn/thread.php?stid=30742904");
});

test("requires explicit confirmation before enabling keep-login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /高级设置/ }).click();
  const keepLogin = page.getByLabel("保持本机网页会话");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("保持本机网页会话说明");
    await dialog.dismiss();
  });
  await keepLogin.click();
  await expect(keepLogin).not.toBeChecked();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("本软件只读取页面上已经渲染出的公开招募内容");
    await dialog.accept();
  });
  await keepLogin.click();
  await expect(keepLogin).toBeChecked();
});

test("aggregate search can run NGA only without an official dungeon", async ({ page }) => {
  await page.goto("/");

  await page.locator(".source-toggle-grid").getByRole("button", { name: "石之家" }).click();
  await page.getByRole("button", { name: "聚合检索" }).click();

  await expect(page.getByText(/浏览器预览未打开本机网页窗口/)).toBeVisible();
  await expect(page.getByText(/请先选择副本名称/)).toHaveCount(0);
});

test("aggregate search pulls official rows when official source and dungeon are selected", async ({ page }) => {
  await page.goto("/");

  await page.locator(".source-toggle-grid").getByRole("button", { name: "NGA" }).click();
  await page.locator(".field").filter({ hasText: "副本名称" }).locator("select").selectOption("巴哈姆特绝境战");
  await page.getByRole("button", { name: "聚合检索" }).click();

  await expect(page.getByRole("heading", { name: "巴哈姆特绝境战" })).toBeVisible();
  await expect(page.getByText("绝境战 · 陆行鸟/红玉海")).toBeVisible();
  await expect(page.getByText(/NGA已保存/)).toBeVisible();
  await expect(page.getByText(/石之家本轮 2/)).toBeVisible();
  await expect(page.getByText(/本地已保存/)).toHaveCount(0);
});

test("player seeking view includes official rows tagged as seeking", async ({ page }) => {
  await page.goto("/");

  await page.locator(".source-toggle-grid").getByRole("button", { name: "NGA" }).click();
  await page.locator(".field").filter({ hasText: "副本名称" }).locator("select").selectOption("巴哈姆特绝境战");
  await page.getByRole("button", { name: "聚合检索" }).click();
  await page.locator(".field").filter({ hasText: "浏览视图" }).getByRole("button", { name: "玩家求职", exact: true }).click();

  await expect(page.getByText("绝境战 · 陆行鸟/求职专用")).toBeVisible();
  await expect(page.getByText("绝境战 · 陆行鸟/红玉海")).toHaveCount(0);
});

test("local label filter applies after official full fetch", async ({ page }) => {
  let seenUrl = "";
  await page.route("**/api/recruits?**", async (route) => {
    seenUrl = route.request().url();
    await route.fallback();
  });
  await page.goto("/");

  await page.locator(".source-toggle-grid").getByRole("button", { name: "NGA" }).click();
  await page.locator(".field").filter({ hasText: "副本名称" }).locator("select").selectOption("巴哈姆特绝境战");
  await page.getByRole("button", { name: "全部" }).click();
  await page.locator(".field").filter({ hasText: "标签/类型" }).getByRole("button", { name: /玩家求职/ }).click();
  await page.getByRole("button", { name: "聚合检索" }).click();

  expect(new URL(seenUrl).searchParams.has("label")).toBe(false);
  expect(new URL(seenUrl).searchParams.has("target_area_id")).toBe(false);
  expect(new URL(seenUrl).searchParams.has("position")).toBe(false);
  await expect(page.getByText("绝境战 · 陆行鸟/求职专用")).toBeVisible();
  await expect(page.getByText("绝境战 · 陆行鸟/红玉海")).toHaveCount(0);
});
