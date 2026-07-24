import { NextResponse } from "next/server";
import { orchestrateEvaluationBatch } from "@/lib/autonomous-recruiting-evaluation-engine";

export const dynamic = "force-dynamic";

/**
 * Dry-run evaluation preview for autopilot ops.
 * Thin path: sample signals → P204-shaped decisions → CEO orchestrate + audit.
 * Never writes candidates, workflows, or Dropbox.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      candidates?: Array<Record<string, unknown>>;
      useLLMEnhancement?: boolean;
      batchId?: string;
    };
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "candidates array required for dry-run preview" },
        { status: 400 },
      );
    }
    if (candidates.length > 50) {
      return NextResponse.json({ error: "max 50 candidates per preview" }, { status: 400 });
    }

    const result = await orchestrateEvaluationBatch({
      mode: "dry_run",
      useLLMEnhancement: Boolean(body.useLLMEnhancement),
      batchId: body.batchId,
      candidates: candidates as Parameters<typeof orchestrateEvaluationBatch>[0]["candidates"],
    });

    return NextResponse.json({
      ok: true,
      previewOnly: true,
      composer: "candidate-evaluation-orchestrator",
      scoringSource: "p204-blend (via thin composer)",
      result: {
        mode: result.mode,
        dryRun: result.dryRun,
        evaluated: result.evaluated,
        autoAdvance: result.autoAdvance,
        humanReview: result.humanReview,
        autoReject: result.autoReject,
        paperworkTasksPlanned: result.paperworkTasksPlanned,
        blocked: result.blocked,
        averageLatencyMs: result.averageLatencyMs,
        traceId: result.traceId,
        batchId: result.batchId,
        llmEnhancementsApplied: result.llmEnhancementsApplied,
        auditCount: result.audits.length,
        timelineLength: result.timeline.length,
        timeline: result.timeline.slice(0, 40),
        decisions: result.decisions,
        evaluations: result.evaluations.map((e) => ({
          candidateId: e.candidateId,
          redactedCandidateId: e.redactedCandidateId,
          recommendation: e.recommendation,
          confidence: e.confidence,
          reasonCodes: e.reasonCodes,
          components: e.components,
          llmInsight: e.llmInsight ?? null,
        })),
        paperworkTasks: result.paperworkTasks,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
