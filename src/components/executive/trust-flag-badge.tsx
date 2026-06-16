import type { RoiCategory, TrustFlag } from "@/lib/executive-trust-roi/types";

const TRUST_FLAG_STYLES: Record<TrustFlag, string> = {
  Proven: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  Promising: "border-teal-500/30 bg-teal-500/10 text-teal-100",
  Unproven: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  "Needs review": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  "Poor performer": "border-rose-500/30 bg-rose-500/10 text-rose-100",
};

const ROI_CATEGORY_STYLES: Record<RoiCategory, string> = {
  "High ROI": "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  "Medium ROI": "border-teal-500/30 bg-teal-500/10 text-teal-100",
  "Low ROI": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  "Negative ROI": "border-rose-500/30 bg-rose-500/10 text-rose-100",
  "Not enough data": "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
};

export function TrustFlagBadge({ flag }: { flag: TrustFlag }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${TRUST_FLAG_STYLES[flag]}`}
      title={`Trust: ${flag}`}
    >
      {flag}
    </span>
  );
}

export function RoiCategoryBadge({ category }: { category: RoiCategory }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${ROI_CATEGORY_STYLES[category]}`}
      title={`ROI: ${category}`}
    >
      {category}
    </span>
  );
}
