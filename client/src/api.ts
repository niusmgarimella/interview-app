export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<T> {
  const r = await fetch('/api' + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new ApiError(d.error || 'Request failed', r.status);
  return d as T;
}
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
