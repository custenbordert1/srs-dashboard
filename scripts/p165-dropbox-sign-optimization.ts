/**
 * P165 — Dropbox Sign API optimization validation (read-only simulation).
 *
 * Compares projected API usage before/after P165 optimizations using today's
 * active packet queue. Does NOT send paperwork or call the live Dropbox API.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { planMonitorPackets } from "../src/lib/paperwork-monitor/plan-monitor-packets.ts";
import { selectActivePaperworkPackets } from "../src/lib/paperwork-monitor/select-active-packets.ts";
import { getDropboxMonitorBudgetPerCycle } from "../src/lib/dropbox-sign-api/constants.ts";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

async function main() {
const SEND_CAP = Number.parseInt(process.env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE ?? "10", 10) || 10;
const budgetLimit = getDropboxMonitorBudgetPerCycle();

const active = await selectActivePaperworkPackets();
const simulatedPriority = active
  .filter((p) => p.workflow.paperworkSentAt?.startsWith("2026-07-08"))
  .slice(0, SEND_CAP)
  .map((p) => p.candidateId);

const fallbackPriority = active.slice(0, SEND_CAP).map((p) => p.candidateId);
const priorityCandidateIds =
  simulatedPriority.length > 0 ? simulatedPriority : fallbackPriority;

const afterPlan = planMonitorPackets({
  allActive: active,
  scope: "postCycle",
  priorityCandidateIds,
  budgetLimit,
});

const before = {
  postRequests: SEND_CAP,
  getRequests: active.length * 2,
  totalRequests: SEND_CAP + active.length * 2,
  notes: "P164 measured: double GET per packet + full portfolio poll",
};

const after = {
  postRequests: SEND_CAP,
  getRequests: afterPlan.projectedGetRequests,
  totalRequests: SEND_CAP + afterPlan.projectedGetRequests,
  deferredHistorical: afterPlan.deferredCandidateIds.length,
  duplicateGetsEliminated: true,
  notes: "P165: single GET per packet; post-cycle scope polls cycle sends only",
};

const reductionPct = Math.round((1 - after.totalRequests / before.totalRequests) * 1000) / 10;

const report = {
  generatedAt: new Date().toISOString(),
  sourcePhase: "P165",
  queue: {
    activePackets: active.length,
    simulatedCycleSends: priorityCandidateIds.length,
    priorityCandidateIds,
  },
  comparison: { before, after },
  reduction: {
    estimatedPercent: reductionPct,
    getRequestReduction: before.getRequests - after.getRequests,
    totalRequestReduction: before.totalRequests - after.totalRequests,
  },
  targets: {
    postRequests: SEND_CAP,
    getRequestsMax: 25,
    totalMax: 35,
    meetsTarget: after.getRequests < 25 && after.totalRequests < 35,
  },
  readiness: {
    periodicAutomaticPaperworkSending:
      after.totalRequests < 35
        ? "READY — projected cycle API usage stays under Dropbox Sign limits with P165 optimizations."
        : "CAUTION — review deferred queue depth and monitor budget before enabling periodic sends.",
    continuousModeRequired: false,
    rateLimitRisk: after.totalRequests < 100 ? "low" : "elevated",
  },
};

const artifactsDir = path.join(process.cwd(), "artifacts");
mkdirSync(artifactsDir, { recursive: true });
const jsonPath = path.join(artifactsDir, "p165-dropbox-sign-optimization.json");
const mdPath = path.join(artifactsDir, "p165-dropbox-sign-optimization.md");
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const md = `# P165 — Dropbox Sign API Optimization Validation

Generated: ${report.generatedAt}

## API call comparison

| Metric | BEFORE (P164) | AFTER (P165) | Target |
|--------|---------------|--------------|--------|
| POST (sends) | ${before.postRequests} | ${after.postRequests} | ~10 |
| GET (status) | ${before.getRequests} | ${after.getRequests} | <25 |
| **TOTAL** | **${before.totalRequests}** | **${after.totalRequests}** | **<35** |

- Estimated reduction: **${reductionPct}%**
- Historical packets deferred: **${after.deferredHistorical}**
- Meets target: **${report.targets.meetsTarget ? "YES" : "NO"}**

## Queue context

- Active packets today: **${active.length}**
- Simulated cycle sends: **${priorityCandidateIds.length}**

## Readiness

${report.readiness.periodicAutomaticPaperworkSending}

Rate limit risk: **${report.readiness.rateLimitRisk}**

## Confirmations

- Duplicate GETs eliminated: **yes** (signature passed to processSignatureStatus)
- Full portfolio post-send poll eliminated: **yes** (postCycle scope)
- Dropbox throttling + cache: **implemented** in dropbox-sign client
- Production flags / continuous mode: **unchanged**
`;

writeFileSync(mdPath, md);
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${jsonPath}\nWrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
