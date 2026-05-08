import { OFFICIAL_SOURCE_REPO } from "../config";
import type { UpdateCheckPayload, UpdateProvider } from "../types";

export type UpdateLevel = "green" | "yellow" | "red" | "unknown";

export function getUpdateLevel(info: UpdateCheckPayload | null, isChecking: boolean, error: string): UpdateLevel {
  if (isChecking || error || !info) {
    return "unknown";
  }

  const relation = compareVersionText(info.currentVersion, info.latestVersion);
  if (relation === 0) {
    return "green";
  }
  if (relation !== null && relation > 0) {
    return "yellow";
  }
  if (relation !== null && relation < 0) {
    return hasMajorVersionGap(info.currentVersion, info.latestVersion) ? "red" : "yellow";
  }

  if (!info.isNewer) {
    return "green";
  }
  return hasMajorVersionGap(info.currentVersion, info.latestVersion) ? "red" : "yellow";
}

export function getUpdateStatusLabel(
  level: UpdateLevel,
  info: UpdateCheckPayload | null,
  isChecking: boolean,
  error: string
): string {
  if (isChecking) {
    return "正在检查更新";
  }
  if (error || !info || level === "unknown") {
    return "更新状态未知";
  }
  if (isCurrentAheadOfLatest(info.currentVersion, info.latestVersion)) {
    return "节点待同步";
  }
  if (level === "green") {
    return "Release 对齐";
  }
  if (level === "red") {
    return "建议立即更新";
  }
  return "有可用更新";
}

export function getUpdateStatusText(
  level: UpdateLevel,
  info: UpdateCheckPayload | null,
  provider: UpdateProvider,
  error: string
): string {
  if (error) {
    return `检查失败：${error}`;
  }
  if (!info) {
    return provider === "github" ? `GitHub / ${OFFICIAL_SOURCE_REPO}` : "国内镜像节点";
  }

  const sourceLabel = info.sourceLabel || (info.provider === "github" ? "GitHub" : "国内镜像");
  if (isCurrentAheadOfLatest(info.currentVersion, info.latestVersion)) {
    return `当前 ${info.currentVersion} 高于 ${sourceLabel} 最新 Release ${info.latestVersion}，说明该下载节点尚未同步；可切换其他节点或等待镜像发布。`;
  }
  if (level === "green") {
    return `当前 ${info.currentVersion} 与 ${sourceLabel} 最新 Release ${info.latestVersion} 对齐。`;
  }
  if (level === "red") {
    return `当前 ${info.currentVersion} 落后到重大版本 ${info.latestVersion}，建议直接更新。`;
  }
  return `当前 ${info.currentVersion}，最新 ${info.latestVersion}，可一键下载并更新。`;
}

export function isCurrentAheadOfLatest(current: string, latest: string): boolean {
  const relation = compareVersionText(current, latest);
  return relation !== null && relation > 0;
}

export function compareVersionText(left: string, right: string): number | null {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  if (!leftParts || !rightParts) {
    return normalizeVersionText(left) === normalizeVersionText(right) ? 0 : null;
  }

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function hasMajorVersionGap(current: string, latest: string): boolean {
  const currentMajor = parseMajorVersion(current);
  const latestMajor = parseMajorVersion(latest);
  return latestMajor !== null && currentMajor !== null && latestMajor > currentMajor;
}

function parseMajorVersion(value: string): number | null {
  const match = normalizeVersionText(value).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseVersionParts(value: string): number[] | null {
  const match = normalizeVersionText(value).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return null;
  }
  return [match[1], match[2] ?? "0", match[3] ?? "0"].map(Number);
}

function normalizeVersionText(value: string): string {
  return value.trim().replace(/^v/i, "");
}
