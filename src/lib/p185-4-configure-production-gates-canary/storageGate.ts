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
  | "postgres"
  | "unsafe";

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV?.trim());
}

function productionStorageConfirmed(): boolean {
  return process.env.P185_PRODUCTION_STORAGE_CONFIRMED === "1";
}

/**
 * Production live-send gate (Option A):
 * - Preferred: Neon / Vercel Postgres (`adapter === "postgres"`) via P185.5.
 * - Local filesystem alone is not enough on Vercel.
 * - `P185_PRODUCTION_STORAGE_CONFIRMED` is never auto-set — operator only.
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
  const dataDir = path.resolve(
    storage.adapter === "postgres" ? "/postgres" : storage.dataDir || p185DataDir(),
  );
  const vercel = isVercelRuntime();
  const confirmed = productionStorageConfirmed();
  const blockers: string[] = [];
  const setup: string[] = [];

  let pathClassification: ProductionStoragePathClassification =
    storage.adapter === "postgres"
      ? "postgres"
      : storage.adapter === "durable_volume"
        ? "durable_volume"
        : storage.adapter === "ephemeral_tmp"
          ? "ephemeral_tmp"
          : storage.adapter === "in_memory"
            ? "in_memory"
            : "local_filesystem";

  if (storage.adapter !== "postgres" && (dataDir.startsWith("/tmp/") || dataDir === "/tmp")) {
    pathClassification = "ephemeral_tmp";
  }

  if (storage.adapter === "postgres") {
    if (!storage.healthy || !storage.durable) {
      blockers.push("Postgres durable adapter is unhealthy.");
      setup.push("Check P185_DATABASE_URL / DATABASE_URL connectivity and schema migrations.");
      return { approvedForLiveSend: false, pathClassification, blockers, setup };
    }
    if (!confirmed) {
      blockers.push(
        "P185_PRODUCTION_STORAGE_CONFIRMED is not set — set only after P185.5 migration + durability validation pass.",
      );
      setup.push(
        "After P185.5 migration/validation reports ready_to_confirm, set P185_PRODUCTION_STORAGE_CONFIRMED=1 in Vercel Production env (do not fabricate).",
      );
      return { approvedForLiveSend: false, pathClassification, blockers, setup };
    }
    return { approvedForLiveSend: true, pathClassification, blockers, setup };
  }

  if (
    !storage.healthy ||
    !storage.durable ||
    pathClassification === "ephemeral_tmp" ||
    pathClassification === "in_memory"
  ) {
    blockers.push("Durable production storage is not confirmed healthy.");
    setup.push(
      "Prefer Neon/Vercel Postgres via P185_DATABASE_URL. Do not use .data, /tmp, or function-local filesystem on Vercel.",
    );
    return { approvedForLiveSend: false, pathClassification, blockers, setup };
  }

  if (vercel) {
    if (pathClassification === "local_filesystem" && !process.env.P185_DURABLE_DATA_DIR?.trim()) {
      blockers.push(
        "Vercel runtime detected with local_filesystem storage — not durable across deployments.",
      );
      setup.push(
        "On Vercel: set P185_DATABASE_URL to Neon/Vercel Postgres, run P185.5 migration, then set P185_PRODUCTION_STORAGE_CONFIRMED=1 after validation.",
      );
      return { approvedForLiveSend: false, pathClassification, blockers, setup };
    }
    if (!confirmed) {
      blockers.push("P185_PRODUCTION_STORAGE_CONFIRMED is not set to 1 for this Vercel environment.");
      setup.push(
        "After verifying durable Postgres survives redeploys, set P185_PRODUCTION_STORAGE_CONFIRMED=1 in Vercel project env (Production).",
      );
      return { approvedForLiveSend: false, pathClassification, blockers, setup };
    }
  } else if (!confirmed) {
    blockers.push(
      "P185_PRODUCTION_STORAGE_CONFIRMED is not set — local filesystem health alone does not authorize live sends.",
    );
    setup.push(
      "Use P185_DATABASE_URL (or P185_PGLITE_DATA_DIR for local durable validation), run P185.5 migration/validation, then set P185_PRODUCTION_STORAGE_CONFIRMED=1.",
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
