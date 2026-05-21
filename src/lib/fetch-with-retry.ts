type FetchWithRetryOptions = {
  retries?: number;
  delayMs?: number;
  backoff?: number;
};

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 400;
  const backoff = options.backoff ?? 1.6;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, init);
      // Return client/config errors immediately; retry only on transient server failures.
      if (response.ok || response.status < 500 || response.status === 503) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs * backoff ** attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed after retries");
}
