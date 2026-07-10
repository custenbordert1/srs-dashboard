"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { OperationsControlCenterPanel } from "@/components/executive/operations-control-center-panel";

export function OperationsControlCenterPage({ user }: { user: UserPublic }) {
  return (
    <AppShell
      user={user}
      title="Operations Control Center"
      subtitle="P159 — visibility, safeguards, and operator control before continuous mode"
    >
      <OperationsControlCenterPanel />
    </AppShell>
  );
}
