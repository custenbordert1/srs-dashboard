"use client";

import { ExecutiveSummary } from "@/components/executive/ui/executive-summary";
import { GlassPanel } from "@/components/executive/ui/glass-panel";
import { executiveSemantic } from "@/components/executive/ui/executive-tokens";
import { StatusBadge } from "@/components/executive/ui/status-badge";
import type { CommandCenterAssistantResponse } from "@/lib/ai-command-center/types";
import Link from "next/link";
import { useEffect, useState } from "react";

function riskTone(level: CommandCenterAssistantResponse["riskLevel"]): keyof typeof executiveSemantic {
  switch (level) {
    case "critical":
    case "high":
      return "critical";
    case "medium":
      return "attention";
    default:
      return "healthy";
  }
}

function businessImpactText(response: CommandCenterAssistantResponse): string {
  const parts: string[] = [];
  if (response.approvalRequired) {
    parts.push("Executive approval may be required before any action is taken.");
  } else {
    parts.push("This recommendation can proceed without an immediate approval gate.");
  }
  parts.push(`Operational risk is ${response.riskLevel}.`);
  if (response.automationReadiness) {
    parts.push(`Automation readiness: ${response.automationReadiness}.`);
  }
  return parts.join(" ");
}

function StreamingText({ text, active }: { text: string; active: boolean }) {
  const [visible, setVisible] = useState(active ? "" : text);

  useEffect(() => {
    if (!active) {
      setVisible(text);
      return;
    }
    setVisible("");
    let i = 0;
    const timer = setInterval(() => {
      i += 2;
      setVisible(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, 10);
    return () => clearInterval(timer);
  }, [text, active]);

  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{visible}</p>;
}

type AIResponseCardProps = {
  response: CommandCenterAssistantResponse;
  streaming?: boolean;
};

export function AIResponseCard({ response, streaming = false }: AIResponseCardProps) {
  const primaryAction = response.recommendedActions[0];
  const whyItMatters = response.supportingEvidence[0];
  const risk = riskTone(response.riskLevel);

  return (
    <article className="ex-fade-in space-y-5">
      <ExecutiveSummary title="Executive brief" accent>
        <StreamingText text={response.summary} active={streaming} />
      </ExecutiveSummary>

      <div className="grid gap-4 lg:grid-cols-2">
        {whyItMatters ? (
          <GlassPanel soft className="p-4 sm:p-5">
            <p className="text-xs font-medium text-zinc-500">Why this matters</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{whyItMatters}</p>
          </GlassPanel>
        ) : null}

        {primaryAction ? (
          <GlassPanel soft className={["p-4 sm:p-5", executiveSemantic.info.bg].join(" ")}>
            <p className="text-xs font-medium text-sky-300/90">Recommended action</p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-50">{primaryAction}</p>
            {response.recommendedActions.length > 1 ? (
              <ul className="mt-3 space-y-1 text-xs text-zinc-400">
                {response.recommendedActions.slice(1, 3).map((action) => (
                  <li key={action}>· {action}</li>
                ))}
              </ul>
            ) : null}
          </GlassPanel>
        ) : null}
      </div>

      <GlassPanel soft className="p-4 sm:p-5">
        <p className="text-xs font-medium text-zinc-500">Business impact</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{businessImpactText(response)}</p>
      </GlassPanel>

      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-500">Confidence</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">
            {response.confidence != null ? `${response.confidence}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">Risk profile</p>
          <p className={`mt-1 text-sm font-medium capitalize ${executiveSemantic[risk].text}`}>{response.riskLevel}</p>
        </div>
        <StatusBadge tone={response.approvalRequired ? "warning" : "success"}>
          {response.approvalRequired ? "Approval required" : "Clear to review"}
        </StatusBadge>
      </div>

      {response.supportingEvidence.length > 1 ? (
        <details className="group rounded-2xl bg-zinc-950/40 px-4 py-3 ring-1 ring-inset ring-white/[0.04]">
          <summary className="cursor-pointer text-xs font-medium text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Supporting evidence ({response.supportingEvidence.length - 1} more)
            </span>
            <span className="hidden group-open:inline">Hide supporting evidence</span>
          </summary>
          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-zinc-400">
            {response.supportingEvidence.slice(1, 8).map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {response.sourceAttributions.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-zinc-500">Sources</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {response.sourceAttributions.map((source) => (
              <li key={source.phase} className="rounded-full bg-zinc-800/40 px-2.5 py-1 text-[11px] text-zinc-400">
                {source.fullLabel}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {response.dashboardLinks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {response.dashboardLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-200 ring-1 ring-inset ring-sky-500/20 transition-colors hover:bg-sky-500/15"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}
