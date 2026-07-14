"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";

const MILESTONES = [
  "Applied",
  "AI Reviewed",
  "Paperwork Sent",
  "Viewed",
  "Signed",
  "Ready for Assignment",
] as const;

type MilestoneId = (typeof MILESTONES)[number];

function reachedMilestones(candidate: CandidateDrawerRow): Set<MilestoneId> {
  const set = new Set<MilestoneId>();
  if (candidate.appliedDate?.trim()) set.add("Applied");

  const aiDone =
    Boolean(candidate.aiRecommendation?.trim()) ||
    candidate.aiNumericScore > 0 ||
    candidate.workflowStatus !== "Applied";
  if (aiDone) set.add("AI Reviewed");

  const status = candidate.paperworkStatus as PaperworkStatus;
  if (status === "sent" || status === "viewed" || status === "signed" || candidate.paperworkSentAt) {
    set.add("Paperwork Sent");
  }
  if (status === "viewed" || status === "signed") set.add("Viewed");
  if (status === "signed" || candidate.paperworkSignedAt) set.add("Signed");

  if (
    candidate.workflowStatus === "Ready for MEL" ||
    candidate.workflowStatus === "Loaded in MEL" ||
    candidate.workflowStatus === "Active Rep"
  ) {
    set.add("Ready for Assignment");
  }

  return set;
}

type CandidateWorkspaceMilestoneTimelineProps = {
  candidate: CandidateDrawerRow;
};

export function CandidateWorkspaceMilestoneTimeline({
  candidate,
}: CandidateWorkspaceMilestoneTimelineProps) {
  const reached = reachedMilestones(candidate);

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Timeline</h3>
      <ol className="mt-2 flex flex-wrap gap-1.5">
        {MILESTONES.map((label) => {
          const done = reached.has(label);
          return (
            <li
              key={label}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                done
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                  : "border-zinc-800 bg-zinc-950/50 text-zinc-500"
              }`}
            >
              {done ? "✓ " : ""}
              {label}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
