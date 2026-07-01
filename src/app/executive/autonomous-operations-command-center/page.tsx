import { AutonomousOperationsCommandCenterPage } from "@/components/executive/autonomous-operations-command-center-page";
import { getServerSession } from "@/lib/auth/request-session";
import { toPublicUser } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/user-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExecutiveAutonomousOperationsCommandCenterPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login?next=/executive/autonomous-operations-command-center");
  }

  if (session.role !== "executive") {
    redirect(session.role === "dm" ? "/dm" : "/");
  }

  const user = await findUserById(session.userId);
  if (!user) {
    redirect("/login?next=/executive/autonomous-operations-command-center");
  }

  return <AutonomousOperationsCommandCenterPage user={toPublicUser(user)} />;
}
