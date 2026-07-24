import { P245_SUBJECT } from "@/lib/p245-onboarding-paperwork-reminders/types";

export function extractFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  const first = trimmed.split(/\s+/)[0]?.replace(/[^A-Za-z'-]/g, "") ?? "";
  return first || "there";
}

export function buildP245ReminderEmail(input: {
  firstName: string;
}): { subject: string; text: string; html: string } {
  const firstName = input.firstName.trim() || "there";
  const text = `Hi ${firstName},

We're excited to have you join Strategic Retail Solutions (SRS)!

Our records show that your onboarding paperwork has been sent but has not yet been completed.

To continue with the hiring process and become eligible for upcoming work opportunities, please complete your onboarding packet as soon as possible using the Dropbox Sign email you previously received.

If you cannot locate the Dropbox Sign email, simply reply to this email and we'll gladly resend your paperwork.

Once your paperwork is completed:

• HR will review your documents
• Your profile will be finalized
• Your District Manager will contact you regarding available work in your area

We look forward to working with you!

Thank you,

Taylor Custenborder
Lead Recruiter
Strategic Retail Solutions (SRS)
`;

  const html = `<p>Hi ${escapeHtml(firstName)},</p>
<p>We're excited to have you join Strategic Retail Solutions (SRS)!</p>
<p>Our records show that your onboarding paperwork has been sent but has not yet been completed.</p>
<p>To continue with the hiring process and become eligible for upcoming work opportunities, please complete your onboarding packet as soon as possible using the Dropbox Sign email you previously received.</p>
<p>If you cannot locate the Dropbox Sign email, simply reply to this email and we'll gladly resend your paperwork.</p>
<p>Once your paperwork is completed:</p>
<ul>
<li>HR will review your documents</li>
<li>Your profile will be finalized</li>
<li>Your District Manager will contact you regarding available work in your area</li>
</ul>
<p>We look forward to working with you!</p>
<p>Thank you,</p>
<p>Taylor Custenborder<br/>Lead Recruiter<br/>Strategic Retail Solutions (SRS)</p>`;

  return { subject: P245_SUBJECT, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
