import type { CandidateSkillTagId } from "@/lib/recruiting-intelligence/types";

export type SkillTagDefinition = {
  id: CandidateSkillTagId;
  label: string;
  terms: string[];
  weight: number;
};

export const MERCHANDISING_SKILL_TAGS: SkillTagDefinition[] = [
  { id: "resets", label: "Resets", terms: ["reset", "re-set", "store reset", "full reset"], weight: 5 },
  { id: "planograms", label: "Planograms", terms: ["planogram", "pog", "shelf set", "schematic"], weight: 5 },
  { id: "audits", label: "Audits", terms: ["audit", "store audit", "compliance audit"], weight: 4 },
  { id: "inventory", label: "Inventory", terms: ["inventory", "stock", "replenish", "backstock"], weight: 4 },
  { id: "walmart", label: "Walmart", terms: ["walmart", "wal-mart"], weight: 4 },
  { id: "target", label: "Target", terms: ["target stores", "target corp", " target "], weight: 4 },
  { id: "grocery", label: "Grocery", terms: ["grocery", "supermarket", "kroger", "publix", "albertsons", "food lion"], weight: 4 },
  {
    id: "fixture_installation",
    label: "Fixture installation",
    terms: ["fixture", "install", "installation", "build-out", "buildout"],
    weight: 5,
  },
  {
    id: "retail_merchandising",
    label: "Retail merchandising",
    terms: ["merchandis", "category", "cpg", "brand ambassador", "display", "retail"],
    weight: 3,
  },
  {
    id: "overnight_travel",
    label: "Overnight travel",
    terms: ["overnight", "overnights", "hotel travel"],
    weight: 4,
  },
  {
    id: "travel_willing",
    label: "Travel willing",
    terms: ["travel", "radius", "mile", "multi-store", "route", "regional", "territory"],
    weight: 3,
  },
  { id: "cpg", label: "CPG", terms: ["cpg", "consumer packaged", "fmcg"], weight: 3 },
  { id: "osa_scanning", label: "OOS / scanning", terms: ["oos", "out of stock", "scanning", "on-shelf", "osa"], weight: 4 },
];

const TAG_BY_ID = new Map(MERCHANDISING_SKILL_TAGS.map((tag) => [tag.id, tag]));

export function labelForSkillTag(id: CandidateSkillTagId): string {
  return TAG_BY_ID.get(id)?.label ?? id;
}

export function extractSkillTagsFromText(text: string): CandidateSkillTagId[] {
  const normalized = text.toLowerCase();
  const found: CandidateSkillTagId[] = [];
  for (const tag of MERCHANDISING_SKILL_TAGS) {
    if (tag.terms.some((term) => normalized.includes(term))) {
      found.push(tag.id);
    }
  }
  return found;
}

export function scoreExperienceFromTags(tags: CandidateSkillTagId[]): number {
  let score = 0;
  for (const id of tags) {
    score += TAG_BY_ID.get(id)?.weight ?? 0;
  }
  return Math.min(100, Math.round(score * 2.2));
}
