export type TimedResult<T> = {
  value: T;
  timedOut: boolean;
  error: string | null;
  elapsedMs: number;
};

export async function withRequestTimeout<T>(input: {
  label: string;
  promise: Promise<T>;
  timeoutMs: number;
  fallback: T;
}): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const value = await Promise.race([
      input.promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${input.label} timed out after ${input.timeoutMs}ms`));
        }, input.timeoutMs);
      }),
    ]);
    return {
      value,
      timedOut: false,
      error: null,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      value: input.fallback,
      timedOut: true,
      error: error instanceof Error ? error.message : `${input.label} failed`,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
