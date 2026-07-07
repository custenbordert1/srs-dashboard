"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { RecruitingAutopilotOperationsPanel } from "@/components/executive/recruiting-autopilot-operations-panel";

export function RecruitingAutopilotOperationsPage({ user }: { user: UserPublic }) {
  return (
    <AppShell
      user={user}
      title="Recruiting Autopilot Operations"
      subtitle="P155 — monitor and control the P154.7 continuous recruiting runner"
    >
      <RecruitingAutopilotOperationsPanel />
    </AppShell>
  );
}
