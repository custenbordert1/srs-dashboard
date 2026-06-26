import { ExecutiveButton } from "@/components/executive/ui/executive-button";
import { ExecutiveCard } from "@/components/executive/ui/executive-card";
import { CardSkeleton } from "@/components/executive/ui/loading-skeleton";
import { SectionHeader } from "@/components/executive/ui/section-header";

export function ExecutivePanelLoading({
  title,
  badge,
}: {
  title: string;
  badge?: string;
}) {
  return (
    <ExecutiveCard>
      <SectionHeader title={title} badge={badge} />
      <div className="mt-6">
        <CardSkeleton lines={4} />
      </div>
    </ExecutiveCard>
  );
}

export function ExecutivePanelError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <ExecutiveCard variant="warning">
      <SectionHeader title={title} badgeTone="warning" />
      <p className="mt-3 text-sm text-amber-100/90">{message}</p>
      {onRetry ? (
        <div className="mt-4">
          <ExecutiveButton onClick={onRetry}>Retry</ExecutiveButton>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}

export function ExecutiveWarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-xl bg-amber-500/[0.04] px-3.5 py-2.5 text-xs leading-relaxed text-amber-100/85 ring-1 ring-inset ring-amber-500/10">
      {warnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  );
}
