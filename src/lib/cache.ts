import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

/**
 * 공개 페이지(기출·사상가·개념·원전·출제 분석)의 DB 조회 결과를 서버에 저장해 두고 재사용한다.
 * 페이지를 열 때마다 Supabase 를 여러 번 왕복하던 것을 줄여 페이지 이동을 빠르게 한다.
 *
 * - 관리자가 무언가를 저장하면(관리자 API 의 POST·PUT·PATCH·DELETE 성공) 바로 비운다 → 수정 내용이 곧바로 보인다.
 * - 혹시 놓친 경우를 대비해 1시간이 지나면 저절로 새로 읽는다.
 * - 회원별 데이터(메모·퀴즈 기록)는 저장하지 않는다.
 */
export const CONTENT_TAG = "content";

/**
 * 배포마다 새로: Vercel 의 저장분은 배포가 바뀌어도 남으므로, 배포(커밋) 표시를 키에 넣어
 * 새 코드가 예전 모양의 저장분(예: 새로 더한 값이 없는 카드 목록)을 읽지 않게 한다.
 */
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "local";

export function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return unstable_cache(fn, ["content", BUILD, name], { tags: [CONTENT_TAG], revalidate: 3600 });
}

/** 공개 페이지 저장분을 비운다. 다음 요청은 DB 에서 새로 읽는다 (오래된 내용을 보여 주지 않음) */
export function invalidateContent() {
  try {
    revalidateTag(CONTENT_TAG, { expire: 0 });
  } catch (e) {
    // 캐시를 쓸 수 없는 환경(스크립트 등)에서도 저장 자체는 성공해야 한다
    console.error("[cache] invalidate failed", e);
  }
}

/** 관리자 쓰기 API 를 감싼다: 성공(2xx·3xx) 응답이면 공개 페이지 저장분을 비운다 */
export function invalidating<A extends unknown[]>(handler: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const res = await handler(...args);
    if (res.status < 400) invalidateContent();
    return res;
  };
}
