/**
 * P153.2 — Fresh candidate ingestion rescue validation
 *
 * Usage: npx tsx scripts/p153.2-fresh-candidate-ingestion-rescue.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { parseCandidateApplication } from "@/lib/recruiting-intelligence/resume-parser";

const TARGET_ID = "705cdc0e7f30";
const TARGET_EMAIL = "custenborder.taylor@gmail.com";
const TARGET_NAME = "Taylor Custenborder";
const EXPECTED_APPLIED = "2026-07-06T19:47:35.990Z";
const EXPECTED_POSITION = "Retail Display Merchandiser – West Chester, OH";

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

function formatMarkdown(report: Record<string, unknown>): string {
  const v = report.validation as Record<string, unknown>;
  const lines = [
    "# P153.2 — Fresh Candidate Ingestion Rescue",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Validation",
    "",
    `- Target visible in platform read path: **${v.targetVisible}**`,
    `- Target ID: ${v.targetId ?? "—"}`,
    `- Applied date: ${v.appliedDate ?? "—"}`,
    `- Position: ${v.positionName ?? "—"}`,
    `- Resume detected: ${v.resumeDetected}`,
    `- Questionnaire detected: ${v.questionnaireDetected}`,
    `- P153 would select target: **${v.p153SelectsTarget}**`,
    "",
    "## Freshness rescue",
    "",
    `- Ran: ${(report.freshnessRescue as { ran?: boolean })?.ran ?? false}`,
    `- Positions rescanned: ${(report.freshnessRescue as { positionsRescanned?: number })?.positionsRescanned ?? 0}`,
    `- New candidates: ${(report.freshnessRescue as { newCandidates?: number })?.newCandidates ?? 0}`,
    `- Rescued IDs: ${((report.freshnessRescue as { rescuedCandidateIds?: string[] })?.rescuedCandidateIds ?? []).join(", ") || "—"}`,
    "",
    "## Candidate lookup rescue",
    "",
    `- Found: ${(report.candidateLookupRescue as { found?: boolean })?.found ?? false}`,
    `- Source: ${(report.candidateLookupRescue as { source?: string })?.source ?? "—"}`,
    "",
    "## Rollback",
    "",
    "Monitor rescue rotation and ingestion checkpoint; no Breezy writes performed.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnvLocal();
  const generatedAt = new Date().toISOString();

  const resolved = await resolveCandidatesForRead({
    scanMode: "fast",
    force: true,
    candidateLookup: { email: TARGET_EMAIL, name: TARGET_NAME },
  });

  if (!resolved.ok) {
    console.error(resolved.error);
    process.exit(1);
  }

  const target = resolved.candidates.find((c) => c.candidateId === TARGET_ID);
  const emailHits = resolved.candidates.filter((c) => (c.email ?? "").toLowerCase() === TARGET_EMAIL);
  const nameMatches = resolved.candidates.filter((c) =>
    `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes("taylor custenborder"),
  );
  const selected = nameMatches.sort((a, b) =>
    (b.appliedDate || b.addedDate || "").localeCompare(a.appliedDate || a.addedDate || ""),
  )[0];

  const resume = target ? parseCandidateApplication(target) : null;

  const validation = {
    targetVisible: Boolean(target),
    targetId: target?.candidateId ?? null,
    appliedDate: target?.appliedDate ?? target?.addedDate ?? null,
    appliedDateMatches: (target?.appliedDate ?? target?.addedDate) === EXPECTED_APPLIED,
    positionName: target?.positionName ?? null,
    positionMatches: target?.positionName === EXPECTED_POSITION,
    resumeDetected: Boolean(target?.hasResume || resume?.hasResume),
    questionnaireDetected: Boolean(target?.hasQuestionnaire || target?.questionnaireAnswers?.length),
    emailHitCount: emailHits.length,
    p153SelectsTarget: selected?.candidateId === TARGET_ID,
    p153SelectedId: selected?.candidateId ?? null,
  };

  const store = await readIngestionStore();
  const inStore = Boolean(store.candidates[TARGET_ID]);

  const report = {
    sourcePhase: "P153.2",
    generatedAt,
    resolved: {
      fromIngestionStore: resolved.fromIngestionStore,
      candidateCount: resolved.candidates.length,
      fetchedAt: resolved.fetchedAt,
    },
    freshnessRescue: resolved.freshnessRescue ?? null,
    candidateLookupRescue: resolved.candidateLookupRescue ?? null,
    ingestionStore: {
      containsTarget: inStore,
      lastChunkAt: store.lastChunkAt,
      lastFreshnessRescueAt: store.lastFreshnessRescueAt,
      rescueRotationIndex: store.rescueRotationIndex,
    },
    validation,
    emailHits: emailHits.map((c) => ({
      candidateId: c.candidateId,
      appliedDate: c.appliedDate,
      positionName: c.positionName,
    })),
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p153.2-fresh-candidate-ingestion-rescue.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p153.2-fresh-candidate-ingestion-rescue.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log(JSON.stringify({ ok: validation.targetVisible && validation.p153SelectsTarget, jsonPath, mdPath, validation }, null, 2));
  if (!validation.targetVisible || !validation.p153SelectsTarget) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
