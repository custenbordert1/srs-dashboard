import { readFile } from "node:fs/promises";
import path from "node:path";
import type { P223ProfileHydration } from "@/lib/p223-recruiter-inbox-restoration/union";

function dataPath(...parts: string[]): string {
  return path.join(process.cwd(), ".data", ...parts);
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function mergeProfile(
  into: P223ProfileHydration,
  patch: Partial<P223ProfileHydration>,
): P223ProfileHydration {
  return {
    candidateId: into.candidateId,
    firstName: into.firstName || patch.firstName,
    lastName: into.lastName || patch.lastName,
    email: into.email || patch.email,
    phone: into.phone || patch.phone,
    positionId: into.positionId || patch.positionId,
    positionName: into.positionName || patch.positionName,
    city: into.city || patch.city,
    state: into.state || patch.state,
    zipCode: into.zipCode || patch.zipCode,
    appliedDate: into.appliedDate || patch.appliedDate,
  };
}

/**
 * Read-only profile hydration for workflow-restored Inbox rows.
 * Never writes. Uses durable operator / questionnaire / zip ledgers when present.
 */
export async function loadP223ProfilesForWorkflowIds(
  candidateIds: string[],
): Promise<Record<string, P223ProfileHydration>> {
  const profiles: Record<string, P223ProfileHydration> = {};
  for (const candidateId of candidateIds) {
    profiles[candidateId] = { candidateId };
  }
  if (candidateIds.length === 0) return profiles;

  const idSet = new Set(candidateIds);

  const questionnaire = await readJsonSafe<{
    records?: Record<
      string,
      {
        candidateId?: string;
        positionId?: string;
        completedAt?: string;
        flatAnswers?: Record<string, unknown>;
        mappedQualificationFields?: Record<string, unknown>;
      }
    >;
  }>(dataPath("p193-3-questionnaire-store.json"));

  for (const candidateId of candidateIds) {
    const row = questionnaire?.records?.[candidateId];
    if (!row) continue;
    const flat = row.flatAnswers ?? {};
    const mapped = row.mappedQualificationFields ?? {};
    const pick = (...keys: string[]): string => {
      for (const key of keys) {
        const value = flat[key] ?? mapped[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
      return "";
    };
    profiles[candidateId] = mergeProfile(profiles[candidateId]!, {
      positionId: typeof row.positionId === "string" ? row.positionId : undefined,
      appliedDate: typeof row.completedAt === "string" ? row.completedAt : undefined,
      email: pick("email", "Email", "candidate_email"),
      phone: pick("phone", "Phone", "mobile"),
      city: pick("city", "City"),
      state: pick("state", "State"),
      zipCode: pick("zip", "zipCode", "Zip", "postal_code"),
      firstName: pick("firstName", "first_name", "First Name"),
      lastName: pick("lastName", "last_name", "Last Name"),
    });
  }

  const p216 = await readJsonSafe<{
    targets?: Array<{
      candidateId: string;
      enrich?: {
        name?: string;
        email?: string;
        city?: string;
        state?: string;
        zip?: string;
        positionId?: string;
      };
    }>;
  }>(dataPath("p216-position-authority-operator-local.json"));

  for (const target of p216?.targets ?? []) {
    if (!idSet.has(target.candidateId)) continue;
    const enrich = target.enrich ?? {};
    const name = String(enrich.name ?? "").trim();
    const parts = name ? name.split(/\s+/) : [];
    profiles[target.candidateId] = mergeProfile(profiles[target.candidateId]!, {
      firstName: parts[0],
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
      email: enrich.email,
      city: enrich.city,
      state: enrich.state,
      zipCode: enrich.zip,
      positionId: enrich.positionId,
    });
  }

  // P226 — authoritative recovery identity (preferred over stub Unknown Candidate).
  const p226 = await readJsonSafe<{
    records?: Record<
      string,
      {
        candidateId?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        city?: string;
        state?: string;
        positionId?: string;
      }
    >;
  }>(dataPath("p226-candidate-recovery-store.json"));

  for (const candidateId of candidateIds) {
    const row = p226?.records?.[candidateId];
    if (!row) continue;
    profiles[candidateId] = {
      ...profiles[candidateId]!,
      firstName: row.firstName?.trim() || profiles[candidateId]!.firstName,
      lastName: row.lastName?.trim() || profiles[candidateId]!.lastName,
      email: row.email?.trim() || profiles[candidateId]!.email,
      city: row.city?.trim() || profiles[candidateId]!.city,
      state: row.state?.trim() || profiles[candidateId]!.state,
      positionId: row.positionId?.trim() || profiles[candidateId]!.positionId,
    };
  }

  return profiles;
}
