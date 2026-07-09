import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ApprovalRule } from "@/lib/autonomous-recruiting-engine/types";
import { DEFAULT_APPROVAL_RULES } from "@/lib/autonomous-recruiting-engine/approval-rules";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function rulesPath(): string {
  return path.join(recruitingDataDir(), "autonomous-recruiting-approval-rules.json");
}

type ApprovalRulesStoreFile = {
  rules: ApprovalRule[];
  updatedAt: string;
};

async function readRulesFile(): Promise<ApprovalRulesStoreFile> {
  try {
    const raw = await readFile(rulesPath(), "utf8");
    const parsed = JSON.parse(raw) as ApprovalRulesStoreFile;
    return {
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { rules: DEFAULT_APPROVAL_RULES, updatedAt: new Date().toISOString() };
  }
}

async function writeRulesFile(file: ApprovalRulesStoreFile): Promise<void> {
  const storeDir = recruitingDataDir();
  await safeRecruitingMkdir(storeDir);
  await writeFile(rulesPath(), JSON.stringify(file, null, 2), "utf8");
}

export async function listApprovalRules(): Promise<ApprovalRule[]> {
  const file = await readRulesFile();
  if (file.rules.length === 0) {
    const seeded = { rules: DEFAULT_APPROVAL_RULES, updatedAt: new Date().toISOString() };
    await writeRulesFile(seeded);
    return seeded.rules;
  }
  return file.rules;
}

export async function saveApprovalRules(rules: ApprovalRule[]): Promise<ApprovalRule[]> {
  await writeRulesFile({ rules, updatedAt: new Date().toISOString() });
  return rules;
}

export async function recordRuleTrigger(
  ruleId: string,
  success: boolean,
): Promise<ApprovalRule | null> {
  const file = await readRulesFile();
  const index = file.rules.findIndex((rule) => rule.id === ruleId);
  if (index < 0) return null;

  const rule = file.rules[index]!;
  const triggerCount = rule.triggerCount + 1;
  const successCount = rule.successCount + (success ? 1 : 0);
  const updated: ApprovalRule = {
    ...rule,
    triggerCount,
    successCount,
    successRate: triggerCount > 0 ? Math.round((successCount / triggerCount) * 100) : rule.successRate,
    lastTriggered: new Date().toISOString(),
  };
  file.rules[index] = updated;
  await writeRulesFile(file);
  return updated;
}

export async function upsertApprovalRule(
  patch: Partial<ApprovalRule> & { name: string },
): Promise<ApprovalRule> {
  const file = await readRulesFile();
  const existingIndex = patch.id
    ? file.rules.findIndex((rule) => rule.id === patch.id)
    : file.rules.findIndex((rule) => rule.name === patch.name);

  if (existingIndex >= 0) {
    const merged: ApprovalRule = { ...file.rules[existingIndex]!, ...patch, id: file.rules[existingIndex]!.id };
    file.rules[existingIndex] = merged;
    await writeRulesFile(file);
    return merged;
  }

  const created: ApprovalRule = {
    id: patch.id ?? randomUUID(),
    name: patch.name,
    status: patch.status ?? "enabled",
    condition: patch.condition ?? {},
    action: "auto-approve",
    successRate: patch.successRate ?? 0,
    triggerCount: patch.triggerCount ?? 0,
    successCount: patch.successCount ?? 0,
    lastTriggered: patch.lastTriggered,
  };
  file.rules.push(created);
  await writeRulesFile(file);
  return created;
}
