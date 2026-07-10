import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type {
  LiveSendReadinessApproval,
  LiveSendReadinessApprovalFile,
} from "@/lib/live-send-readiness/types";

function dataDir(): string {
  return recruitingDataDir();
}

export function p99ApprovalPath(): string {
  return path.join(dataDir(), "p99-live-send-readiness-approval.json");
}

async function ensureDataDir(): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
}

export async function loadLiveSendReadinessApproval(): Promise<LiveSendReadinessApprovalFile> {
  try {
    const raw = await readFile(p99ApprovalPath(), "utf8");
    return JSON.parse(raw) as LiveSendReadinessApprovalFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), approval: null };
  }
}

export async function saveLiveSendReadinessApproval(
  approval: LiveSendReadinessApproval,
): Promise<LiveSendReadinessApprovalFile> {
  const file: LiveSendReadinessApprovalFile = {
    version: 1,
    updatedAt: approval.approvedAt,
    approval,
  };
  await ensureDataDir();
  await writeFile(p99ApprovalPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return file;
}
