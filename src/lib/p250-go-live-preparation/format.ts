import type {
  P250BlockersAndRemediation,
  P250ControlledLaunchPlan,
  P250GoNoGo,
  P250OperationsDashboard,
  P250ProductionSafetyReview,
} from "@/lib/p250-go-live-preparation/types";

export function formatP250BlockersMarkdown(b: P250BlockersAndRemediation): string {
  const lines = [
    `# P250 — Blockers and Remediation`,
    ``,
    `**Ops date:** ${b.opsDate}`,
    `**Generated:** ${b.generatedAt}`,
    `**Readiness overall:** ${b.readinessOverall}`,
    `**Mode:** read-only (no sends)`,
    ``,
    `| Status | Count |`,
    `| --- | ---: |`,
    `| PASS | ${b.passCount} |`,
    `| FAIL | ${b.failCount} |`,
    `| WARN | ${b.warnCount} |`,
    ``,
    `## Modes`,
    ``,
    `- Email mode: \`${b.modes.emailMode}\``,
    `- Dropbox testMode: \`${b.modes.dropboxTestMode}\``,
    `- Resend ready for live: ${b.modes.resendReady ? "yes" : "no"}`,
    `- Pilot live env: ${b.modes.pilotLiveEnvOk ? "yes" : "no"}`,
    ``,
    `## Blockers (FAIL) — exact remediation`,
    ``,
  ];

  if (b.blockers.length === 0) {
    lines.push(`_None_`, ``);
  } else {
    for (const blocker of b.blockers) {
      lines.push(`### ${blocker.check} (\`${blocker.id}\`)`);
      lines.push(``);
      lines.push(`- **Observed:** ${blocker.observed}`);
      lines.push(`- **Automatic fix:** no`);
      lines.push(`- **Remediation steps:**`);
      blocker.remediationSteps.forEach((step, i) => {
        lines.push(`  ${i + 1}. ${step}`);
      });
      if (blocker.verificationCommand) {
        lines.push(`- **Verify:** \`${blocker.verificationCommand}\``);
      }
      lines.push(``);
    }
  }

  lines.push(`## Warnings (WARN)`, ``);
  if (b.warnings.length === 0) {
    lines.push(`_None_`, ``);
  } else {
    for (const w of b.warnings) {
      lines.push(`### ${w.check} (\`${w.id}\`)`);
      lines.push(``);
      lines.push(`- **Observed:** ${w.observed}`);
      lines.push(`- **Remediation steps:**`);
      w.remediationSteps.forEach((step, i) => {
        lines.push(`  ${i + 1}. ${step}`);
      });
      lines.push(``);
    }
  }

  lines.push(`## Env presence (secrets never printed)`, ``);
  lines.push(`| Variable | Present | Notes |`);
  lines.push(`| --- | --- | --- |`);
  for (const e of b.envPresence) {
    lines.push(`| ${e.name} | ${e.present ? "yes" : "no"} | ${e.notes.replace(/\|/g, "/")} |`);
  }
  lines.push(``);
  lines.push(`## Source`, ``);
  lines.push(`- Readiness refreshed: yes`);
  lines.push(`- P249 artifacts reused: ${b.source.p249ArtifactsReused.join(", ") || "(none)"}`);
  lines.push(``);
  return lines.join("\n");
}

export function formatP250SafetyMarkdown(s: P250ProductionSafetyReview): string {
  const lines = [
    `# P250 — Production Safety Review`,
    ``,
    `**Ops date:** ${s.opsDate}`,
    `**Generated:** ${s.generatedAt}`,
    `**Mode:** ${s.mode}`,
    ``,
    `## Controls`,
    ``,
    `| Control | Status | Evidence | Residual risk |`,
    `| --- | --- | --- | --- |`,
  ];
  for (const c of s.controls) {
    lines.push(
      `| ${c.control} | ${c.status} | ${c.evidence.replace(/\|/g, "/")} | ${(c.residualRisk ?? "—").replace(/\|/g, "/")} |`,
    );
  }
  lines.push(``, `## Live write guards`, ``);
  for (const g of s.liveWriteGuards) lines.push(`- ${g}`);
  lines.push(``, `## Remaining production risks`, ``);
  for (const r of s.remainingProductionRisks) lines.push(`- ${r}`);
  lines.push(``);
  return lines.join("\n");
}

export function formatP250LaunchPlanMarkdown(p: P250ControlledLaunchPlan): string {
  const lines = [
    `# P250 — Controlled Launch Plan`,
    ``,
    `**Ops date:** ${p.opsDate}`,
    `**Generated:** ${p.generatedAt}`,
    `**Recommendation:** ${p.recommendation}`,
    ``,
    `> Plan only — P250 does **not** execute live. Explicit operator approval required before any \`--live\` command.`,
    ``,
    `## Expected volumes (from P249 / current dry-run)`,
    ``,
    `| Stage | Count |`,
    `| --- | ---: |`,
    `| Test / canary email | ${p.volumes.testEmail} |`,
    `| Initial paperwork | ${p.volumes.initialPaperwork} |`,
    `| Reminder 1 batch | ${p.volumes.reminder1Batch} |`,
    `| Ready for MEL (advance) | ${p.volumes.readyForMel} |`,
    `| Open-store safe capacity | ${p.volumes.openStoreSafeCapacity ?? "n/a"} |`,
    ``,
    `## Prerequisite blockers`,
    ``,
  ];
  if (p.prerequisiteBlockers.length === 0) lines.push(`_None_`, ``);
  else {
    for (const b of p.prerequisiteBlockers) lines.push(`- ${b}`);
    lines.push(``);
  }

  lines.push(`## Sequence`, ``);
  for (const step of p.steps) {
    lines.push(`### ${step.order}. ${step.stage} — ${step.action}`);
    lines.push(``);
    lines.push(`- Count: ${step.count ?? "n/a"}`);
    lines.push(`- Risk: ${step.risk}`);
    if (step.command) lines.push(`- Command: \`${step.command}\``);
    lines.push(`- Verify:`);
    for (const v of step.verify) lines.push(`  - ${v}`);
    lines.push(`- Rollback:`);
    for (const r of step.rollback) lines.push(`  - ${r}`);
    lines.push(`- Stop if:`);
    for (const s of step.stopConditions) lines.push(`  - ${s}`);
    lines.push(``);
  }

  lines.push(`## Monitoring`, ``);
  for (const m of p.monitoring) lines.push(`- ${m}`);
  lines.push(``);
  lines.push(`## Gates`, ``);
  lines.push(`- Explicit approval required: yes`);
  lines.push(`- Live execution in P250: no`);
  lines.push(``);
  return lines.join("\n");
}

export function formatP250DashboardMarkdown(d: P250OperationsDashboard): string {
  return [
    `# P250 — Operations Dashboard`,
    ``,
    `**Ops date:** ${d.opsDate}`,
    `**Generated:** ${d.generatedAt}`,
    `**Source:** ${d.sourceArtifact}`,
    `**P249 dry-run zero writes:** ${d.dryRunZeroWritesConfirmed ? "confirmed" : "unknown"}`,
    ``,
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| New applicants (Applied) | ${d.newApplicants} |`,
    `| Paperwork Needed | ${d.paperworkNeeded} |`,
    `| Eligible to Send | ${d.eligibleToSend} |`,
    `| Paperwork Sent | ${d.paperworkSent} |`,
    `| Outstanding Signatures | ${d.outstandingSignatures} |`,
    `| Reminder 1 | ${d.reminder1} |`,
    `| Reminder 2 | ${d.reminder2} |`,
    `| Reminder 3 | ${d.reminder3} |`,
    `| Reminder 4 | ${d.reminder4} |`,
    `| Viewed | ${d.viewed} |`,
    `| Signed Today | ${d.signedToday} |`,
    `| Ready for MEL | ${d.readyForMel} |`,
    `| Blocked (manual) | ${d.blocked} |`,
    `| Pipeline Health % | ${d.pipelineHealthPct} |`,
    `| Est. recruiter hours saved | ${d.estimatedRecruiterHoursSaved} |`,
    ``,
  ].join("\n");
}

export function formatP250GoNoGoMarkdown(g: P250GoNoGo): string {
  const lines = [
    `# P250 — GO / NO-GO`,
    ``,
    `**Ops date:** ${g.opsDate}`,
    `**Generated:** ${g.generatedAt}`,
    `**Decision:** **${g.decision}**`,
    ``,
    `| Key metric | Value |`,
    `| --- | ---: |`,
    `| Readiness score | ${g.readinessScore} |`,
    `| Expected initial paperwork sends | ${g.expectedVolumes.initialPaperworkSends} |`,
    `| Expected Reminder 1 sends | ${g.expectedVolumes.reminder1Sends} |`,
    `| Expected Ready for MEL | ${g.expectedVolumes.readyForMel} |`,
    ``,
    `## Justification`,
    ``,
    g.justification,
    ``,
    `## Blockers`,
    ``,
  ];
  if (g.blockers.length === 0) lines.push(`_None_`, ``);
  else {
    for (const b of g.blockers) lines.push(`- ${b}`);
    lines.push(``);
  }
  lines.push(`## Remaining risks`, ``);
  for (const r of g.remainingRisks) lines.push(`- ${r}`);
  lines.push(``);
  lines.push(`## Recommended launch window`, ``);
  lines.push(g.recommendedLaunchWindow, ``);
  lines.push(
    g.decision === "NO-GO"
      ? `## Path to live (after remediation)`
      : `## Only remaining action`,
    ``,
  );
  lines.push(g.onlyRemainingAction, ``);
  return lines.join("\n");
}

export function formatP250ExecutiveSummaryMarkdown(input: {
  goNoGo: P250GoNoGo;
  dashboard: P250OperationsDashboard;
  blockerCount: number;
}): string {
  const g = input.goNoGo;
  return [
    `# P250 — Executive Summary`,
    ``,
    `**Decision: ${g.decision}** — readiness score ${g.readinessScore}/100.`,
    ``,
    g.justification,
    ``,
    `## Snapshot`,
    ``,
    `- Initial paperwork ready: **${g.expectedVolumes.initialPaperworkSends}**`,
    `- Reminder 1 ready: **${g.expectedVolumes.reminder1Sends}**`,
    `- Ready for MEL: **${g.expectedVolumes.readyForMel}**`,
    `- Outstanding signatures: **${input.dashboard.outstandingSignatures}**`,
    `- Open blockers: **${input.blockerCount}**`,
    ``,
    `## Launch posture`,
    ``,
    `- Recommended window: ${g.recommendedLaunchWindow}`,
    `- ${g.onlyRemainingAction}`,
    ``,
  ].join("\n");
}
