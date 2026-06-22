/** Prefer Breezy first/last name; fall back to email only when name is absent. */
export function formatCandidateDisplayName(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  fallback?: string;
}): string {
  const first = input.firstName?.trim() ?? "";
  const last = input.lastName?.trim() ?? "";
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;
  return input.email?.trim() || input.fallback || "Candidate";
}
