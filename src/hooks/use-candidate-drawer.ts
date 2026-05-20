"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildCandidateDrawerRow } from "@/lib/build-candidate-drawer-row";
import {
  getRecruitingActions,
  loadRecruitingActionsMap,
  toggleRecruitingAction,
  type RecruitingActionType,
} from "@/lib/candidate-recruiting-actions";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { useMelOpportunities } from "@/hooks/use-mel-opportunities";
import { matchCandidateToOpportunities } from "@/lib/mel-matching/matching-engine";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowState, CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type { OpportunityBestRepMatches } from "@/lib/rep-intelligence/rep-types";
import { useCallback, useEffect, useMemo, useState } from "react";

function daysSince(raw: string | null): number | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const start = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date();
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

type UseCandidateDrawerOptions = {
  /** Preloaded Breezy candidates (Command Center). When omitted, fetched on first open. */
  candidates?: BreezyCandidate[];
  territoryStates?: string[];
};

export function useCandidateDrawer(options: UseCandidateDrawerOptions = {}) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<CandidateWorkflowState>({});
  const [recruitingActionsMap, setRecruitingActionsMap] = useState(loadRecruitingActionsMap);
  const [fetchedCandidates, setFetchedCandidates] = useState<BreezyCandidate[]>([]);
  const [breezyLoading, setBreezyLoading] = useState(false);
  const { opportunities: melOpportunities, loading: melLoading } = useMelOpportunities(
    options.territoryStates,
  );
  const [repMatchCache, setRepMatchCache] = useState<Record<string, OpportunityBestRepMatches[]>>({});
  const [repMatchesLoadingKey, setRepMatchesLoadingKey] = useState<string | null>(null);
  const breezyCandidates = options.candidates ?? fetchedCandidates;

  useEffect(() => {
    let cancelled = false;
    void fetchWithRetry("/api/candidates/workflows", { cache: "no-store" })
      .then((res) => res.json())
      .then((parsed: { ok?: boolean; workflows?: CandidateWorkflowState }) => {
        if (!cancelled && parsed.workflows) setWorkflowState(parsed.workflows);
      })
      .catch(() => {
        /* local-only fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const candidateById = useMemo(() => {
    const map = new Map<string, BreezyCandidate>();
    for (const candidate of breezyCandidates) map.set(candidate.candidateId, candidate);
    return map;
  }, [breezyCandidates]);

  const ensureCandidateLoaded = useCallback(
    async (candidateId: string) => {
      if (candidateById.has(candidateId)) return;
      setBreezyLoading(true);
      try {
        const res = await fetchWithRetry("/api/breezy/candidates", { cache: "no-store" });
        const parsed = (await res.json()) as { ok: boolean; candidates?: BreezyCandidate[] };
        if (parsed.ok && parsed.candidates) {
          setFetchedCandidates(parsed.candidates);
        }
      } finally {
        setBreezyLoading(false);
      }
    },
    [candidateById],
  );

  const openCandidate = useCallback(
    (candidateId: string) => {
      void ensureCandidateLoaded(candidateId);
      setSelectedCandidateId(candidateId);
    },
    [ensureCandidateLoaded],
  );

  const closeCandidate = useCallback(() => setSelectedCandidateId(null), []);

  const repMatchRequestKey = useMemo(() => {
    if (!selectedCandidateId) return "";
    const breezy = candidateById.get(selectedCandidateId);
    if (!breezy || melOpportunities.length === 0) return "";
    const melMatch = matchCandidateToOpportunities(breezy, melOpportunities, {
      territoryStates: options.territoryStates,
    });
    return melMatch.matches
      .slice(0, 8)
      .map((m) => m.opportunityId)
      .sort()
      .join("|");
  }, [candidateById, melOpportunities, options.territoryStates, selectedCandidateId]);

  const opportunityRepMatches = useMemo(
    () => (repMatchRequestKey ? (repMatchCache[repMatchRequestKey] ?? []) : []),
    [repMatchCache, repMatchRequestKey],
  );
  const repMatchesLoading = repMatchRequestKey !== "" && repMatchesLoadingKey === repMatchRequestKey;

  const selectedDrawerRow = useMemo((): CandidateDrawerRow | null => {
    if (!selectedCandidateId) return null;
    const breezy = candidateById.get(selectedCandidateId);
    if (!breezy) return null;
    const row = buildCandidateDrawerRow(breezy, {
      workflow: workflowState[selectedCandidateId],
      territoryStates: options.territoryStates,
      recruitingActions: recruitingActionsMap[selectedCandidateId] ?? getRecruitingActions(selectedCandidateId),
    });
    if (melOpportunities.length === 0) {
      return { ...row, opportunityRepMatches };
    }
    const melMatch = matchCandidateToOpportunities(breezy, melOpportunities, {
      territoryStates: options.territoryStates,
    });
    return {
      ...row,
      matchedOpportunities: melMatch.matches,
      melMatchingSummary: melMatch.aiSummary,
      opportunityRepMatches,
    };
  }, [
    candidateById,
    melOpportunities,
    opportunityRepMatches,
    options.territoryStates,
    recruitingActionsMap,
    selectedCandidateId,
    workflowState,
  ]);

  useEffect(() => {
    if (!repMatchRequestKey || repMatchCache[repMatchRequestKey]) return;

    let cancelled = false;
    const requestKey = repMatchRequestKey;
    const opportunityIds = requestKey.split("|").filter(Boolean);

    void (async () => {
      setRepMatchesLoadingKey(requestKey);
      try {
        const res = await fetch("/api/workforce-intelligence/opportunity-rep-matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityIds }),
        });
        const parsed = (await res.json()) as { ok?: boolean; matches?: OpportunityBestRepMatches[] };
        if (!cancelled && parsed.ok && parsed.matches) {
          setRepMatchCache((prev) => ({ ...prev, [requestKey]: parsed.matches! }));
        }
      } catch {
        if (!cancelled) {
          setRepMatchCache((prev) => ({ ...prev, [requestKey]: [] }));
        }
      } finally {
        if (!cancelled) {
          setRepMatchesLoadingKey((current) => (current === requestKey ? null : current));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repMatchCache, repMatchRequestKey]);

  async function persistWorkflow(
    candidateId: string,
    workflowStatus: CandidateWorkflowStatus,
    patch: { note?: string; assignedRecruiter?: string; assignedDM?: string } = {},
  ) {
    const breezy = candidateById.get(candidateId);
    if (!breezy) return;
    const scored = buildScoredWorkflowRow(breezy, workflowState[candidateId]);
    const res = await fetch("/api/candidates/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateId,
        workflowStatus,
        assignedRecruiter: patch.assignedRecruiter ?? scored.assignedRecruiter,
        assignedDM: patch.assignedDM ?? scored.assignedDM,
        note: patch.note,
      }),
    });
    const parsed = (await res.json()) as { ok: boolean; workflow?: CandidateWorkflowState[string]; error?: string };
    if (!res.ok || !parsed.ok || !parsed.workflow) {
      throw new Error(parsed.error ?? `Workflow update failed (${res.status})`);
    }
    setWorkflowState((prev) => ({ ...prev, [candidateId]: parsed.workflow! }));
  }

  const handleRecruitingAction = useCallback((type: RecruitingActionType) => {
    if (!selectedCandidateId) return;
    const updated = toggleRecruitingAction(selectedCandidateId, type);
    setRecruitingActionsMap((prev) => ({ ...prev, [selectedCandidateId]: updated }));
  }, [selectedCandidateId]);

  return {
    openCandidate,
    closeCandidate,
    selectedCandidateId,
    drawerCandidate: selectedDrawerRow,
    drawerOpen: selectedCandidateId !== null,
    breezyLoading,
    drawerProps: {
      candidate: selectedDrawerRow,
      open: selectedCandidateId !== null,
      onClose: closeCandidate,
      statusAgingDays: selectedDrawerRow
        ? daysSince(selectedDrawerRow.lastActionAt ?? selectedDrawerRow.appliedDate)
        : null,
      appliedAgingDays: selectedDrawerRow ? daysSince(selectedDrawerRow.appliedDate) : null,
      onStatusChange: (status: CandidateWorkflowStatus) => {
        if (!selectedCandidateId) return;
        void persistWorkflow(selectedCandidateId, status).catch((err) => {
          window.alert(err instanceof Error ? err.message : "Workflow update failed");
        });
      },
      onSaveAssignments: (assignedRecruiter: string, assignedDM: string) => {
        if (!selectedCandidateId || !selectedDrawerRow) return;
        void persistWorkflow(selectedCandidateId, selectedDrawerRow.workflowStatus, {
          assignedRecruiter,
          assignedDM,
        }).catch((err) => {
          window.alert(err instanceof Error ? err.message : "Assignment update failed");
        });
      },
      onAddNote: (note: string) => {
        if (!selectedCandidateId || !selectedDrawerRow) return;
        void persistWorkflow(selectedCandidateId, selectedDrawerRow.workflowStatus, { note }).catch((err) => {
          window.alert(err instanceof Error ? err.message : "Note save failed");
        });
      },
      onRecruitingAction: handleRecruitingAction,
      loading: breezyLoading && !selectedDrawerRow,
      melMatchesLoading: melLoading,
      repMatchesLoading,
    },
  };
}

export type CandidateDrawerController = ReturnType<typeof useCandidateDrawer>;
