import type { PipelineStage } from "@/lib/recruiting-sample-data";

export function ApplicantPipeline({ stages }: { stages: PipelineStage[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <section
      aria-labelledby="pipeline-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="pipeline-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Applicant pipeline
          </h2>
          <p className="text-sm text-zinc-500">Volume by stage (last 30 days)</p>
        </div>
      </div>

      <ol className="mt-5 space-y-4">
        {stages.map((stage) => {
          const pct = Math.round((stage.count / max) * 100);
          return (
            <li key={stage.id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-zinc-200">{stage.label}</span>
                <span className="tabular-nums text-zinc-400">
                  {stage.count.toLocaleString()}
                  <span className="ml-2 text-xs text-zinc-600">({pct}% of top stage)</span>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800/80">
                <div
                  className={`h-full rounded-full ${stage.color} transition-[width] duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
