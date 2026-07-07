import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

export function p1547RunnerAuditPath(): string {
  return path.join(recruitingDataDir(), "p154-continuous-autonomous-recruiting-runner-audit.jsonl");
}

export async function appendP1547RunnerAudit(entry: Record<string, unknown>): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await appendFile(p1547RunnerAuditPath(), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
}
