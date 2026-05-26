"use client";

import { MOCK_DM_LOGINS, isMockDmLoginEnabled } from "@/lib/auth/mock-dm-logins";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type LoginSuccessResponse = {
  ok: true;
  role: UserRole;
  redirect: string;
};

type LoginErrorResponse = {
  ok: false;
  error: string;
};

type LoginResponse = LoginSuccessResponse | LoginErrorResponse;

async function parseLoginResponse(res: Response): Promise<LoginResponse> {
  const text = await res.text();
  if (!text.trim()) {
    return {
      ok: false,
      error: `Empty response from server (HTTP ${res.status}). Check SESSION_SECRET in .env.local.`,
    };
  }
  try {
    return JSON.parse(text) as LoginResponse;
  } catch {
    return {
      ok: false,
      error: `Invalid server response (HTTP ${res.status}).`,
    };
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const parsed = await parseLoginResponse(res);
      if (!res.ok || !parsed.ok) {
        setError(parsed.ok ? "Login failed" : parsed.error);
        return;
      }
      const next = searchParams.get("next");
      const destination =
        next && next.startsWith("/") ? next : parsed.redirect ?? (parsed.role === "dm" ? "/dm" : "/");
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl shadow-black/30 backdrop-blur-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300/90">SRS Recruiting</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-500">
        District managers, recruiters, and executives use role-based access with territory protection.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm">
          <span className="text-zinc-400">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30"
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {isMockDmLoginEnabled() ? (
        <div className="mt-6 rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-3">
          <p className="text-[11px] font-medium text-violet-200/90">Dev: quick DM login</p>
          <p className="mt-1 text-[10px] text-zinc-500">
            Uses seeded DM accounts and default password from <code className="text-zinc-400">.env.local</code>.
          </p>
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {MOCK_DM_LOGINS.map((mock) => (
              <button
                key={mock.email}
                type="button"
                disabled={busy}
                onClick={() => {
                  setEmail(mock.email);
                  setPassword("");
                  setError(null);
                }}
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                title={`${mock.territoryStates.join(", ")} (${mock.stateCount} states)`}
              >
                {mock.dmName}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">
            Click a DM, enter password, then Sign in. Recruiter: recruiter@srsmerchandising.com · Admin:
            admin@srsmerchandising.com
          </p>
        </div>
      ) : null}

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-500">
        <p className="font-medium text-zinc-400">Roles</p>
        <ul className="mt-1 space-y-0.5">
          <li>{ROLE_LABELS.admin} — full command center + executive tools</li>
          <li>{ROLE_LABELS.recruiter} — full recruiting command center</li>
          <li>{ROLE_LABELS.dm} — territory-scoped DM dashboard only</li>
        </ul>
      </div>
    </section>
  );
}
