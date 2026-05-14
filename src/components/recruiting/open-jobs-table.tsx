import type { OpenJob } from "@/lib/recruiting-sample-data";

const priorityStyles: Record<OpenJob["priority"], string> = {
  critical: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30",
  standard: "bg-zinc-500/15 text-zinc-200 ring-1 ring-zinc-500/25",
  backfill: "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/25",
};

export function OpenJobsTable({ jobs }: { jobs: OpenJob[] }) {
  return (
    <section
      aria-labelledby="open-jobs-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-1 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5 sm:py-5">
        <div>
          <h2 id="open-jobs-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Open jobs
          </h2>
          <p className="text-sm text-zinc-500">Highest-volume roles across SRS markets</p>
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Sample data
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium sm:px-5">Role</th>
              <th className="px-4 py-3 font-medium sm:px-5">Region</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Openings</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Applicants</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Days open</th>
              <th className="px-4 py-3 font-medium sm:px-5">Priority</th>
              <th className="px-4 py-3 font-medium sm:px-5">Hiring manager</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{job.title}</td>
                <td className="px-4 py-3 text-zinc-400 sm:px-5">{job.region}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {job.openings}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {job.applicants.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {job.daysOpen}
                </td>
                <td className="px-4 py-3 sm:px-5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${priorityStyles[job.priority]}`}
                  >
                    {job.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-400 sm:px-5">{job.hiringManager}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
