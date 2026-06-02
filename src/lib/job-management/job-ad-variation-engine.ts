import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";
import type { JobVariantQueueStatus } from "@/lib/job-management/job-draft-types";
import { buildVariantDescriptionBody } from "@/lib/job-management/job-variant-description-template";
import { expandMetroCities } from "@/lib/job-management/job-metro-expansion";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import { getDmForState } from "@/lib/dm-territory-map";

export const JOB_VARIANT_TITLE_TEMPLATES = [
  "Retail Merchandiser",
  "Field Merchandising Specialist",
  "Store Reset Representative",
  "Retail Project Support",
  "Traveling Merchandiser",
] as const;

/** Lines matching these patterns are copied verbatim — pay, employment, and compliance language. */
const LOCKED_LINE_PATTERNS = [
  /\bpay\b/i,
  /\/hr\b/i,
  /\$\d/,
  /\bcontractor\b/i,
  /\b1099\b/i,
  /\bw-?2\b/i,
  /\bemployment\b/i,
  /\bindependent contractor\b/i,
  /\bequal opportunity\b/i,
  /\beeo\b/i,
  /\bbackground check\b/i,
  /\bdrug screen\b/i,
  /\bmust be\b/i,
  /\brequired\b/i,
  /\bqualification/i,
  /\bbenefits\b/i,
  /\be-?verify\b/i,
] as const;

export function isLockedDescriptionLine(line: string, payRate: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (payRate.trim() && trimmed.toLowerCase().includes(payRate.trim().toLowerCase())) return true;
  return LOCKED_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export type GeneratedJobVariant = {
  sourceJobId: string;
  variantGroupId: string;
  variantIndex: number;
  generatedTitle: string;
  generatedDescriptionHash: string;
  cityTarget: string;
  usState: string;
  dmOwner: string;
  title: string;
  description: string;
  payRate: string;
  department: string;
  source: string;
  queueStatus: JobVariantQueueStatus;
  metadata: Record<string, string>;
};

export function hashJobDescription(description: string): string {
  return createHash("sha256").update(description.trim()).digest("hex").slice(0, 16);
}

function rotate<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

function shuffleMutableBullets(lines: string[], variantIndex: number, payRate: string): string[] {
  const mutableIndexes: number[] = [];
  const mutableBullets: string[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const isBullet = /^[-*•]/.test(trimmed) || /^\d+\./.test(trimmed);
    if (isBullet && !isLockedDescriptionLine(trimmed, payRate)) {
      mutableIndexes.push(index);
      mutableBullets.push(line);
    }
  });

  if (mutableBullets.length < 2) return lines;

  const rotated = [
    ...mutableBullets.slice(variantIndex % mutableBullets.length),
    ...mutableBullets.slice(0, variantIndex % mutableBullets.length),
  ];

  const result = [...lines];
  mutableIndexes.forEach((lineIndex, bulletIndex) => {
    result[lineIndex] = rotated[bulletIndex]!;
  });
  return result;
}

export function buildVariantDescription(options: {
  baseDescription: string;
  payRate: string;
  cityTarget: string;
  usState: string;
  variantIndex: number;
}): string {
  return buildVariantDescriptionBody({
    baseDescription: options.baseDescription,
    payRate: options.payRate,
    cityTarget: options.cityTarget,
    usState: options.usState,
    variantIndex: options.variantIndex,
    shuffleMutableBullets,
  });
}

export function generateJobAdVariants(
  row: BreezyJobCatalogRow,
  options?: {
    variantCount?: number;
    cityTargets?: string[];
    variantGroupId?: string;
  },
): GeneratedJobVariant[] {
  const location = normalizeJobLocationFields(row.city, row.usState);
  const variantCount = Math.min(
    5,
    Math.max(3, options?.variantCount ?? 5),
  );
  const cities =
    options?.cityTargets?.length && options.cityTargets.length > 0
      ? options.cityTargets.map((c) => c.trim()).filter(Boolean).slice(0, variantCount)
      : expandMetroCities(location.city, location.usState, variantCount);

  const variantGroupId = options?.variantGroupId ?? randomUUID();
  const payRate = row.payRate?.trim() ?? "";
  const department = row.department?.trim() ?? "";
  const baseDescription = row.description?.trim() ?? "";
  const dmOwner = getDmForState(location.usState) ?? "Unassigned";

  const variants: GeneratedJobVariant[] = [];

  for (let index = 0; index < Math.min(variantCount, cities.length); index += 1) {
    const cityTarget = cities[index]!;
    const titleBase = rotate(JOB_VARIANT_TITLE_TEMPLATES, index);
    const generatedTitle = titleBase;
    const title = `${generatedTitle} — ${cityTarget}, ${location.usState}`;
    const description = buildVariantDescription({
      baseDescription,
      payRate,
      cityTarget,
      usState: location.usState,
      variantIndex: index,
    });

    variants.push({
      sourceJobId: row.breezyJobId,
      variantGroupId,
      variantIndex: index,
      generatedTitle,
      generatedDescriptionHash: hashJobDescription(description),
      cityTarget,
      usState: location.usState,
      dmOwner,
      title,
      description,
      payRate,
      department,
      source: row.source,
      queueStatus: "pending",
      metadata: {
        variantGroupId,
        sourceJobId: row.breezyJobId,
        generatedTitle,
        generatedDescriptionHash: hashJobDescription(description),
        cityTarget,
        dmOwner,
        variantIndex: String(index),
        clonedFrom: row.breezyJobId,
        clonedAt: new Date().toISOString(),
        originalPipelineStatus: row.pipelineStatus,
      },
    });
  }

  return variants;
}

export function assertVariantTitleDiversity(variants: GeneratedJobVariant[]): boolean {
  const titles = new Set(variants.map((v) => v.generatedTitle));
  return titles.size === variants.length;
}
