import { describe, expect, it } from "vitest";
import type { RecruitRow } from "../types";
import { getRecruitRenderKey } from "./recruit-render-key";

describe("recruit render keys", () => {
  it("uses official recruit ids before poster uuids", () => {
    const first = officialRow({ id: 50273, uuid: "10006962" });
    const second = officialRow({ id: 49903, uuid: "10006962" });

    expect(getRecruitRenderKey(first)).toBe("official-50273");
    expect(getRecruitRenderKey(second)).toBe("official-49903");
  });

  it("keeps NGA sample identity keys", () => {
    const row = {
      ...officialRow({ id: -46624084, uuid: "nga-46624084" }),
      source: "nga",
      sourceMeta: { platform: "nga", topicId: "46624084" }
    } satisfies RecruitRow;

    expect(getRecruitRenderKey(row)).toBe("nga-46624084");
  });
});

function officialRow(input: { id: number; uuid: string }): RecruitRow {
  return {
    id: input.id,
    uuid: input.uuid,
    source: "official",
    character_name: "",
    area_name: "",
    group_name: "",
    fb_type: "绝境战",
    fb_name: "妖星乱舞绝境战",
    fb_time: "",
    team_composition: "满编小队",
    progress: "",
    strategy: "",
    need_job: []
  };
}
