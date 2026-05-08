import { describe, expect, it } from "vitest";
import type { UpdateCheckPayload } from "../types";
import { getUpdateLevel, getUpdateStatusLabel, getUpdateStatusText, isCurrentAheadOfLatest } from "./update-status";

describe("update status", () => {
  it("treats a lagging mirror as pending sync instead of release aligned", () => {
    const info = updateInfo({
      provider: "gitee",
      sourceLabel: "国内镜像",
      currentVersion: "0.1.8",
      latestVersion: "v0.1.7",
      isNewer: false
    });

    const level = getUpdateLevel(info, false, "");

    expect(level).toBe("yellow");
    expect(getUpdateStatusLabel(level, info, false, "")).toBe("节点待同步");
    expect(getUpdateStatusText(level, info, "gitee", "")).toContain("高于 国内镜像 最新 Release v0.1.7");
    expect(getUpdateStatusText(level, info, "gitee", "")).toContain("尚未同步");
    expect(isCurrentAheadOfLatest("0.1.8", "v0.1.7")).toBe(true);
  });

  it("keeps equal releases green", () => {
    const info = updateInfo({
      currentVersion: "0.1.8",
      latestVersion: "v0.1.8",
      isNewer: false
    });
    const level = getUpdateLevel(info, false, "");

    expect(level).toBe("green");
    expect(getUpdateStatusLabel(level, info, false, "")).toBe("Release 对齐");
  });

  it("keeps major version gaps red", () => {
    const info = updateInfo({
      currentVersion: "0.1.8",
      latestVersion: "v1.0.0",
      isNewer: true
    });

    expect(getUpdateLevel(info, false, "")).toBe("red");
  });
});

function updateInfo(patch: Partial<UpdateCheckPayload>): UpdateCheckPayload {
  return {
    provider: "github",
    sourceLabel: "GitHub",
    currentVersion: "0.1.8",
    latestVersion: "v0.1.8",
    latestName: "v0.1.8",
    latestUrl: "https://example.test/releases/v0.1.8",
    publishedAt: "2026-05-08T00:00:00.000Z",
    body: "",
    assets: [],
    isNewer: false,
    fetchedAt: "2026-05-08T00:00:00.000Z",
    ...patch
  };
}
