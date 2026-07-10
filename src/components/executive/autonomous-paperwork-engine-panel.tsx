"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { AutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/types";
import { useCallback, useEffect, useState } from "react";

export function AutonomousPaperworkEnginePanel() {
  const [report, setReport] = useState<AutonomousPaperworkReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-paperwork-engine?includeCandidates=true", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        autonomousPaperworkEngine?: AutonomousPaperworkReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.autonomousPaperworkEngine) {
        setError(data.error ?? "Failed to load autonomous paperwork engine");
        return;
      }
      setReport(data.autonomousPaperworkEngine);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load autonomous paperwork engine");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runMode = async (mode: "dryRun" | "executeOne" | "executeSafeSingles") => {
    setRunning(true);
    setActionError(null);
    setActionResult(null);
    try {
      const res = await fetch("/api/autonomous-paperwork-engine/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          mtdOnly: true,
          executiveApprovalFlag: mode !== "dryRun",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        autonomousPaperworkEngine?: AutonomousPaperworkReport;
        warnings?: string[];
        error?: string;
        sendsThisRun?: number;
        stopReason?: string | null;
      };
      if (!res.ok || !data.ok || !data.autonomousPaperworkEngine) {
        setActionError(data.error ?? data.stopReason ?? "Run failed");
        return;
      }
      setReport(data.autonomousPaperworkEngine);
      setWarnings(data.warnings ?? []);
      setActionResult(
        mode === "dryRun"
          ? "dryRun complete — no sends."
          : `${data.sendsThisRun ?? 0} send(s) via ${mode}.`,
      );
    } catch {
      setActionError("Run failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <ExecutivePanelLoading title="Autonomous Paperwork Engine" badge="P106" />;
  if (error || !report)
    return <ExecutivePanelError title="Autonomous Paperwork Engine" message={error ?? "No report"} onRetry={load} />;

  const m = report.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Autonomous Paperwork Engine"
        subtitle="P106 — auto-advance, controlled executeOne, no batch"
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Evaluated" value={m.candidatesEvaluated.toLocaleString()} />
        <MetricCard label="Ready to send" value={m.readyToSend.toLocaleString()} />
        <MetricCard label="Sent" value={m.sent.toLocaleString()} />
        <MetricCard label="Skipped sent" value={m.skippedAlreadySent.toLocaleString()} />
        <MetricCard label="Action needed" value={m.remainingActionNeeded.toLocaleString()} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Blocked email" value={m.blockedInvalidEmail.toLocaleString()} />
        <MetricCard label="Not mappable" value={m.blockedUnpublishedJob.toLocaleString()} />
        <MetricCard label="Duplicate risk" value={m.blockedDuplicateRisk.toLocaleString()} />
        <MetricCard label="Blocked P84" value={m.blockedP84.toLocaleString()} />
        <MetricCard label="Manual review" value={m.blockedManualReview.toLocaleString()} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void runMode("dryRun")}
        >
          dryRun
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void runMode("executeOne")}
        >
          executeOne
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void runMode("executeSafeSingles")}
        >
          executeSafeSingles
        </button>
      </div>

      {actionError ? <p className="mb-2 text-sm text-red-600">{actionError}</p> : null}
      {actionResult ? <p className="mb-2 text-sm text-green-700">{actionResult}</p> : null}

      <SectionHeader title="Ready to Send" />
      <ul className="mb-4 space-y-1 text-sm">
        {report.readyToSend.length === 0 ? (
          <li className="text-muted-foreground">None</li>
        ) : (
          report.readyToSend.slice(0, 10).map((c) => (
            <li key={c.candidateId}>
              ✓ {c.candidateName} — {c.email} — {c.positionTitle ?? c.positionId}
            </li>
          ))
        )}
      </ul>

      <SectionHeader title="Sent" />
      <ul className="mb-4 space-y-1 text-sm">
        {report.sent.length === 0 ? (
          <li className="text-muted-foreground">None</li>
        ) : (
          report.sent.slice(0, 10).map((c) => (
            <li key={c.candidateId}>
              ✓ {c.candidateName} — {c.signatureRequestId?.slice(0, 16) ?? "—"} — {c.sentAt ?? "—"}
            </li>
          ))
        )}
      </ul>

      <SectionHeader title="Blocked" />
      <ul className="mb-4 space-y-1 text-sm">
        {report.blocked.length === 0 ? (
          <li className="text-muted-foreground">None</li>
        ) : (
          report.blocked.slice(0, 15).map((c) => (
            <li key={c.candidateId}>
              ✗ {c.candidateName} — {c.blockerReason} — {c.recommendedFix}
            </li>
          ))
        )}
      </ul>

      {warnings.length > 0 ? (
        <ul className="text-xs text-muted-foreground">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </ExecutiveCard>
  );
}
