import type { UpdateProvider } from "./types";

export const OFFICIAL_SOURCE_REPO = "today080221/risingstones-partyfinder-helper";

export const UPDATE_PROVIDER_LABELS: Record<UpdateProvider, string> = {
  github: "GitHub",
  gitee: "国内镜像"
};

export const DEFAULT_UPDATE_PROVIDER: UpdateProvider = "gitee";
