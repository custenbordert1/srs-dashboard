import type {
  P215Comparison,
  P215P214Blocker,
  P215RootCause,
  P215RootCauseEvidence,
  P215TitleKind,
} from "@/lib/p215-position-resolution-audit/types";

/** Title heuristics used only to distinguish legitimately non-geo postings. */
export function classifyP215TitleKind(title: string): P215TitleKind {
  const t = title.trim().toLowerCase();
  if (!t) return "generic";
  if (/national|nationwide|all locations|remote/.test(t)) return "national";
  if (/flexible|project-based|as needed|traveling|float/.test(t)) return "flexible";
  // "..., City, ST" or "... – City, ST" style geo-titled postings.
  if (/,\s*[a-z .'-]+,\s*[a-z]{2}\s*(?:\([^)]*\))?$/i.test(title.trim())) return "geo_titled";
  if (/[–-]\s*[a-z .'-]+,\s*[a-z]{2}\s*$/i.test(title.trim())) return "geo_titled";
  return "generic";
}

/**
 * Exactly one root cause per blocked candidate, strictest evidence first:
 * attachment → position id → lookup outcome → Position.Location → title kind.
 */
export function classifyP215RootCause(e: P215RootCauseEvidence): P215RootCause {
  if (!e.attachedToPosition) return "CANDIDATE_NOT_ATTACHED_TO_POSITION";
  if (!e.hasPositionId) return "POSITION_ID_MISSING";
  if (!e.lookupSucceeded) return "POSITION_LOOKUP_FAILED";
  if (!e.positionFound) return "POSITION_LOOKUP_FAILED";

  const hasLocation = Boolean(e.locationCity.trim() && e.locationState.trim());
  if (hasLocation) return "POSITION_LOCATION_PRESENT";

  if (e.titleKind === "national") return "LEGITIMATE_NATIONAL_POSTING";
  if (e.titleKind === "flexible") return "LEGITIMATE_FLEXIBLE_POSTING";
  if (e.titleKind === "generic" || e.titleKind === "geo_titled") {
    return "POSITION_LOCATION_EMPTY";
  }
  return "UNKNOWN";
}

/**
 * Was P214's posting-related block correct for this candidate?
 *
 * P214 derived posting geography by parsing the position *title* (via
 * parseLocationFromJobName on ingestion positionName) and never resolved the
 * Breezy Position object. The block was correct only when the position truly
 * has no usable location (or genuinely cannot be resolved).
 */
export function compareP215AgainstP214(args: {
  rootCause: P215RootCause;
  p214Blocker: P215P214Blocker;
  locationCity: string;
  locationState: string;
}): P215Comparison {
  switch (args.rootCause) {
    case "POSITION_LOCATION_PRESENT":
      return {
        p214Correct: false,
        explanation:
          `Automation parsed the position title instead of resolving Position.Location. ` +
          `The applied Breezy position carries a valid location ` +
          `(${args.locationCity}, ${args.locationState}); classifying it as ` +
          `${args.p214Blocker} was wrong.`,
      };
    case "POSITION_LOCATION_EMPTY":
      return {
        p214Correct: true,
        explanation:
          "The resolved position has no city/state in Position.Location, so treating the posting as non-geographic was correct (though it should be labeled POSITION_LOCATION_EMPTY, not inferred from the title).",
      };
    case "LEGITIMATE_NATIONAL_POSTING":
      return {
        p214Correct: true,
        explanation:
          "Position.Location is empty and the posting is a legitimate national posting — the non-geographic classification stands.",
      };
    case "LEGITIMATE_FLEXIBLE_POSTING":
      return {
        p214Correct: true,
        explanation:
          "Position.Location is empty and the posting is a legitimate flexible posting — the non-geographic classification stands.",
      };
    case "POSITION_LOOKUP_FAILED":
      return {
        p214Correct: false,
        explanation:
          "Position lookup failed (API error or archived/deleted position). P214 never attempted the lookup, so the block was based on incomplete evidence — it should be re-evaluated once the lookup succeeds.",
      };
    case "POSITION_ID_MISSING":
      return {
        p214Correct: true,
        explanation:
          "No position id exists on the candidate record; with no position to resolve, the conservative block was correct.",
      };
    case "CANDIDATE_NOT_ATTACHED_TO_POSITION":
      return {
        p214Correct: true,
        explanation:
          "Candidate is not attached to any position; there is no posting location to use, so the conservative block was correct.",
      };
    default:
      return {
        p214Correct: false,
        explanation: "Root cause could not be determined — classification unverifiable.",
      };
  }
}
