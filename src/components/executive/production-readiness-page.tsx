"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { ProductionReadinessPanel } from "@/components/executive/production-readiness-panel";

export function ProductionReadinessPage({ user }: { user: UserPublic }) {
  return (
    <AppShell
      user={user}
      title="Production Readiness & Deployment"
      subtitle="P160 — read-only certification before company server deployment"
    >
      <ProductionReadinessPanel />
    </AppShell>
  );
}
