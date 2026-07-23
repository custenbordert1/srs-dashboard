import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  P256_AUTHORIZED_NAMES,
  P256_SOURCE_ARTIFACT,
  type P256AuthorizedTarget,
} from "@/lib/p256-controlled-live-recovered-send/types";

type P255RecoveryCandidate = {
  candidateId?: string;
  name?: string;
  email?: string;
  nowEligible?: boolean;
  notes?: string[];
};

type P255EligibilityRow = {
  candidateId?: string;
  location?: string;
};

type P255RecoveryReport = {
  candidates?: P255RecoveryCandidate[];
  eligibilityRowsAfter?: P255EligibilityRow[];
};

function normalizeName(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function extractPositionId(notes: string[] | undefined): string | null {
  for (const note of notes ?? []) {
    const m = String(note).match(/Breezy live hit via position\s+([a-f0-9]+)/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

function parseCityState(raw: string): { city: string; state: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { city: "", state: "" };
  const m = text.match(/^(.+),\s*([A-Za-z]{2})\s*$/);
  if (m) return { city: m[1]!.trim(), state: m[2]!.trim().toUpperCase() };
  return { city: text, state: "" };
}

/**
 * Resolve durable IDs for the operator-authorized recovered cohort from P255.
 * Hard-filters to authorized names + nowEligible only (never DeAnn / others).
 */
export function resolveP256AuthorizedTargets(input?: {
  cwd?: string;
  sourceArtifact?: string;
}): P256AuthorizedTarget[] {
  const cwd = input?.cwd ?? process.cwd();
  const sourceArtifact = input?.sourceArtifact ?? P256_SOURCE_ARTIFACT;
  const full = path.isAbsolute(sourceArtifact)
    ? sourceArtifact
    : path.join(cwd, sourceArtifact);

  if (!existsSync(full)) {
    throw new Error(`P256: missing P255 recovery report at ${sourceArtifact}`);
  }

  let report: P255RecoveryReport;
  try {
    report = JSON.parse(readFileSync(full, "utf8")) as P255RecoveryReport;
  } catch (error) {
    throw new Error(
      `P256: failed to parse ${sourceArtifact}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const authorized = new Set<string>(P256_AUTHORIZED_NAMES);
  const locationById = new Map<string, { city: string; state: string }>();
  for (const row of report.eligibilityRowsAfter ?? []) {
    const id = String(row.candidateId ?? "").trim();
    if (!id) continue;
    const parsed = parseCityState(String(row.location ?? ""));
    if (parsed.city && parsed.state) locationById.set(id, parsed);
  }

  const targets: P256AuthorizedTarget[] = [];

  for (const row of report.candidates ?? []) {
    const candidateId = String(row.candidateId ?? "").trim();
    const name = String(row.name ?? "").trim();
    const email = String(row.email ?? "").trim();
    if (!candidateId || !name) continue;
    if (row.nowEligible !== true) continue;
    if (!authorized.has(normalizeName(name))) continue;

    const loc = locationById.get(candidateId) ?? { city: "", state: "" };
    targets.push({
      candidateId,
      name,
      email,
      positionId: extractPositionId(row.notes),
      city: loc.city,
      state: loc.state,
      source: P256_SOURCE_ARTIFACT,
    });
  }

  if (targets.length === 0) {
    throw new Error(
      `P256: no authorized nowEligible candidates found in ${sourceArtifact} ` +
        `(expected Sadio Mustafa + Melissa Lloyd).`,
    );
  }

  // Stable order: Sadio then Melissa when both present.
  targets.sort((a, b) => {
    const ai = P256_AUTHORIZED_NAMES.indexOf(
      normalizeName(a.name) as (typeof P256_AUTHORIZED_NAMES)[number],
    );
    const bi = P256_AUTHORIZED_NAMES.indexOf(
      normalizeName(b.name) as (typeof P256_AUTHORIZED_NAMES)[number],
    );
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  return targets;
}

export function assertP256CandidateAuthorized(
  candidateId: string,
  authorizedIds: ReadonlySet<string>,
): void {
  if (!authorizedIds.has(candidateId)) {
    throw new Error(
      `P256 SAFETY ABORT: refused to process unauthorized candidateId=${candidateId}`,
    );
  }
}
