import type { TrendWeek } from "@/lib/recruiting-sample-data";

type Point = { x: number; yA: number; yH: number };

function buildPoints(data: TrendWeek[], width: number, height: number, pad: number): Point[] {
  const maxA = Math.max(...data.map((d) => d.applicants), 1);
  const maxH = Math.max(...data.map((d) => d.hires), 1);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;

  return data.map((d, i) => ({
    x: pad + i * step,
    yA: pad + innerH - (d.applicants / maxA) * innerH,
    yH: pad + innerH - (d.hires / maxH) * innerH,
  }));
}

function linePath(points: Point[], key: "yA" | "yH") {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p[key].toFixed(1)}`)
    .join(" ");
}

function areaPath(points: Point[], key: "yA" | "yH", baselineY: number) {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p[key].toFixed(1)}`)
    .join(" ");
  return `${line} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(
    1,
  )} ${baselineY.toFixed(1)} Z`;
}

export function RecruitingTrendsChart({ data }: { data: TrendWeek[] }) {
  const width = 960;
  const height = 280;
  const pad = 36;
  const points = buildPoints(data, width, height, pad);
  const baselineY = height - pad;

  return (
    <section
      aria-labelledby="trends-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="trends-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Recruiting trends
          </h2>
          <p className="text-sm text-zinc-500">Weekly applicants vs. hires (sample series)</p>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-6 rounded-full bg-sky-400/90" />
            Applicants
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-6 rounded-full bg-teal-400/90" />
            Hires
          </span>
        </div>
      </div>

      <div className="mt-4 w-full overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950/50">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Line chart of weekly applicants and hires"
        >
          <defs>
            <linearGradient id="gradApplicants" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(56 189 248)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(56 189 248)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gradHires" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(45 212 191)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(45 212 191)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect x={0} y={0} width={width} height={height} fill="transparent" />

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = pad + (height - pad * 2) * t;
            return (
              <line
                key={t}
                x1={pad}
                x2={width - pad}
                y1={y}
                y2={y}
                stroke="rgb(39 39 42 / 0.65)"
                strokeWidth={1}
              />
            );
          })}

          <path d={areaPath(points, "yA", baselineY)} fill="url(#gradApplicants)" />
          <path d={areaPath(points, "yH", baselineY)} fill="url(#gradHires)" />

          <path
            d={linePath(points, "yA")}
            fill="none"
            stroke="rgb(56 189 248)"
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={linePath(points, "yH")}
            fill="none"
            stroke="rgb(45 212 191)"
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {data.map((d, i) => {
            const x = points[i]?.x ?? pad;
            return (
              <text
                key={d.weekLabel}
                x={x}
                y={height - 10}
                textAnchor="middle"
                fill="rgb(113 113 122)"
                style={{ fontSize: 11 }}
              >
                {d.weekLabel}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
