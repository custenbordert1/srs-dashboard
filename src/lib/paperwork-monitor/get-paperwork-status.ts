import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { findActiveOnboardingRecord } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadMonitorState, monitorAuditPath } from "@/lib/paperwork-monitor/monitor-store";
import { evaluateReminders } from "@/lib/paperwork-monitor/reminder-engine";
import { P107_LIVE_CANDIDATE_NAMES } from "@/lib/paperwork-monitor/live-candidate-registry";
import type { PaperworkStatusDetail } from "@/lib/paperwork-monitor/types";
import { readFile } from "node:fs/promises";

export async function getPaperworkStatusForCandidate(
  candidateId: string,
): Promise<PaperworkStatusDetail | null> {
  const [bundle, store, state, onboarding] = await Promise.all([
    getCandidateWorkflowBundle(),
    readIngestionStore(),
    loadMonitorState(),
    findActiveOnboardingRecord(candidateId),
  ]);

  const workflow = bundle.workflows[candidateId];
  if (!workflow) return null;

  const ingested = store.candidates[candidateId];
  const ingestedName = ingested
    ? `${ingested.firstName ?? ""} ${ingested.lastName ?? ""}`.trim()
    : "";
  const candidateName =
    ingestedName ||
    P107_LIVE_CANDIDATE_NAMES[candidateId as keyof typeof P107_LIVE_CANDIDATE_NAMES] ||
    candidateId;

  const tracking = state.candidateTracking[candidateId] ?? null;

  const reminderEligible = tracking
    ? {
        text: evaluateReminders({ tracking, nowMs: Date.now() + 31 * 60 * 1000 })?.channel === "sms",
        email: evaluateReminders({ tracking, nowMs: Date.now() + 25 * 60 * 60 * 1000 })?.channel === "email",
        recruiter:
          evaluateReminders({ tracking, nowMs: Date.now() + 49 * 60 * 60 * 1000 })?.channel === "recruiter",
        needsAttention:
          evaluateReminders({ tracking, nowMs: Date.now() + 73 * 60 * 60 * 1000 })?.channel ===
          "needs_attention",
      }
    : { text: false, email: false, recruiter: false, needsAttention: false };

  let auditSnippet: string[] = [];
  try {
    const raw = await readFile(monitorAuditPath(), "utf8");
    auditSnippet = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as { candidateId?: string; action?: string; at?: string };
        } catch {
          return null;
        }
      })
      .filter((e): e is { candidateId?: string; action?: string; at?: string } => e?.candidateId === candidateId)
      .slice(-5)
      .map((e) => `${e.at ?? ""}: ${e.action ?? "event"}`);
  } catch {
    auditSnippet = [];
  }

  return {
    candidateId,
    candidateName,
    signatureRequestId: workflow.signatureRequestId,
    dropboxStatus: tracking?.lastDropboxStatus ?? null,
    tracking,
    workflowStatus: workflow.workflowStatus,
    onboardingStatus: onboarding?.status ?? null,
    paperworkStatus: workflow.paperworkStatus,
    viewedAt: workflow.paperworkViewedAt ?? tracking?.viewedAt ?? null,
    signedAt: workflow.paperworkSignedAt ?? tracking?.signedAt ?? null,
    reminderEligible,
    auditSnippet,
  };
}
