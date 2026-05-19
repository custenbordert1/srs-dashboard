import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hasHelloSignKey(): boolean {
  const key = process.env.HELLOSIGN_API_KEY?.trim();
  return Boolean(key && key.toLowerCase() !== "placeholder" && key.toLowerCase() !== "your-hellosign-api-key");
}

export async function GET() {
  const configured = hasHelloSignKey();
  return NextResponse.json({
    ok: true,
    provider: "HelloSign",
    configured,
    sendEnabled: false,
    statusLabel: configured ? "Configured, sending disabled" : "Waiting on HelloSign API key",
    message: "HelloSign integration is in preparation mode. No paperwork packets are sent from this dashboard yet.",
  });
}
