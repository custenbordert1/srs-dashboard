import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkAutoEligibility } from "@/lib/autonomous-paperwork-engine/paperwork-lifecycle";
import { resolveAutonomousOnboardingState } from "@/lib/autonomous-onboarding-engine/state-machine";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { resolveEffectiveCommunicationMode } from "@/lib/autonomous-candidate-communication-engine/pilot-filters";
import { getCommunicationTemplate } from "@/lib/autonomous-candidate-communication-engine/communication-templates";
import type {
  CommunicationDecision,
  CommunicationEventType,
  CommunicationRecipientRole,
  P73FeatureFlags,
} from "@/lib/autonomous-candidate-communication-engine/types";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function hoursSince(iso: string | null | undefined, referenceMs: number): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return (referenceMs - parsed) / MS_PER_HOUR;
}

function isToday(iso: string | null | undefined, referenceMs: number): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  const ref = new Date(referenceMs);
  return (
    date.getUTCFullYear() === ref.getUTCFullYear() &&
    date.getUTCMonth() === ref.getUTCMonth() &&
    date.getUTCDate() === ref.getUTCDate()
  );
}

function recipientLabel(role: CommunicationRecipientRole, row: ScoredCandidateWorkflowRow): string {
  switch (role) {
    case "representative":
      return formatCandidateDisplayName(row);
    case "recruiter":
      return row.assignedRecruiter?.trim() || "Unassigned Recruiter";
    case "district_manager":
      return row.assignedDM?.trim() || row.suggestedDM?.trim() || "District Manager";
    case "executive":
      return "Executive Leadership";
    case "operations":
      return "Operations";
  }
}

function makeDecision(input: {
  row: ScoredCandidateWorkflowRow;
  flags: P73FeatureFlags;
  referenceMs: number;
  communicationType: CommunicationEventType;
  recipientRole: CommunicationRecipientRole;
  trigger: string;
  explanation: string;
  scheduledAt: string;
  approvalRequired: boolean;
  skipped: boolean;
  skipReason: string | null;
}): CommunicationDecision {
  const template = getCommunicationTemplate(input.communicationType);
  const effectiveMode = resolveEffectiveCommunicationMode({ row: input.row, flags: input.flags });
  const wouldSend =
    !input.skipped &&
    effectiveMode !== "off" &&
    input.flags.communicationEnabled;

  return {
    decisionId: `${input.row.candidateId}:${input.communicationType}:${input.recipientRole}`,
    candidateId: input.row.candidateId,
    candidateName: formatCandidateDisplayName(input.row),
    communicationType: input.communicationType,
    recipientRole: input.recipientRole,
    recipientLabel: recipientLabel(input.recipientRole, input.row),
    templateId: template.templateId,
    channel: template.channel,
    scheduledAt: input.scheduledAt,
    approvalRequired: input.approvalRequired,
    skipped: input.skipped,
    skipReason: input.skipReason,
    explanation: input.explanation,
    trigger: input.trigger,
    effectiveMode,
    wouldSend,
  };
}

function recruitingDecisions(input: {
  row: ScoredCandidateWorkflowRow;
  flags: P73FeatureFlags;
  referenceMs: number;
  fetchedAt: string;
}): CommunicationDecision[] {
  const decisions: CommunicationDecision[] = [];
  const { row, flags, referenceMs, fetchedAt } = input;

  if (isToday(row.appliedDate, referenceMs)) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "application_received",
        recipientRole: "representative",
        trigger: "candidate_applied",
        explanation: "Application received today — auto-acknowledgement to candidate.",
        scheduledAt: row.appliedDate ?? fetchedAt,
        approvalRequired: false,
        skipped: !row.email?.trim(),
        skipReason: !row.email?.trim() ? "Candidate email missing." : null,
      }),
    );
  }

  const interviewStatuses = new Set(["Phone Screen", "Interview", "Interview Scheduled"]);
  if (interviewStatuses.has(row.workflowStatus)) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "interview_invitation",
        recipientRole: "representative",
        trigger: "workflow_interview_stage",
        explanation: `Workflow status "${row.workflowStatus}" indicates interview stage.`,
        scheduledAt: row.lastActionAt ?? fetchedAt,
        approvalRequired: true,
        skipped: !row.email?.trim(),
        skipReason: !row.email?.trim() ? "Candidate email missing." : null,
      }),
    );
  }

  if (row.followUpDueAt && Date.parse(row.followUpDueAt) <= referenceMs) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "interview_reminder",
        recipientRole: "representative",
        trigger: "follow_up_due",
        explanation: "Follow-up due date has passed.",
        scheduledAt: row.followUpDueAt,
        approvalRequired: false,
        skipped: !row.email?.trim(),
        skipReason: !row.email?.trim() ? "Candidate email missing." : null,
      }),
    );
  }

  if (row.actionType && row.actionType !== "none" && !isUnassignedRecruiter(row.assignedRecruiter ?? "")) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "recruiter_follow_up",
        recipientRole: "representative",
        trigger: "recruiter_action_due",
        explanation: `Recruiter action "${row.actionType}" requires candidate follow-up.`,
        scheduledAt: row.lastActionAt ?? fetchedAt,
        approvalRequired: true,
        skipped: !row.email?.trim(),
        skipReason: !row.email?.trim() ? "Candidate email missing." : null,
      }),
    );
  }

  const inactiveHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs);
  if (inactiveHours != null && inactiveHours >= 72 && !row.paperworkSentAt) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "candidate_inactivity_reminder",
        recipientRole: "representative",
        trigger: "candidate_inactivity",
        explanation: `No activity for ${Math.floor(inactiveHours)} hours and paperwork not sent.`,
        scheduledAt: fetchedAt,
        approvalRequired: false,
        skipped: !row.email?.trim(),
        skipReason: !row.email?.trim() ? "Candidate email missing." : null,
      }),
    );
  }

  return decisions;
}

function paperworkDecisions(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
  flags: P73FeatureFlags;
  referenceMs: number;
  fetchedAt: string;
}): CommunicationDecision[] {
  const decisions: CommunicationDecision[] = [];
  const { row, onboarding, policy, flags, referenceMs, fetchedAt } = input;

  const eligibility = buildPaperworkAutoEligibility({ row, onboarding, policy });
  if (eligibility.eligible) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "paperwork_ready",
        recipientRole: "recruiter",
        trigger: "paperwork_eligible",
        explanation: "Candidate meets automatic paperwork eligibility requirements.",
        scheduledAt: fetchedAt,
        approvalRequired: false,
        skipped: false,
        skipReason: null,
      }),
    );
  }

  if (row.paperworkSentAt) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "paperwork_sent",
        recipientRole: "representative",
        trigger: "paperwork_sent",
        explanation: "Paperwork packet was sent to candidate.",
        scheduledAt: row.paperworkSentAt,
        approvalRequired: false,
        skipped: !row.email?.trim(),
        skipReason: !row.email?.trim() ? "Candidate email missing." : null,
      }),
    );

    if (!row.paperworkSignedAt) {
      const hoursWaiting = hoursSince(row.paperworkSentAt, referenceMs) ?? 0;
      const reminders: Array<{ type: CommunicationEventType; minHours: number; label: string }> = [
        { type: "reminder_24h", minHours: 24, label: "24-hour reminder" },
        { type: "reminder_48h", minHours: 48, label: "48-hour reminder" },
        { type: "final_reminder", minHours: 72, label: "Final reminder" },
      ];

      for (const reminder of reminders) {
        if (hoursWaiting >= reminder.minHours) {
          decisions.push(
            makeDecision({
              row,
              flags,
              referenceMs,
              communicationType: reminder.type,
              recipientRole: "representative",
              trigger: "paperwork_unsigned",
              explanation: `${reminder.label} — paperwork unsigned for ${Math.floor(hoursWaiting)} hours.`,
              scheduledAt: new Date(Date.parse(row.paperworkSentAt) + reminder.minHours * MS_PER_HOUR).toISOString(),
              approvalRequired: reminder.type === "final_reminder",
              skipped: !row.email?.trim(),
              skipReason: !row.email?.trim() ? "Candidate email missing." : null,
            }),
          );
        }
      }
    }
  }

  if (row.paperworkSignedAt) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "paperwork_completed",
        recipientRole: "representative",
        trigger: "paperwork_signed",
        explanation: "Paperwork signed — completion acknowledgement.",
        scheduledAt: row.paperworkSignedAt,
        approvalRequired: false,
        skipped: !row.email?.trim(),
        skipReason: !row.email?.trim() ? "Candidate email missing." : null,
      }),
    );
  }

  return decisions;
}

function onboardingDecisions(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  flags: P73FeatureFlags;
  referenceMs: number;
  fetchedAt: string;
}): CommunicationDecision[] {
  const decisions: CommunicationDecision[] = [];
  const { row, onboarding, flags, referenceMs, fetchedAt } = input;

  const onboardingState = resolveAutonomousOnboardingState({
    candidateId: row.candidateId,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    onboardingStatus: onboarding?.status ?? null,
  });

  const stateComms: Array<{
    states: string[];
    type: CommunicationEventType;
    role: CommunicationRecipientRole;
    trigger: string;
    explanation: string;
    approval: boolean;
  }> = [
    {
      states: ["paperwork_signed", "welcome_prepared", "training_assigned", "training_in_progress", "training_complete", "ready_for_work", "assigned"],
      type: "welcome_email",
      role: "representative",
      trigger: "onboarding_welcome",
      explanation: "Paperwork signed — welcome email prepared.",
      approval: false,
    },
    {
      states: ["training_assigned", "training_in_progress", "training_complete", "ready_for_work", "assigned"],
      type: "training_instructions",
      role: "representative",
      trigger: "training_assigned",
      explanation: "Training modules assigned.",
      approval: false,
    },
    {
      states: ["ready_for_work", "assigned"],
      type: "mel_survey_assignment",
      role: "representative",
      trigger: "mel_survey",
      explanation: "Candidate ready for MEL survey assignment.",
      approval: false,
    },
    {
      states: ["assigned"],
      type: "store_call_assignment",
      role: "representative",
      trigger: "store_assignment",
      explanation: "Candidate assigned to project — store call notification.",
      approval: true,
    },
    {
      states: ["ready_for_work", "assigned"],
      type: "ready_for_work_confirmation",
      role: "representative",
      trigger: "ready_for_work",
      explanation: "Candidate reached Ready for Work state.",
      approval: false,
    },
  ];

  for (const comm of stateComms) {
    if (comm.states.includes(onboardingState)) {
      decisions.push(
        makeDecision({
          row,
          flags,
          referenceMs,
          communicationType: comm.type,
          recipientRole: comm.role,
          trigger: comm.trigger,
          explanation: comm.explanation,
          scheduledAt: row.paperworkSignedAt ?? row.lastActionAt ?? fetchedAt,
          approvalRequired: comm.approval,
          skipped: comm.role === "representative" && !row.email?.trim(),
          skipReason: comm.role === "representative" && !row.email?.trim() ? "Candidate email missing." : null,
        }),
      );
    }
  }

  return decisions;
}

function districtManagerDecisions(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  flags: P73FeatureFlags;
  referenceMs: number;
  fetchedAt: string;
}): CommunicationDecision[] {
  const decisions: CommunicationDecision[] = [];
  const { row, onboarding, flags, referenceMs, fetchedAt } = input;

  const onboardingState = resolveAutonomousOnboardingState({
    candidateId: row.candidateId,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    onboardingStatus: onboarding?.status ?? null,
  });

  if (onboardingState === "ready_for_work") {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "new_representative_ready",
        recipientRole: "district_manager",
        trigger: "ready_for_work",
        explanation: "New representative ready for DM assignment.",
        scheduledAt: fetchedAt,
        approvalRequired: false,
        skipped: !row.assignedDM && !row.suggestedDM,
        skipReason: !row.assignedDM && !row.suggestedDM ? "District Manager not assigned." : null,
      }),
    );
  }

  if (onboardingState === "assigned") {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "representative_completed_onboarding",
        recipientRole: "district_manager",
        trigger: "onboarding_complete",
        explanation: "Representative completed onboarding.",
        scheduledAt: fetchedAt,
        approvalRequired: false,
        skipped: !row.assignedDM && !row.suggestedDM,
        skipReason: !row.assignedDM && !row.suggestedDM ? "District Manager not assigned." : null,
      }),
    );
  }

  const stalledHours = hoursSince(row.lastActionAt ?? row.paperworkSentAt, referenceMs);
  if (
    stalledHours != null &&
    stalledHours >= 96 &&
    ["paperwork_sent", "training_assigned", "training_in_progress"].includes(onboardingState)
  ) {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "representative_overdue",
        recipientRole: "district_manager",
        trigger: "onboarding_stalled",
        explanation: `Onboarding stalled for ${Math.floor(stalledHours)} hours in ${onboardingState}.`,
        scheduledAt: fetchedAt,
        approvalRequired: false,
        skipped: !row.assignedDM && !row.suggestedDM,
        skipReason: !row.assignedDM && !row.suggestedDM ? "District Manager not assigned." : null,
      }),
    );
  }

  if (row.workflowStatus === "Not Qualified" || onboarding?.status === "declined") {
    decisions.push(
      makeDecision({
        row,
        flags,
        referenceMs,
        communicationType: "representative_failed_onboarding",
        recipientRole: "district_manager",
        trigger: "onboarding_failed",
        explanation: "Candidate disqualified or onboarding declined.",
        scheduledAt: fetchedAt,
        approvalRequired: true,
        skipped: !row.assignedDM && !row.suggestedDM,
        skipReason: !row.assignedDM && !row.suggestedDM ? "District Manager not assigned." : null,
      }),
    );
  }

  return decisions;
}

export function buildCommunicationDecisionsForCandidate(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
  flags: P73FeatureFlags;
  referenceMs: number;
  fetchedAt: string;
}): CommunicationDecision[] {
  if (input.flags.executionMode === "off") {
    return [];
  }

  return [
    ...recruitingDecisions(input),
    ...paperworkDecisions(input),
    ...onboardingDecisions(input),
    ...districtManagerDecisions(input),
  ];
}

export function buildCommunicationDecisions(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P73FeatureFlags;
  referenceMs: number;
  fetchedAt: string;
}): CommunicationDecision[] {
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const decisions = input.candidates.flatMap((row) =>
    buildCommunicationDecisionsForCandidate({
      row,
      onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
      policy: input.policy,
      flags: input.flags,
      referenceMs: input.referenceMs,
      fetchedAt: input.fetchedAt,
    }),
  );

  const leadershipTypes: CommunicationEventType[] = [
    "daily_communication_summary",
    "failed_communication_alerts",
    "communication_health_metrics",
  ];

  for (const communicationType of leadershipTypes) {
    const template = getCommunicationTemplate(communicationType);
    decisions.push({
      decisionId: `leadership:${communicationType}`,
      candidateId: null,
      candidateName: null,
      communicationType,
      recipientRole: communicationType === "communication_health_metrics" ? "executive" : "operations",
      recipientLabel: communicationType === "communication_health_metrics" ? "Executive Leadership" : "Operations",
      templateId: template.templateId,
      channel: template.channel,
      scheduledAt: input.fetchedAt,
      approvalRequired: false,
      skipped: false,
      skipReason: null,
      explanation: `Leadership ${communicationType.replace(/_/g, " ")} generated from communication queue.`,
      trigger: "daily_leadership_digest",
      effectiveMode: input.flags.executionMode === "off" ? "off" : "preview",
      wouldSend: input.flags.communicationEnabled,
    });
  }

  return decisions;
}
