import type { P84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/types";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { protectionBlockerOverridesApproval } from "@/lib/p109-project-mapping-review/approval-bridge";
import type { RunnerProductionConfig } from "@/lib/autonomous-paperwork-runner/runner-config";
import type { LiveSendOperatorChecklistReport } from "@/lib/live-send-operator-checklist/types";
import type { SafetyGateStatus } from "@/lib/p118-autonomous-paperwork-operations-center/types";

export function buildPaperworkSafetyStatus(input: {
  config: RunnerProductionConfig;
  p84Flags: P84FeatureFlags;
  operatorChecklist: LiveSendOperatorChecklistReport;
  auditLogPresent: boolean;
}): SafetyGateStatus[] {
  const liveModeDisabled = input.config.liveEngineMode == null && !canLiveSendPaperwork(input.p84Flags);
  const dryRunEnabled = input.config.liveEngineMode == null;

  return [
    {
      id: "dry_run_enabled",
      label: "Dry-run enabled",
      passed: dryRunEnabled,
      detail: dryRunEnabled
        ? "Runner live mode unset — evaluation only."
        : `Live engine mode active: ${input.config.liveEngineMode}.`,
    },
    {
      id: "live_mode_disabled",
      label: "Live mode disabled",
      passed: liveModeDisabled,
      detail: liveModeDisabled
        ? "AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE unset and P84 liveSend off."
        : "Live send path is enabled in config or P84 flags.",
    },
    {
      id: "execute_batch_disabled",
      label: "executeBatch disabled",
      passed: true,
      detail: "P106.3 runner supports executeOne / executeSafeSingles only — no executeBatch.",
    },
    {
      id: "duplicate_protection",
      label: "Duplicate protection",
      passed: protectionBlockerOverridesApproval("duplicate_risk"),
      detail: "duplicate_risk overrides approved mapping bridge.",
    },
    {
      id: "already_sent_protection",
      label: "already_sent protection",
      passed: protectionBlockerOverridesApproval("already_sent"),
      detail: "already_sent overrides approved mapping bridge.",
    },
    {
      id: "invalid_email_protection",
      label: "invalid_email protection",
      passed: protectionBlockerOverridesApproval("invalid_email"),
      detail: "invalid_email overrides approved mapping bridge.",
    },
    {
      id: "audit_logging",
      label: "Audit logging",
      passed: input.auditLogPresent,
      detail: input.auditLogPresent
        ? "P97 audit log present."
        : "P97 audit log missing or empty.",
    },
    {
      id: "dropbox_sign_guarded",
      label: "Dropbox Sign guarded",
      passed: !canLiveSendPaperwork(input.p84Flags),
      detail: canLiveSendPaperwork(input.p84Flags)
        ? "P84 liveSend enabled — Dropbox Sign may be invoked."
        : "P84 liveSend disabled — Dropbox guarded.",
    },
    {
      id: "breezy_write_protection",
      label: "Breezy write protection",
      passed: true,
      detail: "P106 runner and P118 operations center perform read-only Breezy access.",
    },
    {
      id: "operator_checklist",
      label: "Operator checklist status",
      passed: input.operatorChecklist.goNoGo === "GO",
      detail:
        input.operatorChecklist.goNoGo === "GO"
          ? "P101 operator checklist GO."
          : `P101 operator checklist ${input.operatorChecklist.goNoGo}: ${input.operatorChecklist.goNoGoReason}`,
    },
  ];
}
