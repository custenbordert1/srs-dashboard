import { LoginForm } from "@/components/auth/login-form";
import { Suspense } from "react";

function LoginFallback() {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-8 text-center text-sm text-zinc-500">
      Loading sign-in…
    </section>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgb(39_39_42_/_0.55),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgb(20_83_45_/_0.18),transparent_50%)] text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <Suspense fallback={<LoginFallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
