"use client";

/** 퀴즈 화면용 fetch (관리자용 admin-client 의 PDF 코드를 번들에 넣지 않으려고 따로 둔다) */
export async function quizApi<T = unknown>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback =
      res.status === 504
        ? "서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요."
        : `요청 실패 (${res.status})`;
    throw new Error((json as { error?: string }).error ?? fallback);
  }
  return json as T;
}
