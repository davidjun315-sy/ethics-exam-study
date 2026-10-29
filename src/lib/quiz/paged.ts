/**
 * Supabase(PostgREST) 요청 크기 제한 대응.
 * - 한 번에 최대 1,000줄만 돌려주므로 range 로 나눠 끝까지 읽는다.
 * - .in("…", 목록) 은 목록이 URL 에 들어가므로 길면 400 Bad Request → 작게 나눠 보낸다.
 */
export const PAGE = 1000;
export const CHUNK = 60;

export function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** make(from, to) 로 만든 질의를 1,000줄씩 끝까지 읽는다 */
export async function fetchAll<T>(make: (from: number, to: number) => Res<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** 목록을 나눠서 질의하고 결과를 합친다 */
export async function fetchIn<T>(list: string[], make: (part: string[]) => Res<T>): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunks(list)) {
    const { data, error } = await make(part);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}
