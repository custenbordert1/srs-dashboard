const VERIFICATION_FORMS: Array<{ title: string; description: string }> = [
  {
    title: "Bank Statement",
    description: "A statement from your bank showing the account and routing numbers.",
  },
  {
    title: "Voided Check",
    description:
      'A check with "VOID" written across it, displaying the necessary numbers.',
  },
  {
    title: "Bank Letter",
    description: "An official letter from your bank confirming your account details.",
  },
  {
    title: "Direct Deposit Form",
    description: "A form from your bank or employer containing account information.",
  },
  {
    title: "Screenshot from Online Banking",
    description:
      "A screenshot showing the account and routing numbers from your bank's website or mobile app.",
  },
];

const SIGNATURE_LINES = [
  "Human Resource",
  "Strategic Retail Solutions",
  "humanresource@srsmerchandising.com",
  "Office: 888-572-5580",
  "Fax: 888-569-0996",
  "www.srsmerchandising.com",
] as const;

export function buildDirectDepositVerificationEmailBody(): string {
  const lines: string[] = [
    "Welcome aboard!",
    "",
    "I'm reaching out to verify the account and routing numbers you provided on your Wage Consent Form. Please send a clear picture of a document that verifies the numbers you provided. Below are some acceptable forms of verification:",
    "",
  ];

  for (const form of VERIFICATION_FORMS) {
    lines.push(`${form.title} – ${form.description}`);
  }

  lines.push(
    "",
    "Let me know if you have any questions. Looking forward to having you on the team!",
    "",
    ...SIGNATURE_LINES,
  );

  return lines.join("\n");
}

export function buildDirectDepositVerificationEmailHtml(): string {
  const intro = [
    "<p style=\"margin:0 0 12px\">Welcome aboard!</p>",
    "<p style=\"margin:0 0 12px\">I'm reaching out to verify the account and routing numbers you provided on your Wage Consent Form. Please send a clear picture of a document that verifies the numbers you provided. Below are some acceptable forms of verification:</p>",
  ];

  const listItems = VERIFICATION_FORMS.map(
    (form) =>
      `<li style="margin:0 0 8px"><strong>${form.title}</strong> – ${form.description}</li>`,
  ).join("");

  const closing = [
    "<p style=\"margin:12px 0\">Let me know if you have any questions. Looking forward to having you on the team!</p>",
    "<p style=\"margin:16px 0 4px\">Human Resource<br/>Strategic Retail Solutions</p>",
    '<p style="margin:0 0 4px"><a href="mailto:humanresource@srsmerchandising.com">humanresource@srsmerchandising.com</a></p>',
    "<p style=\"margin:0 0 4px\">Office: 888-572-5580<br/>Fax: 888-569-0996</p>",
    '<p style="margin:0"><a href="https://www.srsmerchandising.com">www.srsmerchandising.com</a></p>',
  ].join("");

  return `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111;line-height:1.5">${intro.join("")}<ul style="margin:0 0 12px 20px;padding:0">${listItems}</ul>${closing}</div>`;
}
