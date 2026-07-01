"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { WorkforceIntelligencePanel } from "@/components/executive/workforce-intelligence-panel";

export function WorkforceIntelligencePage({ user }: { user: UserPublic }) {
  return (
    <AppShell
      user={user}
      title="Workforce Intelligence"
      subtitle="Import active-reps-clean.csv to power live rep matching, coverage analytics, and staffing recommendations."
    >
      <WorkforceIntelligencePanel />
    </AppShell>
  );
}
