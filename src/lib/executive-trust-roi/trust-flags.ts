import { isSuccessfulEffectiveness } from "@/lib/recommendation-intelligence/scoring";
import type { RecommendationRecord } from "@/lib/recommendation-intelligence/types";
import { computeRoiCategory, typeSuccessRate } from "@/lib/executive-trust-roi/roi-categories";
import type { RoiCategory, TrustFlag } from "@/lib/executive-trust-roi/types";

export function assignTrustFlag(input: {
  records: RecommendationRecord[];
  roiCategory?: RoiCategory | null;
}): TrustFlag {
  const { records } = input;
  const tracked = records.filter((row) => row.status !== "Ignored");
  const scored = tracked.filter((row) => row.effectiveness != null);
  const successRate = typeSuccessRate(records);

  if (tracked.length < 2) return "Unproven";

  if (scored.length >= 3 && successRate < 35) return "Poor performer";

  if (successRate >= 70 && scored.length >= 5) return "Proven";

  if (successRate >= 50 && scored.length >= 3) return "Promising";

  const category = input.roiCategory ?? (scored[0] ? computeRoiCategory(scored[0]) : "Not enough data");
  if (category === "Not enough data" || scored.length < 3) return "Needs review";

  if (scored.some((row) => isSuccessfulEffectiveness(row.effectiveness))) return "Promising";

  return "Unproven";
}

export function assignRecordTrustFlag(record: RecommendationRecord, typeRecords: RecommendationRecord[]): TrustFlag {
  const category = computeRoiCategory(record);
  if (category === "Not enough data" && record.effectiveness == null) {
    return assignTrustFlag({ records: typeRecords });
  }
  if (category === "Negative ROI") return "Poor performer";
  if (category === "High ROI" && isSuccessfulEffectiveness(record.effectiveness)) return "Proven";
  if (category === "Medium ROI") return "Promising";
  if (category === "Low ROI") return "Needs review";
  return assignTrustFlag({ records: typeRecords, roiCategory: category });
}
