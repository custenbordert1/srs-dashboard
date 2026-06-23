import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RecommendationFeedbackIndex } from "@/lib/autonomous-recruiting-autopilot/types";

const STORE_DIR = path.join(process.cwd(), ".data");
const FEEDBACK_PATH = path.join(STORE_DIR, "autonomous-recruiting-feedback.json");

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
    const raw = await readFile(FEEDBACK_PATH, "utf8");
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
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(FEEDBACK_PATH, JSON.stringify(file, null, 2), "utf8");
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
