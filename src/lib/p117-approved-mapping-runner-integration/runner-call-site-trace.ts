export const P117_RUNNER_CALL_SITE_TRACE = [
  {
    layer: "P106.3 Runner",
    file: "src/lib/autonomous-paperwork-runner/run-autonomous-paperwork-runner.ts",
    function: "runAutonomousPaperworkRunnerCycle",
    calls: ["runAutonomousPaperworkEngine"],
    notes: "Orchestrates ingestion sync, candidate selection, and P106 engine per cycle.",
  },
  {
    layer: "P106 Engine",
    file: "src/lib/p106-autonomous-paperwork-engine/run-autonomous-paperwork-engine.ts",
    function: "runAutonomousPaperworkEngine",
    calls: ["buildAutonomousPaperworkReport"],
    notes: "dryRun returns report only; executeOne calls controlled-live-send after auto-repair.",
  },
  {
    layer: "P106 Report Builder",
    file: "src/lib/p106-autonomous-paperwork-engine/build-autonomous-paperwork-report.ts",
    function: "buildAutonomousPaperworkReport",
    calls: ["classifyPaperworkBlocker", "resolveClosedAdProjectMapping"],
    notes: "Primary production classification loop per candidate. P117 bridge hooks here when flag enabled.",
  },
  {
    layer: "Classifier",
    file: "src/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker.ts",
    function: "classifyPaperworkBlocker",
    calls: ["resolveClosedAdProjectMapping"],
    notes: "Ordered protection gates then closed-ad mapping inside classifier.",
  },
  {
    layer: "Closed-Ad Recovery",
    file: "src/lib/closed-ad-project-mapping/resolve-closed-ad-project-mapping.ts",
    function: "resolveClosedAdProjectMapping",
    calls: [],
    notes: "Title/city/state heuristic; does not read P109 store today.",
  },
  {
    layer: "P84 Eligibility",
    file: "src/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility.ts",
    function: "buildPaperworkSendEligibility",
    calls: [],
    notes: "Uses projectMapping from report builder after classification.",
  },
] as const;

export const P117_INTEGRATION_DESIGN = {
  gapFromP116:
    "P109 approved mappings affect P110/P111–P115 dry-run overlays but not classifyPaperworkBlocker in the runner path.",
  approach:
    "Optional P117 bridge wraps classifyPaperworkBlocker with P110 overlay jobs when USE_APPROVED_MAPPING_BRIDGE_DRY_RUN=true and engine mode is dryRun only.",
  insertionPoint:
    "buildAutonomousPaperworkReport candidate loop — swap classifier call when bridge active; default path unchanged.",
  protectionOrder:
    "already_sent, invalid_email, duplicate_risk evaluated in baseline before bridge overlay; protectionBlockerOverridesApproval prevents bridge unlock.",
  nonGoals: [
    "No live executeOne bridge activation",
    "No Breezy writes",
    "No paperwork sends",
    "No AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE changes",
  ],
  futureLivePath:
    "After dry-run validation, introduce separate USE_APPROVED_MAPPING_BRIDGE_LIVE flag with P101/P100 gate requirements — out of P117 scope.",
} as const;
