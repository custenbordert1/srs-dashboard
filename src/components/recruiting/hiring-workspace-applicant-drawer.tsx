"use client";

import type {
  HiringEligibilityPanel,
  HiringWorkspaceApplicantRow,
} from "@/lib/p258-hiring-workspace";

const labelClass = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500";

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-100 break-words">{value || "—"}</dd>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: HiringEligibilityPanel["verdict"] }) {
  const tone =
    verdict === "Eligible"
      ? "bg-teal-500/15 text-teal-200 ring-teal-500/30"
      : verdict === "Blocked"
        ? "bg-rose-500/15 text-rose-200 ring-rose-500/30"
        : "bg-amber-500/15 text-amber-100 ring-amber-500/30";
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${tone}`}>
      {verdict}
    </span>
  );
}

type Props = {
  applicant: HiringWorkspaceApplicantRow;
  onClose: () => void;
};

const DRAWER_SECTIONS = [
  "Overview",
  "Recruiting",
  "Workflow",
  "Paperwork",
  "History",
  "Eligibility",
  "Notes",
] as const;

export function HiringWorkspaceApplicantDrawer({ applicant, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Applicant review"
    >
      <button type="button" className="flex-1 cursor-default" aria-label="Close drawer" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-zinc-700 bg-zinc-900 shadow-xl">
        <header className="shrink-0 border-b border-zinc-800 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/80">
                Applicant review
              </p>
              <h3 className="mt-0.5 truncate text-lg font-semibold text-zinc-50">
                {applicant.displayName}
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                Score {applicant.hiringScore} · {applicant.workflowStatus}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {DRAWER_SECTIONS.map((section) => (
              <a
                key={section}
                href={`#hw-${section.toLowerCase()}`}
                className="rounded-md px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                {section}
              </a>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section id="hw-overview" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Overview</h4>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={applicant.displayName} />
              <Field label="Hiring score" value={String(applicant.hiringScore)} />
              <Field
                label="Distance"
                value={
                  applicant.distanceMiles != null ? `${Math.round(applicant.distanceMiles)} mi` : "—"
                }
              />
              <Field label="Applied" value={formatDate(applicant.appliedDate)} />
              <Field label="Email" value={applicant.email} />
              <Field label="Phone" value={applicant.phone} />
              <Field label="City" value={applicant.city} />
              <Field label="State" value={applicant.state} />
              <Field label="ZIP" value={applicant.zipCode} />
              <Field label="Source" value={applicant.source} />
              <Field label="Has resume" value={applicant.hasResume ? "Yes" : "No"} />
              <Field label="Last activity" value={formatDate(applicant.lastActivity)} />
            </dl>
            <div>
              <p className={labelClass}>Score breakdown</p>
              <ul className="mt-1 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2 text-[11px] text-zinc-400">
                {applicant.hiringScoreReasons.map((reason) => (
                  <li key={reason.id} className="flex justify-between gap-2">
                    <span>
                      {reason.label}: {reason.detail}
                    </span>
                    <span className="tabular-nums text-zinc-300">
                      {reason.points}×{reason.weight}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="hw-recruiting" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Recruiting</h4>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Recruiter" value={applicant.recruiter} />
              <Field label="DM" value={applicant.dm} />
              <Field
                label="Recruiter ownership"
                value={
                  applicant.recruiterAssignmentSource
                    ? [
                        applicant.recruiterAssignmentSource === "manual" ||
                        applicant.recruiterAssignmentSource === "operator_restore" ||
                        applicant.recruiterAssignmentSource ===
                          "operator_confirmed_historical_restore"
                          ? "Operator"
                          : applicant.recruiterAssignmentSource,
                        applicant.recruiterAssignedAt
                          ? formatDate(applicant.recruiterAssignedAt)
                          : null,
                        applicant.recruiterAssignedBy
                          ? `by ${applicant.recruiterAssignedBy}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "—"
                }
              />
              <Field
                label="DM ownership"
                value={
                  applicant.dmAssignmentSource
                    ? [
                        applicant.dmAssignmentSource === "manual" ? "Operator" : applicant.dmAssignmentSource,
                        applicant.dmAssignedAt ? formatDate(applicant.dmAssignedAt) : null,
                        applicant.dmAssignedBy ? `by ${applicant.dmAssignedBy}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "—"
                }
              />
              <Field label="Position" value={applicant.positionName} />
              <Field label="Position ID" value={applicant.positionId} />
              <Field label="Breezy stage" value={applicant.breezyStage} />
              <Field label="Next action" value={applicant.nextActionNeeded} />
            </dl>
          </section>

          <section id="hw-workflow" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Workflow</h4>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Workflow stage" value={applicant.workflowStatus} />
              <Field label="Ready for paperwork" value={applicant.readyForPaperwork ? "Yes" : "No"} />
            </dl>
          </section>

          <section id="hw-paperwork" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Paperwork</h4>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Paperwork status" value={applicant.paperworkStatus} />
              <Field label="Dropbox Sign" value={applicant.dropboxSignStatus} />
              <Field label="Template" value={applicant.paperworkTemplateKey || "—"} />
              <Field label="Signature request" value={applicant.signatureRequestId || "—"} />
              <Field label="Sent at" value={formatDate(applicant.paperworkSentAt)} />
              <Field label="Viewed at" value={formatDate(applicant.paperworkViewedAt)} />
              <Field label="Signed at" value={formatDate(applicant.paperworkSignedAt)} />
              <Field label="Error" value={applicant.paperworkError || "—"} />
            </dl>
          </section>

          <section id="hw-history" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">History</h4>
            {!applicant.history.length ? (
              <p className="text-sm text-zinc-500">No durable workflow history events.</p>
            ) : (
              <ol className="space-y-2">
                {applicant.history.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs"
                  >
                    <p className="text-zinc-200">{event.message || event.type}</p>
                    <p className="mt-0.5 text-zinc-500">{formatDate(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section id="hw-eligibility" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Eligibility
            </h4>
            <div className="flex items-center gap-2">
              <VerdictBadge verdict={applicant.eligibility.verdict} />
              <span className="text-[11px] text-zinc-500">Production send gates (P84)</span>
            </div>
            <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
              {applicant.eligibility.gates.map((gate) => (
                <li
                  key={gate.id}
                  className="flex items-start justify-between gap-2 text-[11px]"
                >
                  <span className="text-zinc-300">
                    {gate.label}
                    {gate.detail ? (
                      <span className="block text-zinc-500">{gate.detail}</span>
                    ) : null}
                  </span>
                  <span
                    className={
                      gate.passed ? "shrink-0 text-teal-300" : "shrink-0 text-rose-300"
                    }
                  >
                    {gate.passed ? "Pass" : "Fail"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section id="hw-notes" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Notes</h4>
            {!applicant.notes.length ? (
              <p className="text-sm text-zinc-500">No operator notes on file.</p>
            ) : (
              <ul className="space-y-2">
                {applicant.notes.map((note) => (
                  <li
                    key={note}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300"
                  >
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
