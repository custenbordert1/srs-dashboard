"use client";

import type { KpiDrillFilterId } from "@/lib/manager-kpi-filter";
import { useCallback, useState } from "react";
import { ManagerKpiCards } from "./manager-kpi-cards";
import NeedsAttentionQueue, { NEEDS_ATTENTION_SECTION_ID } from "./needs-attention-queue";

export function NeedsAttentionSection() {
  const [kpiDrillFilter, setKpiDrillFilter] = useState<KpiDrillFilterId | null>(null);
  const scrollToQueue = useCallback(() => {
    requestAnimationFrame(() => {
      document.getElementById(NEEDS_ATTENTION_SECTION_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  function handleKpiDrillFilterChange(filter: KpiDrillFilterId) {
    setKpiDrillFilter(filter);
    scrollToQueue();
  }

  return (
    <div className="space-y-6">
      <ManagerKpiCards
        activeDrillFilter={kpiDrillFilter}
        onDrillFilterChange={handleKpiDrillFilterChange}
      />
      <NeedsAttentionQueue
        kpiDrillFilter={kpiDrillFilter}
        onClearKpiDrillFilter={() => setKpiDrillFilter(null)}
      />
    </div>
  );
}
