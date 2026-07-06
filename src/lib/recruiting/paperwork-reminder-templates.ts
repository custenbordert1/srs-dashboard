import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildTemplateVariables,
  renderPreviewTemplate,
} from "@/lib/autonomous-candidate-communication-engine/communication-templates";
import type { CommunicationPreviewTemplate } from "@/lib/autonomous-candidate-communication-engine/types";

export const P146_REMINDER_1_TEMPLATE_ID = "p146_paperwork_reminder_1";
export const P146_REMINDER_2_TEMPLATE_ID = "p146_paperwork_reminder_2";

const REMINDER_1_TEMPLATE: CommunicationPreviewTemplate = {
  templateId: P146_REMINDER_1_TEMPLATE_ID,
  communicationType: "reminder_24h",
  channel: "email",
  subject: "Friendly reminder — onboarding paperwork",
  body: "Hi {{FirstName}},\n\nThis is a friendly reminder that your onboarding paperwork for {{Project}} is still outstanding.\n\nPlease take a few minutes to review and sign using the link below:\n{{PaperworkLink}}\n\nIf you have questions, reply to this email or contact {{Recruiter}}.\n\nThank you,\nStrategic Retail Solutions Recruiting",
  mergeFields: ["firstName", "project", "paperworkLink", "recruiter"],
};

const REMINDER_2_TEMPLATE: CommunicationPreviewTemplate = {
  templateId: P146_REMINDER_2_TEMPLATE_ID,
  communicationType: "reminder_48h",
  channel: "email",
  subject: "Action needed — onboarding paperwork",
  body: "Hi {{FirstName}},\n\nWe still need your completed onboarding paperwork for {{Project}} before we can move you to the next step.\n\nPlease sign using the link below as soon as possible:\n{{PaperworkLink}}\n\nIf you need help, contact {{Recruiter}}.\n\nThank you,\nStrategic Retail Solutions Recruiting",
  mergeFields: ["firstName", "project", "paperworkLink", "recruiter"],
};

export function resolvePaperworkReminderTemplate(
  action: "Send Reminder #1" | "Send Reminder #2",
): CommunicationPreviewTemplate {
  return action === "Send Reminder #1" ? REMINDER_1_TEMPLATE : REMINDER_2_TEMPLATE;
}

export function buildPaperworkReminderEmail(input: {
  row: ScoredCandidateWorkflowRow;
  action: "Send Reminder #1" | "Send Reminder #2";
}): { templateId: string; subject: string; text: string } {
  const template = resolvePaperworkReminderTemplate(input.action);
  const variables = buildTemplateVariables(input.row);
  const rendered = renderPreviewTemplate(template, variables);
  return {
    templateId: template.templateId,
    subject: rendered.subject,
    text: rendered.body,
  };
}
