"use client";

import { useState } from "react";
import { LiveSheetTable } from "./live-sheet-table";
import { ManagerSummary } from "./manager-summary";

export function LiveSheetSection() {
  const [drillSeq, setDrillSeq] = useState(0);
  const [drillManager, setDrillManager] = useState<string | null>(null);

  function handleClearManagerDrill() {
    setDrillManager(null);
    setDrillSeq((n) => n + 1);
  }

  return (
    <div className="space-y-6">
      <LiveSheetTable drillSeq={drillSeq} drillManager={drillManager} />
      <ManagerSummary managerName={drillManager} onClear={handleClearManagerDrill} />
    </div>
  );
}
