import { ExecutiveCard } from "@/components/executive/ui/executive-card";
import { GlassPanel } from "@/components/executive/ui/glass-panel";
import {
  ChatResponseSkeleton,
  MetricSkeleton,
} from "@/components/executive/ui/loading-skeleton";
import { SectionHeader } from "@/components/executive/ui/section-header";

export function AICommandCenterLoadingSkeleton() {
  return (
    <ExecutiveCard variant="premium" className="ex-fade-in overflow-hidden">
      <SectionHeader
        eyebrow="Your executive operating layer"
        title="Executive AI Assistant"
        badge="Preview · P77 Governed"
        badgeTone="preview"
      />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <MetricSkeleton key={index} />
        ))}
      </div>
      <GlassPanel soft className="mt-10 overflow-hidden !rounded-3xl p-6 sm:p-7">
        <ChatResponseSkeleton />
      </GlassPanel>
    </ExecutiveCard>
  );
}
