"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { AutonomousOperationsCommandCenterPanel } from "@/components/executive/autonomous-operations-command-center-panel";

export function AutonomousOperationsCommandCenterPage({ user }: { user: UserPublic }) {
  return (
    <AppShell
      user={user}
      title="Autonomous Operations Command Center"
      subtitle="Production monitoring and operator controls for autonomous paperwork (P126)"
    >
      <AutonomousOperationsCommandCenterPanel />
    </AppShell>
  );
}
