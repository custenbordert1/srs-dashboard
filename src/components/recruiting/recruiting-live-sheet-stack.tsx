"use client";

import type { KpiDrillFilterId } from "@/lib/manager-kpi-filter";
import { useCallback, useState } from "react";
import { LiveSheetTable } from "./live-sheet-table";
import { ManagerKpiCards } from "./manager-kpi-cards";
import { ManagerSummary } from "./manager-summary";
import NeedsAttentionQueue, { NEEDS_ATTENTION_SECTION_ID } from "./needs-attention-queue";
import { PostAutomationQueue } from "./post-automation-queue";

export function RecruitingLiveSheetStack() {
  const [drillSeq, setDrillSeq] = useState(0);
  const [drillManager, setDrillManager] = useState<string | null>(null);
  const [kpiDrillFilter, setKpiDrillFilter] = useState<KpiDrillFilterId | null>(null);

  function handleClearManagerDrill() {
    setDrillManager(null);
    setDrillSeq((n) => n + 1);
  }

  const scrollToNeedsAttention = useCallback(() => {
    requestAnimationFrame(() => {
      document.getElementById(NEEDS_ATTENTION_SECTION_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  function handleKpiDrillFilterChange(filter: KpiDrillFilterId) {
    setKpiDrillFilter(filter);
    scrollToNeedsAttention();
  }

  function handleClearKpiDrillFilter() {
    setKpiDrillFilter(null);
  }

  return (
    <div className="space-y-6">
      <LiveSheetTable drillSeq={drillSeq} drillManager={drillManager} />

      <ManagerKpiCards
        selectedManager={drillManager}
        activeDrillFilter={kpiDrillFilter}
        onDrillFilterChange={handleKpiDrillFilterChange}
      />

      <NeedsAttentionQueue
        kpiDrillFilter={kpiDrillFilter}
        selectedManager={drillManager}
        onClearKpiDrillFilter={handleClearKpiDrillFilter}
      />

      <ManagerSummary managerName={drillManager} onClear={handleClearManagerDrill} />

      <PostAutomationQueue />
    </div>
  );
}
