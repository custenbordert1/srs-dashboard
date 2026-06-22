"use client";

import type { CandidateQuestionnaireIntelligence } from "@/lib/candidate-readiness/types";

const NOT_AVAILABLE = "Not available from Breezy yet.";

function formatBool(value: boolean | null): string {
  if (value === null) return "Not answered";
  return value ? "Yes" : "No";
}

type CandidateQuestionnaireIntelligencePanelProps = {
  intelligence: CandidateQuestionnaireIntelligence;
};

export function CandidateQuestionnaireIntelligencePanel({
  intelligence,
}: CandidateQuestionnaireIntelligencePanelProps) {
  const hasStructuredAnswers =
    intelligence.merchandisingExperience ||
    intelligence.priorVendorExperience ||
    intelligence.availabilityNotes ||
    intelligence.readinessChecks.some((check) => check.passed !== null);

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Questionnaire intelligence</h3>

      {!intelligence.available ? (
        <p className="mt-3 text-sm text-zinc-500">{NOT_AVAILABLE}</p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          {hasStructuredAnswers ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Key answers</p>
              <ul className="mt-1 space-y-1 text-zinc-300">
                <li>Merchandising experience: {intelligence.merchandisingExperience ?? "Not answered"}</li>
                <li>Prior vendor/company: {intelligence.priorVendorExperience ?? "Not answered"}</li>
                <li>Smartphone access: {formatBool(intelligence.smartphoneAccess)}</li>
                <li>Internet access: {formatBool(intelligence.internetAccess)}</li>
                <li>Comfort with apps/tools: {formatBool(intelligence.comfortableWithApps)}</li>
                <li>Printer/laptop access: {formatBool(intelligence.printerLaptopAccess)}</li>
                <li>Photo/upload comfort: {formatBool(intelligence.photoUploadComfort)}</li>
                <li>Schedule/deadline understanding: {formatBool(intelligence.scheduleUnderstanding)}</li>
                <li>Availability notes: {intelligence.availabilityNotes ?? "Not answered"}</li>
              </ul>
            </div>
          ) : null}

          {intelligence.answers.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Application responses</p>
              <ul className="mt-1 space-y-2 text-zinc-300">
                {intelligence.answers.map((entry, index) => (
                  <li key={`${entry.question}-${index}`}>
                    <span className="text-zinc-400">{entry.question}: </span>
                    {entry.answer || "Not answered"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Readiness checks</p>
            <ul className="mt-2 space-y-2">
              {intelligence.readinessChecks.map((check) => (
                <li key={check.label} className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                      check.passed === true
                        ? "border-teal-500/50 bg-teal-500/20 text-teal-100"
                        : check.passed === false
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                          : "border-zinc-600 bg-zinc-950 text-zinc-600"
                    }`}
                    aria-hidden
                  >
                    {check.passed === true ? "✓" : check.passed === false ? "✕" : ""}
                  </span>
                  <span className={check.passed === true ? "text-zinc-200" : "text-zinc-400"}>{check.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {intelligence.missingAnswers.length > 0 &&
          !intelligence.missingAnswers.every((item) => item.includes("Not available")) ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Missing answers</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-zinc-500">
                {intelligence.missingAnswers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
