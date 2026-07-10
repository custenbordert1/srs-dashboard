import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildBreezySyncValidation } from "@/lib/p174-breezy-sync-reliability";
import path from "node:path";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function excelDateToIso(serial: number, timeFrac = 0): string {
  if (!serial || !Number.isFinite(serial)) return "";
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (timeFrac) {
    const secs = Math.round(timeFrac * 86400);
    d.setUTCHours(0, 0, 0, 0);
    d.setTime(d.getTime() + secs * 1000);
  }
  return d.toISOString();
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "read",
  });
  if (isGuardFailure(guard)) return guard;

  const workbook = path.join(process.cwd(), "diagnostics", "Breezy Info.xlsx");
  let exportCandidates: Array<{
    name: string;
    email: string;
    phone: string;
    positionName: string;
    appliedAt: string;
    recruiter: string;
  }> = [];
  let exportPositions: Array<{ position: string; applied: number; location: string }> = [];

  try {
    const wb = XLSX.readFile(workbook);
    const posRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets["Breezy_OpenPositions_Statistics"] ?? {},
      { defval: "" },
    );
    const candRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets["Breezy Applicants"] ?? {},
      { defval: "" },
    );
    exportPositions = posRows.map((r) => ({
      position: String(r.Position ?? ""),
      applied: Number(r.Applied ?? 0),
      location: String(r.Location ?? ""),
    }));
    exportCandidates = candRows.map((r) => {
      const addedDate = Number(r.addedDate ?? 0);
      const addedTime = Number(r.addedTime ?? 0);
      return {
        name: String(r.name ?? ""),
        email: String(r.email_address ?? ""),
        phone: String(r.phone_number ?? ""),
        positionName: String(r.position ?? ""),
        appliedAt: excelDateToIso(addedDate, addedTime),
        recruiter: String(r.sourced_by_name ?? ""),
      };
    });
    exportCandidates.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  } catch {
    // Workbook optional on server — still return live dashboard without export baseline
  }

  const report = await buildBreezySyncValidation({
    exportCandidates,
    exportPositions,
  });

  return NextResponse.json({ ok: true, report });
}
