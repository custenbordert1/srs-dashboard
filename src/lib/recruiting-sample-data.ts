export type Kpi = {
  id: string;
  label: string;
  value: string;
  change: string;
  changeDirection: "up" | "down" | "flat";
  hint: string;
};

export type OpenJob = {
  id: string;
  title: string;
  region: string;
  openings: number;
  applicants: number;
  daysOpen: number;
  priority: "critical" | "standard" | "backfill";
  hiringManager: string;
};

export type PipelineStage = {
  id: string;
  label: string;
  count: number;
  color: string;
};

export type NewHireMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type DmLeaderboardRow = {
  rank: number;
  name: string;
  market: string;
  interviews: number;
  offers: number;
  hires: number;
  score: number;
};

export type TrendWeek = {
  weekLabel: string;
  applicants: number;
  hires: number;
};

export const kpis: Kpi[] = [
  {
    id: "open-roles",
    label: "Open requisitions",
    value: "142",
    change: "+6.2%",
    changeDirection: "up",
    hint: "vs. prior 30 days",
  },
  {
    id: "pipeline",
    label: "Active candidates",
    value: "1,284",
    change: "+3.1%",
    changeDirection: "up",
    hint: "in interview stages",
  },
  {
    id: "ttf",
    label: "Median time to fill",
    value: "26d",
    change: "2d faster",
    changeDirection: "up",
    hint: "rolling 90 days",
  },
  {
    id: "offer-accept",
    label: "Offer acceptance",
    value: "91%",
    change: "-1.4%",
    changeDirection: "down",
    hint: "last quarter",
  },
];

export const openJobs: OpenJob[] = [
  {
    id: "j-401",
    title: "Store Manager — Supercenter",
    region: "Northwest",
    openings: 4,
    applicants: 118,
    daysOpen: 9,
    priority: "critical",
    hiringManager: "Jordan Ellis",
  },
  {
    id: "j-402",
    title: "Assistant Manager — Operations",
    region: "Southeast",
    openings: 6,
    applicants: 204,
    daysOpen: 14,
    priority: "standard",
    hiringManager: "Priya Nandakumar",
  },
  {
    id: "j-403",
    title: "Team Lead — Fulfillment",
    region: "Central",
    openings: 3,
    applicants: 67,
    daysOpen: 21,
    priority: "backfill",
    hiringManager: "Marcus Chen",
  },
  {
    id: "j-404",
    title: "HR Business Partner II",
    region: "Corporate",
    openings: 2,
    applicants: 312,
    daysOpen: 5,
    priority: "standard",
    hiringManager: "Sam Rivera",
  },
  {
    id: "j-405",
    title: "Asset Protection Supervisor",
    region: "Southwest",
    openings: 5,
    applicants: 89,
    daysOpen: 33,
    priority: "critical",
    hiringManager: "Dana Ortiz",
  },
];

export const pipelineStages: PipelineStage[] = [
  { id: "applied", label: "Applied", count: 8420, color: "bg-sky-500" },
  { id: "screen", label: "Screen", count: 2180, color: "bg-violet-500" },
  { id: "interview", label: "Interview", count: 940, color: "bg-amber-400" },
  { id: "offer", label: "Offer", count: 186, color: "bg-emerald-400" },
  { id: "hired", label: "Hired", count: 74, color: "bg-teal-400" },
];

export const newHireMetrics: NewHireMetric[] = [
  {
    id: "nh-30",
    label: "Hires (30d)",
    value: "58",
    detail: "Ahead of plan by 4 roles",
  },
  {
    id: "nh-90",
    label: "Hires (90d)",
    value: "171",
    detail: "Plan: 165",
  },
  {
    id: "start-readiness",
    label: "Start readiness",
    value: "97%",
    detail: "Docs + equipment cleared",
  },
  {
    id: "quality",
    label: "Quality of hire",
    value: "4.2",
    detail: "Manager survey (1–5)",
  },
];

export const dmLeaderboard: DmLeaderboardRow[] = [
  {
    rank: 1,
    name: "Amy Harp",
    market: "CO, KS, MO, NE, OK, TX",
    interviews: 0,
    offers: 0,
    hires: 0,
    score: 0,
  },
  {
    rank: 2,
    name: "Erin Boatright",
    market: "AL, FL, GA, LA, MS, NC, SC",
    interviews: 0,
    offers: 0,
    hires: 0,
    score: 0,
  },
  {
    rank: 3,
    name: "Lori VandeWiele",
    market: "AR, IA, IN, KY, MN, ND, SD, TN, WI",
    interviews: 0,
    offers: 0,
    hires: 0,
    score: 0,
  },
  {
    rank: 4,
    name: "Melissa O'Connor",
    market: "CT, DC, DE, MA, MD, ME, NH, NJ, NY, RI, VT",
    interviews: 0,
    offers: 0,
    hires: 0,
    score: 0,
  },
  {
    rank: 5,
    name: "Mindie Rodriguez",
    market: "OH, PA, VA, WV",
    interviews: 0,
    offers: 0,
    hires: 0,
    score: 0,
  },
  {
    rank: 6,
    name: "Shelly Debellis",
    market: "AK, AZ, CA, HI, ID, MT, NM, NV, UT, WY",
    interviews: 0,
    offers: 0,
    hires: 0,
    score: 0,
  },
  {
    rank: 7,
    name: "Trista Thomas",
    market: "IL, MI, OR, WA",
    interviews: 0,
    offers: 0,
    hires: 0,
    score: 0,
  },
];

export const weeklyTrends: TrendWeek[] = [
  { weekLabel: "Jan 6", applicants: 820, hires: 11 },
  { weekLabel: "Jan 13", applicants: 910, hires: 13 },
  { weekLabel: "Jan 20", applicants: 780, hires: 9 },
  { weekLabel: "Jan 27", applicants: 860, hires: 12 },
  { weekLabel: "Feb 3", applicants: 940, hires: 14 },
  { weekLabel: "Feb 10", applicants: 1010, hires: 15 },
  { weekLabel: "Feb 17", applicants: 990, hires: 14 },
  { weekLabel: "Feb 24", applicants: 1070, hires: 16 },
  { weekLabel: "Mar 3", applicants: 1120, hires: 17 },
  { weekLabel: "Mar 10", applicants: 1040, hires: 15 },
  { weekLabel: "Mar 17", applicants: 980, hires: 13 },
  { weekLabel: "Mar 24", applicants: 1150, hires: 18 },
];
