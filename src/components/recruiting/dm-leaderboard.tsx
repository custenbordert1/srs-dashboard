import type { DmLeaderboardRow } from "@/lib/recruiting-sample-data";

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1
      ? "bg-amber-500/20 text-amber-200 ring-amber-500/30"
      : rank === 2
        ? "bg-zinc-400/15 text-zinc-200 ring-zinc-400/25"
        : rank === 3
          ? "bg-orange-700/25 text-orange-200 ring-orange-600/30"
          : "bg-zinc-800 text-zinc-300 ring-zinc-700/40";
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ring-1 ${tone}`}
    >
      {rank}
    </span>
  );
}

export function DmLeaderboard({ rows }: { rows: DmLeaderboardRow[] }) {
  return (
    <section
      aria-labelledby="dm-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <h2 id="dm-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          DM leaderboard
        </h2>
        <p className="text-sm text-zinc-500">
          District managers ranked by pipeline velocity and closed hires
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium sm:px-5">Rank</th>
              <th className="px-4 py-3 font-medium sm:px-5">DM</th>
              <th className="px-4 py-3 font-medium sm:px-5">Market</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Interviews</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Offers</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Hires</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.map((row) => (
              <tr key={row.rank} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 sm:px-5">
                  <RankBadge rank={row.rank} />
                </td>
                <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.name}</td>
                <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.market}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.interviews}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.offers}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.hires}
                </td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <span className="inline-flex min-w-[2.5rem] justify-end rounded-md bg-teal-500/15 px-2 py-1 text-sm font-semibold tabular-nums text-teal-200 ring-1 ring-teal-500/25">
                    {row.score}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
