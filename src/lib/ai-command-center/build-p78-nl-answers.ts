/**
 * P78 bridges conversational prompts to existing P69 query resolution.
 * Command Center chat uses resolveCommandCenterQuery + runExecutiveQueryPreview directly.
 */
export { resolveCommandCenterQuery } from "@/lib/ai-command-center/build-ai-command-response";
