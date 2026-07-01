import { P117_BRIDGE_ENV_FLAG } from "@/lib/p117-approved-mapping-runner-integration/bridge-flag";

export const P117_SOURCE_PHASE = "P117";

export type ApprovedMappingRunnerIntegrationPlan = {
  sourcePhase: "P117";
  generatedAt: string;
  mode: "dryRun";
  summary: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  bridgeFlag: {
    envVar: typeof P117_BRIDGE_ENV_FLAG;
    enabled: boolean;
    activeInThisRun: boolean;
    constraints: string[];
  };
  callSiteTrace: Array<{
    layer: string;
    file: string;
    function: string;
    calls: string[];
    notes: string;
  }>;
  integrationDesign: {
    gapFromP116: string;
    approach: string;
    insertionPoint: string;
    protectionOrder: string;
    nonGoals: string[];
    futureLivePath: string;
  };
  proof: {
    defaultRunnerUnchanged: boolean;
    bridgeOnlyWhenFlagEnabled: boolean;
    nonApprovedDecisionsDoNotUnlock: boolean;
    protectionOverridesApproval: boolean;
    noSends: boolean;
    noBreezyWrites: boolean;
    noLiveMode: boolean;
  };
  metrics: {
    baselineBlockedProjectMapping: number;
    bridgeUnlockedViaApproval: number;
    bridgeAppliedCount: number;
    approvedMappingsLoaded: number;
    protectionBlockedBridgeCount: number;
    readyToSendBaseline: number;
    readyToSendWithBridge: number;
  };
  sampleBridgeUnlocks: Array<{
    candidateId: string;
    candidateName: string;
    baselineBlocker: string;
    overlayBlocker: string | null;
    bridgeApplied: boolean;
  }>;
  safetyStatus: {
    p1063RunnerDefaultUnchanged: boolean;
    bridgeDryRunOnly: boolean;
    noBreezyWrites: boolean;
    noLiveSends: boolean;
    noLiveMode: boolean;
    liveRunnerUnwired: boolean;
  };
  warnings: string[];
};
