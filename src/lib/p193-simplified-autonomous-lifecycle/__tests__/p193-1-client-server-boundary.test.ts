import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  projectCandidateRowToP193,
  projectLegacyRowToStatusViewModel,
  toP193CandidateStatusViewModel,
} from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";
import { DEFAULT_P193_FLAGS } from "@/lib/p193-simplified-autonomous-lifecycle/types";
import {
  readP193Flags,
  readP193LifecycleStore,
} from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";

const ROOT = path.resolve(__dirname, "../../../../..");
const CLIENT_ENTRY_FILES = [
  "src/components/recruiting/candidate-workspace/candidate-workspace.tsx",
  "src/components/recruiting/p193-candidate-detail-panel.tsx",
  "src/components/executive/p193-simplified-lifecycle-panel.tsx",
];

const FORBIDDEN_IMPORTS = [
  "node:fs",
  "node:fs/promises",
  "node:path",
  "server/store",
  "server/persistence",
  "server/load-candidate",
  "server/index",
  "/server\"",
  "/server'",
  "recruiting-data-dir",
];

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "server" || name === "node_modules") continue;
      collectTsFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith("@/lib/p193-simplified-autonomous-lifecycle")) return null;
  const rel = spec.replace("@/lib/p193-simplified-autonomous-lifecycle", "");
  const base = path.join(ROOT, "src/lib/p193-simplified-autonomous-lifecycle", rel.replace(/^\//, ""));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // continue
    }
  }
  return null;
}

function walkClientImportGraph(entryRel: string): {
  files: string[];
  hits: Array<{ file: string; match: string }>;
} {
  const visited = new Set<string>();
  const queue = [path.join(ROOT, entryRel)];
  const hits: Array<{ file: string; match: string }> = [];

  while (queue.length) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    let src = "";
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const forbidden of FORBIDDEN_IMPORTS) {
      if (src.includes(forbidden) && !file.includes("/server/")) {
        // Allow type-only comments; forbid real imports
        if (
          new RegExp(
            `from\\s+['"][^'"]*${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          ).test(src) ||
          src.includes(`from "node:`) ||
          src.includes(`from 'node:`) ||
          /from\s+["']@\/lib\/p193-simplified-autonomous-lifecycle\/server/.test(src) ||
          /from\s+["']@\/lib\/recruiting-data-dir["']/.test(src)
        ) {
          hits.push({ file: path.relative(ROOT, file), match: forbidden });
        }
      }
    }
    const importRe = /from\s+["'](@\/lib\/p193-simplified-autonomous-lifecycle[^"']*)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const resolved = resolveImport(file, m[1]!);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return { files: [...visited].map((f) => path.relative(ROOT, f)), hits };
}

describe("P193.1 client/server boundary", () => {
  it("client import graphs contain no Node filesystem or server store modules", () => {
    const report: Record<string, { files: string[]; hits: Array<{ file: string; match: string }> }> =
      {};
    for (const entry of CLIENT_ENTRY_FILES) {
      report[entry] = walkClientImportGraph(entry);
      assert.equal(
        report[entry]!.hits.length,
        0,
        `Forbidden imports in ${entry}: ${JSON.stringify(report[entry]!.hits)}`,
      );
    }
    // Ensure barrel shared index is not pulling server persistence into workspace path
    const workspace = report[CLIENT_ENTRY_FILES[0]!]!;
    assert.equal(
      workspace.files.some((f) => f.includes("/server/")),
      false,
    );
  });

  it("shared projection works without storage", () => {
    const record = projectCandidateRowToP193({
      candidateId: "abc123",
      workflowStatus: "Paperwork Needed",
      recommendedStage: "Qualified",
      paperworkStatus: "not_sent",
      notes: [],
    });
    assert.equal(record.state, "Qualified");
    const vm = projectLegacyRowToStatusViewModel({
      candidateId: "abc123",
      workflowStatus: "Paperwork Needed",
    });
    assert.equal(vm.missing, false);
    assert.equal(vm.projectedFromLegacy, true);
    assert.equal(vm.simplifiedStage, "Qualified");
    assert.equal(typeof JSON.stringify(vm), "string");
  });

  it("missing candidate view model serializes cleanly", () => {
    const vm = toP193CandidateStatusViewModel({
      record: null,
      candidateId: "missing-id",
    });
    assert.equal(vm.missing, true);
    assert.equal(vm.readyForAssignment, false);
    assert.ok(JSON.parse(JSON.stringify(vm)));
  });

  it("stale data handling marks old updatedAt", () => {
    const record = projectCandidateRowToP193({
      candidateId: "stale1",
      workflowStatus: "Applied",
    });
    record.updatedAt = "2020-01-01T00:00:00.000Z";
    const vm = toP193CandidateStatusViewModel({
      record,
      candidateId: "stale1",
      nowMs: Date.parse("2026-07-14T00:00:00.000Z"),
    });
    assert.equal(vm.stale, true);
  });

  it("server persistence remains readable server-side (flags off)", async () => {
    const flags = await readP193Flags();
    assert.equal(flags.enabled, false);
    assert.equal(flags.paperworkBridgeEnabled, false);
    assert.equal(flags.reminderSendEnabled, false);
    assert.equal(flags.readyForAssignmentEnabled, false);
    assert.equal(DEFAULT_P193_FLAGS.enabled, false);
    const store = await readP193LifecycleStore();
    assert.equal(typeof store.records, "object");
  });

  it("no production writes from client projection", () => {
    const before = JSON.stringify(DEFAULT_P193_FLAGS);
    projectCandidateRowToP193({
      candidateId: "noop",
      workflowStatus: "Signed",
      paperworkStatus: "signed",
    });
    assert.equal(JSON.stringify(DEFAULT_P193_FLAGS), before);
  });
});
