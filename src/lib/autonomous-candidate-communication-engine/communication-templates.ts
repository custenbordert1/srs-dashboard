import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  CommunicationPreviewTemplate,
  CommunicationTemplateVariables,
} from "@/lib/autonomous-candidate-communication-engine/types";

export const COMMUNICATION_PREVIEW_TEMPLATES: CommunicationPreviewTemplate[] = [
  {
    templateId: "recruiting_application_received",
    communicationType: "application_received",
    channel: "email",
    subject: "Application Received — Strategic Retail Solutions",
    body: "Hi {{FirstName}},\n\nThank you for applying to Strategic Retail Solutions. We received your application and a recruiter will review it shortly.\n\nCurrent status: {{CurrentStatus}}\n\nThank you.",
    mergeFields: ["firstName", "currentStatus"],
  },
  {
    templateId: "recruiting_interview_invitation",
    communicationType: "interview_invitation",
    channel: "email",
    subject: "Interview Invitation — Strategic Retail Solutions",
    body: "Hi {{FirstName}},\n\nWe would like to invite you to interview for the {{Project}} opportunity.\n\nYour recruiter {{Recruiter}} will coordinate scheduling.\n\nThank you.",
    mergeFields: ["firstName", "project", "recruiter"],
  },
  {
    templateId: "recruiting_interview_reminder",
    communicationType: "interview_reminder",
    channel: "email",
    subject: "Interview Reminder",
    body: "Hi {{FirstName}},\n\nThis is a reminder about your upcoming interview. Please reply to {{Recruiter}} if you need to reschedule.\n\nThank you.",
    mergeFields: ["firstName", "recruiter"],
  },
  {
    templateId: "recruiting_follow_up",
    communicationType: "recruiter_follow_up",
    channel: "email",
    subject: "Follow-up from {{Recruiter}}",
    body: "Hi {{FirstName}},\n\n{{Recruiter}} is following up on your application. Please let us know if you are still interested.\n\nThank you.",
    mergeFields: ["firstName", "recruiter"],
  },
  {
    templateId: "recruiting_inactivity",
    communicationType: "candidate_inactivity_reminder",
    channel: "email",
    subject: "Checking in on your application",
    body: "Hi {{FirstName}},\n\nWe have not heard from you recently. Please respond so we can keep your application active.\n\nThank you.",
    mergeFields: ["firstName"],
  },
  {
    templateId: "paperwork_ready",
    communicationType: "paperwork_ready",
    channel: "email",
    subject: "Your paperwork is ready",
    body: "Hi {{FirstName}},\n\nYour onboarding paperwork is ready to send.\n\nPaperwork link: {{PaperworkLink}}\n\nThank you.",
    mergeFields: ["firstName", "paperworkLink"],
  },
  {
    templateId: "paperwork_sent",
    communicationType: "paperwork_sent",
    channel: "email",
    subject: "Onboarding Paperwork — Please Sign",
    body: "Hi {{FirstName}},\n\nYour onboarding paperwork has been sent. Please review and sign using the link below.\n\n{{PaperworkLink}}\n\nThank you.",
    mergeFields: ["firstName", "paperworkLink"],
  },
  {
    templateId: "paperwork_reminder_24h",
    communicationType: "reminder_24h",
    channel: "email",
    subject: "Reminder: Onboarding Paperwork",
    body: "Hi {{FirstName}},\n\nThis is a friendly reminder to complete your onboarding paperwork.\n\n{{PaperworkLink}}\n\nThank you.",
    mergeFields: ["firstName", "paperworkLink"],
  },
  {
    templateId: "paperwork_reminder_48h",
    communicationType: "reminder_48h",
    channel: "email",
    subject: "Second Reminder: Onboarding Paperwork",
    body: "Hi {{FirstName}},\n\nYour onboarding paperwork is still pending. Please complete it at your earliest convenience.\n\n{{PaperworkLink}}\n\nThank you.",
    mergeFields: ["firstName", "paperworkLink"],
  },
  {
    templateId: "paperwork_final_reminder",
    communicationType: "final_reminder",
    channel: "email",
    subject: "Final Reminder: Onboarding Paperwork",
    body: "Hi {{FirstName}},\n\nThis is a final reminder to complete your onboarding paperwork before your packet expires.\n\n{{PaperworkLink}}\n\nThank you.",
    mergeFields: ["firstName", "paperworkLink"],
  },
  {
    templateId: "paperwork_completed",
    communicationType: "paperwork_completed",
    channel: "email",
    subject: "Paperwork Completed — Thank You",
    body: "Hi {{FirstName}},\n\nCongratulations! Your onboarding paperwork has been completed.\n\nYour next steps are:\n• Complete MEL survey\n• Complete training\n• Wait for District Manager contact\n\nThank you.",
    mergeFields: ["firstName"],
  },
  {
    templateId: "onboarding_welcome",
    communicationType: "welcome_email",
    channel: "email",
    subject: "Welcome to Strategic Retail Solutions",
    body: "Hi {{FirstName}},\n\nCongratulations!\n\nYour onboarding paperwork has been completed.\n\nYour next steps are:\n• Complete MEL survey\n• Complete training\n• Wait for District Manager contact\n\nThank you.",
    mergeFields: ["firstName"],
  },
  {
    templateId: "onboarding_training",
    communicationType: "training_instructions",
    channel: "email",
    subject: "Training Instructions",
    body: "Hi {{FirstName}},\n\nPlease complete your training modules using the link below.\n\n{{TrainingLink}}\n\nThank you.",
    mergeFields: ["firstName", "trainingLink"],
  },
  {
    templateId: "onboarding_mel_survey",
    communicationType: "mel_survey_assignment",
    channel: "email",
    subject: "MEL Survey Assignment",
    body: "Hi {{FirstName}},\n\nPlease complete your MEL survey for the {{Market}} market.\n\n{{SurveyLink}}\n\nThank you.",
    mergeFields: ["firstName", "market", "surveyLink"],
  },
  {
    templateId: "onboarding_store_call",
    communicationType: "store_call_assignment",
    channel: "email",
    subject: "Store Assignment — {{Store}}",
    body: "Hi {{FirstName}},\n\nYou have been assigned to {{Store}} on project {{Project}}.\n\nYour District Manager {{DistrictManager}} will contact you.\n\nThank you.",
    mergeFields: ["firstName", "store", "project", "districtManager"],
  },
  {
    templateId: "onboarding_ready_for_work",
    communicationType: "ready_for_work_confirmation",
    channel: "email",
    subject: "Ready for Work Confirmation",
    body: "Hi {{FirstName}},\n\nYou are confirmed Ready for Work in the {{Market}} market.\n\nThank you.",
    mergeFields: ["firstName", "market"],
  },
  {
    templateId: "dm_new_rep_ready",
    communicationType: "new_representative_ready",
    channel: "email",
    subject: "New Representative Ready — {{CandidateName}}",
    body: "Hi {{DistrictManager}},\n\n{{CandidateName}} is ready for work in {{Market}}.\n\nPlease schedule store assignment and onboarding call.\n\nThank you.",
    mergeFields: ["candidateName", "districtManager", "market"],
  },
  {
    templateId: "dm_onboarding_complete",
    communicationType: "representative_completed_onboarding",
    channel: "email",
    subject: "Onboarding Complete — {{CandidateName}}",
    body: "Hi {{DistrictManager}},\n\n{{CandidateName}} has completed onboarding for {{Project}}.\n\nThank you.",
    mergeFields: ["candidateName", "districtManager", "project"],
  },
  {
    templateId: "dm_rep_overdue",
    communicationType: "representative_overdue",
    channel: "email",
    subject: "Representative Overdue — {{CandidateName}}",
    body: "Hi {{DistrictManager}},\n\n{{CandidateName}} is overdue on onboarding steps. Current status: {{CurrentStatus}}.\n\nPlease follow up.\n\nThank you.",
    mergeFields: ["candidateName", "districtManager", "currentStatus"],
  },
  {
    templateId: "dm_rep_failed",
    communicationType: "representative_failed_onboarding",
    channel: "email",
    subject: "Onboarding Failed — {{CandidateName}}",
    body: "Hi {{DistrictManager}},\n\n{{CandidateName}} failed onboarding. Status: {{CurrentStatus}}.\n\nReview required.\n\nThank you.",
    mergeFields: ["candidateName", "districtManager", "currentStatus"],
  },
  {
    templateId: "leadership_daily_summary",
    communicationType: "daily_communication_summary",
    channel: "internal",
    subject: "Daily Communication Summary",
    body: "Communications today: {{Queue}}\n\nPreview only — no live delivery.",
    mergeFields: ["queue"],
  },
  {
    templateId: "leadership_failed_alerts",
    communicationType: "failed_communication_alerts",
    channel: "internal",
    subject: "Failed Communication Alerts",
    body: "Failed communications require review. Queue: {{Queue}}",
    mergeFields: ["queue"],
  },
  {
    templateId: "leadership_health_metrics",
    communicationType: "communication_health_metrics",
    channel: "internal",
    subject: "Communication Health Metrics",
    body: "Communication health snapshot. Status: {{CurrentStatus}}",
    mergeFields: ["currentStatus"],
  },
];

const TEMPLATE_BY_TYPE = new Map(
  COMMUNICATION_PREVIEW_TEMPLATES.map((template) => [template.communicationType, template] as const),
);

export function getCommunicationTemplate(
  communicationType: CommunicationPreviewTemplate["communicationType"],
): CommunicationPreviewTemplate {
  return TEMPLATE_BY_TYPE.get(communicationType) ?? COMMUNICATION_PREVIEW_TEMPLATES[0];
}

export function buildTemplateVariables(row: ScoredCandidateWorkflowRow): CommunicationTemplateVariables {
  const candidateName = formatCandidateDisplayName(row);
  return {
    firstName: row.firstName?.trim() || "Candidate",
    lastName: row.lastName?.trim() || "",
    candidateName,
    recruiter: row.assignedRecruiter?.trim() || "Recruiting Team",
    districtManager: row.assignedDM?.trim() || row.suggestedDM?.trim() || "District Manager",
    project: row.positionName?.trim() || "Project",
    store: row.city?.trim() || "Assigned Store",
    market: row.city?.trim() || row.state?.trim() || "Market",
    surveyLink: "https://preview.srs.local/mel-survey",
    trainingLink: "https://preview.srs.local/training",
    paperworkLink: row.signatureRequestId
      ? `https://preview.srs.local/paperwork/${row.signatureRequestId}`
      : "https://preview.srs.local/paperwork",
    currentStatus: row.workflowStatus || row.paperworkStatus || "Unknown",
    queue: "Communication Queue",
  };
}

const MERGE_FIELD_LABELS: Record<keyof CommunicationTemplateVariables, string> = {
  firstName: "FirstName",
  lastName: "LastName",
  candidateName: "CandidateName",
  recruiter: "Recruiter",
  districtManager: "DistrictManager",
  project: "Project",
  store: "Store",
  market: "Market",
  surveyLink: "SurveyLink",
  trainingLink: "TrainingLink",
  paperworkLink: "PaperworkLink",
  currentStatus: "CurrentStatus",
  queue: "Queue",
};

export function renderPreviewTemplate(
  template: CommunicationPreviewTemplate,
  variables: CommunicationTemplateVariables,
): { subject: string; body: string } {
  let subject = template.subject;
  let body = template.body;

  for (const field of template.mergeFields) {
    const label = MERGE_FIELD_LABELS[field];
    const value = variables[field];
    const token = `{{${label}}}`;
    subject = subject.split(token).join(value);
    body = body.split(token).join(value);
  }

  return { subject, body };
}
