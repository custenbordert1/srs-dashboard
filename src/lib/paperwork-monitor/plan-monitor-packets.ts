import { getDropboxMonitorBudgetPerCycle } from "@/lib/dropbox-sign-api/constants";
import type { ActivePaperworkPacket } from "@/lib/paperwork-monitor/select-active-packets";

export type PaperworkMonitorScope = "postCycle" | "scheduled" | "manual";

export type MonitorPacketPlan = {
  scope: PaperworkMonitorScope;
  packetsToPoll: ActivePaperworkPacket[];
  deferredCandidateIds: string[];
  projectedGetRequests: number;
  budgetLimit: number;
  budgetExceeded: boolean;
  warnings: string[];
};

function packetSentMs(packet: ActivePaperworkPacket): number {
  const sentAt = packet.workflow.paperworkSentAt;
  return sentAt ? Date.parse(sentAt) : 0;
}

function sortNewestFirst(packets: ActivePaperworkPacket[]): ActivePaperworkPacket[] {
  return [...packets].sort((a, b) => packetSentMs(b) - packetSentMs(a));
}

export function planMonitorPackets(input: {
  allActive: ActivePaperworkPacket[];
  scope?: PaperworkMonitorScope;
  priorityCandidateIds?: string[];
  deferredQueue?: string[];
  budgetLimit?: number;
}): MonitorPacketPlan {
  const scope = input.scope ?? "manual";
  const budgetLimit = input.budgetLimit ?? getDropboxMonitorBudgetPerCycle();
  const warnings: string[] = [];
  const priority = new Set((input.priorityCandidateIds ?? []).filter(Boolean));
  const deferredExisting = [...(input.deferredQueue ?? [])];

  if (scope === "postCycle") {
    const priorityPackets = input.allActive.filter((p) => priority.has(p.candidateId));
    const deferredCandidateIds = input.allActive
      .filter((p) => !priority.has(p.candidateId))
      .map((p) => p.candidateId);

    const mergedDeferred = [...new Set([...deferredCandidateIds, ...deferredExisting])].filter(
      (id) => !priority.has(id),
    );

    if (priorityPackets.length === 0) {
      warnings.push("P165 — post-cycle monitor: no priority packets; skipping Dropbox polls.");
    } else {
      warnings.push(
        `P165 — post-cycle monitor: polling ${priorityPackets.length} cycle packet(s); deferring ${mergedDeferred.length} historical packet(s).`,
      );
    }

    return {
      scope,
      packetsToPoll: priorityPackets,
      deferredCandidateIds: mergedDeferred,
      projectedGetRequests: priorityPackets.length,
      budgetLimit,
      budgetExceeded: priorityPackets.length > budgetLimit,
      warnings,
    };
  }

  const deferredIds = [...new Set(deferredExisting)];
  const deferredPackets = deferredIds
    .map((id) => input.allActive.find((p) => p.candidateId === id))
    .filter((p): p is ActivePaperworkPacket => Boolean(p));

  const nonDeferred = input.allActive.filter((p) => !deferredIds.includes(p.candidateId));
  const ordered = [...sortNewestFirst(deferredPackets), ...sortNewestFirst(nonDeferred)];

  const packetsToPoll = ordered.slice(0, budgetLimit);
  const polledIds = new Set(packetsToPoll.map((p) => p.candidateId));
  const deferredCandidateIds = ordered.filter((p) => !polledIds.has(p.candidateId)).map((p) => p.candidateId);

  const budgetExceeded = ordered.length > budgetLimit;
  if (budgetExceeded) {
    warnings.push(
      `P165 — monitor budget ${budgetLimit} GET(s): polling ${packetsToPoll.length}, deferring ${deferredCandidateIds.length}.`,
    );
  }

  return {
    scope,
    packetsToPoll,
    deferredCandidateIds,
    projectedGetRequests: packetsToPoll.length,
    budgetLimit,
    budgetExceeded,
    warnings,
  };
}
