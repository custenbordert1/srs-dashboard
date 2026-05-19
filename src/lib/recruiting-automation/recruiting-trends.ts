import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { getDmForState } from "@/lib/dm-territory-map";
import { isHiredStage, parseDate } from "@/lib/dm-dashboard/territory-shared";
import type { ChartBar } from "@/lib/recruiting-intelligence";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RecruitingTrendCharts = {
  applicantsPerDay: ChartBar[];
  hiresPerWeek: ChartBar[];
  sourceConversion: ChartBar[];
  territoryFillVelocity: ChartBar[];
};

export function buildRecruitingTrendCharts(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
): RecruitingTrendCharts {
  const reference = new Date(referenceIso);

  const applicantsPerDay: ChartBar[] = [];
  for (let d = 13; d >= 0; d -= 1) {
    const dayStart = new Date(reference);
    dayStart.setUTCHours(0, 0, 0, 0);
    dayStart.setTime(dayStart.getTime() - d * MS_PER_DAY);
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
    const label =
      d === 0
        ? "Today"
        : d === 1
          ? "Yesterday"
          : dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const count = candidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= dayStart && applied < dayEnd;
    }).length;
    applicantsPerDay.push({ label, value: count });
  }

  const hiresPerWeek: ChartBar[] = [];
  for (let w = 7; w >= 0; w -= 1) {
    const start = new Date(reference.getTime() - (w + 1) * 7 * MS_PER_DAY);
    const end = new Date(reference.getTime() - w * 7 * MS_PER_DAY);
    const label = w === 0 ? "This week" : w === 1 ? "Last week" : `W-${w}`;
    const count = candidates.filter((c) => {
      if (!isHiredStage(c.stage)) return false;
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= start && applied < end;
    }).length;
    hiresPerWeek.push({ label, value: count });
  }

  const sourceStats = new Map<string, { total: number; hired: number }>();
  for (const candidate of candidates) {
    const source = candidate.source.trim() || "Unknown";
    const bucket = sourceStats.get(source) ?? { total: 0, hired: 0 };
    bucket.total += 1;
    if (isHiredStage(candidate.stage)) bucket.hired += 1;
    sourceStats.set(source, bucket);
  }

  const sourceConversion: ChartBar[] = [...sourceStats.entries()]
    .map(([label, stats]) => ({
      label,
      value: stats.total > 0 ? Math.round((stats.hired / stats.total) * 100) : 0,
    }))
    .filter((row) => row.value > 0 || sourceStats.get(row.label)!.total >= 3)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 8);

  const velocityByDm = new Map<string, { hires: number; jobs: number }>();
  for (const job of jobs) {
    const dm = getDmForState(job.state) ?? "Unassigned";
    const bucket = velocityByDm.get(dm) ?? { hires: 0, jobs: 0 };
    bucket.jobs += 1;
    velocityByDm.set(dm, bucket);
  }
  for (const candidate of candidates) {
    if (!isHiredStage(candidate.stage)) continue;
    const dm = getDmForState(candidate.state) ?? "Unassigned";
    const bucket = velocityByDm.get(dm) ?? { hires: 0, jobs: 0 };
    bucket.hires += 1;
    velocityByDm.set(dm, bucket);
  }

  const territoryFillVelocity: ChartBar[] = [...velocityByDm.entries()]
    .map(([label, stats]) => ({
      label,
      value: stats.jobs > 0 ? Math.round((stats.hires / stats.jobs) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 8);

  return {
    applicantsPerDay,
    hiresPerWeek,
    sourceConversion,
    territoryFillVelocity,
  };
}
