import {
  getP185StorageHealth,
  p185DataDir,
} from "@/lib/p185-production-paperwork-automation-runner";
import path from "node:path";

export type ProductionStoragePathClassification =
  | "durable_volume"
  | "local_filesystem"
  | "ephemeral_tmp"
  | "in_memory"
  | "unsafe";

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV?.trim());
}

function productionStorageConfirmed(): boolean {
  return process.env.P185_PRODUCTION_STORAGE_CONFIRMED === "1";
}

/**
 * Local filesystem is acceptable for a laptop canary only when the operator
 * explicitly confirms storage for this environment. Vercel always requires a
 * durable volume (or confirmed non-/tmp absolute durable dir) — never /tmp.
 */
export function evaluateProductionStorageGate(input?: {
  storage?: ReturnType<typeof getP185StorageHealth>;
}): {
  approvedForLiveSend: boolean;
  pathClassification: ProductionStoragePathClassification;
  blockers: string[];
  setup: string[];
} {
  const storage = input?.storage ?? getP185StorageHealth();
  const dataDir = path.resolve(storage.dataDir || p185DataDir());
  const vercel = isVercelRuntime();
  const confirmed = productionStorageConfirmed();
  const blockers: string[] = [];
  const setup: string[] = [];

  let pathClassification: ProductionStoragePathClassification =
    storage.adapter === "durable_volume"
      ? "durable_volume"
      : storage.adapter === "ephemeral_tmp"
        ? "ephemeral_tmp"
        : storage.adapter === "in_memory"
          ? "in_memory"
          : "local_filesystem";

  if (dataDir.startsWith("/tmp/") || dataDir === "/tmp") {
    pathClassification = "ephemeral_tmp";
  }

  if (
    !storage.healthy ||
    !storage.durable ||
    pathClassification === "ephemeral_tmp" ||
    pathClassification === "in_memory"
  ) {
    blockers.push("Durable production storage is not confirmed healthy.");
    setup.push(
      "Set P185_DURABLE_DATA_DIR to a durable absolute path (never /tmp). On Vercel, attach a persistent volume or external durable store — local .data is not durable across serverless deploys.",
    );
    return { approvedForLiveSend: false, pathClassification, blockers, setup };
  }

  if (vercel) {
    if (pathClassification === "local_filesystem" && !process.env.P185_DURABLE_DATA_DIR?.trim()) {
      blockers.push(
        "Vercel runtime detected with local_filesystem storage — not durable across deployments.",
      );
      setup.push(
        "On Vercel: provision durable storage, set P185_DURABLE_DATA_DIR to that absolute path, and set P185_PRODUCTION_STORAGE_CONFIRMED=1 only after verifying persistence across deploys.",
      );
      return { approvedForLiveSend: false, pathClassification, blockers, setup };
    }
    if (!confirmed) {
      blockers.push("P185_PRODUCTION_STORAGE_CONFIRMED is not set to 1 for this Vercel environment.");
      setup.push(
        "After verifying the durable volume survives redeploys, set P185_PRODUCTION_STORAGE_CONFIRMED=1 in Vercel project env (Production).",
      );
      return { approvedForLiveSend: false, pathClassification, blockers, setup };
    }
  } else if (!confirmed) {
    blockers.push(
      "P185_PRODUCTION_STORAGE_CONFIRMED is not set — local filesystem health alone does not authorize live sends.",
    );
    setup.push(
      "For an intentional local canary only: set P185_PRODUCTION_STORAGE_CONFIRMED=1 in .env.local after confirming this machine's .data path is the intended durable store for the canary. Do not set this on Vercel without a durable volume.",
    );
    return { approvedForLiveSend: false, pathClassification, blockers, setup };
  }

  return { approvedForLiveSend: true, pathClassification, blockers, setup };
}

export function isProductionStorageConfirmedEnv(): boolean {
  return productionStorageConfirmed();
}

export function isVercelRuntimeEnv(): boolean {
  return isVercelRuntime();
}
