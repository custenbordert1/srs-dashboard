import { fetchGoogleSheetAsRows } from "@/lib/google-sheet-csv";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await fetchGoogleSheetAsRows();
  return NextResponse.json(data);
}
