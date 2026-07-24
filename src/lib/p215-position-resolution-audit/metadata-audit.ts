import { classifyP215TitleKind } from "@/lib/p215-position-resolution-audit/classify";
import type { P215PositionMetadataSummary } from "@/lib/p215-position-resolution-audit/types";

export type P215PositionInput = {
  jobId: string;
  name: string;
  city: string;
  state: string;
};

/** Part 6 — metadata audit across all scanned Breezy positions. */
export function auditP215PositionMetadata(
  positions: P215PositionInput[],
): P215PositionMetadataSummary {
  let withValidLocation = 0;
  let withoutLocation = 0;
  let flexiblePostings = 0;
  let nationalPostings = 0;
  let missingCity = 0;
  let missingState = 0;

  for (const p of positions) {
    const hasCity = Boolean(p.city.trim());
    const hasState = Boolean(p.state.trim());
    if (hasCity && hasState) withValidLocation += 1;
    else withoutLocation += 1;
    if (!hasCity) missingCity += 1;
    if (!hasState) missingState += 1;

    const kind = classifyP215TitleKind(p.name);
    if (kind === "flexible") flexiblePostings += 1;
    if (kind === "national") nationalPostings += 1;
  }

  return {
    totalPositions: positions.length,
    withValidLocation,
    withoutLocation,
    flexiblePostings,
    nationalPostings,
    missingCity,
    missingState,
  };
}
