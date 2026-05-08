import type { AllianceKey, JobConfigEntry, NormalizedJobMeta, PositionKey, RecruitRow } from "../types";

export const FULL_PARTY_POSITIONS: PositionKey[] = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"];
export const LIGHT_PARTY_POSITIONS = ["T", "H", "D1", "D2"] as const;

export interface JobPickerGroup {
  group: string;
  label: string;
  jobs: JobConfigEntry[];
}

const JOB_GROUP_ORDER = ["职能分类", "防护职业", "治疗职业", "近战职业", "远程物理职业", "远程魔法职业"];
const JOB_GROUP_LABELS: Record<string, string> = {
  职能分类: "智能分类",
  防护职业: "防护职业（T）",
  治疗职业: "治疗职业（奶）",
  近战职业: "近战职业（近战）",
  远程物理职业: "远程物理职业（远敏）",
  远程魔法职业: "远程魔法职业（法系）"
};

export function buildJobMeta(jobConfig: Record<string, JobConfigEntry[] | JobConfigEntry>): NormalizedJobMeta {
  const jobs: JobConfigEntry[] = [];
  const jobsById: Record<string, JobConfigEntry> = {};
  const childIdsByCategoryId: Record<string, string[]> = {};
  const categories = asArray(jobConfig["职能分类"]);

  for (const value of Object.values(jobConfig)) {
    for (const job of asArray(value)) {
      if (!jobsById[job.id]) {
        jobs.push(job);
      }
      jobsById[job.id] = job;
    }
  }

  for (const category of categories) {
    childIdsByCategoryId[category.id] = asArray(jobConfig[category.value]).map((job) => job.id);
  }

  const attack = categories.find((category) => category.value === "进攻职业");
  if (attack) {
    childIdsByCategoryId[attack.id] = [
      ...asArray(jobConfig["近战职业"]),
      ...asArray(jobConfig["远程物理职业"]),
      ...asArray(jobConfig["远程魔法职业"])
    ].map((job) => job.id);
  }

  return { jobs, jobsById, childIdsByCategoryId };
}

export function jobCanEnter(
  selectedJobIds: string[],
  needJobIds: string[],
  jobMeta: NormalizedJobMeta,
  options: { row?: RecruitRow; noDuplicateJobs?: boolean; alliance?: "" | AllianceKey } = {}
): boolean {
  if (selectedJobIds.length === 0) {
    return true;
  }

  const selectedCandidates = expandConcreteJobIds(selectedJobIds, jobMeta);
  const acceptedCandidates = needJobIds.includes("32")
    ? new Set(getAllConcreteJobIds(jobMeta))
    : expandConcreteJobIds(needJobIds, jobMeta);
  const occupiedJobIds =
    options.noDuplicateJobs && options.row ? getOccupiedJobIds(options.row) : new Set<string>();

  return [...selectedCandidates].some((id) => {
    if (occupiedJobIds.has(id)) {
      return false;
    }
    return acceptedCandidates.has(id) || jobMatchesOpenPosition(id, options.row, jobMeta, options.alliance ?? "");
  });
}

export function buildJobPickerGroups(
  jobConfig: Record<string, JobConfigEntry[] | JobConfigEntry>
): JobPickerGroup[] {
  return Object.entries(jobConfig)
    .filter(([group]) => group !== "限制职业" && group !== "进攻职业")
    .map(([group, value]) => ({
      group,
      label: JOB_GROUP_LABELS[group] ?? group,
      jobs: asArray(value)
    }))
    .sort((left, right) => jobGroupRank(left.group) - jobGroupRank(right.group) || left.group.localeCompare(right.group));
}

export function expandJobIds(ids: string[], jobMeta: NormalizedJobMeta): Set<string> {
  const expanded = new Set<string>();
  const visit = (id: string) => {
    if (expanded.has(id)) {
      return;
    }
    expanded.add(id);
    for (const childId of jobMeta.childIdsByCategoryId[id] ?? []) {
      visit(childId);
    }
  };

  ids.forEach(visit);
  return expanded;
}

export function expandConcreteJobIds(ids: string[], jobMeta: NormalizedJobMeta): Set<string> {
  const expanded = new Set<string>();
  const visit = (id: string) => {
    if (id === "32") {
      getAllConcreteJobIds(jobMeta).forEach((jobId) => expanded.add(jobId));
      return;
    }
    const children = jobMeta.childIdsByCategoryId[id] ?? [];
    if (children.length === 0) {
      expanded.add(id);
      return;
    }
    children.forEach(visit);
  };

  ids.forEach(visit);
  return expanded;
}

export function getOccupiedJobIds(row: RecruitRow): Set<string> {
  const occupied = new Set<string>();
  const add = (value: unknown) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      occupied.add(String(numeric));
    }
  };

  for (const position of [...FULL_PARTY_POSITIONS, ...LIGHT_PARTY_POSITIONS]) {
    add(row[position]);
  }

  if (row.team_position) {
    for (const team of Object.values(row.team_position)) {
      if (!team) {
        continue;
      }
      for (const position of FULL_PARTY_POSITIONS) {
        add(team[position]);
      }
    }
  }

  return occupied;
}

export function getOpenPositions(row: RecruitRow, alliance: "" | AllianceKey = ""): string[] {
  if (row.team_composition === "团队" && row.team_position) {
    const alliances = alliance ? [alliance] : (["A", "B", "C"] as AllianceKey[]);
    const positions: string[] = [];
    for (const teamKey of alliances) {
      const team = row.team_position[teamKey];
      if (!team) {
        continue;
      }
      for (const position of FULL_PARTY_POSITIONS) {
        if (!Number(team[position])) {
          positions.push(`${teamKey}-${position}`);
        }
      }
    }
    return positions;
  }

  const positions = row.team_composition === "轻锐小队" ? LIGHT_PARTY_POSITIONS : FULL_PARTY_POSITIONS;
  return positions.filter((position) => !Number(row[position]));
}

export function matchesOpenPositions(
  row: RecruitRow,
  selectedPositions: string[],
  alliance: "" | AllianceKey = ""
): boolean {
  if (selectedPositions.length === 0) {
    return true;
  }
  const openPositions = getOpenPositions(row, alliance);
  const normalizedOpen = new Set(openPositions.flatMap((position) => [position, position.split("-").at(-1) ?? position]));
  return selectedPositions.some((position) => normalizedOpen.has(position));
}

export function formatJobNames(ids: string[], jobMeta: NormalizedJobMeta): string {
  return ids.map((id) => jobMeta.jobsById[id]?.value ?? id).join("、");
}

function jobMatchesOpenPosition(
  jobId: string,
  row: RecruitRow | undefined,
  jobMeta: NormalizedJobMeta,
  alliance: "" | AllianceKey
): boolean {
  if (!row) {
    return false;
  }

  const openPositions = getOpenPositions(row, alliance).map((position) => position.split("-").at(-1) ?? position);
  if (openPositions.length === 0) {
    return false;
  }

  const acceptedPositions = positionsForJob(jobId, jobMeta);
  return openPositions.some((position) => acceptedPositions.has(position));
}

function positionsForJob(jobId: string, jobMeta: NormalizedJobMeta): Set<string> {
  const job = jobMeta.jobsById[jobId];
  const role = getJobRole(job);
  if (role === "tank") {
    return new Set(["MT", "ST", "T"]);
  }
  if (role === "healer") {
    return new Set(["H1", "H2", "H"]);
  }
  if (role === "dps") {
    return new Set(["D1", "D2", "D3", "D4"]);
  }
  return new Set();
}

function getJobRole(job: JobConfigEntry | undefined): "tank" | "healer" | "dps" | "unknown" {
  const text = `${job?.job_type ?? ""} ${job?.value ?? ""}`;
  if (text.includes("防护")) {
    return "tank";
  }
  if (text.includes("治疗")) {
    return "healer";
  }
  if (
    text.includes("进攻") ||
    text.includes("近战") ||
    text.includes("远程物理") ||
    text.includes("远程魔法") ||
    text.includes("远敏") ||
    text.includes("法系")
  ) {
    return "dps";
  }
  return "unknown";
}

function jobGroupRank(group: string): number {
  const index = JOB_GROUP_ORDER.indexOf(group);
  return index >= 0 ? index : JOB_GROUP_ORDER.length;
}

function asArray(value: JobConfigEntry[] | JobConfigEntry | undefined): JobConfigEntry[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function getAllConcreteJobIds(jobMeta: NormalizedJobMeta): string[] {
  return jobMeta.jobs
    .filter((job) => !jobMeta.childIdsByCategoryId[job.id]?.length && job.job_type !== "职能分类")
    .map((job) => job.id);
}
