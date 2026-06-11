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
import { listDmEscalationLogs } from "@/lib/dm-escalation-store";
import { submitDmEscalation } from "@/lib/dm-portal/submit-dm-escalation";
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

  const syncEscalationLogs = useCallback(() => {
    setEscalationLogs(listDmEscalationLogs({ dmUserId: user.id, limit: 30 }));
  }, [user.id]);

  const submitEscalationForJob = useCallback(
    async (actionType: DmEscalationActionType, job: DmJobOperationalDetail, relatedAlert?: DmPrioritizedAlert | null) => {
      const result = await submitDmEscalation({
        actionType,
        job,
        user,
        relatedAlert,
      });
      syncEscalationLogs();
      if (!result.ok) {
        showToast(result.error, "info");
        return false;
      }
      showToast(`${DM_ESCALATION_ACTION_LABELS[actionType]} sent to recruiter queue for ${job.title}`);
      return true;
    },
    [showToast, syncEscalationLogs, user],
  );

  const logEscalation = useCallback(
    (actionType: DmEscalationActionType) => {
      if (!view?.primaryJob) {
        showToast("Select a job drilldown before logging an action.", "info");
        return;
      }
      void submitEscalationForJob(actionType, view.primaryJob, view.relatedAlerts[0] ?? null);
    },
    [showToast, submitEscalationForJob, view?.primaryJob, view?.relatedAlerts],
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
    submitEscalationForJob,
    syncEscalationLogs,
    showToast,
    toast,
    dismissToast,
  };
}
