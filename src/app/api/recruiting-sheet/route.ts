import { fetchGoogleSheetAsRows } from "@/lib/google-sheet-csv";
import { NextResponse } from "next/server";

export const revalidate = 60;

export async function GET() {
  const data = await fetchGoogleSheetAsRows();
  return NextResponse.json(data);
}
