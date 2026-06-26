import { IconSparkles } from "@/components/executive/ui/executive-icons";

export function AssistantAvatar() {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/25"
      aria-hidden
    >
      <IconSparkles size={16} />
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 ex-fade-in" role="status" aria-label="Assistant is typing">
      <AssistantAvatar />
      <div className="flex items-center gap-2 rounded-2xl bg-zinc-950/50 px-4 py-3 ring-1 ring-inset ring-white/[0.04]">
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:300ms]" />
        </span>
        <span className="text-xs text-zinc-500">Composing executive brief…</span>
      </div>
    </div>
  );
}
