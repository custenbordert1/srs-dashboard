import { estimateGeoPoint } from "@/lib/mel-matching/distance-utils";
import { distanceMilesForCandidateToJob } from "@/lib/recruiting-intelligence/travel-radius";
import type { P193NearbyJob } from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
import type {
  P193LifecycleRecord,
  P193Flags,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";
import { assertLegalP193Transition } from "@/lib/p193-simplified-autonomous-lifecycle/stateMachine";

export type ReadyForAssignmentResult = {
  advanced: boolean;
  blockers: string[];
  record: P193LifecycleRecord;
};

/**
 * When every required document is signed → Ready For Assignment.
 * Populates lat/long, nearby jobs, distances, available projects.
 * Does NOT export to MEL or assign projects.
 */
export function advanceToReadyForAssignment(input: {
  record: P193LifecycleRecord;
  flags: P193Flags;
  authorized: boolean;
  city?: string;
  state?: string;
  nearbyJobs?: P193NearbyJob[];
  availableProjects?: Array<{ projectId: string; title: string }>;
  nowIso?: string;
}): ReadyForAssignmentResult {
  const blockers: string[] = [];
  if (!input.flags.enabled) blockers.push("p193_disabled");
  if (!input.flags.readyForAssignmentEnabled) blockers.push("ready_flag_disabled");
  if (!input.authorized) blockers.push("not_authorized");
  if (input.record.state !== "Signed" && input.record.metadata.paperworkStatus !== "signed") {
    blockers.push("not_fully_signed");
  }
  if (input.record.state === "Ready For Assignment") {
    return { advanced: false, blockers: ["already_ready"], record: input.record };
  }

  if (blockers.length) {
    return { advanced: false, blockers, record: input.record };
  }

  assertLegalP193Transition("Signed", "Ready For Assignment");

  const nowIso = input.nowIso ?? new Date().toISOString();
  const geo = estimateGeoPoint(input.city ?? "", input.state ?? "");
  const jobs = input.nearbyJobs ?? [];
  const nearbyJobs = jobs
    .map((job) => ({
      jobId: job.jobId,
      title: job.title,
      distanceMiles: distanceMilesForCandidateToJob("", input.city ?? "", input.state ?? "", {
        city: job.city,
        state: job.state,
        zip: job.zip,
      }),
    }))
    .sort((a, b) => (a.distanceMiles ?? 9e9) - (b.distanceMiles ?? 9e9))
    .slice(0, 10);

  const record: P193LifecycleRecord = {
    ...input.record,
    previousState: input.record.state,
    state: "Ready For Assignment",
    enteredAt: nowIso,
    updatedAt: nowIso,
    metadata: {
      ...input.record.metadata,
      paperworkStatus: "signed",
      signatureTimestamp: input.record.metadata.signatureTimestamp ?? nowIso,
      lastStatusChangeAt: nowIso,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      nearbyJobs,
      distanceToNearestWorkMiles: nearbyJobs[0]?.distanceMiles ?? null,
      availableProjects: (input.availableProjects ?? []).slice(0, 20),
    },
    timeline: [
      ...input.record.timeline,
      {
        at: nowIso,
        state: "Ready For Assignment",
        detail: "All required documents signed — prepared for assignment (no MEL export)",
      },
    ],
    version: input.record.version + 1,
  };

  return { advanced: true, blockers: [], record };
}
