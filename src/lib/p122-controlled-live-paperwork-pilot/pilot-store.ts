import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { PilotSendRegistry, PilotSendResult } from "@/lib/p122-controlled-live-paperwork-pilot/types";

export function p122PilotRegistryPath(): string {
  return path.join(recruitingDataDir(), "p122-controlled-live-paperwork-pilot-registry.json");
}

export function p122PilotArtifactPath(): string {
  return path.join(process.cwd(), "artifacts", "p122-controlled-live-paperwork-pilot.json");
}

export async function loadPilotSendRegistry(): Promise<PilotSendRegistry> {
  try {
    const raw = await readFile(p122PilotRegistryPath(), "utf8");
    return JSON.parse(raw) as PilotSendRegistry;
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      sendCount: 0,
      sends: [],
      lastSendResult: null,
    };
  }
}

export async function savePilotSendRegistry(registry: PilotSendRegistry): Promise<void> {
  const dir = recruitingDataDir();
  await mkdir(dir, { recursive: true });
  await writeFile(p122PilotRegistryPath(), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export async function recordPilotSend(input: {
  candidateId: string;
  candidateName: string;
  signatureRequestId: string | null;
  auditEntryId: string | null;
  sendResult: PilotSendResult;
}): Promise<PilotSendRegistry> {
  const registry = await loadPilotSendRegistry();
  const sentAt = input.sendResult.executedAt;
  registry.sends.push({
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    sentAt,
    signatureRequestId: input.signatureRequestId,
    auditEntryId: input.auditEntryId,
  });
  registry.sendCount = registry.sends.length;
  registry.lastSendResult = input.sendResult;
  registry.updatedAt = sentAt;
  await savePilotSendRegistry(registry);
  return registry;
}
