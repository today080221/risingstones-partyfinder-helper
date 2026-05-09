import { describe, expect, it } from "vitest";
import type { RecruitRow } from "../types";
import { buildRecruitTagOptions } from "./tags";

describe("recruit tag options", () => {
  it("keeps selected tag options at the front for collapsed previews", () => {
    const rows: RecruitRow[] = [
      {
        id: 1,
        uuid: "official-1",
        source: "official",
        character_name: "招募人",
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
        labelInfo: [],
        status: 1
      }
    ];

    const options = buildRecruitTagOptions(rows, [], ["首月目标"]);

    expect(options[0]).toMatchObject({ id: "首月目标", label: "首月目标" });
  });
});
