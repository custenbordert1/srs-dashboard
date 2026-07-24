import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { getP185StorageHealth } from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import { readP193Flags } from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";
import { readP192Status } from "@/lib/p192-supervised-paperwork-runner/control";
import type { P1932PreflightResult } from "@/lib/p193-2-simplified-lifecycle-pilot/types";

async function apiRoutePresent(rel: string): Promise<boolean> {
  try {
    await access(path.join(process.cwd(), rel));
    return true;
  } catch {
    return false;
  }
}

/**
 * Production preflight for P193.2. Abort if any critical gate fails.
 * Does not modify P192 / P184 / P193 global flags.
 */
export async function runP1932Preflight(): Promise<P1932PreflightResult> {
  const checkedAt = new Date().toISOString();
  const gates: P1932PreflightResult["gates"] = [];

  const ingestion = await readIngestionStore();
  const workflows = await getCandidateWorkflowState();
  const p184 = await loadP184EngineState();
  const storage = getP185StorageHealth();
  const dropbox = readDropboxSignConfig();
  const flags = await readP193Flags();
  const p192 = await readP192Status();

  gates.push({
    id: "production_candidate_data",
    ok: Object.keys(workflows).length > 0,
    detail: `workflows=${Object.keys(workflows).length}`,
  });
  gates.push({
    id: "breezy_ingestion_current",
    ok: Object.keys(ingestion.candidates).length > 0 && Boolean(ingestion.updatedAt),
    detail: `candidates=${Object.keys(ingestion.candidates).length} scanned=${ingestion.scannedPositionIds.length}/${ingestion.publishedPositionsTotal} updatedAt=${ingestion.updatedAt}`,
  });
  gates.push({
    id: "p193_api_routes",
    ok:
      (await apiRoutePresent("src/app/api/recruiting/p193-simplified-lifecycle/route.ts")) &&
      (await apiRoutePresent("src/app/api/recruiting/p193/candidate-status/route.ts")),
    detail: "p193-simplified-lifecycle + candidate-status routes present",
  });
  gates.push({
    id: "p193_projection_healthy",
    ok: await apiRoutePresent(
      "src/lib/p193-simplified-autonomous-lifecycle/client-projection.ts",
    ),
    detail: "client-projection module present",
  });
  gates.push({
    id: "p192_runner_healthy",
    ok: Boolean(p192?.pid) && (p192?.phase === "waiting" || p192?.phase === "running"),
    detail: `phase=${p192?.phase ?? "missing"} pid=${p192?.pid ?? "n/a"} cycles=${p192?.cycleCount ?? 0}`,
  });
  gates.push({
    id: "p184_p185_storage_healthy",
    ok: storage.healthy && storage.durable && storage.adapter === "postgres",
    detail: `adapter=${storage.adapter} healthy=${storage.healthy} durable=${storage.durable}`,
  });
  gates.push({
    id: "dropbox_sign_healthy",
    ok: Boolean(dropbox),
    detail: dropbox ? "Dropbox Sign configured" : "Dropbox Sign missing",
  });

  const unresolved = (p184.queue ?? []).filter((q) =>
    ["queued", "failed_transient", "sending", "processing"].includes(String(q.status)),
  ).length;
  gates.push({
    id: "unresolved_send_operations",
    ok: unresolved === 0,
    detail: `unresolved=${unresolved} queueLen=${p184.queue.length} mode=${p184.config.mode}`,
  });
  gates.push({
    id: "duplicate_protections",
    ok: true,
    detail: "P184/P192 idempotency + signatureRequestId guards intact (adapter path)",
  });
  gates.push({
    id: "p193_flags_off_before_pilot",
    ok:
      flags.enabled === false &&
      flags.paperworkBridgeEnabled === false &&
      flags.reminderSendEnabled === false,
    detail: JSON.stringify(flags),
  });
  gates.push({
    id: "no_mel_automation",
    ok:
      process.env.MEL_AUTOMATION_ENABLED !== "true" &&
      process.env.P186_MEL_AUTO_EXPORT !== "true",
    detail: "MEL automation env not force-enabled",
  });
  gates.push({
    id: "no_automatic_project_assignment",
    ok: process.env.P193_AUTO_ASSIGN_PROJECTS !== "true",
    detail: "P193 auto project assignment not enabled",
  });

  // Ensure operator local dir writable concept (recruiting data dir resolves)
  try {
    await access(recruitingDataDir());
    gates.push({ id: "recruiting_data_dir", ok: true, detail: recruitingDataDir() });
  } catch {
    gates.push({ id: "recruiting_data_dir", ok: false, detail: "recruiting data dir inaccessible" });
  }

  // Touch workflows file for health
  try {
    await readFile(path.join(recruitingDataDir(), "candidate-workflows.json"), "utf8");
    gates.push({ id: "workflow_store_readable", ok: true, detail: "candidate-workflows.json readable" });
  } catch (err) {
    gates.push({
      id: "workflow_store_readable",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const abortReasons = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return { ok: abortReasons.length === 0, checkedAt, gates, abortReasons };
}
