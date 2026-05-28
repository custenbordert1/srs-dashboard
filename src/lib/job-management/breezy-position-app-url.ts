/** Breezy HR web app deep link for a company position (when company id is known). */
export function buildBreezyPositionAppUrl(companyId: string, positionId: string): string | null {
  const company = companyId.trim();
  const position = positionId.trim();
  if (!company || !position) return null;
  return `https://app.breezy.hr/p/${encodeURIComponent(company)}/position/${encodeURIComponent(position)}`;
}
