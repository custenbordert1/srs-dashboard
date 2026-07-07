export async function withServerTimeout<T>(input: {
  label: string;
  promise: Promise<T>;
  timeoutMs: number;
  fallback: T;
}): Promise<{ value: T; timedOut: boolean; error: string | null }> {
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
    return { value, timedOut: false, error: null };
  } catch (error) {
    return {
      value: input.fallback,
      timedOut: true,
      error: error instanceof Error ? error.message : `${input.label} failed`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
