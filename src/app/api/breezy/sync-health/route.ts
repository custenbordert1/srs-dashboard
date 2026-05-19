import { buildBreezySyncHealthSnapshot } from "@/lib/breezy-sync-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await buildBreezySyncHealthSnapshot());
}
