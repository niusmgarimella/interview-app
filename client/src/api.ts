export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<T> {
  const r = await fetch('/api' + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const rawText = await r.text();
  let d: { error?: string } = {};
  try { d = JSON.parse(rawText); } catch {}
  if (!r.ok) {
    const fallback = rawText && rawText.length < 150 && !rawText.includes('<html') ? rawText : `Request failed (${r.status} ${r.statusText || 'Error'})`;
    throw new ApiError(d.error || fallback, r.status);
  }
  return d as T;
}
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
