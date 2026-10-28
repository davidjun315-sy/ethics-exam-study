/**
 * 기입형 자동 채점. (순수 계산)
 * - 띄어쓰기·문장부호·따옴표·대소문자 차이는 무시한다.
 * - 괄호 병기(양지(良知))는 괄호 안/밖 어느 쪽으로 써도 인정한다.
 * - 정답 목록(accepted_answers)에 있는 표현만 정답이다. "비슷한 뜻"은 자동으로 인정하지 않는다.
 */

const LABEL_PREFIX = /^\s*(?:[㉠-㉻①-⑳ⓐ-ⓩ]|\([가-힣a-zA-Z0-9]\)|[가-힣]\.|\d+\))\s*[:：.)]?\s*/;

export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFC")
    .replace(LABEL_PREFIX, "")
    .replace(/[\s"'“”‘’「」『』〈〉《》<>.,·•:;!?~\-–—_/\\]/g, "")
    .toLowerCase();
}

/** "양지(良知)" → ["양지(良知)", "양지", "良知"] */
export function answerVariants(s: string): string[] {
  const out = new Set<string>();
  const base = s.trim();
  if (!base) return [];
  out.add(base);
  const outside = base.replace(/\s*[(（][^)）]*[)）]\s*/g, " ").trim();
  if (outside) out.add(outside);
  for (const m of base.matchAll(/[(（]([^)）]+)[)）]/g)) if (m[1].trim()) out.add(m[1].trim());
  return [...out];
}

/** 정답 하나에서 인정 표현 목록을 만든다: 레이블 제거 + 괄호 병기 + "또는" / "/" 로 나열된 표현 */
export function seedAcceptedAnswers(answer: string): string[] {
  const cleaned = answer.replace(LABEL_PREFIX, "").trim();
  const parts = cleaned
    .split(/\s*(?:\/|\s또는\s|\|)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const p of parts) for (const v of answerVariants(p)) out.add(v);
  return [...out];
}

export function isCorrectFill(input: string, accepted: string[]): boolean {
  const mine = new Set(answerVariants(input).map(normalizeAnswer).filter(Boolean));
  if (mine.size === 0) return false;
  return accepted.some((a) => answerVariants(a).some((v) => mine.has(normalizeAnswer(v))));
}

/** 자동 채점하기에 적당한 짧은 정답인지 (긴 문장·여러 개념 나열은 자기평가로) */
export function isShortAnswer(answer: string): boolean {
  const a = answer.replace(LABEL_PREFIX, "").trim();
  if (!a || a.length > 30) return false;
  if (/(다|음|함|임)\.?$/.test(a) && a.length > 8) return false; // 문장형 답
  return a.split(/\s+/).length <= 5;
}
