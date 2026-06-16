import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { SimulatorScenarioDefinition, SimulatorScenarioKind } from "@/lib/coverage-optimization-simulator/types";

export const SIMULATOR_SCENARIOS: SimulatorScenarioDefinition[] = [
  {
    kind: "increase-pay",
    label: "Increase Pay",
    description: "Raise pay rates to improve applicant velocity in tight labor markets.",
    autopilotKinds: ["adjust-pay-rate"],
    baseRoiMultiplier: 1.1,
  },
  {
    kind: "expand-radius",
    label: "Expand Radius",
    description: "Widen recruiting radius to reach more candidates around open calls.",
    autopilotKinds: ["expand-recruiting-radius"],
    baseRoiMultiplier: 1.05,
  },
  {
    kind: "add-recruiter",
    label: "Add Recruiter",
    description: "Assign an additional recruiter to high-pressure territories or projects.",
    autopilotKinds: ["assign-additional-recruiter"],
    baseRoiMultiplier: 1.25,
  },
  {
    kind: "add-budget",
    label: "Add Budget",
    description: "Increase ad spend to accelerate pipeline in under-filled markets.",
    autopilotKinds: ["increase-ad-spend"],
    baseRoiMultiplier: 1.15,
  },
  {
    kind: "re-engage-candidates",
    label: "Re-Engage Candidates",
    description: "Reopen stalled, abandoned, and former-worker candidates with targeted outreach.",
    autopilotKinds: ["reopen-previous-candidates", "create-candidate-outreach-campaign"],
    baseRoiMultiplier: 1.2,
  },
  {
    kind: "territory-blitz",
    label: "Territory Blitz",
    description: "Concentrate recruiting effort in a territory for a short high-intensity push.",
    autopilotKinds: ["launch-territory-blitz"],
    baseRoiMultiplier: 1.35,
  },
  {
    kind: "refresh-job-postings",
    label: "Refresh Job Postings",
    description: "Refresh stale postings to improve visibility and application flow.",
    autopilotKinds: ["refresh-job-posting"],
    baseRoiMultiplier: 0.95,
  },
];

export function scenarioDefinitionForKind(kind: SimulatorScenarioKind): SimulatorScenarioDefinition {
  return SIMULATOR_SCENARIOS.find((row) => row.kind === kind) ?? SIMULATOR_SCENARIOS[0]!;
}

export function autopilotKindToScenarioKind(
  kind: AutopilotRecommendation["kind"],
): SimulatorScenarioKind | null {
  const match = SIMULATOR_SCENARIOS.find((scenario) => scenario.autopilotKinds.includes(kind));
  return match?.kind ?? null;
}
