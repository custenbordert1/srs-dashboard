export function buildDirectDepositVerificationEmailBody(): string {
  return [
    "Welcome aboard!",
    "",
    "I'm reaching out to verify the account and routing numbers you provided on your Wage Consent Form. Please send a clear picture or document that verifies the numbers you provided.",
    "",
    "Acceptable forms:",
    "",
    "* Bank statement",
    "* Voided check",
    "* Bank letter",
    "* Direct deposit form",
    "* Banking app screenshot showing account/routing numbers",
    "",
    "If you have questions, contact recruiting.",
    "",
    "Thank you,",
    "SRS Merchandising Recruiting",
  ].join("\n");
}

export function buildDirectDepositVerificationEmailHtml(): string {
  const paragraphs = buildDirectDepositVerificationEmailBody()
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "<br/>";
      if (line.startsWith("* ")) {
        return `<li>${line.slice(2)}</li>`;
      }
      return `<p style="margin:0 0 8px">${line}</p>`;
    });
  const listStarted = paragraphs.some((p) => p.startsWith("<li>"));
  const body = listStarted
    ? paragraphs
        .join("")
        .replace(/(<li>[\s\S]*?<\/li>)+/g, (match) => `<ul style="margin:0 0 12px 18px">${match}</ul>`)
    : paragraphs.join("");
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">${body}</div>`;
}
