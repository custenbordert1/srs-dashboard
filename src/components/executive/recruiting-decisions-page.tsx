"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { RecruitingDecisionsPanel } from "@/components/executive/recruiting-decisions-panel";

export function RecruitingDecisionsPage({ user }: { user: UserPublic }) {
  return (
    <AppShell
      user={user}
      title="Recruiting Decisions"
      subtitle="P157 — intelligent recruiter decision engine (read-only)"
    >
      <RecruitingDecisionsPanel />
    </AppShell>
  );
}
