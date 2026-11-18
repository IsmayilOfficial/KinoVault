// Security: CSRF and session fallback tokens are stored strictly in memory (never localStorage)
let inMemoryCsrfToken = '';
let inMemorySessionToken = '';

export function setCsrfToken(token: string | undefined): void {
  inMemoryCsrfToken = token ?? '';
}

export function setSessionToken(token: string | undefined): void {
  inMemorySessionToken = token ?? '';
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (inMemorySessionToken) {
    headers['Authorization'] = `Bearer ${inMemorySessionToken}`;
  }
  if (method !== 'GET' && inMemoryCsrfToken) {
    headers['X-CSRF-Token'] = inMemoryCsrfToken;
  }

  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const message = typeof parsed.error === 'string' ? parsed.error : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, parsed);
  }

  return parsed as T;
}
