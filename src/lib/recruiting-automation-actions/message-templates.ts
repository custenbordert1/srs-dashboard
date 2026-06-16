import type { FollowUpCampaignType } from "@/lib/recruiting-automation-actions/types";

export type MessageTemplate = {
  campaignType: FollowUpCampaignType;
  label: string;
  subject: string;
  body: string;
};

export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    campaignType: "stalled-candidate",
    label: "Stalled Candidate",
    subject: "Still interested in opportunities in {{city}}?",
    body:
      "Hi {{firstName}},\n\nI wanted to follow up on your application. We still have openings in {{city}} and would love to reconnect. Reply here or call us when you have a moment.\n\nBest,\n{{recruiterName}}",
  },
  {
    campaignType: "previous-applicant",
    label: "Previous Applicant",
    subject: "New opportunities near {{city}}",
    body:
      "Hi {{firstName}},\n\nYou applied with us before and we have new roles opening in {{city}}. If you are still open to work, I would like to share the latest openings with you.\n\nThanks,\n{{recruiterName}}",
  },
  {
    campaignType: "former-worker",
    label: "Former Worker",
    subject: "Welcome back — openings in {{city}}",
    body:
      "Hi {{firstName}},\n\nWe valued your past work with us and have new assignments in {{city}}. If you are available, I would like to discuss returning.\n\nRegards,\n{{recruiterName}}",
  },
  {
    campaignType: "incomplete-onboarding",
    label: "Incomplete Onboarding",
    subject: "Finish your onboarding in {{city}}",
    body:
      "Hi {{firstName}},\n\nYour onboarding is almost complete for roles in {{city}}. I can help you finish the remaining steps so you can start quickly.\n\nLet me know,\n{{recruiterName}}",
  },
  {
    campaignType: "interview-no-response",
    label: "Interview No-Response",
    subject: "Reschedule your interview in {{city}}?",
    body:
      "Hi {{firstName}},\n\nWe tried to reach you about an interview for work in {{city}}. If you are still interested, reply and we will find a time that works.\n\nBest,\n{{recruiterName}}",
  },
];

export function getMessageTemplate(campaignType: FollowUpCampaignType): MessageTemplate {
  return (
    DEFAULT_MESSAGE_TEMPLATES.find((row) => row.campaignType === campaignType) ??
    DEFAULT_MESSAGE_TEMPLATES[0]!
  );
}

export function renderMessageTemplate(
  template: string,
  vars: { firstName?: string; recruiterName?: string; city?: string },
): string {
  return template
    .replace(/\{\{firstName\}\}/g, vars.firstName ?? "there")
    .replace(/\{\{recruiterName\}\}/g, vars.recruiterName ?? "Your recruiter")
    .replace(/\{\{city\}\}/g, vars.city ?? "your area");
}
