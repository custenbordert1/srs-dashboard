import type { CommandCenterChatContext } from "@/lib/ai-command-center/build-chat-context";
import type { SourceAttribution } from "@/lib/ai-command-center/types";
import type { ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";

const SOURCE_LABELS: Record<string, SourceAttribution> = {
  "Executive Daily Brief (P72)": { phase: "P72", label: "Daily Brief", fullLabel: "P72 Daily Brief" },
  "Autonomous Candidate Communication Engine (P73)": { phase: "P73", label: "Communication", fullLabel: "P73 Communication" },
  "Autonomous Recruiting Orchestrator (P74)": { phase: "P74", label: "Orchestrator", fullLabel: "P74 Orchestrator" },
  "Autonomous Operations Center (P75)": { phase: "P75", label: "Operations", fullLabel: "P75 Operations" },
  "Autonomous Decision Engine (P76)": { phase: "P76", label: "Decisions", fullLabel: "P76 Decisions" },
  "Autonomous Approval & Governance Engine (P77)": { phase: "P77", label: "Governance", fullLabel: "P77 Governance" },
  "AI Command Center (P78)": { phase: "P78", label: "Command Center", fullLabel: "P78 Command Center" },
};

const QUERY_ENGINE_PHASES: Partial<Record<ExecutiveQueryId, string[]>> = {
  brief_how_are_we_doing: ["P72"],
  brief_recruiting_summary: ["P72"],
  brief_what_changed: ["P72"],
  brief_needs_attention: ["P72", "P75"],
  orchestrator_next_actions: ["P74", "P76"],
  orchestrator_candidates_stuck: ["P74", "P75"],
  operations_anything_broken: ["P75"],
  operations_biggest_risk: ["P75", "P76"],
  operations_problem_tomorrow: ["P75", "P76"],
  operations_recruiting_slowdown: ["P75", "P74"],
  decisions_what_next: ["P76", "P75"],
  governance_requires_approval: ["P77", "P76"],
  governance_executive_approval: ["P77"],
};

function byPhase(phase: string): SourceAttribution {
  const match = Object.values(SOURCE_LABELS).find((entry) => entry.phase === phase);
  return match ?? { phase, label: phase, fullLabel: phase };
}

export function formatSourceAttributions(input: {
  sourceSystems: string[];
  queryId: ExecutiveQueryId | null;
  context: CommandCenterChatContext;
}): SourceAttribution[] {
  const seen = new Set<string>();
  const result: SourceAttribution[] = [];

  const add = (attribution: SourceAttribution | undefined) => {
    if (!attribution || seen.has(attribution.phase)) return;
    seen.add(attribution.phase);
    result.push(attribution);
  };

  for (const system of input.sourceSystems) {
    add(SOURCE_LABELS[system]);
  }

  const phases = input.queryId ? QUERY_ENGINE_PHASES[input.queryId] : null;
  if (phases) {
    for (const phase of phases) add(byPhase(phase));
  }

  if (result.length === 0) {
    add(SOURCE_LABELS["AI Command Center (P78)"]);
  }

  if (input.context.governance.approvalQueue.length > 0 && !seen.has("P77")) {
    add(byPhase("P77"));
  }

  return result.sort((a, b) => a.phase.localeCompare(b.phase));
}

export function sourceAttributionsToEngineNames(attributions: SourceAttribution[]): string[] {
  return attributions.map((entry) => entry.fullLabel);
}
