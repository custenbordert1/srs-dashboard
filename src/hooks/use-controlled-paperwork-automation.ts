"use client";

import {
  cacheKey,
  fetchCachedJson,
  getCachedAllowExpired,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import { fetchWithTimeout, HEAVY_REQUEST_TIMEOUT_MS, isAbortError } from "@/lib/fetch-with-timeout";
import type { ControlledPaperworkAutomationSnapshot } from "@/lib/p145-controlled-paperwork-automation/types";
import type { AutoSendExecutionSummary } from "@/lib/recruiting/paperwork-execution-engine";
import type { InitialPaperworkExecutionSummary } from "@/lib/recruiting/initial-paperwork-execution-engine";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_KEY = cacheKey(["recruiting", "paperwork-automation"]);

type CachePayload = {
  snapshot: ControlledPaperworkAutomationSnapshot;
  meta?: {
    partialSync?: boolean;
    candidatesFromIngestionStore?: boolean;
    candidateSource?: string | null;
    refreshedAt?: string;
  };
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  snapshot?: ControlledPaperworkAutomationSnapshot;
  meta?: CachePayload["meta"];
  partial?: boolean;
  autoSendEnabled?: boolean;
  initialPaperworkAutoSendEnabled?: boolean;
  execution?: AutoSendExecutionSummary | InitialPaperworkExecutionSummary;
  message?: string;
};

function readCache(): CachePayload | null {
  return getCachedAllowExpired<CachePayload>(CACHE_KEY);
}

async function fetchSnapshot(signal?: AbortSignal, mode: "preview" | "approval" = "approval") {
  const res = await fetchWithTimeout(`/api/recruiting/paperwork-automation?mode=${mode}`, {
    cache: "no-store",
    timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
    signal,
  });
  const parsed = (await res.json()) as ApiResponse;
  if ((!res.ok && !parsed.partial) || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Failed to load paperwork automation");
  }
  return {
    snapshot: parsed.snapshot,
    meta: parsed.meta,
    autoSendEnabled: parsed.autoSendEnabled ?? parsed.snapshot.autoSend.autoSendEnabled,
    initialPaperworkAutoSendEnabled:
      parsed.initialPaperworkAutoSendEnabled ?? parsed.snapshot.initialPaperwork.autoSendEnabled,
  };
}

export function useControlledPaperworkAutomation() {
  const initial = typeof window !== "undefined" ? readCache() : null;
  const [data, setData] = useState<ControlledPaperworkAutomationSnapshot | null>(
    initial?.snapshot ?? null,
  );
  const [meta, setMeta] = useState<CachePayload["meta"]>(initial?.meta);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial?.snapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(false);
  const [acting, setActing] = useState(false);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [initialAutoSendEnabled, setInitialAutoSendEnabled] = useState(false);
  const [lastExecution, setLastExecution] = useState<AutoSendExecutionSummary | null>(null);
  const [lastInitialExecution, setLastInitialExecution] = useState<InitialPaperworkExecutionSummary | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (manual = false) => {
    const current = generation.current + 1;
    generation.current = current;
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setShowingCachedSnapshot(false);

    try {
      const payload = await fetchCachedJson(CACHE_KEY, () => fetchSnapshot(undefined, "approval"), {
        ttlMs: LONG_CLIENT_CACHE_TTL_MS,
        force: manual,
        label: "controlled-paperwork-automation",
        staleOnError: true,
      });
      if (generation.current !== current) return;
      setData(payload.snapshot);
      setMeta(payload.meta);
      const parsed = payload as CachePayload & { autoSendEnabled?: boolean };
      if (typeof parsed.autoSendEnabled === "boolean") setAutoSendEnabled(parsed.autoSendEnabled);
      else setAutoSendEnabled(payload.snapshot.autoSend.autoSendEnabled);
      setInitialAutoSendEnabled(
        payload.initialPaperworkAutoSendEnabled ?? payload.snapshot.initialPaperwork.autoSendEnabled,
      );
      setLastInitialExecution(payload.snapshot.lastInitialPaperworkSummary);
    } catch (err) {
      if (isAbortError(err)) return;
      const cached = readCache();
      if (cached?.snapshot) {
        setData(cached.snapshot);
        setMeta(cached.meta);
        setShowingCachedSnapshot(true);
        if (!isIgnorableFetchError(err)) {
          setError(friendlyFetchMessageFromError(err));
        }
      } else if (!isIgnorableFetchError(err)) {
        setError(friendlyFetchMessageFromError(err));
      }
    } finally {
      if (generation.current === current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const submitApproval = useCallback(
    async (input: {
      action: "approve" | "reject" | "approve_selected" | "approve_all";
      candidateIds?: string[];
    }) => {
      if (!data) return;
      setActing(true);
      setError(null);
      try {
        const res = await fetchWithTimeout("/api/recruiting/paperwork-automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: input.action,
            candidateIds: input.candidateIds ?? [],
            snapshot: data,
          }),
          timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as ApiResponse & { message?: string };
        if (!res.ok || !parsed.snapshot) {
          throw new Error(parsed.error ?? "Approval request failed");
        }
        setData(parsed.snapshot);
      } catch (err) {
        if (!isIgnorableFetchError(err)) {
          setError(friendlyFetchMessageFromError(err));
        }
      } finally {
        setActing(false);
      }
    },
    [data],
  );

  const runAutoSendAction = useCallback(
    async (dryRun: boolean, action: "auto_send_reminders" | "auto_send_initial") => {
      setActing(true);
      setError(null);
      try {
        const res = await fetchWithTimeout("/api/recruiting/paperwork-automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            dryRun,
          }),
          timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as ApiResponse;
        if (!res.ok || !parsed.snapshot) {
          throw new Error(parsed.error ?? "Auto-send request failed");
        }
        setData(parsed.snapshot);
        if (action === "auto_send_initial") {
          setLastInitialExecution(
            (parsed.execution as InitialPaperworkExecutionSummary | undefined) ??
              parsed.snapshot.lastInitialPaperworkSummary,
          );
          if (typeof parsed.initialPaperworkAutoSendEnabled === "boolean") {
            setInitialAutoSendEnabled(parsed.initialPaperworkAutoSendEnabled);
          }
        } else {
          setLastExecution(
            (parsed.execution as AutoSendExecutionSummary | undefined) ??
              parsed.snapshot.lastAutoSendSummary,
          );
          if (typeof parsed.autoSendEnabled === "boolean") setAutoSendEnabled(parsed.autoSendEnabled);
        }
      } catch (err) {
        if (!isIgnorableFetchError(err)) {
          setError(friendlyFetchMessageFromError(err));
        }
      } finally {
        setActing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return {
    data,
    meta,
    error,
    loading,
    refreshing,
    acting,
    showingCachedSnapshot,
    refresh: () => load(true),
    submitApproval,
    autoSendEnabled,
    initialAutoSendEnabled,
    lastExecution,
    lastInitialExecution,
    runDryRun: () => runAutoSendAction(true, "auto_send_reminders"),
    runAutoSend: () => runAutoSendAction(false, "auto_send_reminders"),
    runInitialDryRun: () => runAutoSendAction(true, "auto_send_initial"),
    runInitialAutoSend: () => runAutoSendAction(false, "auto_send_initial"),
  };
}
