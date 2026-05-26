/** Recruiter-facing copy for Breezy sync status — display only; does not change sync logic. */

export type RecruiterSyncHeaderInput = {
  candidateCount: number;
  fetchedAt: string;
  fromCache?: boolean;
  stale?: boolean;
  partial?: boolean;
  positionsScanned?: number | null;
  totalPositionsAvailable?: number | null;
  refreshing?: boolean;
};

function formatShortTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCandidateAvailability(count: number): string {
  return `${count.toLocaleString()} candidate${count === 1 ? "" : "s"} currently available`;
}

/** Candidates tab header — no position-scan terminology. */
export function formatRecruiterCandidatesSyncHeader(input: RecruiterSyncHeaderInput): string {
  const parts: string[] = [];
  const time = formatShortTime(input.fetchedAt);
  if (time) parts.push(`Last updated ${time}`);

  if (input.candidateCount > 0) {
    parts.push(formatCandidateAvailability(input.candidateCount));
  }

  if (input.refreshing) {
    parts.push("Live sync active");
  } else if (input.stale) {
    parts.push("Showing last available list until sync completes");
  } else if (input.partial) {
    parts.push("Loading additional candidates");
  } else if (input.fromCache) {
    parts.push("Loaded from recent cache");
  }

  return parts.length > 0 ? parts.join(" · ") : "Candidate list not loaded yet";
}

/** Generic header (may include position scan counts for non-Candidates surfaces). */
export function formatRecruiterSyncHeader(input: RecruiterSyncHeaderInput): string {
  const parts: string[] = [];
  const time = formatShortTime(input.fetchedAt);
  if (time) parts.push(`Last updated ${time}`);

  if (input.candidateCount > 0) {
    parts.push(formatCandidateAvailability(input.candidateCount));
  }

  if (input.refreshing) {
    parts.push("Live sync active");
  } else if (input.stale) {
    parts.push("Showing last available list until sync completes");
  } else if (input.partial) {
    parts.push("Loading additional candidates");
  } else if (input.fromCache) {
    parts.push("Loaded from recent cache");
  }

  if (
    input.positionsScanned != null &&
    input.totalPositionsAvailable != null &&
    input.totalPositionsAvailable > 0
  ) {
    parts.push(
      `${input.positionsScanned}/${input.totalPositionsAvailable} job positions checked`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "Candidate list not loaded yet";
}

export function formatRecruiterSyncAlert(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("timed out") && lower.includes("cached")) {
    return "Refresh is taking longer than usual — candidates currently available stay visible while we retry.";
  }
  if (lower.includes("timed out")) {
    return "Refresh timed out — try again shortly or keep working with candidates currently available.";
  }
  if (lower.includes("background sync") || lower.includes("sync in progress")) {
    return "Live sync active — you can keep triaging the table.";
  }
  if (lower.includes("partial") || lower.includes("incomplete")) {
    return "Loading additional candidates — counts may increase as refresh finishes.";
  }
  if (lower.includes("stale") || lower.includes("last loaded")) {
    return "Showing last available list until sync completes.";
  }
  if (lower.includes("showing loaded candidates")) {
    return "Candidates currently available while the latest refresh finishes.";
  }
  return message;
}

export function formatRecruiterBackgroundSyncLine(loadedCount: number): string {
  return `${formatCandidateAvailability(loadedCount)} — live sync active`;
}

export function formatRecruiterQueueSyncNote(input: {
  partial?: boolean;
  stale?: boolean;
}): string | null {
  if (input.partial) {
    return "Loading additional candidates — queue counts may increase.";
  }
  if (input.stale) {
    return "Using last available candidate list for queue counts.";
  }
  return null;
}
