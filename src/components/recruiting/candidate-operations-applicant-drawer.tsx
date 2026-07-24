"use client";

import type {
  CandidateOpsApplicant,
  CandidateOpsIntelligenceBadge,
} from "@/lib/p259-candidate-operations";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

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

function toneClass(tone: CandidateOpsIntelligenceBadge["tone"]): string {
  switch (tone) {
    case "good":
      return "bg-teal-500/15 text-teal-200 ring-teal-500/30";
    case "warn":
      return "bg-amber-500/15 text-amber-100 ring-amber-500/30";
    case "bad":
      return "bg-rose-500/15 text-rose-200 ring-rose-500/30";
    case "info":
      return "bg-sky-500/15 text-sky-200 ring-sky-500/30";
    default:
      return "bg-zinc-800 text-zinc-300 ring-zinc-700";
  }
}

const DRAWER_SECTIONS = [
  "Summary",
  "Score",
  "Eligibility",
  "Workflow",
  "Documents",
  "Communications",
  "Notes",
  "Timeline",
] as const;

type Props = {
  applicant: CandidateOpsApplicant;
  onClose: () => void;
  recruiterOptions?: string[];
  dmOptions?: string[];
  onRequestMoveStage: (toStatus: CandidateWorkflowStatus) => void;
  onRequestAssignRecruiter: (recruiter: string) => void;
  onRequestAssignDm: (dm: string) => void;
  onPaperworkAction: (
    actionId: CandidateOpsApplicant["paperworkPanel"]["actions"][number]["id"],
  ) => void;
};

export function CandidateOperationsApplicantDrawer({
  applicant,
  onClose,
  recruiterOptions = [],
  dmOptions = [],
  onRequestMoveStage,
  onRequestAssignRecruiter,
  onRequestAssignDm,
  onPaperworkAction,
}: Props) {
  const intel = applicant.intelligence;
  const paperwork = applicant.paperworkPanel;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Candidate operations review"
    >
      <button type="button" className="flex-1 cursor-default" aria-label="Close drawer" onClick={onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-zinc-700 bg-zinc-900 shadow-xl">
        <header className="shrink-0 border-b border-zinc-800 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-200/80">
                Candidate operations
              </p>
              <h3 className="mt-0.5 truncate text-lg font-semibold text-zinc-50">
                {applicant.displayName}
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                Score {applicant.hiringScore} · Sign {intel.probabilityToSign}% ·{" "}
                {applicant.workflowStatus}
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
                href={`#co-${section.toLowerCase()}`}
                className="rounded-md px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                {section}
              </a>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {intel.badges.map((badge) => (
              <span
                key={badge.id}
                title={badge.detail}
                className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ${toneClass(badge.tone)}`}
              >
                {badge.label}: {badge.value}
              </span>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section id="co-summary" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Summary</h4>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={applicant.displayName} />
              <Field
                label="Distance"
                value={
                  applicant.distanceMiles != null
                    ? `${Math.round(applicant.distanceMiles)} mi`
                    : "—"
                }
              />
              <Field label="Current project / job" value={applicant.positionName || "—"} />
              <Field label="Position ID" value={applicant.positionId} />
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
              <Field label="Email" value={applicant.email} />
              <Field label="Phone" value={applicant.phone} />
              <Field label="City" value={applicant.city} />
              <Field label="State" value={applicant.state} />
              <Field label="Applied" value={formatDate(applicant.appliedDate)} />
              <Field label="Last activity" value={formatDate(applicant.lastActivity)} />
            </dl>
          </section>

          <section id="co-score" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Hiring Score / Intelligence
            </h4>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Hiring score" value={String(intel.hiringScore)} />
              <Field label="Probability to sign" value={`${intel.probabilityToSign}%`} />
              <Field label="Probability to complete" value={`${intel.probabilityToComplete}%`} />
              <Field
                label="Estimated days to hire"
                value={intel.estimatedDaysToHire == null ? "—" : String(intel.estimatedDaysToHire)}
              />
              <Field label="Coverage" value={intel.coverageBand} />
              <Field label="Duplicate risk" value={intel.duplicateRisk} />
              <Field
                label="Missing information"
                value={intel.missingInformation.length ? intel.missingInformation.join(", ") : "None"}
              />
            </dl>
            <ul className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2 text-[11px] text-zinc-400">
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
          </section>

          <section id="co-eligibility" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Eligibility
            </h4>
            <p className="text-sm text-zinc-200">{applicant.eligibility.verdict}</p>
            <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
              {applicant.eligibility.gates.map((gate) => (
                <li key={gate.id} className="flex items-start justify-between gap-2 text-[11px]">
                  <span className="text-zinc-300">
                    {gate.label}
                    {gate.detail ? <span className="block text-zinc-500">{gate.detail}</span> : null}
                  </span>
                  <span className={gate.passed ? "text-teal-300" : "text-rose-300"}>
                    {gate.passed ? "Pass" : "Fail"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section id="co-workflow" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Workflow</h4>
            <div className="flex flex-wrap gap-1">
              {applicant.workflowStages.map((stage) => (
                <span
                  key={stage.id}
                  className={`rounded-md px-2 py-0.5 text-[10px] ring-1 ${
                    stage.current
                      ? "bg-teal-500/15 text-teal-200 ring-teal-500/30"
                      : "bg-zinc-950 text-zinc-500 ring-zinc-800"
                  }`}
                >
                  {stage.label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500">
                Move stage
                <select
                  className="mt-1 block rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
                  defaultValue=""
                  onChange={(event) => {
                    const value = event.target.value as CandidateWorkflowStatus;
                    if (!value) return;
                    onRequestMoveStage(value);
                    event.target.value = "";
                  }}
                >
                  <option value="">Select stage…</option>
                  {applicant.workflowStages
                    .filter((s) => s.id !== "Archived")
                    .map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500">
                Assign recruiter
                <select
                  className="mt-1 block rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
                  defaultValue=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    onRequestAssignRecruiter(value);
                    event.target.value = "";
                  }}
                >
                  <option value="">Select recruiter…</option>
                  {recruiterOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500">
                Assign DM
                <select
                  className="mt-1 block rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
                  defaultValue=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    onRequestAssignDm(value);
                    event.target.value = "";
                  }}
                >
                  <option value="">Select DM…</option>
                  {dmOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[10px] text-zinc-600">
              Stage / assignment changes require confirmation and call existing workflow APIs only.
            </p>
          </section>

          <section id="co-documents" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Documents / Paperwork
            </h4>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Dropbox status" value={paperwork.dropboxStatus} />
              <Field label="Template" value={paperwork.template} />
              <Field label="Envelope" value={paperwork.envelopeId || "—"} />
              <Field label="Viewed" value={paperwork.viewed ? formatDate(paperwork.viewedAt) : "No"} />
              <Field label="Signed" value={paperwork.signed ? formatDate(paperwork.signedAt) : "No"} />
              <Field label="Reminder count" value={String(paperwork.reminderCount)} />
              <Field label="Sent date" value={formatDate(paperwork.sentDate)} />
              <Field label="Expiration" value={formatDate(paperwork.expiration)} />
              <Field label="Error" value={paperwork.error || "—"} />
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {paperwork.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  title={action.disabledReason}
                  onClick={() => onPaperworkAction(action.id)}
                  className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {action.label}
                  {!action.liveWired && action.requiresConfirm ? " · preview" : ""}
                </button>
              ))}
            </div>
          </section>

          <section id="co-communications" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Communications
            </h4>
            <ol className="space-y-2">
              {applicant.communications.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    item.sparse
                      ? "border-zinc-800/60 bg-zinc-950/30 text-zinc-500"
                      : "border-zinc-800 bg-zinc-950/40 text-zinc-300"
                  }`}
                >
                  <p className="font-medium text-zinc-200">{item.title}</p>
                  <p className="mt-0.5">{item.detail}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
                    {item.kind}
                    {item.at ? ` · ${formatDate(item.at)}` : ""}
                    {item.sparse ? " · sparse" : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section id="co-notes" className="space-y-3">
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

          <section id="co-timeline" className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Timeline</h4>
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
        </div>
      </aside>
    </div>
  );
}
