type LoadingSkeletonProps = {
  className?: string;
};

export function LoadingSkeleton({ className = "" }: LoadingSkeletonProps) {
  return <div className={["ex-shimmer rounded-lg", className].join(" ")} />;
}

export function MetricSkeleton() {
  return (
    <div className="rounded-2xl bg-zinc-900/20 p-4 ring-1 ring-inset ring-white/[0.04]">
      <LoadingSkeleton className="h-10 w-24" />
      <LoadingSkeleton className="mt-3 h-3 w-28" />
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      <LoadingSkeleton className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <LoadingSkeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function ChatResponseSkeleton() {
  return (
    <div className="flex gap-3">
      <LoadingSkeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-3 rounded-2xl bg-zinc-950/40 p-5 ring-1 ring-inset ring-white/[0.04]">
        <LoadingSkeleton className="h-4 w-32" />
        <LoadingSkeleton className="h-16 w-full" />
        <LoadingSkeleton className="h-4 w-28" />
        <LoadingSkeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-2xl bg-zinc-900/20 p-5 ring-1 ring-inset ring-white/[0.04]">
      <LoadingSkeleton className="h-4 w-36" />
      <LoadingSkeleton className="mt-4 h-32 w-full rounded-xl" />
    </div>
  );
}
