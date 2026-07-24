import type { P193LifecycleState } from "@/lib/p193-simplified-autonomous-lifecycle/types";

const FORWARD: Record<P193LifecycleState, P193LifecycleState[]> = {
  Applied: ["AI Reviewing", "Needs Human Review", "Hold", "Rejected"],
  "AI Reviewing": ["Qualified", "Needs Human Review", "Rejected", "Hold"],
  Qualified: ["Paperwork Sent", "Needs Human Review", "Hold", "Rejected"],
  "Paperwork Sent": ["Awaiting Signature", "Expired", "Hold"],
  "Awaiting Signature": ["Signed", "Expired", "Hold", "Rejected"],
  Signed: ["Ready For Assignment", "Hold"],
  "Ready For Assignment": [],
  "Needs Human Review": ["AI Reviewing", "Qualified", "Rejected", "Hold", "Applied"],
  Rejected: [],
  Hold: ["Applied", "AI Reviewing", "Qualified", "Needs Human Review"],
  Expired: ["Qualified", "Needs Human Review", "Hold"],
};

export function isLegalP193Transition(from: P193LifecycleState, to: P193LifecycleState): boolean {
  if (from === to) return true;
  return (FORWARD[from] ?? []).includes(to);
}

export function assertLegalP193Transition(from: P193LifecycleState, to: P193LifecycleState): void {
  if (!isLegalP193Transition(from, to)) {
    throw new Error(`Illegal P193 transition: ${from} → ${to}`);
  }
}

/** Happy-path index for age/SLA display. */
export const P193_HAPPY_PATH: P193LifecycleState[] = [
  "Applied",
  "AI Reviewing",
  "Qualified",
  "Paperwork Sent",
  "Awaiting Signature",
  "Signed",
  "Ready For Assignment",
];

export function happyPathIndex(state: P193LifecycleState): number {
  const idx = P193_HAPPY_PATH.indexOf(state);
  return idx >= 0 ? idx : -1;
}
