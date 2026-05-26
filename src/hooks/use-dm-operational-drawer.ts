"use client";

import type { UserPublic } from "@/lib/auth/types";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import { resolveDrawerJobId } from "@/lib/dm-dashboard/build-dm-operational-index";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import type {
  DmEscalationActionType,
  DmEscalationLogEntry,
  DmJobOperationalDetail,
  DmOperationalDrawerTarget,
  DmOperationalIndex,
} from "@/lib/dm-dashboard/dm-operational-types";
import { cityKey } from "@/lib/dm-dashboard/territory-shared";
import { DM_ESCALATION_ACTION_LABELS } from "@/lib/dm-dashboard/dm-operational-types";
import { appendDmEscalationLog, listDmEscalationLogs } from "@/lib/dm-escalation-store";
import { buildSourceEscalationLogId } from "@/lib/operational-escalation/dm-escalation-response";
import { parseCityLabelToKey } from "@/lib/dm-dashboard/build-dm-operational-index";
import { useCallback, useMemo, useState } from "react";
import { useDmToast } from "@/hooks/use-dm-toast";

export type DmOperationalDrawerView = {
  target: DmOperationalDrawerTarget;
  title: string;
  subtitle: string;
  primaryJob: DmJobOperationalDetail | null;
  nearbyJobs: DmJobOperationalDetail[];
  nearbyRepsCount: number | null;
  demandLevel: string;
  relatedAlerts: DmPrioritizedAlert[];
};

function nearbyJobsFor(
  index: DmOperationalIndex,
  job: DmJobOperationalDetail,
  limit = 6,
): DmJobOperationalDetail[] {
  return Object.values(index.jobsById)
    .filter((row) => row.jobId !== job.jobId && row.state === job.state)
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
    .slice(0, limit);
}

export function useDmOperationalDrawer(
  data: DmDashboardSnapshot | null,
  user: UserPublic,
) {
  const { toast, showToast, dismissToast } = useDmToast();
  const [target, setTarget] = useState<DmOperationalDrawerTarget | null>(null);
  const [escalationLogs, setEscalationLogs] = useState<DmEscalationLogEntry[]>(() =>
    typeof window === "undefined" ? [] : listDmEscalationLogs({ dmUserId: user.id, limit: 30 }),
  );

  const index = data?.operationalIndex ?? null;

  const openTarget = useCallback((next: DmOperationalDrawerTarget) => {
    setTarget(next);
  }, []);

  const openJob = useCallback(
    (jobId: string) => {
      openTarget({ type: "job", jobId });
    },
    [openTarget],
  );

  const openAlert = useCallback(
    (alert: DmPrioritizedAlert) => {
      if (alert.jobId) {
        openTarget({ type: "job", jobId: alert.jobId });
        return;
      }
      if (alert.city && alert.state) {
        openTarget({ type: "city", cityKey: cityKey(alert.city, alert.state) });
        return;
      }
      openTarget({ type: "alert", alertId: alert.id });
    },
    [openTarget],
  );

  const openCityLabel = useCallback(
    (label: string) => {
      const key = parseCityLabelToKey(label);
      if (key) openTarget({ type: "city", cityKey: key });
    },
    [openTarget],
  );

  const openState = useCallback(
    (state: string) => {
      openTarget({ type: "state", state: state.trim().toUpperCase() });
    },
    [openTarget],
  );

  const close = useCallback(() => setTarget(null), []);

  const view = useMemo((): DmOperationalDrawerView | null => {
    if (!target || !index) return null;

    if (target.type === "job") {
      const job = index.jobsById[target.jobId];
      if (!job) return null;
      const city = index.citiesByKey[job.cityKey];
      return {
        target,
        title: job.title,
        subtitle: `${job.city}, ${job.state}`,
        primaryJob: job,
        nearbyJobs: nearbyJobsFor(index, job),
        nearbyRepsCount: null,
        demandLevel: city?.demandLevel ?? "Medium",
        relatedAlerts: job.relatedAlertIds
          .map((id) => index.alertsById[id])
          .filter(Boolean),
      };
    }

    if (target.type === "alert") {
      const alert = index.alertsById[target.alertId];
      if (!alert) return null;
      const jobId = alert.jobId ?? resolveDrawerJobId(target, index);
      const job = jobId ? index.jobsById[jobId] : null;
      return {
        target,
        title: alert.title,
        subtitle: alert.detail,
        primaryJob: job,
        nearbyJobs: job ? nearbyJobsFor(index, job) : [],
        nearbyRepsCount: null,
        demandLevel: alert.priority === "critical" ? "Critical" : "High",
        relatedAlerts: [alert, ...(job?.relatedAlertIds.map((id) => index.alertsById[id]) ?? [])].filter(
          Boolean,
        ),
      };
    }

    if (target.type === "city") {
      const city = index.citiesByKey[target.cityKey];
      if (!city) return null;
      const primaryId = city.jobIds[0];
      const job = primaryId ? index.jobsById[primaryId] : null;
      return {
        target,
        title: city.label,
        subtitle: `${city.openJobs} open jobs · ${city.demandLevel} demand`,
        primaryJob: job,
        nearbyJobs: city.jobIds
          .map((id) => index.jobsById[id])
          .filter(Boolean)
          .slice(0, 8),
        nearbyRepsCount: null,
        demandLevel: city.demandLevel,
        relatedAlerts: city.relatedAlertIds.map((id) => index.alertsById[id]).filter(Boolean),
      };
    }

    const state = index.statesByCode[target.state];
    if (!state) return null;
    const primaryId = state.jobIds[0];
    const job = primaryId ? index.jobsById[primaryId] : null;
    return {
      target,
      title: `${state.state} territory`,
      subtitle: `${state.openJobs} open jobs · ${state.alertCount} alerts`,
      primaryJob: job,
      nearbyJobs: state.jobIds
        .map((id) => index.jobsById[id])
        .filter(Boolean)
        .slice(0, 8),
      nearbyRepsCount: null,
      demandLevel: state.demandLevel,
      relatedAlerts: state.jobIds
        .flatMap((id) => index.jobsById[id]?.relatedAlertIds ?? [])
        .map((id) => index.alertsById[id])
        .filter(Boolean)
        .slice(0, 12),
    };
  }, [index, target]);

  const logEscalation = useCallback(
    (actionType: DmEscalationActionType) => {
      if (!view?.primaryJob) {
        showToast("Select a job drilldown before logging an action.", "info");
        return;
      }
      const job = view.primaryJob;
      const entry: DmEscalationLogEntry = {
        id: `dm-esc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actionType,
        label: DM_ESCALATION_ACTION_LABELS[actionType],
        jobId: job.jobId,
        jobTitle: job.title,
        city: job.city,
        state: job.state,
        dmUserId: user.id,
        dmUserName: user.name,
        territoryStates: user.territoryStates,
        createdAt: new Date().toISOString(),
      };
      const next = appendDmEscalationLog(entry);
      setEscalationLogs(next.filter((row) => row.dmUserId === user.id).slice(0, 30));

      const topAlert = view?.relatedAlerts?.[0];
      const sourceEscalationLogId = buildSourceEscalationLogId(user.id, job.jobId, actionType);
      void fetch("/api/dm/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEscalationLogId,
          escalationType: actionType,
          relatedJobId: job.jobId,
          jobTitle: job.title,
          city: job.city,
          state: job.state,
          priority: job.priority ?? topAlert?.priority ?? null,
          priorityScore: job.priorityScore ?? topAlert?.priorityScore ?? null,
          recommendedAction:
            job.recommendedAction ?? topAlert?.recommendedAction ?? entry.label,
          alertReason: topAlert?.title ?? entry.label,
          jobAgeDays: job.jobAgeDays,
        }),
      })
        .then(async (res) => {
          const parsed = (await res.json()) as { ok?: boolean; error?: string };
          if (!parsed.ok) {
            showToast(parsed.error ?? "Could not send escalation to recruiting.", "info");
            return;
          }
          showToast(`${entry.label} sent to recruiter queue for ${job.title}`);
        })
        .catch(() => {
          showToast("Escalation saved locally but recruiter queue sync failed.", "info");
        });
    },
    [showToast, user.id, user.name, user.territoryStates, view?.primaryJob, view?.relatedAlerts],
  );

  return {
    open: target !== null && view !== null,
    view,
    target,
    openJob,
    openAlert,
    openCityLabel,
    openState,
    close,
    escalationLogs,
    logEscalation,
    toast,
    dismissToast,
  };
}
