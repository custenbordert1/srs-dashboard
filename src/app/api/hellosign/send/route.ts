import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type HelloSignPrepPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  positionName?: string;
  city?: string;
  state?: string;
};

function hasHelloSignKey(): boolean {
  const key = process.env.HELLOSIGN_API_KEY?.trim();
  return Boolean(key && key.toLowerCase() !== "placeholder" && key.toLowerCase() !== "your-hellosign-api-key");
}

export async function POST(request: Request) {
  let payload: HelloSignPrepPayload = {};
  try {
    payload = (await request.json()) as HelloSignPrepPayload;
  } catch {
    payload = {};
  }

  const requiredFields: Array<keyof HelloSignPrepPayload> = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "positionName",
    "city",
    "state",
  ];
  const missingFields = requiredFields.filter((field) => !payload[field]?.trim());

  return NextResponse.json({
    ok: true,
    sendEnabled: false,
    configured: hasHelloSignKey(),
    statusLabel: "Paperwork send disabled",
    message: "HelloSign packet preparation is available, but no real HelloSign request was sent.",
    missingFields,
  });
}
