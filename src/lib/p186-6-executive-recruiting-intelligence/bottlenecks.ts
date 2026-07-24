import { calculateAging } from "@/lib/p186-6-executive-recruiting-intelligence/aging";
import type {
  P1866Bottleneck,
  P1866CohortCandidate,
} from "@/lib/p186-6-executive-recruiting-intelligence/types";
import { average } from "@/lib/p186-6-executive-recruiting-intelligence/util";

type Dim = {
  dimension: string;
  pick: (c: P1866CohortCandidate) => string | null | undefined;
};

const DIMENSIONS: Dim[] = [
  { dimension: "lifecycle_stage", pick: (c) => c.funnelStage },
  { dimension: "recruiter", pick: (c) => c.recruiter },
  { dimension: "dm", pick: (c) => c.dm },
  { dimension: "operator", pick: (c) => c.operator },
  { dimension: "job", pick: (c) => c.job },
  { dimension: "client", pick: (c) => c.client },
  { dimension: "city_state", pick: (c) => [c.city, c.state].filter(Boolean).join(", ") || null },
  { dimension: "source_system", pick: (c) => c.sourceSystem },
  { dimension: "paperwork_template", pick: (c) => c.paperworkTemplate },
  { dimension: "onboarding_requirement", pick: (c) => c.onboardingRequirement },
  { dimension: "mel_export_blocker", pick: (c) => c.melExportBlocker },
];

/**
 * Bottleneck analyzer — recommendations are advisory only.
 */
export function detectBottlenecks(input: {
  cohort: P1866CohortCandidate[];
  nowMs?: number;
  minGroupSize?: number;
}): P1866Bottleneck[] {
  const now = input.nowMs ?? Date.now();
  const min = input.minGroupSize ?? 2;
  const aging = new Map(
    calculateAging({ cohort: input.cohort, nowMs: now }).map((a) => [a.candidateId, a]),
  );
  const findings: P1866Bottleneck[] = [];

  for (const dim of DIMENSIONS) {
    const groups = new Map<string, P1866CohortCandidate[]>();
    for (const c of input.cohort) {
      const key = dim.pick(c)?.trim();
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    for (const [key, rows] of groups) {
      if (rows.length < min) continue;
      const ages = rows.map((r) => Math.max(0, now - Date.parse(r.stageEnteredAt)));
      const overdueCount = rows.filter((r) => {
        const a = aging.get(r.candidateId);
        return a && (a.band === "overdue" || a.band === "critical");
      }).length;
      if (overdueCount === 0 && (average(ages) ?? 0) < 2 * 86400000) continue;

      const exited = rows.filter((r) => r.exitedInRange).length;
      findings.push({
        dimension: dim.dimension,
        key,
        candidateCount: rows.length,
        averageAgeMs: average(ages) ?? 0,
        overdueCount,
        throughput: exited,
        conversion: rows.length > 0 ? Math.round((exited / rows.length) * 1000) / 10 : null,
        trend: null,
        likelyRootCause:
          overdueCount > rows.length / 2
            ? `High overdue share in ${dim.dimension}=${key}`
            : `Elevated dwell time in ${dim.dimension}=${key}`,
        recommendedInvestigation: `Review ownership and blockers for ${dim.dimension} "${key}" (advisory)`,
        advisory: true,
      });
    }
  }

  return findings
    .sort((a, b) => b.overdueCount - a.overdueCount || b.averageAgeMs - a.averageAgeMs)
    .slice(0, 50);
}
