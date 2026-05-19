import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("position_id")?.trim() || undefined;
  const state = searchParams.get("state")?.trim() || undefined;
  const pageSize = Number.parseInt(searchParams.get("page_size") ?? "", 10);
  const maxPages = Number.parseInt(searchParams.get("max_pages") ?? "", 10);
  const maxPositions = Number.parseInt(searchParams.get("max_positions") ?? "", 10);

  const result = await fetchBreezyCandidates({
    positionId,
    state,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
    maxPositions: Number.isFinite(maxPositions) ? maxPositions : undefined,
  });
  const status = result.ok ? 200 : result.error.includes("Waiting on Breezy API key") ? 503 : 502;
  return NextResponse.json(result, { status });
}
