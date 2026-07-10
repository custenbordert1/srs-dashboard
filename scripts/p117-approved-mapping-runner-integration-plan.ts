/**
 * P117 — Approved Mapping Bridge Runner Integration Plan
 * Usage: npx tsx scripts/p117-approved-mapping-runner-integration-plan.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildApprovedMappingRunnerIntegrationPlan } from "@/lib/p117-approved-mapping-runner-integration";

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

function buildMarkdownReport(plan: Awaited<ReturnType<typeof buildApprovedMappingRunnerIntegrationPlan>>): string {
  return `# P117 — Approved Mapping Bridge Runner Integration Plan

**Generated:** ${plan.generatedAt}  
**Mode:** dry-run only  
**GO/NO-GO:** ${plan.goNoGo}

## Summary

${plan.summary}

## P116 gap closure (dry-run)

${plan.integrationDesign.gapFromP116}

## Integration design

- **Approach:** ${plan.integrationDesign.approach}
- **Insertion point:** ${plan.integrationDesign.insertionPoint}
- **Protection order:** ${plan.integrationDesign.protectionOrder}
- **Future live path:** ${plan.integrationDesign.futureLivePath}

## Flag

| Env var | Value | Active this run |
|---------|-------|-----------------|
| \`${plan.bridgeFlag.envVar}\` | ${plan.bridgeFlag.enabled ? "true" : "unset/false"} | ${plan.bridgeFlag.activeInThisRun ? "yes" : "no"} |

Constraints:

${plan.bridgeFlag.constraints.map((item) => `- ${item}`).join("\n")}

## Runner call-site trace

${plan.callSiteTrace
  .map(
    (site) => `### ${site.layer}

- **File:** \`${site.file}\`
- **Function:** \`${site.function}\`
- **Calls:** ${site.calls.length ? site.calls.map((call) => `\`${call}\``).join(", ") : "—"}
- ${site.notes}`,
  )
  .join("\n\n")}

## Proof matrix

| Check | Result |
|-------|--------|
| Default runner unchanged when flag off | ${plan.proof.defaultRunnerUnchanged ? "PASS" : "FAIL"} |
| Bridge only when flag enabled | ${plan.proof.bridgeOnlyWhenFlagEnabled ? "PASS" : "FAIL"} |
| Non-approved decisions do not unlock | ${plan.proof.nonApprovedDecisionsDoNotUnlock ? "PASS" : "FAIL"} |
| Protection overrides approval | ${plan.proof.protectionOverridesApproval ? "PASS" : "FAIL"} |
| No sends | ${plan.proof.noSends ? "PASS" : "FAIL"} |
| No Breezy writes | ${plan.proof.noBreezyWrites ? "PASS" : "FAIL"} |
| No live mode | ${plan.proof.noLiveMode ? "PASS" : "FAIL"} |

## Metrics

| Metric | Value |
|--------|-------|
| Approved mappings loaded | ${plan.metrics.approvedMappingsLoaded} |
| Baseline project-mapping blocked | ${plan.metrics.baselineBlockedProjectMapping} |
| Bridge unlocked via approval | ${plan.metrics.bridgeUnlockedViaApproval} |
| Bridge applied (direct proof) | ${plan.metrics.bridgeAppliedCount} |
| Protection blocked bridge | ${plan.metrics.protectionBlockedBridgeCount} |
| Ready to send (baseline) | ${plan.metrics.readyToSendBaseline} |
| Ready to send (with bridge) | ${plan.metrics.readyToSendWithBridge} |

## Sample bridge unlocks

${
  plan.sampleBridgeUnlocks.length
    ? plan.sampleBridgeUnlocks
        .map(
          (sample) =>
            `- **${sample.candidateName}** (\`${sample.candidateId}\`): ${sample.baselineBlocker} → ${sample.overlayBlocker ?? "n/a"}`,
        )
        .join("\n")
    : "_No bridge unlock samples in this run._"
}

## Safety status

${Object.entries(plan.safetyStatus)
  .map(([key, value]) => `- ${key}: ${value ? "yes" : "no"}`)
  .join("\n")}

## Non-goals (P117)

${plan.integrationDesign.nonGoals.map((item) => `- ${item}`).join("\n")}
`;
}

async function main() {
  loadEnvLocal();

  const plan = await buildApprovedMappingRunnerIntegrationPlan();
  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });

  const jsonPath = path.join(artifactDir, "p117-approved-mapping-runner-integration-plan.json");
  const mdPath = path.join(artifactDir, "p117-approved-mapping-runner-integration-report.md");

  await writeFile(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${buildMarkdownReport(plan)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        jsonPath,
        mdPath,
        goNoGo: plan.goNoGo,
        summary: plan.summary,
        bridgeFlag: plan.bridgeFlag,
        metrics: plan.metrics,
        proof: plan.proof,
        safetyStatus: plan.safetyStatus,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
