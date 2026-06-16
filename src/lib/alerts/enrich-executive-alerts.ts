import type { ExecutiveAlert, ExecutiveAlertContext } from "@/lib/alerts/alert-types";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { PlacementCommandCenterSnapshot } from "@/lib/placement-command-center/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

const INTELLIGENCE_DATA_SOURCES = [
  "Recruiting Intelligence Cache",
  "Breezy",
  "MEL",
  "Workflows",
] as const;

export type EnrichExecutiveAlertsInput = {
  alerts: ExecutiveAlert[];
  bundle: RecruitingIntelligenceRouteBundle;
  placement: PlacementCommandCenterSnapshot;
};

const OPPORTUNITY_ALERT_KINDS = new Set([
  "coverage",
  "risk",
  "forecast",
  "zero-pipeline",
  "recovery",
]);

function parseAlertId(alertId: string): {
  opportunityId?: string;
  candidateId?: string;
  dmName?: string;
  recruiterName?: string;
} {
  const parts = alertId.split(":");
  if (parts[0] === "candidate" && parts[2]) {
    return { candidateId: parts[2] };
  }
  if (
    (parts[0] === "project" || parts[0] === "placement") &&
    parts[2] &&
    OPPORTUNITY_ALERT_KINDS.has(parts[1])
  ) {
    return { opportunityId: parts[2] };
  }
  if (parts[0] === "territory" && parts[1] === "war-room" && parts[2]) {
    return { dmName: parts.slice(2).join(":") };
  }
  if (parts[0] === "recruiter" && parts[1] === "workload" && parts[2]) {
    return { recruiterName: parts.slice(2).join(":") };
  }
  if (parts[0] === "project" && parts[1] === "rep-shortage" && parts[2]) {
    return { dmName: parts[2] };
  }
  return {};
}

function buildContextForAlert(
  alert: ExecutiveAlert,
  input: EnrichExecutiveAlertsInput,
): ExecutiveAlertContext {
  const parsed = parseAlertId(alert.id);
  const { bundle, placement } = input;

  const coverageRow = parsed.opportunityId
    ? bundle.coverage.opportunities.find((row) => row.opportunityId === parsed.opportunityId)
    : undefined;
  const storeRow = parsed.opportunityId
    ? placement.storeCoverage.find((row) => row.opportunityId === parsed.opportunityId)
    : undefined;
  const forecastRow = parsed.opportunityId
    ? placement.projectForecasts.find((row) => row.opportunityId === parsed.opportunityId)
    : undefined;

  const state =
    coverageRow?.state ??
    (parsed.dmName ? undefined : undefined);
  const dmName =
    parsed.dmName ??
    coverageRow?.territoryOwner ??
    storeRow?.client ??
    undefined;

  const linkedCandidates = parsed.candidateId
    ? bundle.candidates
        .filter((row) => row.candidateId === parsed.candidateId)
        .map((candidate) => {
          const workflow = bundle.workflows[candidate.candidateId];
          const row = buildBaselineWorkflowRow(candidate, workflow);
          return {
            candidateId: candidate.candidateId,
            name: `${candidate.firstName} ${candidate.lastName}`.trim(),
            workflowStatus: row.workflowStatus,
            assignedRecruiter: row.assignedRecruiter,
            positionName: candidate.positionName,
          };
        })
    : state
      ? bundle.candidates
          .filter((candidate) => normalizeStateCode(candidate.state) === normalizeStateCode(state))
          .slice(0, 5)
          .map((candidate) => {
            const workflow = bundle.workflows[candidate.candidateId];
            const row = buildBaselineWorkflowRow(candidate, workflow);
            return {
              candidateId: candidate.candidateId,
              name: `${candidate.firstName} ${candidate.lastName}`.trim(),
              workflowStatus: row.workflowStatus,
              assignedRecruiter: row.assignedRecruiter,
              positionName: candidate.positionName,
            };
          })
      : parsed.recruiterName
        ? bundle.candidates
            .filter((candidate) => {
              const workflow = bundle.workflows[candidate.candidateId];
              const row = buildBaselineWorkflowRow(candidate, workflow);
              return row.assignedRecruiter === parsed.recruiterName;
            })
            .slice(0, 5)
            .map((candidate) => {
              const workflow = bundle.workflows[candidate.candidateId];
              const row = buildBaselineWorkflowRow(candidate, workflow);
              return {
                candidateId: candidate.candidateId,
                name: `${candidate.firstName} ${candidate.lastName}`.trim(),
                workflowStatus: row.workflowStatus,
                assignedRecruiter: row.assignedRecruiter,
                positionName: candidate.positionName,
              };
            })
        : [];

  const linkedReps =
    coverageRow?.topRecommendedReps?.slice(0, 3).map((rep) => {
      const rosterRep = bundle.activeReps.find((row) => row.repId === rep.repId);
      return {
        name: rep.repName,
        state: rosterRep?.state ?? coverageRow?.state ?? "",
        active: rep.active,
        distanceMiles: rep.distanceMiles,
      };
    }) ??
    (state
      ? bundle.activeReps
          .filter((rep) => normalizeStateCode(rep.state) === normalizeStateCode(state))
          .slice(0, 5)
          .map((rep) => ({
            name: rep.name,
            state: rep.state,
            active: rep.active,
            distanceMiles: null,
          }))
      : []);

  return {
    opportunityId: parsed.opportunityId,
    storeName: storeRow?.store ?? coverageRow?.storeName,
    projectName: storeRow?.project ?? coverageRow?.projectName ?? forecastRow?.projectName,
    client: storeRow?.client ?? coverageRow?.client ?? forecastRow?.client,
    city: coverageRow?.city,
    state: coverageRow?.state ?? state,
    dmName,
    territoryLabel: dmName ?? coverageRow?.state,
    coveragePercent: storeRow?.coveragePercent ?? coverageRow?.coverageScore,
    openCalls: storeRow?.openCalls,
    candidatesInPipeline: storeRow?.candidatesInPipeline,
    forecastOutcome: forecastRow?.outcome,
    linkedCandidates,
    linkedReps,
    dataSources: [...INTELLIGENCE_DATA_SOURCES],
  };
}

export function enrichExecutiveAlerts(input: EnrichExecutiveAlertsInput): ExecutiveAlert[] {
  return input.alerts.map((alert) => ({
    ...alert,
    context: buildContextForAlert(alert, input),
  }));
}
