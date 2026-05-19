import { resolveSessionSecret } from "@/lib/auth/auth-env";
import type { AuthSession } from "@/lib/auth/types";

function secret(): string | null {
  return resolveSessionSecret();
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function verifySessionTokenEdge(token: string | undefined | null): Promise<AuthSession | null> {
  const key = secret();
  if (!key || !token?.includes(".")) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(encodedPayload));
  const expected = bytesToBase64Url(signed);
  if (expected !== signature) return null;

  try {
    const json = new TextDecoder().decode(base64UrlToBytes(encodedPayload));
    const session = JSON.parse(json) as AuthSession;
    if (!session.userId || !session.role || !session.expiresAt) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
