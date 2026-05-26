import type { VariantPerformanceRow } from "@/lib/recruiting-decision-intelligence/types";

export function buildVariantTitlesByMetro(
  variants: VariantPerformanceRow[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const variant of variants) {
    const city = variant.cityTarget.split(",")[0]?.trim().toLowerCase() ?? "";
    if (!city) continue;
    const key = `${variant.state}:${city}`;
    const titles = out[key] ?? [];
    if (!titles.includes(variant.title)) titles.push(variant.title);
    out[key] = titles;
  }
  return out;
}
