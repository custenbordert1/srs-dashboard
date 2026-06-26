import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  CommunicationExecutionMode,
  P73FeatureFlags,
} from "@/lib/autonomous-candidate-communication-engine/types";

function matchesFilter(value: string | null | undefined, filters: string[]): boolean {
  if (filters.length === 0) return false;
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return filters.some((filter) => normalized.includes(filter.trim().toLowerCase()));
}

export function passesPilotFilters(input: {
  row: ScoredCandidateWorkflowRow;
  flags: P73FeatureFlags;
}): boolean {
  if (input.flags.executionMode !== "pilot") return false;

  const dimensions = [
    { value: input.row.assignedRecruiter, filters: input.flags.pilotRecruiters },
    { value: input.row.assignedDM, filters: input.flags.pilotDistrictManagers },
    { value: input.row.city, filters: input.flags.pilotTerritories },
    { value: input.row.city, filters: input.flags.pilotMarkets },
    { value: input.row.state, filters: input.flags.pilotStates },
    { value: input.row.positionName, filters: input.flags.pilotClients },
    { value: input.row.positionName, filters: input.flags.pilotProjects },
  ];

  const active = dimensions.filter((row) => row.filters.length > 0);
  if (active.length === 0) return false;

  return active.some((row) => matchesFilter(row.value, row.filters));
}

export function resolveEffectiveCommunicationMode(input: {
  row: ScoredCandidateWorkflowRow;
  flags: P73FeatureFlags;
}): CommunicationExecutionMode {
  if (!input.flags.communicationEnabled || input.flags.executionMode === "off") return "off";
  if (input.flags.executionMode === "preview") return "preview";
  if (input.flags.executionMode === "production") return "production";
  return passesPilotFilters(input) ? "pilot" : "preview";
}

export function buildPilotSummary(flags: P73FeatureFlags): string {
  if (flags.executionMode !== "pilot") return "Pilot filters inactive";
  const parts: string[] = [];
  if (flags.pilotRecruiters.length) parts.push(`Recruiters: ${flags.pilotRecruiters.join(", ")}`);
  if (flags.pilotDistrictManagers.length) parts.push(`DMs: ${flags.pilotDistrictManagers.join(", ")}`);
  if (flags.pilotMarkets.length) parts.push(`Markets: ${flags.pilotMarkets.join(", ")}`);
  if (flags.pilotStates.length) parts.push(`States: ${flags.pilotStates.join(", ")}`);
  if (flags.pilotClients.length) parts.push(`Clients: ${flags.pilotClients.join(", ")}`);
  if (flags.pilotProjects.length) parts.push(`Projects: ${flags.pilotProjects.join(", ")}`);
  if (flags.pilotTerritories.length) parts.push(`Territories: ${flags.pilotTerritories.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "No pilot filters configured";
}
