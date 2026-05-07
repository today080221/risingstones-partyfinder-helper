import type { AllianceKey, JobConfigEntry, NormalizedJobMeta, PositionKey, RecruitRow } from "../types";

export const FULL_PARTY_POSITIONS: PositionKey[] = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"];
export const LIGHT_PARTY_POSITIONS = ["T", "H", "D1", "D2"] as const;

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
  options: { row?: RecruitRow; noDuplicateJobs?: boolean } = {}
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

  return [...selectedCandidates].some((id) => acceptedCandidates.has(id) && !occupiedJobIds.has(id));
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
