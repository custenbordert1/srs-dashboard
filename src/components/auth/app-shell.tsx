"use client";

import { ROLE_LABELS } from "@/lib/auth/permissions";
import { isAdminRole, isDmRole } from "@/lib/auth/roles";
import type { UserPublic } from "@/lib/auth/types";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AppShellProps = {
  user: UserPublic;
  children: React.ReactNode;
  title: string;
  subtitle?: string;
};

export function AppShell({ user, children, title, subtitle }: AppShellProps) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300/90">SRS Recruiting</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-300">
              {user.name} · {ROLE_LABELS[user.role]}
            </span>
            {!isDmRole(user.role) ? (
              <Link
                href="/"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Command center
              </Link>
            ) : null}
            {isDmRole(user.role) || isAdminRole(user.role) ? (
              <Link
                href="/dm"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                DM dashboard
              </Link>
            ) : null}
            {isAdminRole(user.role) ? (
              <>
                <Link
                  href="/executive"
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                >
                  Executive rollup
                </Link>
                <Link
                  href="/executive/workforce-intelligence"
                  className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-200 hover:bg-teal-500/20"
                >
                  Workforce Intelligence
                </Link>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
