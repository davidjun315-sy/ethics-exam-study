/** PostgREST nested select 결과 정리용 헬퍼 */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function many<T>(v: T | T[] | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** PostgREST or() 필터에 넣기 전에 특수문자를 제거한다. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\"':]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
}
