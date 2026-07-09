import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function hrDataDir(): string {
  const override = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR?.trim();
  return override ? path.resolve(override) : recruitingDataDir();
}

export type HrPaperworkNoticeType = "paperwork_viewed" | "paperwork_signed";

export type HrPaperworkNotice = {
  id: string;
  type: HrPaperworkNoticeType;
  candidateId: string;
  signatureRequestId: string | null;
  assignedRecruiter: string;
  assignedDM: string;
  createdAt: string;
  summary: string;
};

export async function appendHrPaperworkNotice(input: {
  type: HrPaperworkNoticeType;
  workflow: CandidateWorkflowRecord;
  signatureRequestId?: string | null;
}): Promise<HrPaperworkNotice> {
  const createdAt = new Date().toISOString();
  const signatureRequestId =
    input.signatureRequestId ?? input.workflow.signatureRequestId ?? null;
  const summary =
    input.type === "paperwork_signed"
      ? `Candidate ${input.workflow.candidateId} signed onboarding paperwork.`
      : `Candidate ${input.workflow.candidateId} viewed onboarding paperwork.`;

  const notice: HrPaperworkNotice = {
    id: randomUUID(),
    type: input.type,
    candidateId: input.workflow.candidateId,
    signatureRequestId,
    assignedRecruiter: input.workflow.assignedRecruiter,
    assignedDM: input.workflow.assignedDM,
    createdAt,
    summary,
  };

  const storeDir = hrDataDir();
  const noticesPath = path.join(storeDir, "hr-paperwork-notices.jsonl");
  await mkdir(storeDir, { recursive: true });
  await appendFile(noticesPath, `${JSON.stringify(notice)}\n`, "utf8");
  return notice;
}

/** Optional DM notification hook — logs only until messaging integration exists. */
export function notifyDmPaperworkSignedHook(workflow: CandidateWorkflowRecord): void {
  if (process.env.DROPBOX_SIGN_DM_NOTIFY_ENABLED?.trim().toLowerCase() !== "true") {
    return;
  }
  console.info("[dm-notify-hook] paperwork_signed", {
    candidateId: workflow.candidateId,
    assignedDM: workflow.assignedDM,
    assignedRecruiter: workflow.assignedRecruiter,
    signatureRequestId: workflow.signatureRequestId ? "[redacted]" : null,
  });
}
