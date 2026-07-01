import type { JobSignals } from "@/lib/p108-intelligent-project-mapping/types";
import { normalizePositionTitle } from "@/lib/test-cohort-validation/normalize-position-title";

const RETAILERS = [
  "walmart",
  "target",
  "kroger",
  "albertsons",
  "publix",
  "costco",
  "sam's",
  "dollar general",
  "cvs",
  "walgreens",
  "dunkin",
  "dunkirk",
];

const ROLE_TYPES = [
  "merchandiser",
  "continuity",
  "reset",
  "fixture",
  "field",
  "retail",
  "grocery",
  "osa",
];

function extractClient(haystack: string): string | null {
  const lower = haystack.toLowerCase();
  for (const retailer of RETAILERS) {
    if (lower.includes(retailer)) {
      return retailer
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }
  const continuity = lower.match(/continuity\s+([a-z]+)/i);
  if (continuity?.[1]) {
    return continuity[1].charAt(0).toUpperCase() + continuity[1].slice(1);
  }
  const prefix = haystack.split(/[-–—|]/)[0]?.trim();
  return prefix && prefix.length > 2 ? prefix : null;
}

function extractProjectCode(title: string): string | null {
  const patterns = [
    /\b([A-Z]{2,4})\s*,/,
    /\bproject\s*#?\s*(\d{3,})\b/i,
    /\b(\d{4,})\b/,
    /\bSF\b/,
    /\bcontinuity\b/i,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[0]) return match[0].replace(/\s+/g, " ").trim();
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractRoleType(title: string): string | null {
  const lower = title.toLowerCase();
  for (const role of ROLE_TYPES) {
    if (lower.includes(role)) return role;
  }
  return null;
}

export function extractJobSignals(title: string): JobSignals {
  const trimmed = title.trim();
  return {
    client: extractClient(trimmed),
    projectCode: extractProjectCode(trimmed),
    roleType: extractRoleType(trimmed),
    normalizedTitle: normalizePositionTitle(trimmed),
  };
}

export function titleSimilarityScore(sourceTitle: string, targetTitle: string): {
  points: number;
  matched: boolean;
  detail: string;
} {
  const source = normalizePositionTitle(sourceTitle);
  const target = normalizePositionTitle(targetTitle);
  if (!source || !target) {
    return { points: 0, matched: false, detail: "Missing title" };
  }
  if (source === target) {
    return { points: 25, matched: true, detail: "Exact title match" };
  }
  if (source.includes(target) || target.includes(source)) {
    return { points: 20, matched: true, detail: "Similar title" };
  }
  const sourceTokens = new Set(source.split(/\s+/).filter((t) => t.length > 2));
  const targetTokens = target.split(/\s+/).filter((t) => t.length > 2);
  if (targetTokens.length === 0) {
    return { points: 0, matched: false, detail: "Empty target title" };
  }
  const overlap = targetTokens.filter((t) => sourceTokens.has(t)).length;
  const ratio = overlap / targetTokens.length;
  if (ratio >= 0.75) {
    return { points: 18, matched: true, detail: "Strong title token overlap" };
  }
  if (ratio >= 0.5) {
    return { points: 12, matched: true, detail: "Partial title overlap" };
  }
  if (ratio >= 0.25) {
    return { points: 6, matched: false, detail: "Weak title overlap" };
  }
  return { points: 0, matched: false, detail: "Different title" };
}

export function clientsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizePositionTitle(a);
  const nb = normalizePositionTitle(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function projectCodesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return normalizePositionTitle(a) === normalizePositionTitle(b);
}
