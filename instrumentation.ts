export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { logStartupEnvValidation } = await import("@/lib/env-validation");
  logStartupEnvValidation();
}
