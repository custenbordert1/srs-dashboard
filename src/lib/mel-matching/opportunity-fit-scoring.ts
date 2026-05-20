import type { BreezyCandidate } from "@/lib/breezy-api";
import { scoreBreezyCandidate } from "@/lib/candidate-scoring-engine";
import { buildCandidateScoringInput, scoringHaystack } from "@/lib/candidate-resume-prep";
import { isInterviewingStage } from "@/lib/dm-dashboard/territory-shared";
import { DEFAULT_TRAVEL_RADIUS_MILES } from "@/lib/mel-matching/distance-utils";
import type { MatchLabel, MelOpportunity } from "@/lib/mel-matching/matching-engine-types";

export type OpportunityFitInput = {
  candidate: BreezyCandidate;
  opportunity: MelOpportunity;
  distanceMiles: number | null;
  territoryStates?: string[];
  travelRadiusMiles?: number;
};

export type OpportunityFitResult = {
  fitPercent: number;
  matchLabel: MatchLabel;
  summary: string;
  experienceAlignment: number;
  distanceScore: number;
  territoryScore: number;
  interviewBoost: number;
};

function inferTravelRadiusMiles(candidate: BreezyCandidate): number {
  const text = scoringHaystack(buildCandidateScoringInput(candidate));
  const match = text.match(/(\d{1,3})\s*(?:\+?\s*)?(?:mile|mi)\b/);
  if (match) return Math.min(120, Math.max(15, Number(match[1])));
  if (text.includes("travel") || text.includes("radius") || text.includes("regional")) {
    return 60;
  }
  return DEFAULT_TRAVEL_RADIUS_MILES;
}

function projectTypeKeywords(projectType: string): string[] {
  const normalized = projectType.toLowerCase();
  const keys: string[] = [];
  if (normalized.includes("reset")) keys.push("reset");
  if (normalized.includes("walmart")) keys.push("walmart");
  if (normalized.includes("target")) keys.push("target");
  if (normalized.includes("grocery")) keys.push("grocery");
  if (normalized.includes("merchandis")) keys.push("merchandis");
  if (normalized.includes("osa") || normalized.includes("out of stock")) keys.push("oos");
  if (normalized.includes("fixture") || normalized.includes("planogram")) keys.push("fixture");
  return keys;
}

function experienceAlignmentScore(candidate: BreezyCandidate, opportunity: MelOpportunity): number {
  const text = scoringHaystack(buildCandidateScoringInput(candidate));
  const scored = scoreBreezyCandidate(candidate);
  let score = Math.min(25, Math.round(scored.factors.merchandisingExperience * 0.8));
  score += Math.min(15, Math.round(scored.factors.retailExperience * 0.6));

  for (const keyword of projectTypeKeywords(opportunity.projectType)) {
    if (text.includes(keyword)) score += 8;
  }
  if (opportunity.client && text.includes(opportunity.client.toLowerCase().slice(0, 6))) {
    score += 5;
  }
  return Math.min(40, score);
}

function distanceScore(distanceMiles: number | null, travelRadius: number): number {
  if (distanceMiles === null) return 12;
  if (distanceMiles <= 15) return 30;
  if (distanceMiles <= travelRadius * 0.5) return 26;
  if (distanceMiles <= travelRadius) return 20;
  if (distanceMiles <= travelRadius * 1.35) return 10;
  return 4;
}

function territoryScore(
  candidateState: string,
  opportunityState: string,
  territoryStates?: string[],
): number {
  const cState = candidateState.trim().toUpperCase().slice(0, 2);
  const oState = opportunityState.trim().toUpperCase().slice(0, 2);
  if (!cState || !oState) return 5;
  if (cState === oState) return 15;
  if (territoryStates?.includes(oState)) return 10;
  return 2;
}

function matchLabelForFit(
  fitPercent: number,
  distanceMiles: number | null,
  travelRadius: number,
  inTerritory: boolean,
): MatchLabel {
  if (!inTerritory && fitPercent < 55) return "Outside Territory";
  if (distanceMiles !== null && distanceMiles > travelRadius * 1.35 && fitPercent < 65) {
    return "Outside Territory";
  }
  if (fitPercent >= 78) return "Strong Match";
  if (fitPercent >= 62) return "Good Match";
  return "Stretch Match";
}

function buildSummary(
  candidate: BreezyCandidate,
  opportunity: MelOpportunity,
  distanceMiles: number | null,
  fitPercent: number,
  label: MatchLabel,
): string {
  const parts: string[] = [];
  const text = scoringHaystack(buildCandidateScoringInput(candidate));
  const type = opportunity.projectType.toLowerCase();

  if (label === "Strong Match" && distanceMiles !== null) {
    if (type.includes("walmart") && text.includes("walmart")) {
      parts.push(`Strong Walmart reset fit within ${Math.round(distanceMiles)} miles.`);
    } else if (type.includes("reset")) {
      parts.push(`Strong reset program fit within ${Math.round(distanceMiles)} miles.`);
    } else {
      parts.push(`Strong ${opportunity.projectType} fit within ${Math.round(distanceMiles)} miles.`);
    }
  } else if (type.includes("grocery") && (text.includes("grocery") || text.includes("merchandis"))) {
    parts.push("Candidate aligns with grocery merchandising projects.");
  } else if (fitPercent >= 65) {
    parts.push(`${opportunity.client} ${opportunity.projectType} alignment based on experience profile.`);
  }

  if (distanceMiles !== null && distanceMiles > DEFAULT_TRAVEL_RADIUS_MILES) {
    parts.push("Travel radius may limit large market coverage.");
  }
  if (isInterviewingStage(candidate.stage)) {
    parts.push("Interview-stage momentum supports faster placement.");
  }
  if (opportunity.priority === "high" && opportunity.openStatus) {
    parts.push("High-priority open store call — prioritize outreach.");
  }

  return parts.length > 0 ? parts.join(" ") : `Estimated ${fitPercent}% fit for ${opportunity.projectName}.`;
}

export function scoreOpportunityFit(input: OpportunityFitInput): OpportunityFitResult {
  const { candidate, opportunity, distanceMiles, territoryStates } = input;
  const travelRadius = input.travelRadiusMiles ?? inferTravelRadiusMiles(candidate);
  const scored = scoreBreezyCandidate(candidate, { territoryStates });

  const experienceAlignment = experienceAlignmentScore(candidate, opportunity);
  const distScore = distanceScore(distanceMiles, travelRadius);
  const terrScore = territoryScore(candidate.state, opportunity.state, territoryStates);
  const interviewBoost = isInterviewingStage(candidate.stage) ? 8 : 0;
  const aiBoost = Math.min(12, Math.round(scored.score / 12));

  const raw = experienceAlignment + distScore + terrScore + interviewBoost + aiBoost;
  const fitPercent = Math.min(99, Math.max(5, Math.round(raw * 1.15)));

  const inTerritory =
    territoryStates === undefined ||
    territoryStates.length === 0 ||
    territoryStates.includes(opportunity.state.trim().toUpperCase().slice(0, 2));

  const matchLabel = matchLabelForFit(fitPercent, distanceMiles, travelRadius, inTerritory);
  const summary = buildSummary(candidate, opportunity, distanceMiles, fitPercent, matchLabel);

  return {
    fitPercent,
    matchLabel,
    summary,
    experienceAlignment,
    distanceScore: distScore,
    territoryScore: terrScore,
    interviewBoost,
  };
}
