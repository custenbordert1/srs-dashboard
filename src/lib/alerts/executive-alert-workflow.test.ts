import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlacementContextFromAlert,
  clearPlacementAlertContext,
  readPlacementAlertContext,
  writePlacementAlertContext,
} from "@/lib/alerts/placement-alert-navigation";
import { resolveExecutiveAlertDrawer } from "@/lib/alerts/executive-alert-drawer";
import {
  DEFAULT_EXECUTIVE_ALERT_FILTERS,
  filterExecutiveAlerts,
  listExecutiveAlertTerritories,
  mergeAlertStatuses,
} from "@/lib/alerts/executive-alert-filters";
import {
  mergeLocalAndServerStatuses,
  readLocalExecutiveAlertStatuses,
  writeLocalExecutiveAlertStatus,
} from "@/lib/alerts/executive-alert-status-client";
import {
  listExecutiveAlertStatusOverlays,
  upsertExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-store";
import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

function sampleAlert(overrides: Partial<ExecutiveAlert> = {}): ExecutiveAlert {
  return {
    id: "placement:zero-pipeline:opp-1",
    title: "Zero pipeline · Store 101",
    description: "No candidates in pipeline",
    severity: "critical",
    category: "placement",
    impactScore: 88,
    recommendedAction: "placement-review",
    destination: { tabId: "placement-command-center", label: "Placement Command Center" },
    automationKind: "placement-review",
    manualOnly: true,
    createdAt: "2026-05-28T12:00:00.000Z",
    reason: "Open calls with zero pipeline",
    context: {
      opportunityId: "opp-1",
      storeName: "Store 101",
      projectName: "Houston Retail",
      client: "Acme",
      city: "Houston",
      state: "TX",
      dmName: "Jordan Miles",
      territoryLabel: "Jordan Miles",
      openCalls: 4,
      candidatesInPipeline: 0,
      linkedCandidates: [],
      linkedReps: [],
      dataSources: ["Recruiting Intelligence Cache", "Breezy", "MEL", "Workflows"],
    },
    ...overrides,
  };
}

describe("executive alert workflow", () => {
  it("opens drawer with the selected alert", () => {
    const alerts = [
      sampleAlert(),
      sampleAlert({ id: "placement:recovery:opp-2", title: "Recovery needed" }),
    ];
    const selected = resolveExecutiveAlertDrawer(alerts, "placement:zero-pipeline:opp-1");
    assert.equal(selected?.title, "Zero pipeline · Store 101");
    assert.equal(resolveExecutiveAlertDrawer(alerts, "missing"), null);
  });

  it("filters alerts by severity, category, status, and territory", () => {
    const alerts = mergeAlertStatuses(
      [
        sampleAlert(),
        sampleAlert({
          id: "territory:war-room:Jordan Miles",
          category: "territory",
          severity: "high",
          context: {
            ...sampleAlert().context!,
            dmName: "Jordan Miles",
          },
        }),
        sampleAlert({
          id: "project:coverage:opp-9",
          category: "project",
          severity: "medium",
          context: {
            ...sampleAlert().context!,
            dmName: "Alex Chen",
            territoryLabel: "Alex Chen",
          },
        }),
      ],
      [
        { alertId: "placement:zero-pipeline:opp-1", status: "resolved" },
        { alertId: "territory:war-room:Jordan Miles", status: "in-review" },
      ],
    );

    const severityFiltered = filterExecutiveAlerts(alerts, {
      ...DEFAULT_EXECUTIVE_ALERT_FILTERS,
      severity: "critical",
    });
    assert.equal(severityFiltered.length, 1);
    assert.equal(severityFiltered[0]?.id, "placement:zero-pipeline:opp-1");

    const statusFiltered = filterExecutiveAlerts(alerts, {
      ...DEFAULT_EXECUTIVE_ALERT_FILTERS,
      status: "in-review",
    });
    assert.equal(statusFiltered.length, 1);
    assert.equal(statusFiltered[0]?.id, "territory:war-room:Jordan Miles");

    const territoryFiltered = filterExecutiveAlerts(alerts, {
      ...DEFAULT_EXECUTIVE_ALERT_FILTERS,
      territory: "Alex Chen",
    });
    assert.equal(territoryFiltered.length, 1);
    assert.equal(territoryFiltered[0]?.id, "project:coverage:opp-9");

    const territories = listExecutiveAlertTerritories(alerts);
    assert.ok(territories.includes("Jordan Miles"));
    assert.ok(territories.includes("Alex Chen"));
  });

  it("persists alert status overlays server-side", async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), "srs-alert-status-"));
    process.chdir(tempDir);
    try {
      const session = {
        userId: "exec-1",
        role: "executive" as const,
        email: "exec@example.com",
        name: "Exec",
        territoryStates: null,
      };
      const overlay = await upsertExecutiveAlertStatusOverlay(session, "placement:zero-pipeline:opp-1", "in-review");
      assert.equal(overlay.status, "in-review");

      const listed = await listExecutiveAlertStatusOverlays("exec-1");
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.alertId, "placement:zero-pipeline:opp-1");

      const merged = mergeAlertStatuses([sampleAlert()], listed);
      assert.equal(merged[0]?.status, "in-review");
    } finally {
      process.chdir(previousCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("merges local and server status overlays with newest timestamp winning", () => {
    const local = [
      {
        alertId: "placement:zero-pipeline:opp-1",
        userId: "exec-1",
        status: "snoozed" as const,
        updatedAt: "2026-05-28T12:00:00.000Z",
      },
    ];
    const server = [
      {
        alertId: "placement:zero-pipeline:opp-1",
        userId: "exec-1",
        status: "resolved" as const,
        updatedAt: "2026-05-28T13:00:00.000Z",
      },
    ];
    const merged = mergeLocalAndServerStatuses(local, server);
    assert.equal(merged[0]?.status, "resolved");
  });

  it("builds placement navigation context and stores it in session storage", () => {
    const alert = sampleAlert();
    const context = buildPlacementContextFromAlert(alert);
    assert.equal(context.opportunityId, "opp-1");
    assert.equal(context.storeName, "Store 101");
    assert.equal(context.zeroPipelineOnly, true);
    assert.equal(context.highlightSection, "store-coverage");

    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: {
          setItem: (key: string, value: string) => storage.set(key, value),
          getItem: (key: string) => storage.get(key) ?? null,
          removeItem: (key: string) => storage.delete(key),
        },
      },
    });
    try {
      writePlacementAlertContext(context);
      const loaded = readPlacementAlertContext();
      assert.deepEqual(loaded, context);
      clearPlacementAlertContext();
      assert.equal(readPlacementAlertContext(), null);
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      }
    }
  });

  it("stores local executive alert status overlays", () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          setItem: (key: string, value: string) => storage.set(key, value),
          getItem: (key: string) => storage.get(key) ?? null,
        },
      },
    });
    try {
      writeLocalExecutiveAlertStatus({
        alertId: "placement:zero-pipeline:opp-1",
        userId: "exec-1",
        status: "in-review",
        updatedAt: "2026-05-28T12:00:00.000Z",
      });
      const rows = readLocalExecutiveAlertStatuses("exec-1");
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "in-review");
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      }
    }
  });
});
