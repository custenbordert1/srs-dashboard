"use client";

import type {
  P171ExceptionQueueReport,
  P171LifecycleConsole,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";
import { useCallback, useEffect, useState } from "react";

export function useLifecycleManager() {
  const [console, setConsole] = useState<P171LifecycleConsole | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiting/lifecycle-manager/status", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        console?: P171LifecycleConsole;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.console) {
        setError(data.error ?? "Failed to load lifecycle manager");
        return;
      }
      setConsole(data.console);
      setWarnings(data.warnings ?? data.console.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lifecycle manager");
    } finally {
      setLoading(false);
    }
  }, []);

  const runControl = useCallback(
    async (action: "pause" | "resume" | "run_cycle", force = false) => {
      setActionBusy(true);
      setActionMessage(null);
      try {
        const res = await fetch("/api/recruiting/lifecycle-manager/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, force }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          warnings?: string[];
          cycle?: { status: string; paperworkSent: number; remindersSent: number };
          error?: string;
        };
        if (!res.ok) {
          setActionMessage(data.error ?? "Control action failed");
          return;
        }
        if (action === "run_cycle" && data.cycle) {
          setActionMessage(
            `Cycle ${data.cycle.status} — sent ${data.cycle.paperworkSent} paperwork, ${data.cycle.remindersSent} reminders`,
          );
        } else {
          setActionMessage(action === "pause" ? "Lifecycle manager paused" : "Lifecycle manager resumed");
        }
        await refresh();
      } catch (e) {
        setActionMessage(e instanceof Error ? e.message : "Control action failed");
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
    console,
    warnings,
    loading,
    error,
    actionBusy,
    actionMessage,
    refresh,
    pause: () => runControl("pause"),
    resume: () => runControl("resume"),
    runCycle: (force?: boolean) => runControl("run_cycle", force),
  };
}

export function useLifecycleExceptionQueue() {
  const [report, setReport] = useState<P171ExceptionQueueReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiting/lifecycle-manager/exceptions", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        report?: P171ExceptionQueueReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.report) {
        setError(data.error ?? "Failed to load lifecycle exception queue");
        return;
      }
      setReport(data.report);
      setWarnings(data.warnings ?? data.report.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lifecycle exception queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { report, warnings, loading, error, refresh };
}
