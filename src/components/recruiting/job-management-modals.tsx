"use client";

import type { JobDraft } from "@/lib/job-management/job-draft-types";
import {
  buildBreezyPositionPayload,
  buildDisplayLocation,
  validateJobDraftForBreezyPush,
  type BreezyPositionVerification,
} from "@/lib/job-management/breezy-position-payload";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import { BREEZY_COUNTRY_CODE } from "@/lib/job-management/us-location-rules";
import type { JobManagementRow } from "@/lib/job-management/job-management-rows";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-teal-500/50";
const labelClass = "block text-xs font-medium text-zinc-500";

export function JobViewModal({
  row,
  onClose,
}: {
  row: JobManagementRow;
  onClose: () => void;
}) {
  return (
    <ModalShell title="View job" onClose={onClose}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Field label="Title" value={row.title} />
        <Field label="Status" value={row.statusLabel} />
        <Field label="City" value={row.city || "—"} />
        <Field label="State" value={row.state || "—"} />
        <Field label="Display location" value={row.displayLocation || "—"} />
        <Field label="Source" value={row.source} />
        <Field label="Applicants" value={row.applicants?.toLocaleString() ?? "—"} />
        <Field
          label="Posted"
          value={row.postedDate ? new Date(row.postedDate).toLocaleString() : "—"}
        />
        <Field
          label="Last synced"
          value={row.lastSynced ? new Date(row.lastSynced).toLocaleString() : "—"}
        />
        {row.breezyJobId ? <Field label="Breezy job ID" value={row.breezyJobId} /> : null}
        {row.draftId ? <Field label="Draft ID" value={row.draftId} /> : null}
      </dl>
      {row.draft?.description ? (
        <div className="mt-4">
          <p className={labelClass}>Description</p>
          <p className="mt-1 max-h-40 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 text-xs text-zinc-300 whitespace-pre-wrap">
            {row.draft.description}
          </p>
        </div>
      ) : row.breezyJob?.description ? (
        <div className="mt-4">
          <p className={labelClass}>Description</p>
          <p className="mt-1 max-h-40 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 text-xs text-zinc-300 whitespace-pre-wrap">
            {row.breezyJob.description}
          </p>
        </div>
      ) : null}
    </ModalShell>
  );
}

export function JobDraftEditModal({
  draft,
  saving,
  onClose,
  onChange,
  onSave,
  onPush,
}: {
  draft: JobDraft;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<JobDraft>) => void;
  onSave: () => void;
  onPush: () => void;
}) {
  const location = normalizeJobLocationFields(draft.city, draft.usState);
  const validation = validateJobDraftForBreezyPush({
    ...draft,
    city: location.city,
    usState: location.usState,
  });

  return (
    <ModalShell title="Edit draft job" onClose={onClose} wide>
      <p className="text-xs text-zinc-500">
        US only — country is always US in Breezy. City and state are separate fields; display location is
        formatted as City, ST.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>
          Title
          <input className={inputClass} value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
        </label>
        <label className={labelClass}>
          Department
          <input
            className={inputClass}
            value={draft.department}
            onChange={(e) => onChange({ department: e.target.value })}
          />
        </label>
        <label className={labelClass}>
          Pay rate
          <input className={inputClass} value={draft.payRate} onChange={(e) => onChange({ payRate: e.target.value })} />
        </label>
        <label className={labelClass}>
          City
          <input
            className={inputClass}
            value={draft.city}
            placeholder="Dallas"
            onChange={(e) => onChange({ city: e.target.value })}
            onBlur={() => {
              const normalized = normalizeJobLocationFields(draft.city, draft.usState);
              onChange({ city: normalized.city, usState: normalized.usState || draft.usState });
            }}
          />
        </label>
        <label className={labelClass}>
          State
          <input
            className={inputClass}
            value={draft.usState}
            placeholder="TX"
            onChange={(e) => onChange({ usState: e.target.value })}
          />
        </label>
        <div className="sm:col-span-2">
          <p className={labelClass}>Display location</p>
          <p className="mt-1 rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-sm text-zinc-300">
            {buildDisplayLocation(location.city, location.usState) || "—"}
          </p>
        </div>
        <label className={`${labelClass} sm:col-span-2`}>
          Description
          <textarea
            className={`${inputClass} min-h-[120px]`}
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </label>
      </div>

      {!validation.ok ? (
        <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {validation.message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300">
          Close
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          disabled={!validation.ok}
          onClick={onPush}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
        >
          Push to Breezy
        </button>
      </div>
    </ModalShell>
  );
}

export function JobPushConfirmModal({
  draft,
  pushing,
  onClose,
  onConfirm,
}: {
  draft: JobDraft;
  pushing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const built = buildBreezyPositionPayload(draft);
  const validation = validateJobDraftForBreezyPush(draft);

  return (
    <ModalShell title="Confirm push to Breezy" onClose={onClose} wide>
      <p className="text-sm text-zinc-400">
        This creates a new published position in Breezy using the saved draft below.
      </p>

      {!validation.ok ? (
        <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {validation.message}
        </p>
      ) : null}

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <Field label="Title" value={draft.title} />
        <Field label="Department" value={draft.department || "—"} />
        <Field label="City" value={draft.city || "—"} />
        <Field label="State" value={draft.usState || "—"} />
        <Field label="Pay rate" value={draft.payRate || "—"} />
        <Field
          label="Display location"
          value={buildDisplayLocation(draft.city, draft.usState) || "—"}
        />
      </dl>

      <div className="mt-3">
        <p className={labelClass}>Description</p>
        <p className="mt-1 max-h-28 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 text-xs text-zinc-300 whitespace-pre-wrap">
          {draft.description.trim() || "(empty)"}
        </p>
      </div>

      {built.ok ? (
        <div className="mt-4">
          <p className="text-xs text-zinc-600">Country sent to Breezy: {BREEZY_COUNTRY_CODE} (fixed)</p>
          <p className={labelClass}>Breezy payload preview</p>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-400">
            {JSON.stringify(built.payload, null, 2)}
          </pre>
        </div>
      ) : (
        <p className="mt-3 text-sm text-rose-200">{built.error}</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300">
          Cancel
        </button>
        <button
          type="button"
          disabled={pushing || !built.ok}
          onClick={onConfirm}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
        >
          {pushing ? "Saving & posting…" : "Confirm and post"}
        </button>
      </div>
    </ModalShell>
  );
}

export function JobPushResultModal({
  breezyJobId,
  verification,
  onClose,
}: {
  breezyJobId: string;
  verification?: BreezyPositionVerification;
  onClose: () => void;
}) {
  const matched = verification?.ok === true;
  return (
    <ModalShell title={matched ? "Push successful" : "Push completed with warnings"} onClose={onClose}>
      <p className="text-sm text-zinc-300">
        Breezy job ID: <span className="font-mono text-teal-200">{breezyJobId}</span>
      </p>
      {verification ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className={matched ? "text-emerald-200" : "text-amber-200"}>
            {matched
              ? "Breezy returned matching title, location, and pay rate."
              : "Breezy returned data that did not fully match the draft."}
          </p>
          <Field label="Expected title" value={verification.expected.name || "—"} />
          <Field label="Breezy title" value={verification.actual.name || "—"} />
          <Field
            label="Expected location"
            value={
              verification.expected.city && verification.expected.state
                ? `${verification.expected.city}, ${verification.expected.state}`
                : "—"
            }
          />
          <Field label="Breezy location" value={verification.actual.displayLocation || "—"} />
          <Field label="Expected pay rate" value={verification.expected.payRate || "—"} />
          <Field label="Breezy pay rate" value={verification.actual.payRate || "—"} />
          {verification.mismatches.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-amber-100">
              {verification.mismatches.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">
          Done
        </button>
      </div>
    </ModalShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className="mt-0.5 text-zinc-100">{value}</dd>
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-50">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-300">
            Close
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
