import type { BreezyJob } from "@/lib/breezy-api";
import { getDmForState } from "@/lib/dm-territory-map";
import { isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import {
  resolveAuthoritativePostingGeography,
  resolveP216Routing,
} from "@/lib/p216-position-location-authority";
import { proposeP229Dm } from "@/lib/p229-routing-recovery-analysis";
import type { P235DmResolution } from "@/lib/p235-controlled-newest-five-send/types";

export function resolveP235AuthoritativeDm(input: {
  currentAssignedDM: string;
  positionId: string | null;
  positionName: string | null;
  homeCity: string;
  homeState: string;
  job: Pick<
    BreezyJob,
    "jobId" | "name" | "city" | "state" | "zip" | "displayLocation" | "locationSource" | "status"
  > | null;
}): P235DmResolution {
  const positionId = (input.positionId ?? input.job?.jobId ?? "").trim() || null;
  if (!positionId) {
    return {
      ok: false,
      proposedAssignedDM: null,
      expectedDmFromRouting: null,
      routingState: null,
      positionId: null,
      positionCity: null,
      positionState: null,
      locationSource: null,
      authoritative: false,
      wouldChange: false,
      reason: "missing_position_id",
    };
  }

  if (!input.job) {
    return {
      ok: false,
      proposedAssignedDM: null,
      expectedDmFromRouting: null,
      routingState: null,
      positionId,
      positionCity: null,
      positionState: null,
      locationSource: null,
      authoritative: false,
      wouldChange: false,
      reason: "position_not_found",
    };
  }

  const posting = resolveAuthoritativePostingGeography({
    positionId: input.job.jobId,
    positionName: input.job.name,
    positionStatus: input.job.status,
    city: input.job.city,
    state: input.job.state,
    zip: input.job.zip,
    displayLocation: input.job.displayLocation,
    locationSource: input.job.locationSource,
    homeCity: input.homeCity,
    homeState: input.homeState,
  });

  if (!posting.authoritative) {
    return {
      ok: false,
      proposedAssignedDM: null,
      expectedDmFromRouting: null,
      routingState: null,
      positionId,
      positionCity: posting.city || null,
      positionState: posting.state || null,
      locationSource: posting.locationSource,
      authoritative: false,
      wouldChange: false,
      reason: "position_location_not_authoritative",
    };
  }

  const routing = resolveP216Routing(
    {
      positionId: input.job.jobId,
      positionName: input.job.name,
      positionStatus: input.job.status,
      city: input.job.city,
      state: input.job.state,
      zip: input.job.zip,
      displayLocation: input.job.displayLocation,
      locationSource: input.job.locationSource,
      homeCity: input.homeCity,
      homeState: input.homeState,
    },
    (s) => getDmForState(s),
  );

  const proposal = proposeP229Dm({
    currentAssignedDM: input.currentAssignedDM,
    city: posting.city,
    state: posting.state,
    positionId,
    positionName: input.positionName ?? input.job.name,
    positionStatus: input.job.status,
    locationSource: posting.locationSource,
    postingAuthoritative: true,
    homeCity: input.homeCity,
    homeState: input.homeState,
  });

  if (proposal.ambiguous) {
    return {
      ok: false,
      proposedAssignedDM: null,
      expectedDmFromRouting: proposal.expectedDmFromRouting,
      routingState: proposal.routingState,
      positionId,
      positionCity: posting.city,
      positionState: posting.state,
      locationSource: posting.locationSource,
      authoritative: true,
      wouldChange: false,
      reason: "dm_conflict_or_ambiguous",
    };
  }

  const expected = (proposal.expectedDmFromRouting ?? routing.expectedDm ?? "").trim();
  if (!expected || isUnassignedDm(expected)) {
    return {
      ok: false,
      proposedAssignedDM: null,
      expectedDmFromRouting: expected || null,
      routingState: proposal.routingState ?? routing.routingState ?? null,
      positionId,
      positionCity: posting.city,
      positionState: posting.state,
      locationSource: posting.locationSource,
      authoritative: true,
      wouldChange: false,
      reason: "no_dm_for_routing_state",
    };
  }

  const current = String(input.currentAssignedDM ?? "").trim() || "Unassigned";
  const alreadyCorrect =
    !isUnassignedDm(current) && current.toLowerCase() === expected.toLowerCase();

  return {
    ok: true,
    proposedAssignedDM: alreadyCorrect ? current : expected,
    expectedDmFromRouting: expected,
    routingState: proposal.routingState ?? routing.routingState ?? null,
    positionId,
    positionCity: posting.city,
    positionState: posting.state,
    locationSource: posting.locationSource,
    authoritative: true,
    wouldChange: !alreadyCorrect,
    reason: alreadyCorrect ? "already_matches_routing" : "p216_position_location_territory_routing",
  };
}
