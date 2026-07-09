import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RecommendationFeedbackIndex } from "@/lib/autonomous-recruiting-autopilot/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function feedbackPath(): string {
  return path.join(recruitingDataDir(), "autonomous-recruiting-feedback.json");
}

type FeedbackStoreFile = {
  territoryWeights: Record<string, number>;
  typeWeights: Record<string, number>;
  updatedAt: string;
};

const DEFAULT_FEEDBACK: FeedbackStoreFile = {
  territoryWeights: {},
  typeWeights: {},
  updatedAt: new Date().toISOString(),
};

async function readFeedbackFile(): Promise<FeedbackStoreFile> {
  try {
    const raw = await readFile(feedbackPath(), "utf8");
    const parsed = JSON.parse(raw) as FeedbackStoreFile;
    return {
      territoryWeights: parsed.territoryWeights ?? {},
      typeWeights: parsed.typeWeights ?? {},
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return DEFAULT_FEEDBACK;
  }
}

async function writeFeedbackFile(file: FeedbackStoreFile): Promise<void> {
  await safeRecruitingMkdir();
  await writeFile(feedbackPath(), JSON.stringify(file, null, 2), "utf8");
}

export async function loadRecommendationFeedbackIndex(): Promise<RecommendationFeedbackIndex> {
  const file = await readFeedbackFile();
  return {
    territoryWeights: file.territoryWeights,
    typeWeights: file.typeWeights,
  };
}

export async function saveRecommendationFeedbackIndex(
  index: RecommendationFeedbackIndex,
): Promise<RecommendationFeedbackIndex> {
  await writeFeedbackFile({
    territoryWeights: index.territoryWeights,
    typeWeights: index.typeWeights,
    updatedAt: new Date().toISOString(),
  });
  return index;
}
