import {
  P170_SOURCE_LABELS,
  type P170CandidateSource,
  type P170DiscoveryStatus,
  type P170SearchResult,
} from "@/lib/p170-unified-candidate-discovery/types";

export function sourceLabel(source: P170CandidateSource | null): string {
  if (!source) return "—";
  return P170_SOURCE_LABELS[source];
}

export function sourceTone(source: P170CandidateSource | null): "success" | "warning" | "neutral" {
  if (source === "ingestion_store") return "success";
  if (source === "breezy_rescue") return "warning";
  return "neutral";
}

export type DiscoveryChecklistItem = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export function buildDiscoveryChecklist(discovery: P170DiscoveryStatus): DiscoveryChecklistItem[] {
  return [
    { id: "breezy", label: "Found in Breezy", ok: discovery.foundInBreezy },
    { id: "ingestion", label: "Found in Ingestion", ok: discovery.foundInIngestion },
    { id: "search", label: "Found in Search", ok: discovery.foundInSearch },
    {
      id: "p157",
      label: "Evaluated by P157",
      ok: discovery.evaluatedByP157,
      detail: discovery.p157Action ?? undefined,
    },
    {
      id: "p169",
      label: "Eligible for P169",
      ok: discovery.eligibleForP169,
      detail: discovery.p169Outcome ?? undefined,
    },
    {
      id: "paperwork",
      label: "Paperwork Status",
      ok: !discovery.paperworkStatus.startsWith("Not sent"),
      detail: discovery.paperworkStatus,
    },
  ];
}

export function formatP170Markdown(result: P170SearchResult): string {
  const lines = [
    "# P170 Unified Candidate Discovery",
    "",
    `Generated: ${result.generatedAt}`,
    `Query: ${result.query.raw || "(empty)"}`,
    `Found: ${result.found}`,
    `Source: ${sourceLabel(result.source)}`,
    `Rescue invoked: ${result.rescueInvoked}${result.rescueSource ? ` (${result.rescueSource})` : ""}`,
    `Hydrated into store: ${result.hydratedIntoStore}`,
    "",
  ];

  if (result.candidate) {
    lines.push(
      "## Candidate",
      `- Name: ${result.candidate.name}`,
      `- ID: ${result.candidate.candidateId}`,
      `- Email: ${result.candidate.email ?? "—"}`,
      `- Position: ${result.candidate.positionName ?? result.candidate.positionId ?? "—"}`,
      `- Applied: ${result.candidate.appliedDate ?? "—"}`,
      "",
    );
  }

  if (result.discovery) {
    lines.push(
      "## Discovery status",
      ...buildDiscoveryChecklist(result.discovery).map(
        (item) => `- [${item.ok ? "x" : " "}] ${item.label}${item.detail ? ` — ${item.detail}` : ""}`,
      ),
      "",
    );
  }

  if (result.warnings.length > 0) {
    lines.push("## Warnings", ...result.warnings.map((w) => `- ${w}`), "");
  }

  return lines.join("\n");
}
