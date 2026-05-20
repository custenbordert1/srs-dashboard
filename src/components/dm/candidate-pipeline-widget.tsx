import type { CandidatePipelineSnapshot } from "@/lib/dm-dashboard";

const BUCKET_META = [
  { key: "applied" as const, label: "Applied", color: "border-sky-500/30 bg-sky-500/10 text-sky-100" },
  {
    key: "interviewing" as const,
    label: "Interviewing",
    color: "border-violet-500/30 bg-violet-500/10 text-violet-100",
  },
  { key: "hired" as const, label: "Hired", color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" },
  { key: "stalled" as const, label: "Stalled", color: "border-amber-500/30 bg-amber-500/10 text-amber-100" },
];

export function CandidatePipelineWidget({
  pipeline,
  onCandidateClick,
  selectedCandidateId,
}: {
  pipeline: CandidatePipelineSnapshot;
  onCandidateClick?: (candidateId: string) => void;
  selectedCandidateId?: string | null;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Candidate pipeline</h2>
      <p className="mt-1 text-sm text-zinc-500">Applied, interviewing, hired, and stalled (14+ days)</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BUCKET_META.map((bucket) => (
          <article key={bucket.key} className={`rounded-xl border px-4 py-3 ${bucket.color}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{bucket.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{pipeline.counts[bucket.key]}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {BUCKET_META.map((bucket) => {
          const rows = pipeline[bucket.key];
          return (
            <div key={bucket.key}>
              <h3 className="text-sm font-medium text-zinc-300">{bucket.label}</h3>
              {rows.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">None in this bucket.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {rows.slice(0, 5).map((row) => (
                    <li
                      key={row.candidateId}
                      role={onCandidateClick ? "button" : undefined}
                      tabIndex={onCandidateClick ? 0 : undefined}
                      onClick={onCandidateClick ? () => onCandidateClick(row.candidateId) : undefined}
                      onKeyDown={
                        onCandidateClick
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onCandidateClick(row.candidateId);
                              }
                            }
                          : undefined
                      }
                      className={`rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2 text-xs ${
                        onCandidateClick
                          ? "cursor-pointer transition-colors hover:border-teal-500/30 hover:bg-zinc-900/80"
                          : ""
                      } ${selectedCandidateId === row.candidateId ? "ring-1 ring-teal-500/40" : ""}`}
                    >
                      <p className="font-medium text-zinc-200">{row.name}</p>
                      <p className="text-zinc-500">
                        {row.position} · {row.stage}
                        {row.daysInStage != null ? ` · ${row.daysInStage}d` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
