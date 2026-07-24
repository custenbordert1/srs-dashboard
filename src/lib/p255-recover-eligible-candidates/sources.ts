import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { hasUsablePhone } from "@/lib/p228-production-readiness/eligibility";
import type { P254CandidateForensic, P254MissionResult } from "@/lib/p254-eligibility-forensics/types";
import type { P255FieldSource } from "@/lib/p255-recover-eligible-candidates/types";

export type P255LocalIdentity = {
  candidateId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  positionId: string;
  positionName: string;
  phoneSource: P255FieldSource;
  locationSource: P255FieldSource;
  identitySource: P255FieldSource;
};

type P226Record = {
  candidateId?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  city?: string;
  state?: string;
  positionId?: string;
};

type P193PhoneRow = {
  candidateId?: string;
  name?: string;
  email?: string;
  phone?: string;
};

type P185ReviewRow = {
  candidateId?: string;
  candidateName?: string;
  candidateEmail?: string;
  jobTitle?: string;
  jobCityState?: string;
  originalJobId?: string;
  resolvedJobId?: string;
};

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function parseCityState(raw: string): { city: string; state: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { city: "", state: "" };
  const m = text.match(/^(.+),\s*([A-Za-z]{2})\s*$/);
  if (m) return { city: m[1]!.trim(), state: m[2]!.trim().toUpperCase() };
  return { city: text, state: "" };
}

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function walkCollect<T extends { candidateId?: string }>(
  node: unknown,
  out: Map<string, T>,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkCollect(item, out);
    return;
  }
  const rec = node as T;
  if (typeof rec.candidateId === "string" && rec.candidateId.trim()) {
    out.set(rec.candidateId, rec);
  }
  for (const value of Object.values(node)) walkCollect(value, out);
}

export function loadP254RecoverableCandidates(cwd: string, sourceArtifact: string): {
  forensics: P254MissionResult;
  recoverable: P254CandidateForensic[];
} {
  const full = path.join(cwd, sourceArtifact);
  const forensics = readJson<P254MissionResult>(full);
  if (!forensics) {
    throw new Error(`P255: missing P254 artifact ${sourceArtifact}`);
  }
  const recoverable = (forensics.candidates ?? []).filter((c) => c.automaticallyRecoverable);
  return { forensics, recoverable };
}

export function loadLocalAuthoritativeMaps(cwd: string): {
  p226ById: Map<string, P226Record>;
  p193PhoneById: Map<string, P193PhoneRow>;
  p185ById: Map<string, P185ReviewRow>;
} {
  const p226 = readJson<{ records?: Record<string, P226Record> }>(
    path.join(cwd, ".data/p226-candidate-recovery-store.json"),
  );
  const p226ById = new Map<string, P226Record>();
  if (p226?.records && typeof p226.records === "object") {
    for (const [id, row] of Object.entries(p226.records)) {
      p226ById.set(id, { ...row, candidateId: row.candidateId ?? id });
    }
  }

  const p193 = readJson<unknown>(
    path.join(cwd, ".data/p193-3-questionnaire-backfill-operator-local.json"),
  );
  const p193PhoneById = new Map<string, P193PhoneRow>();
  walkCollect(p193, p193PhoneById);

  const p185 = readJson<unknown>(path.join(cwd, ".data/p185-1-operator-review-local.json"));
  const p185ById = new Map<string, P185ReviewRow>();
  walkCollect(p185, p185ById);

  return { p226ById, p193PhoneById, p185ById };
}

export async function fetchBreezyCandidateByPosition(input: {
  candidateId: string;
  positionId: string | null;
}): Promise<BreezyCandidate | null> {
  const positionId = String(input.positionId ?? "").trim();
  if (!positionId) return null;
  try {
    const live = await fetchBreezyCandidates({
      positionId,
      force: true,
      maxPages: 3,
      scanMode: "all",
    });
    if (!live.ok) return null;
    return live.candidates.find((c) => c.candidateId === input.candidateId) ?? null;
  } catch {
    return null;
  }
}

export async function loadJobsById(): Promise<Map<string, BreezyJob>> {
  try {
    const result = await fetchBreezyJobs("published");
    if (!result.ok) return new Map();
    return new Map(result.jobs.map((j) => [j.jobId, j]));
  } catch {
    return new Map();
  }
}

/**
 * Resolve authoritative phone / identity / home location for a recoverable
 * candidate. Prefer live Breezy, then durable local recovery sources.
 */
export async function resolveAuthoritativeIdentity(input: {
  candidateId: string;
  forensicName: string;
  forensicLocation: string;
  ingestion: BreezyCandidate | null;
  maps: ReturnType<typeof loadLocalAuthoritativeMaps>;
}): Promise<{ identity: P255LocalIdentity; breezyLive: BreezyCandidate | null; notes: string[] }> {
  const notes: string[] = [];
  const p226 = input.maps.p226ById.get(input.candidateId);
  const p193 = input.maps.p193PhoneById.get(input.candidateId);
  const p185 = input.maps.p185ById.get(input.candidateId);
  const existing = input.ingestion;

  const positionIdHint =
    String(existing?.positionId ?? "").trim() ||
    String(p226?.positionId ?? "").trim() ||
    String(p185?.resolvedJobId ?? p185?.originalJobId ?? "").trim() ||
    null;

  const breezyLive = await fetchBreezyCandidateByPosition({
    candidateId: input.candidateId,
    positionId: positionIdHint,
  });
  if (breezyLive) {
    notes.push(`Breezy live hit via position ${positionIdHint}`);
  } else if (positionIdHint) {
    notes.push(`Breezy live miss for position ${positionIdHint}`);
  }

  let phone = "";
  let phoneSource: P255FieldSource = "none";
  if (hasUsablePhone(breezyLive?.phone)) {
    phone = String(breezyLive!.phone).trim();
    phoneSource = "breezy";
  } else if (hasUsablePhone(existing?.phone)) {
    phone = String(existing!.phone).trim();
    phoneSource = "ingestion";
  } else if (hasUsablePhone(p193?.phone)) {
    phone = String(p193!.phone).trim();
    phoneSource = "p193_questionnaire_backfill";
  }

  let city = String(existing?.city ?? "").trim();
  let state = String(existing?.state ?? "").trim().toUpperCase();
  let locationSource: P255FieldSource = city && state ? "ingestion" : "none";

  if ((!city || !state) && breezyLive) {
    const bCity = String(breezyLive.city ?? "").trim();
    const bState = String(breezyLive.state ?? "").trim().toUpperCase();
    if (bCity && bState) {
      city = bCity;
      state = bState;
      locationSource = "breezy";
    }
  }

  if ((!city || !state) && p226?.city && p226?.state) {
    city = String(p226.city).trim();
    state = String(p226.state).trim().toUpperCase();
    locationSource = "p226_recovery_store";
  }

  if ((!city || !state) && p185?.jobCityState) {
    const parsed = parseCityState(p185.jobCityState);
    if (parsed.city && parsed.state) {
      city = parsed.city;
      state = parsed.state;
      locationSource = "p185_operator_review";
    }
  }

  if ((!city || !state) && input.forensicLocation) {
    const parsed = parseCityState(input.forensicLocation);
    if (parsed.city && parsed.state) {
      city = parsed.city;
      state = parsed.state;
      locationSource = "workflow_db";
    }
  }

  const email =
    String(breezyLive?.email ?? "").trim() ||
    String(existing?.email ?? "").trim() ||
    String(p226?.email ?? "").trim() ||
    String(p193?.email ?? "").trim() ||
    String(p185?.candidateEmail ?? "").trim();

  const displayName =
    [breezyLive?.firstName, breezyLive?.lastName].filter(Boolean).join(" ").trim() ||
    [existing?.firstName, existing?.lastName].filter(Boolean).join(" ").trim() ||
    String(p226?.displayName ?? "").trim() ||
    String(p193?.name ?? "").trim() ||
    String(p185?.candidateName ?? "").trim() ||
    String(input.forensicName ?? "").trim();

  const fromBreezyName = breezyLive
    ? {
        firstName: String(breezyLive.firstName ?? "").trim(),
        lastName: String(breezyLive.lastName ?? "").trim(),
      }
    : null;
  const fromExisting = existing
    ? {
        firstName: String(existing.firstName ?? "").trim(),
        lastName: String(existing.lastName ?? "").trim(),
      }
    : null;
  const split = splitName(displayName);
  const firstName =
    fromBreezyName?.firstName ||
    fromExisting?.firstName ||
    String(p226?.firstName ?? "").trim() ||
    split.firstName;
  const lastName =
    fromBreezyName?.lastName ||
    fromExisting?.lastName ||
    String(p226?.lastName ?? "").trim() ||
    split.lastName;

  const identitySource: P255FieldSource = breezyLive
    ? "breezy"
    : existing
      ? "ingestion"
      : p226
        ? "p226_recovery_store"
        : p193
          ? "p193_questionnaire_backfill"
          : p185
            ? "p185_operator_review"
            : "none";

  const positionId =
    String(breezyLive?.positionId ?? "").trim() ||
    String(existing?.positionId ?? "").trim() ||
    String(p226?.positionId ?? "").trim() ||
    String(p185?.resolvedJobId ?? p185?.originalJobId ?? "").trim();

  const positionName =
    String(breezyLive?.positionName ?? "").trim() ||
    String(existing?.positionName ?? "").trim() ||
    String(p185?.jobTitle ?? "").trim();

  return {
    breezyLive,
    notes,
    identity: {
      candidateId: input.candidateId,
      displayName,
      firstName,
      lastName,
      email,
      phone,
      city,
      state,
      positionId,
      positionName,
      phoneSource,
      locationSource,
      identitySource,
    },
  };
}

export function emptyBreezyCandidateShell(identity: P255LocalIdentity): BreezyCandidate {
  const now = new Date().toISOString();
  return {
    candidateId: identity.candidateId,
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: identity.email,
    phone: identity.phone,
    source: "p255-recovery",
    stage: "Applied",
    appliedDate: now,
    createdDate: now,
    addedDate: now,
    updatedDate: now,
    addedDateSource: "p255_recovery",
    positionId: identity.positionId,
    positionName: identity.positionName,
    city: identity.city,
    state: identity.state,
    zipCode: "",
    resumeText: "",
    hasResume: false,
    hasQuestionnaire: false,
    ingestionSource: "breezy_api",
    listMembershipSource: "workflow_restored",
  };
}
