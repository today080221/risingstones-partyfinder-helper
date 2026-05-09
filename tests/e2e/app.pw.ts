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
        labels: [{ id: "practice", name: "开荒", weight: 1 }],
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
  await expect(page.getByLabel("保持登录状态")).not.toBeChecked();
  await expect(page.locator(".field").filter({ hasText: "NGA 招募板地址" }).locator("input")).toHaveValue(
    "https://bbs.nga.cn/thread.php?stid=44366746"
  );
  await expect(page.getByRole("button", { name: "国服招募板" })).toBeVisible();
  await expect(page.getByRole("button", { name: "日服招募板" })).toBeVisible();
  await expect(page.getByRole("button", { name: /打开 NGA/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /登录并采集/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /采集当前页/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /停止/ })).toBeDisabled();
  await expect(page.getByText(/登录状态位置：仅 Tauri 桌面版支持内置 NGA 登录窗口。/)).toBeVisible();
  await expect(page.getByText("先选择石之家副本，或采集 NGA 招募帖")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("requires explicit confirmation before enabling keep-login", async ({ page }) => {
  await page.goto("/");
  const keepLogin = page.getByLabel("保持登录状态");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("保持登录状态说明");
    await dialog.dismiss();
  });
  await keepLogin.click();
  await expect(keepLogin).not.toBeChecked();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("本软件不会读取、导出、上传或显示你的账号密码");
    await dialog.accept();
  });
  await keepLogin.click();
  await expect(keepLogin).toBeChecked();
});
