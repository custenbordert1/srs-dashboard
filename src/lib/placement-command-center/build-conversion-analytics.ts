import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { isHiredStage } from "@/lib/dm-dashboard/territory-shared";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { ConversionSegmentRow } from "@/lib/placement-command-center/types";

type StageFlags = {
  applied: boolean;
  contacted: boolean;
  paperwork: boolean;
  signed: boolean;
  mel: boolean;
  placed: boolean;
};

function stageFlags(
  candidate: BreezyCandidate,
  workflows: CandidateWorkflowState | null,
): StageFlags {
  const row = buildBaselineWorkflowRow(candidate, workflows?.[candidate.candidateId]);
  const contacted = Boolean(row.lastActionAt) || row.history.length > 0;
  const paperwork =
    isPaperworkPendingStatus(row.workflowStatus) ||
    row.workflowStatus === "Signed" ||
    isMelReadyStatus(row.workflowStatus) ||
    row.workflowStatus === "Loaded in MEL" ||
    row.workflowStatus === "Active Rep";
  const signed =
    row.workflowStatus === "Signed" ||
    row.paperworkStatus === "signed" ||
    isMelReadyStatus(row.workflowStatus) ||
    row.workflowStatus === "Loaded in MEL" ||
    row.workflowStatus === "Active Rep";
  const mel =
    isMelReadyStatus(row.workflowStatus) ||
    row.workflowStatus === "Loaded in MEL" ||
    row.workflowStatus === "Active Rep";
  const placed =
    row.workflowStatus === "Loaded in MEL" ||
    row.workflowStatus === "Active Rep" ||
    isHiredStage(candidate.stage);

  return {
    applied: true,
    contacted,
    paperwork,
    signed,
    mel,
    placed,
  };
}

function conversionRate(reached: number, from: number): number | null {
  if (from <= 0) return null;
  return Math.round((reached / from) * 100);
}

function buildSegment(
  segmentKey: string,
  segmentLabel: string,
  candidates: BreezyCandidate[],
  workflows: CandidateWorkflowState | null,
): ConversionSegmentRow {
  const flags = candidates.map((candidate) => stageFlags(candidate, workflows));
  const applied = flags.length;
  const contacted = flags.filter((row) => row.contacted).length;
  const paperwork = flags.filter((row) => row.paperwork).length;
  const signed = flags.filter((row) => row.signed).length;
  const mel = flags.filter((row) => row.mel).length;
  const placed = flags.filter((row) => row.placed).length;

  return {
    segmentKey,
    segmentLabel,
    applicationToContact: conversionRate(contacted, applied),
    contactToPaperwork: conversionRate(paperwork, contacted),
    paperworkToSigned: conversionRate(signed, paperwork),
    signedToMel: conversionRate(mel, signed),
    melToFirstProject: conversionRate(placed, mel),
  };
}

export function buildConversionByRecruiter(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
}): ConversionSegmentRow[] {
  const groups = new Map<string, BreezyCandidate[]>();
  for (const candidate of input.candidates) {
    const row = buildBaselineWorkflowRow(candidate, input.workflows?.[candidate.candidateId]);
    const recruiter = row.assignedRecruiter?.trim() || "Unassigned";
    const list = groups.get(recruiter) ?? [];
    list.push(candidate);
    groups.set(recruiter, list);
  }

  return [...groups.entries()]
    .map(([recruiterName, rows]) => buildSegment(recruiterName, recruiterName, rows, input.workflows))
    .sort((a, b) => (b.applicationToContact ?? 0) - (a.applicationToContact ?? 0))
    .slice(0, 20);
}

export function buildConversionByDm(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
}): ConversionSegmentRow[] {
  const groups = new Map<string, BreezyCandidate[]>();
  for (const candidate of input.candidates) {
    const row = buildBaselineWorkflowRow(candidate, input.workflows?.[candidate.candidateId]);
    const dm = row.assignedDM?.trim() || "Unassigned";
    const list = groups.get(dm) ?? [];
    list.push(candidate);
    groups.set(dm, list);
  }

  return [...groups.entries()]
    .map(([dmName, rows]) => buildSegment(dmName, dmName, rows, input.workflows))
    .sort((a, b) => (b.signedToMel ?? 0) - (a.signedToMel ?? 0))
    .slice(0, 15);
}

export function buildConversionByProject(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
}): ConversionSegmentRow[] {
  const groups = new Map<string, BreezyCandidate[]>();
  for (const candidate of input.candidates) {
    const project = candidate.positionName?.trim() || "Unknown project";
    const list = groups.get(project) ?? [];
    list.push(candidate);
    groups.set(project, list);
  }

  return [...groups.entries()]
    .map(([project, rows]) => buildSegment(project, project, rows, input.workflows))
    .sort((a, b) => b.segmentLabel.localeCompare(a.segmentLabel))
    .slice(0, 20);
}

export function buildConversionByState(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
}): ConversionSegmentRow[] {
  const groups = new Map<string, BreezyCandidate[]>();
  for (const candidate of input.candidates) {
    const state = normalizeStateCode(candidate.state) || "—";
    const list = groups.get(state) ?? [];
    list.push(candidate);
    groups.set(state, list);
  }

  return [...groups.entries()]
    .map(([state, rows]) => buildSegment(state, state, rows, input.workflows))
    .sort((a, b) => (b.applicationToContact ?? 0) - (a.applicationToContact ?? 0))
    .slice(0, 20);
}
