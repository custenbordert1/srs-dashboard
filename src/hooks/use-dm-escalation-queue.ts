"use client";

import type { DmEscalationQueuePublic } from "@/lib/operational-escalation/dm-escalation-response";
import type { RecruiterEscalationQueueStatus } from "@/lib/operational-escalation/operational-escalation-types";
import { useCallback, useEffect, useState } from "react";

type EscalationQueueResponse = {
  ok?: boolean;
  items?: DmEscalationQueuePublic[];
  statusLabels?: Record<RecruiterEscalationQueueStatus, string>;
  refreshedAt?: string;
};

export function useDmEscalationQueue(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [items, setItems] = useState<DmEscalationQueuePublic[]>([]);
  const [statusLabels, setStatusLabels] = useState<Record<RecruiterEscalationQueueStatus, string> | null>(
    null,
  );
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dm/escalations");
      const parsed = (await res.json()) as EscalationQueueResponse;
      if (!parsed.ok) {
        setError("Could not load escalation queue.");
        return;
      }
      setItems(parsed.items ?? []);
      if (parsed.statusLabels) setStatusLabels(parsed.statusLabels);
      setRefreshedAt(parsed.refreshedAt ?? new Date().toISOString());
    } catch {
      setError("Could not load escalation queue.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, statusLabels, loading, error, refreshedAt, refresh };
}
