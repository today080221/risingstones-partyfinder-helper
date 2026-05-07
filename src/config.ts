import type { UpdateProvider } from "./types";

export const UPDATE_REPOSITORIES: Record<UpdateProvider, string> = {
  github: "today080221/risingstones-partyfinder-helper",
  gitee: "jianwen1126/risingstones-partyfinder-helper"
};

export const DEFAULT_UPDATE_PROVIDER: UpdateProvider = "gitee";
