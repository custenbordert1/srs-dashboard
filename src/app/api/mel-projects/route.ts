import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { NextResponse } from "next/server";

export const revalidate = 60;

export async function GET() {
  const data = await fetchMelProjectsSheet();
  return NextResponse.json(data);
}
