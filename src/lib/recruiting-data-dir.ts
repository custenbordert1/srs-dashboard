import { mkdir } from "node:fs/promises";
import {
  canWriteRecruitingFilesystem,
  resolveRecruitingDataDir,
} from "@/lib/runtime-storage";

export { canWriteRecruitingFilesystem, useInMemoryPersistence } from "@/lib/runtime-storage";

export function recruitingDataDir(): string {
  return resolveRecruitingDataDir();
}

/** Creates the recruiting data directory when filesystem persistence is enabled. */
export async function ensureRecruitingDataDir(): Promise<void> {
  if (!canWriteRecruitingFilesystem()) return;
  await mkdir(recruitingDataDir(), { recursive: true });
}
