import { WorkforceIntelligencePage } from "@/components/executive/workforce-intelligence-page";
import { getServerSession } from "@/lib/auth/request-session";
import { toPublicUser } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/user-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExecutiveWorkforceIntelligencePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login?next=/executive/workforce-intelligence");
  }

  if (session.role !== "executive") {
    redirect(session.role === "dm" ? "/dm" : "/");
  }

  const user = await findUserById(session.userId);
  if (!user) {
    redirect("/login?next=/executive/workforce-intelligence");
  }

  return <WorkforceIntelligencePage user={toPublicUser(user)} />;
}
