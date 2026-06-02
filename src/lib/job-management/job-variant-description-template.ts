export const SRS_1099_CONTRACTOR_LINE =
  "This is a 1099 independent contractor role — not W-2 employment.";

export const SRS_GIG_WORK_DISCLAIMER =
  "Work is as-needed gig scheduling; hours and project frequency vary by client, market, and season.";

export const SRS_PAY_CLIENT_DISCLAIMER =
  "Pay rates vary by client assignment (not based on experience).";

export const SRS_EEO_LINE = "Equal opportunity employer.";

const DUPLICATE_SECTION_HEADERS = [
  /^benefits\b/i,
  /^what we offer\b/i,
  /^why join\b/i,
  /^perks\b/i,
];

function isDuplicateSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  return DUPLICATE_SECTION_HEADERS.some((pattern) => pattern.test(trimmed));
}

/** Drop repeated Benefits / What We Offer blocks from cloned Breezy body text. */
export function dedupeOfferSections(lines: string[]): string[] {
  const result: string[] = [];
  let skippingSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!skippingSection) result.push(line);
      skippingSection = false;
      continue;
    }

    if (isDuplicateSectionHeader(trimmed)) {
      if (result.some((existing) => isDuplicateSectionHeader(existing.trim()))) {
        skippingSection = true;
        continue;
      }
    }

    if (skippingSection && (/^[-*•]/.test(trimmed) || /^\d+\./.test(trimmed))) {
      continue;
    }

    skippingSection = false;
    result.push(line);
  }

  return result;
}

function normalizePayLine(payRate: string): string {
  const rate = payRate.trim();
  if (!rate) return SRS_PAY_CLIENT_DISCLAIMER;
  return `Pay: ${rate}. ${SRS_PAY_CLIENT_DISCLAIMER}`;
}

function lineAlreadyPresent(description: string, fragment: string): boolean {
  return description.toLowerCase().includes(fragment.trim().toLowerCase());
}

export function buildLocationSpecificIntro(cityTarget: string, usState = ""): string {
  const city = (cityTarget ?? "").trim();
  const state = (usState ?? "").trim();
  if (city && state) {
    return `Retail merchandising support in the ${city}, ${state} area.`;
  }
  if (city) return `Retail merchandising support in the ${city} area.`;
  return "Retail merchandising support in your local market.";
}

export function buildVariantDescriptionBody(options: {
  baseDescription: string;
  payRate: string;
  cityTarget: string;
  usState: string;
  variantIndex: number;
  shuffleMutableBullets: (lines: string[], variantIndex: number, payRate: string) => string[];
}): string {
  const baseLines = dedupeOfferSections(options.baseDescription.split(/\r?\n/));
  const shuffledLines = options.shuffleMutableBullets(
    baseLines,
    options.variantIndex,
    options.payRate,
  );

  const core = shuffledLines
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (isDuplicateSectionHeader(trimmed)) return false;
      if (/^pay\s*:/i.test(trimmed)) return false;
      if (/\bpay rate varies by experience\b/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const intro = buildLocationSpecificIntro(options.cityTarget, options.usState);
  const payLine = normalizePayLine(options.payRate);

  const blocks = [intro, SRS_1099_CONTRACTOR_LINE, SRS_GIG_WORK_DISCLAIMER];
  if (core) blocks.push(core);
  blocks.push(payLine);
  if (!lineAlreadyPresent(core, SRS_EEO_LINE)) blocks.push(SRS_EEO_LINE);
  blocks.push("Apply today — a recruiter will review your application promptly.");

  return blocks.filter(Boolean).join("\n\n").trim();
}
