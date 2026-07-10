import { OperationsControlCenterPage } from "@/components/executive/operations-control-center-page";
import { getServerSession } from "@/lib/auth/request-session";
import { toPublicUser } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/user-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExecutiveOperationsControlCenterPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login?next=/executive/operations-control-center");
  }

  if (session.role !== "executive") {
    redirect(session.role === "dm" ? "/dm" : "/");
  }

  const user = await findUserById(session.userId);
  if (!user) {
    redirect("/login?next=/executive/operations-control-center");
  }

  return <OperationsControlCenterPage user={toPublicUser(user)} />;
}
