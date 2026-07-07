import { isP154StopOnError } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import {
  getP154MaxAssignmentsPerCycle,
  getP154MaxPaperworkSendsPerCycle,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import type { P159SafetyChecksSection } from "@/lib/p159-operations-control-center/types";

export function buildP159SafetyChecks(): P159SafetyChecksSection {
  const maxSends = getP154MaxPaperworkSendsPerCycle();
  const maxAssignments = getP154MaxAssignmentsPerCycle();

  return {
    duplicateProtectionActive: true,
    activeSignatureProtectionActive: true,
    invalidEmailProtectionActive: true,
    alreadySentProtectionActive: true,
    breezyWriteProtectionActive: true,
    capsActive: maxSends > 0 && maxAssignments > 0,
    stopOnErrorActive: isP154StopOnError(),
  };
}
