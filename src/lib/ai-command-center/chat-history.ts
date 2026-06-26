import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCommandCenterSession } from "@/lib/ai-command-center/conversation-state";
import { normalizeConversationMemory } from "@/lib/ai-command-center/conversation-memory";
import type { CommandCenterChatMessage, CommandCenterSession } from "@/lib/ai-command-center/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function sessionPath(sessionId: string): string {
  return path.join(recruitingDataDir(), "p78-chat-sessions", `${sessionId}.json`);
}

export async function loadChatSession(sessionId: string): Promise<CommandCenterSession> {
  try {
    const raw = await readFile(sessionPath(sessionId), "utf8");
    const parsed = JSON.parse(raw) as CommandCenterSession;
    return { ...parsed, memory: normalizeConversationMemory(parsed.memory) };
  } catch {
    return createCommandCenterSession(sessionId);
  }
}

export async function saveChatSession(session: CommandCenterSession): Promise<void> {
  await mkdir(path.join(recruitingDataDir(), "p78-chat-sessions"), { recursive: true });
  await writeFile(sessionPath(session.sessionId), `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

export async function resetChatSession(sessionId: string): Promise<CommandCenterSession> {
  const fresh = createCommandCenterSession(sessionId);
  await saveChatSession(fresh);
  return fresh;
}

export function appendMessage(session: CommandCenterSession, message: CommandCenterChatMessage): CommandCenterSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    messages: [...session.messages, message].slice(-50),
  };
}
