import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { P1852EvidenceItem } from "@/lib/p185-2-selected-hire-recovery/types";

export type P1852LoadedEvidenceIndex = {
  byCandidate: Map<string, P1852EvidenceItem[]>;
  p181Ids: Set<string>;
  p83ExecutedIds: Set<string>;
  p97Ids: Set<string>;
  p158Ids: Set<string>;
  funnelIds: Set<string>;
  sourcesInspected: Array<{ source: string; authority: string; role: string; count: number }>;
};

function push(
  map: Map<string, P1852EvidenceItem[]>,
  candidateId: string,
  item: P1852EvidenceItem,
): void {
  const list = map.get(candidateId) ?? [];
  list.push(item);
  map.set(candidateId, list);
}

async function loadP97Persisted(): Promise<
  Array<{ candidateId: string; approvedAt: string; approvedBy: string; afterStatus: string }>
> {
  try {
    const raw = await readFile(
      path.join(recruitingDataDir(), "p97-approval-mode-production.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as {
      persisted?: Array<{
        candidateId: string;
        approvedAt: string;
        approvedBy: string;
        afterState?: { workflowStatus?: string };
      }>;
    };
    return (parsed.persisted ?? []).map((p) => ({
      candidateId: p.candidateId,
      approvedAt: p.approvedAt,
      approvedBy: p.approvedBy,
      afterStatus: p.afterState?.workflowStatus ?? "Paperwork Needed",
    }));
  } catch {
    return [];
  }
}

async function loadP158Transitions(): Promise<
  Array<{ candidateId: string; at: string; after: string; mode: string }>
> {
  try {
    const raw = await readFile(
      path.join(recruitingDataDir(), "p158-workflow-transition-audit.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as {
      events?: Array<{
        candidateId: string;
        at: string;
        afterWorkflowStatus?: string;
        executionMode?: string;
        action?: string;
      }>;
    };
    return (parsed.events ?? [])
      .filter(
        (e) =>
          e.action === "transitioned" &&
          e.afterWorkflowStatus === "Paperwork Needed" &&
          (e.executionMode === "production" || !e.executionMode),
      )
      .map((e) => ({
        candidateId: e.candidateId,
        at: e.at,
        after: e.afterWorkflowStatus ?? "Paperwork Needed",
        mode: e.executionMode ?? "production",
      }));
  } catch {
    return [];
  }
}

async function loadP181ArtifactIds(): Promise<string[]> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "artifacts/p181-scoped-operator-paperwork-queue.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as {
      operator?: { scopedCandidateIds?: string[] };
    };
    return parsed.operator?.scopedCandidateIds ?? [];
  } catch {
    return [];
  }
}

async function scanP83AdvancementAudit(): Promise<{
  executed: Map<string, { at: string | null; actor: string | null }>;
  recommended: Map<string, { at: string | null }>;
  funnel: Map<string, { at: string | null }>;
}> {
  const executed = new Map<string, { at: string | null; actor: string | null }>();
  const recommended = new Map<string, { at: string | null }>();
  const funnel = new Map<string, { at: string | null }>();
  const auditPath = path.join(recruitingDataDir(), "candidate-workflow-audit.jsonl");

  try {
    const reader = createInterface({
      input: createReadStream(auditPath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of reader) {
      if (
        !line.includes("candidate_advancement_p83") &&
        !line.includes("onboarding_paperwork_funnel_promotion")
      ) {
        continue;
      }
      try {
        const e = JSON.parse(line) as {
          action?: string;
          candidateId?: string;
          at?: string;
          byUserId?: string;
          metadata?: Record<string, unknown>;
        };
        if (!e.candidateId) continue;
        if (e.action === "onboarding_paperwork_funnel_promotion") {
          funnel.set(e.candidateId, { at: e.at ?? null });
          continue;
        }
        if (e.action !== "candidate_advancement_p83") continue;
        const m = e.metadata ?? {};
        const action = String(m.action ?? m.advancementAction ?? "");
        const shouldAdvance = m.shouldAdvance === true;
        if (action !== "send-paperwork") continue;
        if (shouldAdvance) {
          executed.set(e.candidateId, {
            at: e.at ?? null,
            actor: e.byUserId ?? null,
          });
        } else {
          recommended.set(e.candidateId, { at: e.at ?? null });
        }
      } catch {
        // skip bad lines
      }
    }
  } catch {
    // audit missing in tests
  }

  return { executed, recommended, funnel };
}

/**
 * Load durable selection evidence from platform stores.
 * Authoritative vs supporting is documented in sourcesInspected.
 */
export async function loadP1852SelectionEvidenceIndex(): Promise<P1852LoadedEvidenceIndex> {
  const byCandidate = new Map<string, P1852EvidenceItem[]>();
  const [p97, p158, p181Ids, p83] = await Promise.all([
    loadP97Persisted(),
    loadP158Transitions(),
    loadP181ArtifactIds(),
    scanP83AdvancementAudit(),
  ]);

  for (const row of p97) {
    push(byCandidate, row.candidateId, {
      source: "p97_approval_persist",
      authority: "authoritative",
      detail: `P97 persisted approval → ${row.afterStatus}`,
      timestamp: row.approvedAt,
      actor: row.approvedBy,
    });
  }

  for (const row of p158) {
    push(byCandidate, row.candidateId, {
      source: "p158_workflow_transition",
      authority: "authoritative",
      detail: `P158 ${row.mode} transition → ${row.after}`,
      timestamp: row.at,
      actor: "P158",
    });
  }

  for (const id of p181Ids) {
    push(byCandidate, id, {
      source: "p181_scoped_operator_queue",
      authority: "authoritative",
      detail: "P181 scoped operator paperwork queue membership (approved operator scope).",
      timestamp: null,
      actor: "P181",
    });
  }

  for (const [id, meta] of p83.executed) {
    push(byCandidate, id, {
      source: "p83_executed_advancement",
      authority: "authoritative",
      detail: "P83 send-paperwork with shouldAdvance=true (executed).",
      timestamp: meta.at,
      actor: meta.actor,
    });
  }

  for (const [id, meta] of p83.recommended) {
    push(byCandidate, id, {
      source: "p83_recommendation_only",
      authority: "supporting",
      detail: "P83 send-paperwork recommendation without executed advance.",
      timestamp: meta.at,
      actor: null,
    });
  }

  for (const [id, meta] of p83.funnel) {
    push(byCandidate, id, {
      source: "onboarding_paperwork_funnel_promotion",
      authority: "supporting",
      detail: "Onboarding paperwork funnel promotion (policy; may have reverted).",
      timestamp: meta.at,
      actor: null,
    });
  }

  return {
    byCandidate,
    p181Ids: new Set(p181Ids),
    p83ExecutedIds: new Set(p83.executed.keys()),
    p97Ids: new Set(p97.map((p) => p.candidateId)),
    p158Ids: new Set(p158.map((p) => p.candidateId)),
    funnelIds: new Set(p83.funnel.keys()),
    sourcesInspected: [
      {
        source: "p97_approval_mode_production",
        authority: "authoritative",
        role: "Executive/operator persisted approval to Paperwork Needed",
        count: p97.length,
      },
      {
        source: "p83_candidate_workflow_audit",
        authority: "authoritative",
        role: "Executed send-paperwork advancements only (shouldAdvance=true)",
        count: p83.executed.size,
      },
      {
        source: "p83_recommendations",
        authority: "supporting",
        role: "Recommendations without execution — do not authorize alone",
        count: p83.recommended.size,
      },
      {
        source: "p158_workflow_transition_audit",
        authority: "authoritative",
        role: "Post-assignment production transitions to Paperwork Needed",
        count: p158.length,
      },
      {
        source: "p181_scoped_operator_paperwork_queue_artifact",
        authority: "authoritative",
        role: "Operator-scoped paperwork queue membership",
        count: p181Ids.length,
      },
      {
        source: "onboarding_paperwork_funnel_promotion",
        authority: "supporting",
        role: "Policy funnel promotions — informational/supporting only",
        count: p83.funnel.size,
      },
      {
        source: "p152_immediate_paperwork_policy",
        authority: "informational",
        role: "Send-policy gate after selection — not hire selection",
        count: 0,
      },
      {
        source: "p87_hiring_decisions_preview",
        authority: "informational",
        role: "Preview recommendations only — never authorize",
        count: 0,
      },
      {
        source: "google_recruiting_sheet",
        authority: "informational",
        role: "Archive/reference — not wired as selection evidence",
        count: 0,
      },
      {
        source: "breezy_workflow_current_stage",
        authority: "authoritative",
        role: "Exact Selected/Approved/Paperwork Needed stages when present",
        count: 0,
      },
    ],
  };
}
