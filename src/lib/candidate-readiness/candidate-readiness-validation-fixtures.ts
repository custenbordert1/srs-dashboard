import type { BreezyCandidate } from "@/lib/breezy-api";

type ValidationFixture = {
  id: string;
  label: string;
  candidate: BreezyCandidate;
  expectedGrade: Array<"A" | "B" | "C" | "D">;
  expectedConfidence: "high" | "medium" | "low";
  minScore?: number;
  maxScore?: number;
};

function base(id: string, patch: Partial<BreezyCandidate>): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Candidate",
    lastName: id,
    email: `${id}@example.com`,
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-05-01",
    createdDate: "2026-05-01",
    addedDate: "2026-05-01",
    updatedDate: "2026-05-01",
    addedDateSource: "creation_date",
    positionId: "p1",
    positionName: "Field Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
    hasResume: false,
    ...patch,
  };
}

const techQuestionnaire = [
  { question: "Smartphone access", answer: "Yes" },
  { question: "Internet access", answer: "Yes" },
  { question: "Comfort with apps", answer: "Yes" },
];

/** Realistic Breezy-shaped profiles for recruiter validation. */
export const CANDIDATE_READINESS_VALIDATION_FIXTURES: ValidationFixture[] = [
  {
    id: "strong-full",
    label: "Strong merchandiser with full application",
    expectedGrade: ["A", "B"],
    expectedConfidence: "high",
    minScore: 70,
    candidate: base("strong-full", {
      firstName: "Maria",
      lastName: "Santos",
      resumeText:
        "Retail merchandiser with Walmart and Target reset experience. Customer service background. Team lead. Willing to travel 50 miles. 2016-2020 Walmart reset associate. 2021-2025 Target merchandiser.",
      hasResume: true,
      resumeFields: {
        summary: "Experienced field merchandiser with reset and planogram work.",
        workHistoryText: "Walmart reset associate 2016-2020\nTarget merchandiser 2021-2025",
      },
      questionnaireAnswers: [
        ...techQuestionnaire,
        { question: "Merchandising experience", answer: "5 years" },
        { question: "Prior vendor experience", answer: "SRS, Acosta" },
        { question: "Availability", answer: "Mon-Fri, can travel 60 miles" },
      ],
      hasQuestionnaire: true,
    }),
  },
  {
    id: "resume-only-retail",
    label: "Resume-only retail associate",
    expectedGrade: ["B", "C"],
    expectedConfidence: "medium",
    candidate: base("resume-only-retail", {
      firstName: "Jordan",
      lastName: "Lee",
      resumeText:
        "Retail sales associate with customer service, cash handling, and POS experience at grocery stores. 2019-2023 Kroger. 2023-2025 Publix.",
      hasResume: true,
      resumeFields: {
        workHistoryText: "Kroger sales associate 2019-2023\nPublix cashier 2023-2025",
      },
    }),
  },
  {
    id: "questionnaire-only",
    label: "Questionnaire-only applicant",
    expectedGrade: ["C", "B"],
    expectedConfidence: "medium",
    candidate: base("questionnaire-only", {
      firstName: "Taylor",
      lastName: "Nguyen",
      questionnaireAnswers: [
        ...techQuestionnaire,
        { question: "Merchandising experience", answer: "2 years" },
        { question: "Availability", answer: "Weekends and weekdays" },
      ],
      hasQuestionnaire: true,
    }),
  },
  {
    id: "sparse-applicant",
    label: "Sparse profile with limited data",
    expectedGrade: ["C", "D"],
    expectedConfidence: "low",
    maxScore: 65,
    candidate: base("sparse-applicant", {
      firstName: "Sam",
      lastName: "Patel",
      phone: "",
      email: "sam.p@example.com",
    }),
  },
  {
    id: "call-center-cs",
    label: "Customer service call center background",
    expectedGrade: ["B", "C"],
    expectedConfidence: "high",
    candidate: base("call-center-cs", {
      firstName: "Chris",
      lastName: "Morales",
      resumeText:
        "Customer service representative with phone support and call center experience. Appointment scheduling and inbound support. 2018-2022 call center. 2022-2025 client service.",
      hasResume: true,
      resumeFields: {
        summary: "Phone-based customer service professional.",
        workHistoryText: "Call center representative 2018-2022\nClient service specialist 2022-2025",
      },
      questionnaireAnswers: [...techQuestionnaire],
      hasQuestionnaire: true,
    }),
  },
  {
    id: "retail-no-merch",
    label: "Retail cashier without merchandising",
    expectedGrade: ["C", "B"],
    expectedConfidence: "high",
    candidate: base("retail-no-merch", {
      firstName: "Dana",
      lastName: "Brooks",
      resumeText: "Retail cashier with cash handling and POS at Walmart. 2020-2024 Walmart cashier.",
      hasResume: true,
      resumeFields: { workHistoryText: "Walmart cashier 2020-2024" },
      questionnaireAnswers: [
        ...techQuestionnaire,
        { question: "Merchandising experience", answer: "No" },
      ],
      hasQuestionnaire: true,
    }),
  },
  {
    id: "employment-gaps",
    label: "Merchandiser with employment gap",
    expectedGrade: ["B", "C"],
    expectedConfidence: "high",
    candidate: base("employment-gaps", {
      firstName: "Renee",
      lastName: "Clark",
      resumeText:
        "Merchandiser with reset experience. 2015-2018 reset contractor. 2022-2025 field merchandiser.",
      hasResume: true,
      resumeFields: { workHistoryText: "Reset contractor 2015-2018\nField merchandiser 2022-2025" },
      questionnaireAnswers: [...techQuestionnaire, { question: "Merchandising experience", answer: "4 years" }],
      hasQuestionnaire: true,
    }),
  },
  {
    id: "tech-fail",
    label: "Strong resume but failed tech readiness",
    expectedGrade: ["C", "B"],
    expectedConfidence: "high",
    maxScore: 78,
    candidate: base("tech-fail", {
      firstName: "Alex",
      lastName: "Turner",
      resumeText: "Retail merchandiser with Walmart reset and planogram experience. 2017-2025 merchandising.",
      hasResume: true,
      resumeFields: { workHistoryText: "Walmart merchandiser 2017-2025" },
      questionnaireAnswers: [
        { question: "Smartphone access", answer: "No" },
        { question: "Internet access", answer: "No" },
        { question: "Merchandising experience", answer: "6 years" },
      ],
      hasQuestionnaire: true,
    }),
  },
  {
    id: "travel-ready",
    label: "Travel-ready merchandiser",
    expectedGrade: ["A", "B"],
    expectedConfidence: "high",
    minScore: 70,
    candidate: base("travel-ready", {
      firstName: "Pat",
      lastName: "Reed",
      resumeText:
        "Regional merchandiser willing to travel multi-store routes up to 75 miles. Reset and fixture experience. 2014-2025 SRS merchandiser.",
      hasResume: true,
      resumeFields: { workHistoryText: "SRS merchandiser 2014-2025" },
      questionnaireAnswers: [
        ...techQuestionnaire,
        { question: "Merchandising experience", answer: "8 years" },
        { question: "Availability", answer: "Can travel regional routes" },
      ],
      hasQuestionnaire: true,
    }),
  },
  {
    id: "minimal-resume",
    label: "Minimal resume text without questionnaire",
    expectedGrade: ["C", "D", "B"],
    expectedConfidence: "low",
    maxScore: 72,
    candidate: base("minimal-resume", {
      firstName: "Jamie",
      lastName: "Fox",
      resumeText: "Retail worker.",
      hasResume: true,
    }),
  },
  {
    id: "vendor-veteran",
    label: "Experienced vendor merchandiser",
    expectedGrade: ["A", "B"],
    expectedConfidence: "high",
    minScore: 72,
    candidate: base("vendor-veteran", {
      firstName: "Leslie",
      lastName: "Grant",
      resumeText:
        "CPG merchandiser with Walmart, Target, and grocery resets. Fixture and planogram experience. Supervisor for reset crew. 2012-2018 Acosta. 2018-2025 SRS.",
      hasResume: true,
      resumeFields: {
        summary: "Senior merchandiser with vendor experience.",
        workHistoryText: "Acosta merchandiser 2012-2018\nSRS lead merchandiser 2018-2025",
      },
      questionnaireAnswers: [
        ...techQuestionnaire,
        { question: "Merchandising experience", answer: "10+ years" },
        { question: "Prior vendor experience", answer: "SRS, Acosta, Advantage" },
        { question: "Printer/laptop access", answer: "Yes" },
      ],
      hasQuestionnaire: true,
    }),
  },
  {
    id: "new-applicant",
    label: "New applicant with no experience signals",
    expectedGrade: ["C", "D"],
    expectedConfidence: "high",
    maxScore: 67,
    candidate: base("new-applicant", {
      firstName: "Casey",
      lastName: "Wells",
      resumeText: "Recent applicant interested in merchandising work. Reliable and eager to learn.",
      hasResume: true,
      questionnaireAnswers: [
        { question: "Smartphone access", answer: "Yes" },
        { question: "Internet access", answer: "Yes" },
        { question: "Merchandising experience", answer: "None" },
      ],
      hasQuestionnaire: true,
    }),
  },
];

export type { ValidationFixture };
