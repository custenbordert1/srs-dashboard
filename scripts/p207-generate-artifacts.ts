/**
 * P207 — generate autonomous readiness dashboard artifacts (read-only).
 *
 *   node --import tsx scripts/p207-generate-artifacts.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listIngestedCandidates, readIngestionStore } from "../src/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "../src/lib/candidate-workflow-store";
import { listP2041Recommendations } from "../src/lib/p204-1-supervised-qualification-pilot/store";
import { listP2042OperatorDecisions } from "../src/lib/p204-2-controlled-recommendation-approval/store";
import { readP192Status } from "../src/lib/p192-supervised-paperwork-runner/control";
import {
  buildP207ReadinessSnapshot,
  loadP207DropboxDiagnostics,
  stubVendorBlockedDropbox,
  type P207AiSignal,
} from "../src/lib/p207-autonomous-readiness-dashboard";

function loadEnvLocal(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const art = path.join(process.cwd(), "artifacts");
  await mkdir(art, { recursive: true });

  const [ingestion, workflows, recommendations, decisions, p192] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    listP2041Recommendations().catch(() => []),
    listP2042OperatorDecisions().catch(() => []),
    readP192Status().catch(() => null),
  ]);

  const aiByCandidateId: Record<string, P207AiSignal> = {};
  for (const r of recommendations) {
    aiByCandidateId[r.candidateId] = {
      recommendation: r.recommendation,
      confidence: typeof r.confidence === "number" ? r.confidence : null,
      operatorDecision: r.operatorDecision ?? null,
    };
  }
  for (const d of decisions) {
    const prev = aiByCandidateId[d.candidateId];
    aiByCandidateId[d.candidateId] = {
      recommendation: d.aiRecommendation ?? prev?.recommendation ?? "Unknown",
      confidence: prev?.confidence ?? null,
      operatorDecision: d.decision ?? prev?.operatorDecision ?? null,
    };
  }

  let dropbox = await loadP207DropboxDiagnostics({
    lastSuccessfulSendAt: p192?.lastCycle?.confirmedSent
      ? p192.lastCycle.finishedAt
      : null,
    lastFailedSendAt:
      p192?.lastCycle && (p192.lastCycle.failed ?? 0) > 0
        ? p192.lastCycle.finishedAt
        : null,
  });

  // If live probe unavailable, fall back to last verified P206 vendor-blocked posture.
  if (dropbox.apiStatus !== "ok" || dropbox.productionQuota == null) {
    dropbox = stubVendorBlockedDropbox({
      lastSuccessfulSendAt: dropbox.lastSuccessfulSendAt,
      lastFailedSendAt: dropbox.lastFailedSendAt,
      detail:
        "Fallback from P206 verified state: production quota=0, test_mode=false, software ready, vendor blocked",
    });
  }

  const snapshot = buildP207ReadinessSnapshot({
    candidates: listIngestedCandidates(ingestion),
    workflows,
    dropbox,
    aiByCandidateId,
  });

  const validation = {
    generatedAt: snapshot.generatedAt,
    matched: snapshot.validation.matched,
    authoritativeTotal: snapshot.validation.authoritativeTotal,
    dashboardTotal: snapshot.validation.dashboardTotal,
    countMismatches: snapshot.validation.countMismatches,
    refreshLatencyMs: snapshot.validation.refreshLatencyMs,
    missingData: snapshot.validation.missingData,
    stageCounts: Object.fromEntries(snapshot.stages.map((s) => [s.stage, s.count])),
    safety: snapshot.safety,
  };

  const health = {
    generatedAt: snapshot.generatedAt,
    overallScore: snapshot.overallScore,
    overallTone: snapshot.overallTone,
    subsystems: snapshot.subsystemScores,
    dropbox: {
      softwareReady: snapshot.dropbox.softwareReady,
      vendorBlocked: snapshot.dropbox.vendorBlocked,
      productionQuota: snapshot.dropbox.productionQuota,
      configurationStatus: snapshot.dropbox.configurationStatus,
      detail: snapshot.dropbox.detail,
    },
    largestBlocker: snapshot.largestBlocker,
    immediateSendReady: snapshot.immediateSendReady,
    autonomousReadiness: snapshot.autonomousReadiness,
  };

  const forecast = {
    generatedAt: snapshot.generatedAt,
    ...snapshot.forecast,
    immediateSendReady: snapshot.immediateSendReady,
    paperworkNeeded:
      snapshot.stages.find((s) => s.stage === "Paperwork Needed")?.count ?? 0,
  };

  const pn = snapshot.stages.find((s) => s.stage === "Paperwork Needed");
  const recommendation =
    snapshot.validation.matched &&
    snapshot.safety.lifecycleWrites === false &&
    snapshot.dropbox.apiStatus === "ok"
      ? snapshot.dropbox.softwareReady || snapshot.dropbox.vendorBlocked
        ? "ready for production dashboard"
        : "needs refinement"
      : snapshot.validation.matched
        ? "needs refinement"
        : "not ready";

  const md = `# P207 — Autonomous Readiness Report

Generated: ${snapshot.generatedAt}

## Dashboard status

- Mode: **read-only**
- Overall health: **${snapshot.overallScore}/100** (${snapshot.overallTone})
- Autonomous readiness: ${snapshot.autonomousReadiness}
- Largest blocker: ${snapshot.largestBlocker}
- Immediate send-ready: **${snapshot.immediateSendReady}**
- Recommendation: **${recommendation}**

## Stage counts

| Stage | Count | Δ today | Largest blocker | 2nd blocker | ETA (h) |
| --- | ---: | ---: | --- | --- | ---: |
${snapshot.stages
  .map(
    (s) =>
      `| ${s.stage} | ${s.count} | ${s.changeToday} | ${s.largestBlocker ?? "—"} | ${s.secondBlocker ?? "—"} | ${s.estimatedHoursToClear ?? "—"} |`,
  )
  .join("\n")}

## Subsystem health

| Subsystem | Score | Tone | Detail |
| --- | ---: | --- | --- |
${snapshot.subsystemScores
  .map((s) => `| ${s.label} | ${s.score} | ${s.tone} | ${s.detail} |`)
  .join("\n")}

## Dropbox

- Software ready: ${snapshot.dropbox.softwareReady}
- Vendor blocked: ${snapshot.dropbox.vendorBlocked}
- Production quota: ${snapshot.dropbox.productionQuota}
- Test mode: ${snapshot.dropbox.testMode}
- API status: ${snapshot.dropbox.apiStatus}
- Account: ${snapshot.dropbox.accountEmail ?? "—"}
- Templates: ${snapshot.dropbox.templatesAvailable ?? "—"}
- Detail: ${snapshot.dropbox.detail}

## Forecast (if Dropbox restored)

- Expected sends: ${snapshot.forecast.ifDropboxRestoredNow.expectedSends}
- Expected signatures: ${snapshot.forecast.ifDropboxRestoredNow.expectedSignatures}
- Expected Ready for MEL: ${snapshot.forecast.ifDropboxRestoredNow.expectedReadyForMel}
- 24h: ${snapshot.forecast.next24h.expectedSends} / ${snapshot.forecast.next24h.expectedSignatures} / ${snapshot.forecast.next24h.expectedReadyForMel}
- 7d: ${snapshot.forecast.next7d.expectedSends} / ${snapshot.forecast.next7d.expectedSignatures} / ${snapshot.forecast.next7d.expectedReadyForMel}

## Validation

- Matched: ${snapshot.validation.matched}
- Latency ms: ${snapshot.validation.refreshLatencyMs}
- Mismatches: ${snapshot.validation.countMismatches.length}
- Missing data: ${snapshot.validation.missingData.join(", ") || "none"}

## Safety

- Lifecycle writes: false
- Paperwork Needed creates: false
- Dropbox sends: false
- P192 starts: false
- Automation enabled: false
- MEL writes: false

## Paperwork Needed snapshot

- Count: ${pn?.count ?? 0}
- Largest blocker: ${pn?.largestBlocker ?? "—"}
`;

  await writeFile(
    path.join(art, "p207-dashboard-validation.json"),
    `${JSON.stringify(validation, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(art, "p207-health-score.json"),
    `${JSON.stringify(health, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(art, "p207-forecast.json"),
    `${JSON.stringify(forecast, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(art, "p207-readiness-report.md"), md, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        recommendation,
        overallScore: snapshot.overallScore,
        immediateSendReady: snapshot.immediateSendReady,
        largestBlocker: snapshot.largestBlocker,
        expectedSendsIfRestored: snapshot.forecast.ifDropboxRestoredNow.expectedSends,
        validationMatched: snapshot.validation.matched,
        artifacts: [
          "artifacts/p207-dashboard-validation.json",
          "artifacts/p207-health-score.json",
          "artifacts/p207-forecast.json",
          "artifacts/p207-readiness-report.md",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
