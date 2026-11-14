// Thin fetch wrapper. Auth lives in httpOnly cookies, so requests just send
// credentials; on a 401 we try one silent refresh, then retry once.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

const BASE = '/api/v1';

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    if (body?.error) return new ApiError(res.status, body.error.code, body.error.message, body.error.fields ?? {});
  } catch {
    // not JSON
  }
  return new ApiError(res.status, 'http_' + res.status, '');
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...rest,
      headers,
      credentials: 'include',
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'network', '');
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, init, false);
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// upload sends multipart form data with progress events, which fetch can't report.
export function upload<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // empty or not JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else if (body?.error) reject(new ApiError(xhr.status, body.error.code, body.error.message, body.error.fields ?? {}));
      else reject(new ApiError(xhr.status, 'http_' + xhr.status, ''));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', ''));
    xhr.ontimeout = () => reject(new ApiError(0, 'network', ''));
    xhr.timeout = 120_000;
    xhr.send(form);
  });
}
