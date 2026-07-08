function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function formatRelative(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export function LastUpdatedBadge({
  at,
  stale,
  ageSeconds,
  refreshing,
}: {
  at: string | null | undefined;
  stale?: boolean;
  ageSeconds?: number | null;
  refreshing?: boolean;
}) {
  const value =
    typeof ageSeconds === "number" ? formatRelative(ageSeconds) : formatTimestamp(at);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
          stale
            ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
            : "border-zinc-700 bg-zinc-900/60 text-zinc-400"
        }`}
      >
        {stale ? "Stale · " : "Last updated · "}
        {value}
      </span>
      {refreshing ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" aria-hidden />
          Refreshing…
        </span>
      ) : null}
    </span>
  );
}
