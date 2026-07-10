export const P158_3_SOURCE_PHASE = "P158.3" as const;
export const P1583_AUDIT_MAX_EVENTS = 500;

export function isP158WorkflowTransitionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P158_WORKFLOW_TRANSITION_ENABLED === "true";
}

export function isP158TransitionProductionReady(input: {
  confirmAssignment: boolean;
  confirmTransition: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = input.env ?? process.env;
  return (
    input.confirmAssignment &&
    input.confirmTransition &&
    env.P158_AUTOMATIC_ASSIGNMENTS_ENABLED === "true" &&
    env.P158_WORKFLOW_TRANSITION_ENABLED === "true"
  );
}
