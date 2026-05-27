import type { AuthSession } from "@/lib/auth/types";
import { applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { listRecruiterEscalations } from "@/lib/operational-escalation/operational-escalation-store";
import {
  filterOpportunitiesByTerritory,
  parseMelOpportunities,
} from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import type { BreezyJob } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";

export type RoutingMelContext =
  | {
      ok: true;
      fetchedAt: string;
      melFetchedAt: string;
      melRowCount: number;
      opportunities: MelOpportunity[];
      territoryOpportunities: MelOpportunity[];
      reps: ActiveRep[];
      jobs: BreezyJob[];
      escalations: RecruiterEscalationQueueItem[];
      territoryScope: string;
      territoryLabel: string;
    }
  | { ok: false; error: string };

export async function fetchRoutingMelContext(session: AuthSession): Promise<RoutingMelContext> {
  const [melResult, activeReps, escalations, jobsResult] = await Promise.all([
    fetchMelProjectsSheet(),
    listActiveRosterReps(),
    listRecruiterEscalations(),
    fetchBreezyJobs("published"),
  ]);

  if (!melResult.ok) {
    return { ok: false, error: melResult.error };
  }

  const territoryStates =
    session.territoryStates.length > 0
      ? session.territoryStates.map((state) => normalizeStateCode(state))
      : undefined;

  const allOpportunities = parseMelOpportunities(melResult.rows);
  const territoryOpportunities = filterOpportunitiesByTerritory(allOpportunities, territoryStates);

  const territoryReps =
    session.territoryStates.length > 0
      ? activeReps.filter((rep) =>
          session.territoryStates.includes(normalizeStateCode(rep.state)),
        )
      : activeReps;

  const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];

  const territoryScope =
    session.territoryStates.length > 0
      ? session.territoryStates.map((state) => normalizeStateCode(state)).sort().join(",")
      : "all";

  const territoryLabel = session.territoryStates.length > 0 ? session.territoryStates.join(", ") : "National";

  return {
    ok: true,
    fetchedAt: melResult.fetchedAt,
    melFetchedAt: melResult.fetchedAt,
    melRowCount: melResult.rows.length,
    opportunities: allOpportunities,
    territoryOpportunities,
    reps: territoryReps,
    jobs,
    escalations,
    territoryScope,
    territoryLabel,
  };
}
