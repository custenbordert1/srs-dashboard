import type { JobManagementStatus } from "@/lib/job-management/job-management-rows";
import { JOB_STATUS_LABELS } from "@/lib/job-management/job-management-rows";

const STATUS_STYLES: Record<JobManagementStatus, string> = {
  draft: "bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/35",
  pending_push: "bg-sky-500/15 text-sky-100 ring-1 ring-sky-500/35",
  published: "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/35",
  push_failed: "bg-rose-500/15 text-rose-100 ring-1 ring-rose-500/35",
  needs_review: "bg-sky-500/15 text-sky-100 ring-1 ring-sky-500/35",
};

export function JobManagementStatusBadge({ status }: { status: JobManagementStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}
