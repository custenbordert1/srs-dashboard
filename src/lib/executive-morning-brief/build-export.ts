import { buildExportCsv, type ExportCsvOptions } from "@/lib/export-center";
import type { ExecutiveMorningBriefSnapshot } from "@/lib/executive-morning-brief/types";

export function buildMorningBriefExportCsv(snapshot: ExecutiveMorningBriefSnapshot): string {
  const options: ExportCsvOptions = {
    filename: `executive-morning-brief-${snapshot.planDate}.csv`,
    dataAsOf: snapshot.generatedAt,
    metadata: [
      { label: "Plan Date", value: snapshot.planDate },
      { label: "Recruiting Health", value: String(snapshot.recruitingHealth.score) },
      { label: "Overall Recommendation Success", value: `${snapshot.recommendationIntelligence.overallSuccessRate}%` },
    ],
    headers: ["Section", "Rank", "Title", "Owner", "Impact", "Detail"],
    rows: [
      ...snapshot.dailyPriorities.map((row) => [
        "Priority",
        String(row.rank),
        row.title,
        row.owner ?? "",
        String(row.impactScore),
        row.recommendedAction,
      ]),
      ...snapshot.territoryRisks.map((row) => [
        "Territory Risk",
        String(row.rank),
        row.territoryLabel,
        row.dmName,
        String(row.riskScore),
        `${row.riskLevel} · ${row.coveragePercent}% coverage`,
      ]),
      ...snapshot.scorecard.map((row) => [
        "Scorecard",
        "",
        row.label,
        "",
        String(row.value),
        row.trends.vsLastWeek.label,
      ]),
    ],
  };
  return buildExportCsv(options);
}

export function buildMorningBriefPrintHtml(snapshot: ExecutiveMorningBriefSnapshot): string {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const priorityRows = snapshot.dailyPriorities
    .map(
      (row) =>
        `<tr><td>${row.rank}</td><td>${escape(row.title)}</td><td>${escape(row.owner ?? "—")}</td><td>${row.impactScore}</td></tr>`,
    )
    .join("");

  const riskRows = snapshot.territoryRisks
    .map(
      (row) =>
        `<tr><td>${row.rank}</td><td>${escape(row.territoryLabel)}</td><td>${row.riskLevel}</td><td>${row.coveragePercent}%</td><td>${row.openCalls}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Executive Morning Brief ${escape(snapshot.planDate)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#111}
h1{font-size:1.5rem} h2{font-size:1.1rem;margin-top:1.5rem}
table{border-collapse:collapse;width:100%;margin-top:.5rem}
th,td{border:1px solid #ccc;padding:.4rem .6rem;text-align:left;font-size:.85rem}
.summary{background:#f5f5f5;padding:1rem;border-radius:8px;margin:1rem 0}
</style></head><body>
<h1>Executive Morning Brief — ${escape(snapshot.planDate)}</h1>
<p>Generated ${escape(snapshot.generatedAt)}</p>
<div class="summary"><strong>Today:</strong> ${escape(snapshot.narratives.today)}</div>
<div class="summary"><strong>This week:</strong> ${escape(snapshot.narratives.thisWeek)}</div>
<h2>Scorecard</h2>
<ul>${snapshot.scorecard.map((row) => `<li>${escape(row.label)}: <strong>${row.value}</strong> (${escape(row.trends.vsLastWeek.label)} vs last week)</li>`).join("")}</ul>
<h2>Top Priorities</h2>
<table><thead><tr><th>#</th><th>Action</th><th>Owner</th><th>Impact</th></tr></thead><tbody>${priorityRows}</tbody></table>
<h2>Territory Risks</h2>
<table><thead><tr><th>#</th><th>Territory</th><th>Risk</th><th>Coverage</th><th>Open Calls</th></tr></thead><tbody>${riskRows}</tbody></table>
<h2>Email Digest Preview</h2>
<pre>${escape(snapshot.emailDigest.bodyText)}</pre>
</body></html>`;
}

export function openMorningBriefPrintView(snapshot: ExecutiveMorningBriefSnapshot): void {
  const html = buildMorningBriefPrintHtml(snapshot);
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function downloadMorningBriefExcel(snapshot: ExecutiveMorningBriefSnapshot): void {
  const csv = buildMorningBriefExportCsv(snapshot);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `executive-morning-brief-${snapshot.planDate}.csv`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadMorningBriefPdfViaPrint(snapshot: ExecutiveMorningBriefSnapshot): void {
  openMorningBriefPrintView(snapshot);
}
