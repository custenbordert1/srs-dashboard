import { DmDashboard } from "@/components/dm/dm-dashboard";
import { getServerSession } from "@/lib/auth/request-session";
import { toPublicUser } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/user-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DmDashboardPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login?next=/dm");
  }

  const user = await findUserById(session.userId);
  if (!user) {
    redirect("/login?next=/dm");
  }

  return <DmDashboard user={toPublicUser(user)} />;
}
