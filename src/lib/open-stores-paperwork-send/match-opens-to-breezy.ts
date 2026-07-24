import type { BreezyJob } from "@/lib/breezy-api";
import { buildPositionMatcher } from "@/lib/p175-breezy-export-import/normalize";
import {
  cityStateFromPositionName,
  effectiveApplicantCount,
  fuzzyCityScore,
  normalizeCity,
  normalizePositionKey,
} from "@/lib/open-stores-paperwork-send/normalize";
import type {
  BreezyPostRow,
  OpenStoreMatch,
  OpenStoreMatchConfidence,
  OpenStoreRow,
} from "@/lib/open-stores-paperwork-send/types";

type ScoredPost = {
  post: BreezyPostRow;
  score: number;
  confidence: OpenStoreMatchConfidence;
  note: string;
};

const FUZZY_CITY_MIN = 0.55;

function scorePostForOpen(open: OpenStoreRow, post: BreezyPostRow): ScoredPost | null {
  const openCity = normalizeCity(open.city);
  const openState = open.state.toUpperCase();
  if (!openCity) return null;

  const postCity = normalizeCity(post.city);
  const postState = post.state.toUpperCase();
  const nameHint = cityStateFromPositionName(post.name);
  const nameCity = nameHint.city;
  const nameState = nameHint.state.toUpperCase();

  const locCityScore = fuzzyCityScore(openCity, postCity);
  const nameCityScore = fuzzyCityScore(openCity, nameCity);
  const bestCityScore = Math.max(locCityScore, nameCityScore);

  const locStateOk = !openState || !postState || postState === openState;
  const nameStateOk = !openState || !nameState || nameState === openState;
  const stateOk = locStateOk || nameStateOk;

  // Hard reject clear wrong-state collisions (Pembroke NC vs Pembroke Pines FL)
  if (openState && postState && postState !== openState && nameState && nameState !== openState) {
    return null;
  }
  if (openState && postState && postState !== openState && !nameStateOk && locCityScore < 0.85) {
    return null;
  }

  if (bestCityScore < FUZZY_CITY_MIN || !stateOk) return null;

  let score = 0;
  let confidence: OpenStoreMatchConfidence = "city_only";
  let note = "";

  const exactLoc = locCityScore >= 0.999 && locStateOk;
  const exactName = nameCityScore >= 0.999 && nameStateOk;

  if (exactLoc) {
    score += 100;
    confidence = "exact_location";
    note = `Exact Breezy Location match (${post.location})`;
  } else if (exactName) {
    score += 80;
    confidence = "name_location";
    note = `Position name city/state match (${post.name})`;
  } else {
    score += Math.round(40 + bestCityScore * 35);
    confidence = "city_only";
    note = `Fuzzy city+state match score=${bestCityScore.toFixed(2)} (${post.location || post.name})`;
  }

  if (String(post.status).toLowerCase() === "active") score += 10;
  if (post.candidates > 0) score += Math.min(post.candidates, 15);
  if (normalizePositionKey(post.name).includes(openCity)) score += 5;
  // Prefer same-state location over name-only when scores are close
  if (locStateOk && locCityScore >= nameCityScore) score += 3;

  return { post, score, confidence, note };
}

/**
 * Sort Opens with applicants highest-first so processing prioritizes volume.
 */
export function sortOpensByApplicantCount(opens: OpenStoreRow[]): OpenStoreRow[] {
  return [...opens].sort((a, b) => {
    const diff =
      effectiveApplicantCount({ applicantCount: b.applicantCount }) -
      effectiveApplicantCount({ applicantCount: a.applicantCount });
    if (diff !== 0) return diff;
    return `${a.city}, ${a.state}`.localeCompare(`${b.city}, ${b.state}`);
  });
}

/**
 * Match Opens rows (Applicant=Yes) to Breezy Posts sheet rows by fuzzy city+state.
 * Ambiguous ties stay unmatched unless one candidate clearly wins on score.
 * Input opens should already be sorted by applicant count when prioritization matters.
 */
export function matchOpensToBreezyPosts(input: {
  opens: OpenStoreRow[];
  breezyPosts: BreezyPostRow[];
}): OpenStoreMatch[] {
  return input.opens.map((open) => {
    const scored = input.breezyPosts
      .map((post) => scorePostForOpen(open, post))
      .filter((s): s is ScoredPost => Boolean(s))
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        open,
        breezyPost: null,
        positionId: null,
        positionName: null,
        confidence: "unmatched",
        matchNotes: [`No Breezy Posts row for ${open.city}, ${open.state}`],
        alternatePosts: [],
      };
    }

    const best = scored[0]!;
    const second = scored[1];
    const tied =
      second &&
      second.score === best.score &&
      second.post.name !== best.post.name;

    if (tied) {
      return {
        open,
        breezyPost: null,
        positionId: null,
        positionName: null,
        confidence: "ambiguous",
        matchNotes: [
          `Ambiguous Breezy Posts match for ${open.city}, ${open.state}: ${best.post.name} vs ${second.post.name}`,
        ],
        alternatePosts: scored.slice(0, 5).map((s) => ({
          name: s.post.name,
          location: s.post.location,
          candidates: s.post.candidates,
        })),
      };
    }

    const nearTie =
      second && best.score - second.score < 15 && second.confidence === best.confidence;
    if (nearTie && best.confidence !== "exact_location") {
      return {
        open,
        breezyPost: null,
        positionId: null,
        positionName: null,
        confidence: "ambiguous",
        matchNotes: [
          `Near-tie Breezy Posts for ${open.city}, ${open.state}: ${best.post.name} (${best.score}) vs ${second.post.name} (${second.score})`,
        ],
        alternatePosts: scored.slice(0, 5).map((s) => ({
          name: s.post.name,
          location: s.post.location,
          candidates: s.post.candidates,
        })),
      };
    }

    return {
      open,
      breezyPost: best.post,
      positionId: null,
      positionName: best.post.name,
      confidence: best.confidence,
      matchNotes: [best.note],
      alternatePosts: scored.slice(1, 4).map((s) => ({
        name: s.post.name,
        location: s.post.location,
        candidates: s.post.candidates,
      })),
    };
  });
}

/**
 * Attach live Breezy jobIds to sheet matches via position name matching
 * (names are sanitized so en-dash variants align).
 */
export function attachLivePositionIds(
  matches: OpenStoreMatch[],
  jobs: BreezyJob[],
): OpenStoreMatch[] {
  const matchPosition = buildPositionMatcher(jobs);
  return matches.map((m) => {
    if (!m.breezyPost) return m;
    const job =
      matchPosition(m.breezyPost.name) ??
      matchPosition(normalizePositionKey(m.breezyPost.name));
    if (!job) {
      return {
        ...m,
        matchNotes: [
          ...m.matchNotes,
          `Sheet post matched but no live Breezy job for "${m.breezyPost.name}"`,
        ],
      };
    }
    return {
      ...m,
      positionId: job.jobId,
      positionName: job.name,
      matchNotes: [...m.matchNotes, `Live positionId=${job.jobId}`],
    };
  });
}

export function uniqueMatchedPositionIds(matches: OpenStoreMatch[]): string[] {
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.positionId) ids.add(m.positionId);
  }
  return [...ids];
}
