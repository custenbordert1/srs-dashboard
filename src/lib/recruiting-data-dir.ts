import { mkdir } from "node:fs/promises";
import {
  canWriteRecruitingFilesystem,
  isUnsafeDataDir,
  resolveRecruitingDataDir,
} from "@/lib/runtime-storage";

export {
  canWriteRecruitingFilesystem,
  isServerlessRuntime,
  isUnsafeDataDir,
  useInMemoryPersistence,
} from "@/lib/runtime-storage";

export function recruitingDataDir(): string {
  return resolveRecruitingDataDir();
}

/** Creates the recruiting data directory when filesystem persistence is enabled. */
export async function ensureRecruitingDataDir(target?: string): Promise<void> {
  if (!canWriteRecruitingFilesystem()) return;
  const dir = target ?? recruitingDataDir();
  if (isUnsafeDataDir(dir)) return;
  await mkdir(dir, { recursive: true });
}

/** Preferred mkdir for JSON stores — skips serverless in-memory mode and /var/task. */
export async function safeRecruitingMkdir(target?: string): Promise<void> {
  await ensureRecruitingDataDir(target);
}
