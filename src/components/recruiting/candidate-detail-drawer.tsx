"use client";

import {
  AI_GRADE_STYLES,
  AI_SCORE_TIER_STYLES,
  type AiLetterGrade,
  type AiScoreTier,
  type CandidateAiScoreBreakdown,
  type WorkflowRecommendation,
} from "@/lib/candidate-ai-scoring";
import {
  RECRUITING_ACTION_LABELS,
  type CandidateRecruitingActions,
  type RecruitingActionType,
} from "@/lib/candidate-recruiting-actions";
import { paperworkStatusLabel } from "@/lib/candidate-paperwork";
import { buildIntegrationPrep } from "@/lib/integration-prep";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";
import { addDmToRoster, addRecruiterToRoster } from "@/lib/recruiter-roster";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { CANDIDATE_WORKFLOW_STATUSES } from "@/lib/candidate-workflow-types";
import { CandidatePayrollOnboardingPanel } from "@/components/recruiting/candidate-payroll-onboarding-panel";
import { BestRepMatchSection } from "@/components/recruiting/best-rep-match-section";
import { MatchedOpportunitiesSection } from "@/components/recruiting/matched-opportunities-section";
import type { CandidateOpportunityMatch } from "@/lib/mel-matching/matching-engine-types";
import type { OpportunityBestRepMatches } from "@/lib/rep-intelligence/rep-types";
import {
  resolveCandidateRowPrimaryAction,
  type CandidateRowPrimaryAction,
} from "@/lib/candidate-row-primary-action";
import type { SendPaperworkBlockReason } from "@/lib/onboarding-send-eligibility";
import type {
  CandidateQuestionnaireIntelligence,
  CandidateReadinessScore,
  CandidateResumeIntelligence,
} from "@/lib/candidate-readiness/types";
import type { CandidateFunnelAutomation } from "@/lib/hiring-funnel-automation/types";
import { useEffect, useState } from "react";

export type CandidateDrawerRow = {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  appliedDate: string;
  positionName: string;
  city: string;
  state: string;
  workflowStatus: CandidateWorkflowStatus;
  lastActionAt: string | null;
  nextActionNeeded: string;
  assignedRecruiter: string;
  assignedDM: string;
  notes: string[];
  history: Array<{ id: string; type: string; message: string; createdAt: string }>;
  overallCandidateScore: number | null;
  aiRecommendation: string;
  aiGrade: AiLetterGrade;
  aiNumericScore: number;
  aiRecommendations: WorkflowRecommendation[];
  aiBreakdown: CandidateAiScoreBreakdown;
  resumeKeywordScore: number | null;
  merchandisingExperienceScore: number | null;
  retailExperienceScore: number | null;
  travelFitScore: number | null;
  strengths: string[];
  concerns: string[];
  suggestedProjects: string[];
  bestFit: boolean;
  bestFitReason?: string;
  tierLabel: string;
  extractedKeywords: string[];
  recommendedNextAction: string;
  recruitingActions: CandidateRecruitingActions;
  followUpDueAt: string | null;
  snoozedUntil: string | null;
  suggestedDM: string;
  dmNeedsAssignment: boolean;
  signatureRequestId: string | null;
  paperworkTemplateKey: string | null;
  paperworkSentAt: string | null;
  paperworkSignedAt: string | null;
  paperworkStatus: PaperworkStatus;
  paperworkError: string | null;
  directDepositStatus: import("@/lib/direct-deposit-types").DirectDepositStatus;
  directDepositRequestedAt: string | null;
  directDepositLastReminderAt: string | null;
  directDepositNotes: string | null;
  directDepositTriggeredByUserId: string | null;
  directDepositLastDeliveryMode: "log" | "resend" | null;
  directDepositLastHrCopyIncluded: boolean | null;
  directDepositLastHrBccAddress: string | null;
  matchedOpportunities: CandidateOpportunityMatch[];
  melMatchingSummary: string;
  opportunityRepMatches: OpportunityBestRepMatches[];
  resumeIntelligence: CandidateResumeIntelligence;
  questionnaireIntelligence: CandidateQuestionnaireIntelligence;
  candidateGrade: CandidateReadinessScore;
  funnelAutomation: CandidateFunnelAutomation;
  recruiterAssignmentSource?: import("@/lib/candidate-workflow-types").RecruiterAssignmentSource | null;
  recruiterAssignmentReason?: string | null;
  recruiterAssignmentConfidence?: number | null;
  recruiterAssignedAt?: string | null;
  requiredAction?: string | null;
  actionType?: import("@/lib/candidate-workflow-types").RecruiterActionType | null;
  actionPriority?: import("@/lib/candidate-workflow-types").RecruiterActionPriority | null;
  actionReason?: string | null;
  actionDueDate?: string | null;
  actionConfidence?: number | null;
  actionGeneratedAt?: string | null;
};

type DrawerTab = "overview" | "workflow" | "notes" | "assignments" | "hellosign" | "ai";

type OnboardingTemplateOption = {
  key: OnboardingTemplateKey;
  label: string;
  configured: boolean;
};

type CandidateDetailDrawerProps = {
  candidate: CandidateDrawerRow | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (status: CandidateWorkflowStatus) => void;
  onSaveAssignments: (recruiter: string, dm: string) => void;
  onAddNote: (note: string) => void;
  statusAgingDays: number | null;
  appliedAgingDays: number | null;
  onRecruitingAction?: (type: RecruitingActionType) => void;
  rosters: RecruiterRosters;
  onRostersUpdated?: (rosters: RecruiterRosters) => void;
  loading?: boolean;
  melMatchesLoading?: boolean;
  repMatchesLoading?: boolean;
  onboardingConfigured?: boolean;
  templatesAvailable?: boolean;
  paperworkTemplates?: OnboardingTemplateOption[];
  paperworkSending?: boolean;
  onSendPaperwork?: (templateKey: OnboardingTemplateKey) => void;
  onRefreshPaperworkStatus?: () => void;
  actingRecruiter?: string;
  sendBlockReason?: SendPaperworkBlockReason | null;
  onFlagFollowUp?: () => void;
  onCompleteFollowUp?: () => void;
  onAssignActingRecruiter?: () => void;
  onDirectDepositAction?: (
    action: "resend" | "mark-received" | "mark-approved" | "set-notes",
    payload?: { notes?: string },
  ) => void | Promise<void>;
  directDepositBusy?: boolean;
};

const DRAWER_TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "workflow", label: "Workflow" },
  { id: "notes", label: "Notes" },
  { id: "assignments", label: "Assignments" },
  { id: "hellosign", label: "Paperwork" },
  { id: "ai", label: "AI" },
];

function candidateDisplayName(candidate: CandidateDrawerRow): string {
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();
  return name || candidate.email || "Unknown candidate";
}

function formatDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatAppliedDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function agingBadgeClass(days: number | null): string {
  if (days === null) return "bg-zinc-800/80 text-zinc-400 ring-zinc-600/40";
  if (days <= 3) return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/35";
  if (days <= 7) return "bg-amber-500/15 text-amber-200 ring-amber-500/35";
  return "bg-red-500/15 text-red-200 ring-red-500/35";
}

function AssignmentPanel({
  assignedRecruiter,
  assignedDM,
  rosters,
  onRostersUpdated,
  onSave,
}: {
  assignedRecruiter: string;
  assignedDM: string;
  rosters: RecruiterRosters;
  onRostersUpdated?: (rosters: RecruiterRosters) => void;
  onSave: (recruiter: string, dm: string) => void;
}) {
  const [recruiters, setRecruiters] = useState(rosters.recruiters);
  const [dms, setDms] = useState(rosters.dms);
  const [recruiter, setRecruiter] = useState(assignedRecruiter);
  const [dm, setDm] = useState(assignedDM);

  return (
    <div className="space-y-3">
      <label className="block text-[10px] text-zinc-500">
        Recruiter
        <select
          className="mt-0.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
          value={recruiter}
          onChange={(event) => setRecruiter(event.target.value)}
        >
          {recruiters.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[10px] text-zinc-500">
        DM
        <select
          className="mt-0.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
          value={dm}
          onChange={(event) => setDm(event.target.value)}
        >
          {dms.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Add recruiter to roster");
            if (!name?.trim()) return;
            void addRecruiterToRoster(name.trim())
              .then((next) => {
                setRecruiters(next.recruiters);
                onRostersUpdated?.(next);
              })
              .catch((err) => window.alert(err instanceof Error ? err.message : "Failed to save recruiter"));
            setRecruiter(name.trim());
          }}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          + Recruiter
        </button>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Add DM to roster");
            if (!name?.trim()) return;
            void addDmToRoster(name.trim())
              .then((next) => {
                setDms(next.dms);
                onRostersUpdated?.(next);
              })
              .catch((err) => window.alert(err instanceof Error ? err.message : "Failed to save DM"));
            setDm(name.trim());
          }}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          + DM
        </button>
        <button
          type="button"
          onClick={() => onSave(recruiter.trim() || "Unassigned", dm.trim() || "Unassigned")}
          className="rounded-md border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-200 hover:bg-teal-500/20"
        >
          Save assignments
        </button>
      </div>
    </div>
  );
}

function RecruitingActionsPanel({
  actions,
  onAction,
}: {
  actions: CandidateRecruitingActions;
  onAction: (type: RecruitingActionType) => void;
}) {
  const entries: Array<{ type: RecruitingActionType; active: boolean }> = [
    { type: "dm-review", active: actions.dmReview },
    { type: "recommend-interview", active: actions.recommendInterview },
    { type: "needs-follow-up", active: actions.needsFollowUp },
    { type: "priority-list", active: actions.priorityList },
    { type: "onboarding-packet", active: actions.onboardingPacketPrep },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map(({ type, active }) => {
        const meta = RECRUITING_ACTION_LABELS[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => onAction(type)}
            className={`rounded-lg border px-3 py-2 text-left text-xs transition-all duration-200 ${
              active
                ? "border-teal-500/40 bg-teal-500/15 text-teal-100 shadow-sm shadow-teal-950/20"
                : "border-zinc-700 bg-zinc-950/50 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
            }`}
          >
            <p className="font-medium">{meta.label}</p>
            <p className="mt-0.5 text-[10px] text-zinc-500">{meta.description}</p>
          </button>
        );
      })}
    </div>
  );
}

function NoteComposer({ onAddNote }: { onAddNote: (note: string) => void }) {
  const [noteDraft, setNoteDraft] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600"
          placeholder="Add a local note…"
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && noteDraft.trim()) {
              onAddNote(noteDraft.trim());
              setNoteDraft("");
            }
          }}
        />
        <button
          type="button"
          disabled={!noteDraft.trim()}
          onClick={() => {
            if (!noteDraft.trim()) return;
            onAddNote(noteDraft.trim());
            setNoteDraft("");
          }}
          className="shrink-0 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-200 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function drawerPrimaryToneClass(tone: CandidateRowPrimaryAction["tone"]): string {
  switch (tone) {
    case "teal":
      return "border-teal-600/50 bg-teal-600/15 text-teal-100 hover:bg-teal-600/25";
    case "amber":
      return "border-amber-600/45 bg-amber-600/12 text-amber-100 hover:bg-amber-600/22";
    case "sky":
      return "border-sky-600/45 bg-sky-600/12 text-sky-100 hover:bg-sky-600/22";
    case "cyan":
      return "border-cyan-600/45 bg-cyan-600/12 text-cyan-100 hover:bg-cyan-600/22";
    default:
      return "border-zinc-600 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800";
  }
}

function scoreTierFromNumeric(score: number): AiScoreTier {
  if (score >= 85) return "elite";
  if (score >= 70) return "strong";
  if (score >= 55) return "moderate";
  return "weak";
}

export function CandidateDetailDrawer({
  candidate,
  open,
  onClose,
  onStatusChange,
  onSaveAssignments,
  onAddNote,
  statusAgingDays,
  appliedAgingDays,
  onRecruitingAction,
  rosters,
  onRostersUpdated,
  loading = false,
  melMatchesLoading = false,
  repMatchesLoading = false,
  onboardingConfigured = false,
  templatesAvailable = false,
  paperworkTemplates = [],
  paperworkSending = false,
  onSendPaperwork,
  onRefreshPaperworkStatus,
  actingRecruiter = "Unassigned",
  sendBlockReason = null,
  onFlagFollowUp,
  onCompleteFollowUp,
  onAssignActingRecruiter,
  onDirectDepositAction,
  directDepositBusy = false,
}: CandidateDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>("workflow");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !candidate) return null;

  const drawerPrimary = resolveCandidateRowPrimaryAction({
    candidate,
    actingRecruiter,
    sendBlockReason,
    sendBusy: paperworkSending,
  });

  function runDrawerPrimary() {
    if (drawerPrimary.disabled) return;
    switch (drawerPrimary.kind) {
      case "send-packet":
        onSendPaperwork?.("onboarding_packet");
        setTab("hellosign");
        break;
      case "follow-up":
        onFlagFollowUp?.();
        break;
      case "follow-up-done":
        onCompleteFollowUp?.();
        break;
      case "assign-me":
        onAssignActingRecruiter?.();
        setTab("assignments");
        break;
      case "ready-for-mel":
        onStatusChange("Ready for MEL");
        setTab("workflow");
        break;
      case "review":
        setTab("overview");
        break;
      default:
        setTab("workflow");
    }
  }

  const configuredTemplates = paperworkTemplates.filter((t) => t.configured);

  const timeline = [...candidate.history].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const workflowEvents = timeline.filter((event) => event.type === "status");
  const assignmentEvents = timeline.filter((event) => event.type === "assignment");
  const noteEvents = timeline.filter((event) => event.type === "note");

  return (
    <>
      <button
        type="button"
        aria-label="Close candidate drawer"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-drawer-title"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <header className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Candidate detail</p>
              <h2 id="candidate-drawer-title" className="mt-0.5 text-lg font-semibold text-zinc-50">
                {candidateDisplayName(candidate)}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {candidate.positionName || "—"} · {candidate.city || "—"}, {candidate.state || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
          <nav className="mt-3 flex flex-wrap gap-1">
            {DRAWER_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                  tab === item.id
                    ? "bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30"
                    : "text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? <p className="mb-4 text-sm text-zinc-500">Loading candidate details…</p> : null}

          <section className="mb-4 rounded-xl border border-teal-500/20 bg-zinc-900/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-200/80">
              Operational workspace
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-400" title={candidate.nextActionNeeded}>
              {candidate.nextActionNeeded}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={drawerPrimary.disabled}
                title={drawerPrimary.title ?? drawerPrimary.label}
                onClick={runDrawerPrimary}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${drawerPrimaryToneClass(drawerPrimary.tone)}`}
              >
                {paperworkSending && drawerPrimary.kind === "send-packet" ? "Sending…" : drawerPrimary.label}
              </button>
              {onSendPaperwork && drawerPrimary.kind !== "send-packet" ? (
                <button
                  type="button"
                  disabled={paperworkSending || sendBlockReason !== null || !candidate.email?.trim()}
                  onClick={() => {
                    onSendPaperwork("onboarding_packet");
                    setTab("hellosign");
                  }}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  Send packet
                </button>
              ) : null}
              {onFlagFollowUp ? (
                <button
                  type="button"
                  disabled={candidate.recruitingActions.needsFollowUp}
                  onClick={onFlagFollowUp}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  Follow-up
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setTab("notes")}
                className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                Notes
              </button>
              <button
                type="button"
                onClick={() => setTab("hellosign")}
                className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                Paperwork
              </button>
            </div>
            {onRecruitingAction ? (
              <div className="mt-3 border-t border-zinc-800/80 pt-3">
                <RecruitingActionsPanel actions={candidate.recruitingActions} onAction={onRecruitingAction} />
              </div>
            ) : null}
          </section>

          {tab === "overview" || tab === "ai" ? (
          <section className="mb-5 space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-3xl font-semibold tabular-nums text-teal-200">{candidate.aiNumericScore}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${AI_SCORE_TIER_STYLES[scoreTierFromNumeric(candidate.aiNumericScore)]}`}
              >
                {candidate.tierLabel}
              </span>
              {candidate.bestFit ? (
                <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-teal-200">
                  Best fit
                </span>
              ) : null}
            </div>

            <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
              <p>
                <span className="text-zinc-500">Email:</span> {candidate.email || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Phone:</span> {candidate.phone || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Source:</span> {candidate.source || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Position:</span> {candidate.positionName || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Location:</span> {candidate.city || "—"}, {candidate.state || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Applied:</span> {formatAppliedDate(candidate.appliedDate)}
              </p>
              <p>
                <span className="text-zinc-500">Stage:</span> {candidate.stage || "—"}
              </p>
            </div>

            <div className="rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-200/80">
                Recommended next action
              </p>
              <p className="mt-1 text-sm text-teal-100">{candidate.recommendedNextAction}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Strengths</p>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">
                  {candidate.strengths.map((item) => (
                    <li key={item}>+ {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Concerns</p>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
                  {candidate.concerns.length > 0 ? (
                    candidate.concerns.map((item) => <li key={item}>− {item}</li>)
                  ) : (
                    <li className="text-zinc-600">None flagged</li>
                  )}
                </ul>
              </div>
            </div>

            {candidate.suggestedProjects.length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Best-fit project types
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {candidate.suggestedProjects.map((project) => (
                    <span
                      key={project}
                      className="rounded-md border border-zinc-700/80 bg-zinc-950 px-2 py-0.5 text-[10px] text-zinc-300"
                    >
                      {project}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <MatchedOpportunitiesSection
              matches={candidate.matchedOpportunities}
              aiSummary={candidate.melMatchingSummary}
              loading={melMatchesLoading}
            />
            <BestRepMatchSection
              opportunityMatches={candidate.opportunityRepMatches}
              loading={repMatchesLoading}
            />
          </section>
          ) : null}

          {tab === "overview" ? (
            <div className="space-y-3 text-xs text-zinc-400">
              <p>
                <span className="text-zinc-500">Email:</span> {candidate.email || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Phone:</span> {candidate.phone || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Source / stage:</span> {candidate.source || "—"} · {candidate.stage || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Applied:</span> {formatAppliedDate(candidate.appliedDate)}
              </p>
              <p>
                <span className="text-zinc-500">Workflow:</span> {candidate.workflowStatus}
              </p>
              <p>
                <span className="text-zinc-500">Next action:</span> {candidate.nextActionNeeded}
              </p>
              <p>
                <span className="text-zinc-500">Recruiter / DM:</span> {candidate.assignedRecruiter} · {candidate.assignedDM}
              </p>
              {candidate.suggestedDM && candidate.suggestedDM !== "Unassigned" ? (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-zinc-500">Territory DM:</span>
                  <span
                    className={
                      candidate.dmNeedsAssignment
                        ? "inline-flex rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-100"
                        : "inline-flex rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-300"
                    }
                  >
                    {candidate.suggestedDM}
                    {candidate.dmNeedsAssignment ? " · assign suggested" : " · matched"}
                  </span>
                </p>
              ) : null}
              {candidate.followUpDueAt ? (
                <p className="text-zinc-400">
                  <span className="text-zinc-500">Follow-up due:</span> {formatAppliedDate(candidate.followUpDueAt)}
                </p>
              ) : null}
              {candidate.snoozedUntil ? (
                <p className="text-zinc-400">
                  <span className="text-zinc-500">Snoozed until:</span> {formatAppliedDate(candidate.snoozedUntil)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${agingBadgeClass(statusAgingDays)}`}>
                  Status {statusAgingDays === null ? "—" : `${statusAgingDays}d`}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${agingBadgeClass(appliedAgingDays)}`}>
                  Applied {appliedAgingDays === null ? "—" : `${appliedAgingDays}d`}
                </span>
              </div>
            </div>
          ) : null}

          {tab === "workflow" ? (
            <div className="space-y-3">
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                value={candidate.workflowStatus}
                onChange={(event) => onStatusChange(event.target.value as CandidateWorkflowStatus)}
              >
                {CANDIDATE_WORKFLOW_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              {workflowEvents.length === 0 ? (
                <p className="text-xs text-zinc-600">No workflow status changes yet.</p>
              ) : (
                <ol className="space-y-2">
                  {workflowEvents.map((event) => (
                    <li key={event.id} className="border-l-2 border-zinc-700 pl-2">
                      <p className="text-xs text-zinc-200">{event.message}</p>
                      <p className="text-[10px] text-zinc-600">{formatDate(event.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {tab === "notes" ? (
            <div className="space-y-3">
              <NoteComposer key={candidate.candidateId} onAddNote={onAddNote} />
              {candidate.notes.length === 0 && noteEvents.length === 0 ? (
                <p className="text-xs text-zinc-600">No notes yet.</p>
              ) : (
                <ol className="space-y-2">
                  {noteEvents.map((event) => (
                    <li key={event.id} className="rounded bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
                      {event.message}
                      <p className="text-[10px] text-zinc-600">{formatDate(event.createdAt)}</p>
                    </li>
                  ))}
                  {[...candidate.notes].reverse().map((note, index) => (
                    <li
                      key={`${candidate.candidateId}-stored-note-${index}`}
                      className="rounded bg-zinc-950/60 px-2 py-1 text-xs text-zinc-300"
                    >
                      {note}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {tab === "assignments" ? (
            <div className="space-y-4">
              <AssignmentPanel
                key={`${candidate.candidateId}-${candidate.assignedRecruiter}-${candidate.assignedDM}`}
                assignedRecruiter={candidate.assignedRecruiter}
                assignedDM={candidate.assignedDM}
                rosters={rosters}
                onRostersUpdated={onRostersUpdated}
                onSave={onSaveAssignments}
              />
              {assignmentEvents.length === 0 ? (
                <p className="text-xs text-zinc-600">No assignment changes yet.</p>
              ) : (
                <ol className="space-y-2">
                  {assignmentEvents.map((event) => (
                    <li key={event.id} className="border-l-2 border-zinc-700 pl-2">
                      <p className="text-xs text-zinc-200">{event.message}</p>
                      <p className="text-[10px] text-zinc-600">{formatDate(event.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {tab === "hellosign" ? (
            <div className="space-y-2 text-xs">
              <p className="text-zinc-300">
                Dropbox Sign · {onboardingConfigured ? "configured" : "not configured"}
              </p>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <dt className="text-zinc-500">Paperwork status</dt>
                <dd className="text-zinc-200">{paperworkStatusLabel(candidate.paperworkStatus)}</dd>
                {candidate.paperworkTemplateKey ? (
                  <>
                    <dt className="text-zinc-500">Template</dt>
                    <dd className="text-zinc-200">{candidate.paperworkTemplateKey}</dd>
                  </>
                ) : null}
                {candidate.signatureRequestId ? (
                  <>
                    <dt className="text-zinc-500">Request ID</dt>
                    <dd className="truncate text-zinc-400" title={candidate.signatureRequestId}>
                      {candidate.signatureRequestId}
                    </dd>
                  </>
                ) : null}
                {candidate.paperworkSentAt ? (
                  <>
                    <dt className="text-zinc-500">Sent</dt>
                    <dd className="text-zinc-400">{formatDate(candidate.paperworkSentAt)}</dd>
                  </>
                ) : null}
                {candidate.paperworkSignedAt ? (
                  <>
                    <dt className="text-zinc-500">Signed</dt>
                    <dd className="text-zinc-400">{formatDate(candidate.paperworkSignedAt)}</dd>
                  </>
                ) : null}
              </dl>
              {candidate.paperworkError ? (
                <p className="text-amber-300/90">{candidate.paperworkError}</p>
              ) : null}
              <div className="flex flex-wrap gap-1 border-t border-zinc-800 pt-2">
                {configuredTemplates.length > 0 ? (
                  configuredTemplates.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      disabled={!onboardingConfigured || paperworkSending || !candidate.email?.trim()}
                      onClick={() => onSendPaperwork?.(template.key)}
                      className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-800 disabled:text-zinc-600"
                    >
                      {paperworkSending ? "Sending…" : `Send ${template.label}`}
                    </button>
                  ))
                ) : (
                  <p className="text-[10px] text-zinc-500">No onboarding templates configured</p>
                )}
                {candidate.signatureRequestId ? (
                  <button
                    type="button"
                    onClick={() => onRefreshPaperworkStatus?.()}
                    className="rounded border border-teal-500/40 px-2 py-0.5 text-[10px] text-teal-200 hover:bg-teal-500/10"
                  >
                    Refresh status
                  </button>
                ) : null}
              </div>
              <p className="text-[10px] text-zinc-600">
                {templatesAvailable
                  ? onboardingConfigured
                    ? "Template-based email signature requests only. No embedded signing. Local workflow status does not write to Breezy."
                    : "Templates loaded from .env.local — add DROPBOX_SIGN_API_KEY to send."
                  : "Set DROPBOX_SIGN_TEMPLATE_* variables in .env.local and restart the dev server."}
              </p>
              {onDirectDepositAction ? (
                <CandidatePayrollOnboardingPanel
                  key={`${candidate.candidateId}-${candidate.directDepositStatus}`}
                  paperworkStatus={candidate.paperworkStatus}
                  directDepositStatus={candidate.directDepositStatus}
                  directDepositRequestedAt={candidate.directDepositRequestedAt}
                  directDepositLastReminderAt={candidate.directDepositLastReminderAt}
                  directDepositNotes={candidate.directDepositNotes}
                  directDepositTriggeredByUserId={candidate.directDepositTriggeredByUserId}
                  directDepositLastDeliveryMode={candidate.directDepositLastDeliveryMode}
                  directDepositLastHrCopyIncluded={candidate.directDepositLastHrCopyIncluded}
                  directDepositLastHrBccAddress={candidate.directDepositLastHrBccAddress}
                  hasCandidateEmail={Boolean(candidate.email?.trim())}
                  busy={directDepositBusy}
                  onAction={onDirectDepositAction}
                />
              ) : null}
              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Integration prep</p>
                {buildIntegrationPrep(candidate, candidate.workflowStatus).map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border px-2 py-1.5 ${
                      item.ready
                        ? "border-teal-500/30 bg-teal-500/5 text-teal-200"
                        : "border-zinc-700 bg-zinc-950/40 text-zinc-400"
                    }`}
                  >
                    <p className="font-medium text-zinc-200">{item.label}</p>
                    <p className="mt-0.5 text-zinc-500">{item.statusLabel}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">{item.message}</p>
                    {item.missingFields.length > 0 ? (
                      <p className="mt-1 text-[10px] text-amber-300/90">Missing: {item.missingFields.join(", ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "ai" ? (
            <div className="space-y-4 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-sm font-semibold ${AI_GRADE_STYLES[candidate.aiGrade]}`}
                >
                  {candidate.aiGrade}
                </span>
                <span className="text-zinc-400 tabular-nums">{candidate.aiNumericScore}/100</span>
              </div>
              {candidate.aiRecommendations.length > 0 ? (
                <ul className="flex flex-wrap gap-1">
                  {candidate.aiRecommendations.map((item) => (
                    <li
                      key={item}
                      className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300 ring-1 ring-zinc-700"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <dt className="text-zinc-500">Merchandising keywords</dt>
                <dd className="tabular-nums text-zinc-200">{candidate.aiBreakdown.merchandisingKeywords}</dd>
                <dt className="text-zinc-500">Reset experience</dt>
                <dd className="tabular-nums text-zinc-200">{candidate.aiBreakdown.resetExperience}</dd>
                <dt className="text-zinc-500">Walmart / Target</dt>
                <dd className="tabular-nums text-zinc-200">{candidate.aiBreakdown.walmartTargetExperience}</dd>
                <dt className="text-zinc-500">Travel willingness</dt>
                <dd className="tabular-nums text-zinc-200">{candidate.aiBreakdown.travelWillingness}</dd>
                <dt className="text-zinc-500">Resume / source quality</dt>
                <dd className="tabular-nums text-zinc-200">{candidate.aiBreakdown.resumeSourceQuality}</dd>
                <dt className="text-zinc-500">Years of experience</dt>
                <dd className="tabular-nums text-zinc-200">{candidate.aiBreakdown.yearsOfExperience}</dd>
                <dt className="text-zinc-500">Stage progression</dt>
                <dd className="tabular-nums text-zinc-200">{candidate.aiBreakdown.stageProgression}</dd>
                <dt className="text-zinc-500">Breezy score boost</dt>
                <dd className="tabular-nums text-zinc-200">{candidate.aiBreakdown.breezyScoreBoost}</dd>
                <dt className="col-span-2 text-zinc-500">Summary</dt>
                <dd className="col-span-2 text-zinc-400">{candidate.aiRecommendation}</dd>
              </dl>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-600">
          Local workflow only — Dropbox Sign sends paperwork; no writes to Breezy or MEL.
        </footer>
      </aside>
    </>
  );
}
