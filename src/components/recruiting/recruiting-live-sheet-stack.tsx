"use client";

import { useState } from "react";
import { LiveSheetTable } from "./live-sheet-table";
import { ManagerSummary } from "./manager-summary";
import NeedsAttentionQueue from "./needs-attention-queue";
import { PostAutomationQueue } from "./post-automation-queue";

export function RecruitingLiveSheetStack() {
  const [drillSeq, setDrillSeq] = useState(0);
  const [drillManager, setDrillManager] = useState<string | null>(null);

  function handleClearManagerDrill() {
    setDrillManager(null);
    setDrillSeq((n) => n + 1);
  }

  return (
    <div className="space-y-6">
      <LiveSheetTable drillSeq={drillSeq} drillManager={drillManager} />

      <NeedsAttentionQueue />

      <ManagerSummary managerName={drillManager} onClear={handleClearManagerDrill} />

      <PostAutomationQueue />
    </div>
  );
}
