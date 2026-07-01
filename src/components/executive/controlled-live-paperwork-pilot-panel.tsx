"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import type { ControlledLivePaperworkPilotReport } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { useCallback, useEffect, useState } from "react";

export function ControlledLivePaperworkPilotPanel() {
  const [report, setReport] = useState<ControlledLivePaperworkPilotReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/controlled-live-paperwork-pilot", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        controlledLivePaperworkPilot?: ControlledLivePaperworkPilotReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.controlledLivePaperworkPilot) {
        setError(data.error ?? "Failed to load controlled live paperwork pilot");
        return;
      }
      setReport(data.controlledLivePaperworkPilot);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load controlled live paperwork pilot");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <ExecutivePanelLoading title="Controlled Live Paperwork Pilot" badge="P122 Preview" />;
  if (error || !report) {
    return (
      <ExecutivePanelError
        title="Controlled Live Paperwork Pilot"
        message={error ?? "No pilot report"}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <ExecutiveCard id="controlled-live-paperwork-pilot" variant="premium">
      <SectionHeader
        title="Controlled Live Paperwork Pilot"
        subtitle="P122 — preview only (executeOne script; no dashboard send button)"
        badge="P122 Preview"
      />

      <ExecutiveWarningList warnings={warnings} />

      <div className="mb-5 flex flex-wrap gap-2">
        <StatusBadge tone={report.pilotConfig.pilotEnabled ? "success" : "neutral"}>
          {`Pilot ${report.pilotConfig.pilotEnabled ? "enabled" : "disabled"}`}
        </StatusBadge>
        <StatusBadge tone={report.pilotConfig.liveModeEnabled ? "success" : "neutral"}>
          {`Live mode ${report.pilotConfig.liveModeEnabled ? "on" : "off"}`}
        </StatusBadge>
        <StatusBadge tone={report.pilotConfig.operatorGo ? "success" : "warning"}>
          {`Operator ${report.pilotConfig.operatorGo ? "GO" : "NO-GO"}`}
        </StatusBadge>
        <StatusBadge tone={report.goNoGo === "GO" ? "success" : "warning"}>{report.goNoGo}</StatusBadge>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Pilot cap" value={`${report.pilotConfig.maxSends}`} />
        <MetricCard label="Allowlisted" value={report.allowlistedCandidates.length.toLocaleString()} />
        <MetricCard label="Ready to send" value={report.eligiblePilotCandidates.length.toLocaleString()} />
        <MetricCard label="Blocked" value={report.blockedCandidates.length.toLocaleString()} />
      </div>

      <p className="mb-4 text-xs text-zinc-500">
        Required confirmation phrase for script execution: <span className="text-zinc-300">{P122_CONFIRMATION_PHRASE}</span>
      </p>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">System safety gates</h3>
      <ul className="mb-6 space-y-2 text-sm text-zinc-300">
        {report.systemSafetyChecks.map((check) => (
          <li key={check.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-3 py-2">
            <span className={check.passed ? "text-emerald-200" : "text-amber-200"}>
              {check.passed ? "PASS" : "FAIL"}
            </span>
            {" — "}
            {check.label}: {check.detail}
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Allowlisted candidates</h3>
      <div className="space-y-2">
        {report.allowlistedCandidates.length === 0 ? (
          <p className="text-sm text-zinc-500">No candidates on AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST.</p>
        ) : (
          report.allowlistedCandidates.map((candidate) => (
            <div
              key={candidate.candidateId}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-zinc-100">{candidate.candidateName}</span>
                <StatusBadge tone={candidate.status === "ready_to_send" ? "success" : "warning"}>
                  {candidate.status === "ready_to_send" ? "Ready" : "Blocked"}
                </StatusBadge>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{candidate.email || "No email"}</p>
              {candidate.blockingReasons.length > 0 ? (
                <p className="mt-1 text-xs text-amber-200/90">{candidate.blockingReasons.join(" · ")}</p>
              ) : null}
            </div>
          ))
        )}
      </div>

      {report.sendResult ? (
        <div className="mt-6 rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-4 py-3 text-sm text-zinc-300">
          <p className="font-medium text-zinc-100">Last pilot send result</p>
          <p className="mt-1">
            {report.sendResult.candidateName} — {report.sendResult.outcome}
            {report.sendResult.signatureRequestId ? ` · ${report.sendResult.signatureRequestId}` : ""}
          </p>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
