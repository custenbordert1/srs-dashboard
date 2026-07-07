"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { RecruitingPrioritiesPanel } from "@/components/executive/recruiting-priorities-panel";

export function RecruitingPrioritiesPage({ user }: { user: UserPublic }) {
  return (
    <AppShell
      user={user}
      title="Recruiting Priorities"
      subtitle="P156 — intelligent candidate prioritization by business impact"
    >
      <RecruitingPrioritiesPanel />
    </AppShell>
  );
}
