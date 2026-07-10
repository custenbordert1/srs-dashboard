"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { RecruiterAssignmentCenterPanel } from "@/components/executive/recruiter-assignment-center-panel";

export function RecruiterAssignmentCenterPage({ user }: { user: UserPublic }) {
  return (
    <AppShell
      user={user}
      title="Recruiter Assignment Center"
      subtitle="P158 — autonomous recruiter assignment with simulation and controlled production"
    >
      <RecruiterAssignmentCenterPanel />
    </AppShell>
  );
}
