"use client";

import type { P1863DashboardSnapshot } from "@/lib/p186-3-operator-lifecycle-queues/dashboard";
import type {
  P1863ActionResult,
  P1863BulkPreview,
  P1863CandidateDetail,
  P1863OperatorAction,
} from "@/lib/p186-3-operator-lifecycle-queues/types";
import { useCallback, useEffect, useState } from "react";

export function useP186OperatorQueues() {
  const [dashboard, setDashboard] = useState<P1863DashboardSnapshot | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<P1863CandidateDetail | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<P1863BulkPreview | null>(null);

  const refresh = useCallback(async (params?: Record<string, string>) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ asOperator: "1", ...(params ?? {}) });
      const res = await fetch(`/api/recruiting/p186-operator-queues/status?${qs}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        enabled?: boolean;
        dashboard?: P1863DashboardSnapshot;
        warnings?: string[];
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to load P186 operator queues");
        return;
      }
      setEnabled(Boolean(data.enabled));
      setDashboard(data.dashboard ?? null);
      setWarnings(data.warnings ?? (data.message ? [data.message] : []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load P186 operator queues");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (candidateId: string) => {
    setActionBusy(true);
    try {
      const res = await fetch(
        `/api/recruiting/p186-operator-queues/detail?candidateId=${encodeURIComponent(candidateId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        detail?: P1863CandidateDetail;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.detail) {
        setActionMessage(data.error ?? "Failed to load candidate detail");
        return;
      }
      setDetail(data.detail);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setActionBusy(false);
    }
  }, []);

  const runAction = useCallback(
    async (input: {
      action: P1863OperatorAction;
      candidateIds: string[];
      note?: string;
      label?: string;
      confirmed?: boolean;
      mode?: "preview" | "execute";
    }) => {
      setActionBusy(true);
      setActionMessage(null);
      try {
        const res = await fetch("/api/recruiting/p186-operator-queues/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, asOperator: true }),
        });
        const data = (await res.json()) as P1863ActionResult & {
          preview?: P1863BulkPreview;
          error?: string;
          detail?: string;
          ok?: boolean;
        };
        if (data.preview) setPreview(data.preview);
        if (!res.ok || data.ok === false) {
          setActionMessage(data.error ?? data.detail ?? "Action failed");
          return data;
        }
        setActionMessage(data.detail ?? "Action complete");
        await refresh();
        return data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Action failed";
        setActionMessage(msg);
        return null;
      } finally {
        setActionBusy(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    dashboard,
    enabled,
    warnings,
    loading,
    error,
    detail,
    setDetail,
    preview,
    setPreview,
    actionBusy,
    actionMessage,
    refresh,
    loadDetail,
    runAction,
  };
}
