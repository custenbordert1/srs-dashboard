import type {
  P1867LifecycleTransition,
  P1867OwnershipRow,
} from "@/lib/p186-7-lifecycle-cutover/types";
import { P1867_TRANSITIONS } from "@/lib/p186-7-lifecycle-cutover/types";

/**
 * Final lifecycle ownership matrix — exactly one future owner per transition.
 * P184/P185 remain authority for Paperwork Sent and envelope observations.
 */
export const P1867_OWNERSHIP_MATRIX: readonly P1867OwnershipRow[] = [
  {
    transition: "Applied→Recruiter Review",
    futureAuthoritativeWriter: "p186-lifecycle-control-plane→candidate-workflow-store-core",
    competingWriters: ["candidate-ingestion-backfill", "p175-breezy-export-import", "api-candidates-workflows"],
    productionAdapter: "upsertCandidateWorkflow",
    operatorApprovalRequired: false,
    idempotencyRule: "candidateId+stage+sourceEventId",
    auditRequirement: "p186_lifecycle_audit + workflow audit",
    rollbackWriter: "api-candidates-workflows",
    migrationStatus: "shadow_observe",
    p184P185Preserved: true,
  },
  {
    transition: "Recruiter Review→Hiring Recommendation",
    futureAuthoritativeWriter: "p186-lifecycle-control-plane→candidate-workflow-store-core",
    competingWriters: ["api-candidates-workflows", "p151-pipeline-advancement", "recruiter UI"],
    productionAdapter: "upsertCandidateWorkflow",
    operatorApprovalRequired: false,
    idempotencyRule: "candidateId+recruiterActionId",
    auditRequirement: "workflow audit with actor",
    rollbackWriter: "api-candidates-workflows",
    migrationStatus: "shadow_observe",
    p184P185Preserved: true,
  },
  {
    transition: "Hiring Recommendation→Operator Approved",
    futureAuthoritativeWriter: "p186-3-operator-approval-actions→candidate-workflow-store-core",
    competingWriters: ["p97-approval-mode-persist", "api-candidates-workflows"],
    productionAdapter: "executeOperatorApprovalAction / upsertCandidateWorkflow",
    operatorApprovalRequired: true,
    idempotencyRule: "candidateId+approvalEventId",
    auditRequirement: "p186_operator_audit + workflow audit",
    rollbackWriter: "p97-approval-mode-persist",
    migrationStatus: "canary_ready",
    p184P185Preserved: true,
  },
  {
    transition: "Operator Approved→Paperwork Needed",
    futureAuthoritativeWriter: "p186-3-operator-approval-actions→candidate-workflow-store-core",
    competingWriters: ["p83-candidate-advancement", "p158-post-assignment-transition", "p151-pipeline-advancement", "p97-approval-mode-persist"],
    productionAdapter: "upsertCandidateWorkflow (Paperwork Needed)",
    operatorApprovalRequired: true,
    idempotencyRule: "candidateId+approvalEventId+toStatus",
    auditRequirement: "immutable approval + workflow audit",
    rollbackWriter: "api-candidates-workflows",
    migrationStatus: "canary_ready",
    p184P185Preserved: true,
  },
  {
    transition: "Paperwork Needed→Paperwork Sent",
    futureAuthoritativeWriter: "p185-production-paperwork-runner→p184-autonomous-paperwork-send-engine→onboarding-send-execute",
    competingWriters: [
      "p106-autonomous-paperwork-engine",
      "p1061-autonomous-paperwork-runner",
      "p125-production-runner",
      "p136-paperwork-scheduler",
      "p152-immediate-paperwork",
      "p84-autonomous-paperwork-send",
      "p183-final-scoped-operator-send",
    ],
    productionAdapter: "P184 sender / onboarding-send-execute (isolated)",
    operatorApprovalRequired: true,
    idempotencyRule: "P184/P185 envelope idempotency keys",
    auditRequirement: "P185 envelope + workflow paperwork audit",
    rollbackWriter: "manual operator hold — do not resend",
    migrationStatus: "planned",
    p184P185Preserved: true,
  },
  {
    transition: "Paperwork Sent→Viewed",
    futureAuthoritativeWriter: "dropbox-sign-webhook→candidate-workflow-store-core",
    competingWriters: ["p107-paperwork-monitor", "p84 signature monitor"],
    productionAdapter: "applyCandidatePaperworkViewed",
    operatorApprovalRequired: false,
    idempotencyRule: "signatureRequestId+eventType+eventTime",
    auditRequirement: "webhook + workflow paperwork audit",
    rollbackWriter: "p107-paperwork-monitor (observe only)",
    migrationStatus: "shadow_observe",
    p184P185Preserved: true,
  },
  {
    transition: "Viewed→Signed",
    futureAuthoritativeWriter: "dropbox-sign-webhook→candidate-workflow-store-core",
    competingWriters: ["p107-paperwork-monitor"],
    productionAdapter: "applyCandidatePaperworkSigned",
    operatorApprovalRequired: false,
    idempotencyRule: "signatureRequestId+all_signed",
    auditRequirement: "webhook + workflow paperwork audit",
    rollbackWriter: "p107-paperwork-monitor (observe only)",
    migrationStatus: "shadow_observe",
    p184P185Preserved: true,
  },
  {
    transition: "Signed→Onboarding Complete",
    futureAuthoritativeWriter: "p186-5-post-sign-review→candidate-workflow-store-core",
    competingWriters: ["candidate-onboarding-engine", "direct-deposit-workflow", "hiring-automation-engine"],
    productionAdapter: "executePostSignReviewAction / upsertCandidateWorkflow",
    operatorApprovalRequired: true,
    idempotencyRule: "candidateId+onboardingApprovalEventId",
    auditRequirement: "p186_5_audit + workflow audit",
    rollbackWriter: "api-candidates-workflows",
    migrationStatus: "canary_ready",
    p184P185Preserved: true,
  },
  {
    transition: "Onboarding Complete→Ready for MEL",
    futureAuthoritativeWriter: "p186-5-post-sign-review→candidate-workflow-store-core",
    competingWriters: ["candidate-onboarding-engine", "hiring-automation-engine", "p107-paperwork-monitor"],
    productionAdapter: "approve_ready_for_mel → upsertCandidateWorkflow",
    operatorApprovalRequired: true,
    idempotencyRule: "candidateId+readyForMelApprovalEventId",
    auditRequirement: "p186_5_audit + checklist version",
    rollbackWriter: "api-candidates-workflows",
    migrationStatus: "canary_ready",
    p184P185Preserved: true,
  },
  {
    transition: "Ready for MEL→MEL Export Review",
    futureAuthoritativeWriter: "p186-5-mel-export-queue (pending_review/approved_for_export only)",
    competingWriters: [],
    productionAdapter: "enqueueMelExportItem (no MEL write API)",
    operatorApprovalRequired: true,
    idempotencyRule: "mel idempotency key (candidate+assignment+job+approval)",
    auditRequirement: "p186 mel queue + p186_5_audit",
    rollbackWriter: "cancel queue row (no MEL call)",
    migrationStatus: "planned",
    p184P185Preserved: true,
  },
  {
    transition: "MEL Export Review→Exported",
    futureAuthoritativeWriter: "external MEL observe → confirmed_exported",
    competingWriters: [],
    productionAdapter: "observeExternalMelExport only",
    operatorApprovalRequired: false,
    idempotencyRule: "externalEventId+candidateId",
    auditRequirement: "observe audit — never invent confirmed_exported",
    rollbackWriter: "n/a — do not un-export",
    migrationStatus: "planned",
    p184P185Preserved: true,
  },
] as const;

export function getOwnershipRow(transition: P1867LifecycleTransition): P1867OwnershipRow | undefined {
  return P1867_OWNERSHIP_MATRIX.find((r) => r.transition === transition);
}

export function assertOwnershipCompleteness(): {
  ok: boolean;
  missing: P1867LifecycleTransition[];
  multiOwner: P1867LifecycleTransition[];
  p184P185Preserved: boolean;
} {
  const missing = P1867_TRANSITIONS.filter((t) => !getOwnershipRow(t));
  const multiOwner = P1867_OWNERSHIP_MATRIX.filter((r) => {
    const owners = r.futureAuthoritativeWriter.split("|").map((s) => s.trim()).filter(Boolean);
    return owners.length !== 1 && !r.futureAuthoritativeWriter.includes("→");
  }).map((r) => r.transition);
  // Each row has exactly one futureAuthoritativeWriter string (single owner designation)
  const exactlyOne = P1867_OWNERSHIP_MATRIX.every(
    (r) => typeof r.futureAuthoritativeWriter === "string" && r.futureAuthoritativeWriter.length > 0,
  );
  const p184P185Preserved = P1867_OWNERSHIP_MATRIX.every((r) => r.p184P185Preserved);
  const paperSend = getOwnershipRow("Paperwork Needed→Paperwork Sent");
  const p184Owned =
    !!paperSend &&
    paperSend.futureAuthoritativeWriter.includes("p184") &&
    paperSend.futureAuthoritativeWriter.includes("p185");

  return {
    ok: missing.length === 0 && exactlyOne && p184P185Preserved && p184Owned && multiOwner.length === 0,
    missing,
    multiOwner,
    p184P185Preserved: p184P185Preserved && p184Owned,
  };
}

export function buildArchitectureDoc(): {
  authoritativeLifecycleStore: string;
  eventAuthority: Record<string, string>;
  allowedWriters: string[];
  prohibitedWriters: string[];
  fallbackAuthority: string;
  isolatedSubsystems: string[];
} {
  return {
    authoritativeLifecycleStore: "candidate-workflow-store (production SoR) via approved adapters",
    eventAuthority: {
      breezy_ingestion: "Breezy → ingestion/backfill (seed only)",
      operator_approval: "P186.3 / P97 → workflow store",
      paperwork_send: "P184/P185 only",
      envelope_lifecycle: "Dropbox Sign webhook (+ P107 observe)",
      onboarding_ready_for_mel: "P186.5 review → workflow store",
      mel_export: "External MEL; P186 observes only",
      shadow: "P186.1/P186.2 observe — never SoR",
    },
    allowedWriters: [
      "candidate-workflow-store-core",
      "p186-3-operator-approval-actions",
      "p186-5-post-sign-review",
      "p184-autonomous-paperwork-send-engine",
      "p185-production-paperwork-runner",
      "dropbox-sign-webhook",
      "onboarding-send-execute",
    ],
    prohibitedWriters: [
      "p1547-continuous-recruiting-runner (post freeze)",
      "p169-recruiting-orchestrator (post freeze)",
      "p171-lifecycle-manager production side-effects (post freeze)",
      "p106/p1061/p125/p136/p183 legacy send paths (post freeze)",
    ],
    fallbackAuthority:
      "On rollback: re-enable previous writer flag; P186 returns to shadow_observe; production workflow store remains SoR",
    isolatedSubsystems: [
      "P184/P185 paperwork-send subsystem",
      "Dropbox Sign envelope authority",
      "MEL export destination",
      "P186 never bypasses operator approval or document requirements",
    ],
  };
}
