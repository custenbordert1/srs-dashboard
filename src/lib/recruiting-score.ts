import type { SheetRow } from "@/lib/google-sheet-csv";

export type RecruitingPriority = {
  score: number;
  level: "Critical" | "High" | "Medium" | "Healthy";
};

export function calculateRecruitingScore(row: SheetRow): RecruitingPriority {
  let score = 0;

  const applicants = Number(row["Applicant Count"] || 0);
  const breezyLinked = String(row["BreezyHR Linked"] || "").toLowerCase();

  if (applicants === 0) {
    score += 5;
  }

  if (applicants > 0 && applicants <= 2) {
    score += 3;
  }

  if (breezyLinked !== "yes") {
    score += 3;
  }

  let level: RecruitingPriority["level"] = "Healthy";

  if (score >= 8) {
    level = "Critical";
  } else if (score >= 5) {
    level = "High";
  } else if (score >= 3) {
    level = "Medium";
  }

  return {
    score,
    level,
  };
}
