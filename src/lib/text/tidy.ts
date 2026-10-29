/**
 * PDF 에서 뽑은 문항 텍스트 다듬기. (순수 계산)
 * - 문장 중간의 줄바꿈(시험지 한 줄 끝)을 이어 붙인다.
 * - (1)·(가)·○·<작성 방법>·발화자(갑:, 교사:) 등 새 단락/항목은 줄을 바꾸고 빈 줄로 띄운다.
 * - 배점 "[4점]" 으로 끝나는 발문 다음에는 단락을 나눈다.
 * - 글자는 바꾸지 않는다. 줄바꿈과 공백만 정리한다.
 */

// 줄 맨 앞에 오면 새 단락·항목으로 보는 표시
const STARTS_BLOCK = new RegExp(
  [
    String.raw`^<\s*작\s*성\s*방\s*법\s*>`,
    String.raw`^[【\[]\s*작\s*성\s*방\s*법`,
    String.raw`^[○ㅇ◦•∙▪■□]`,
    String.raw`^\(\s*[0-9]{1,2}\s*\)`, // (1)
    String.raw`^\(\s*[가-하]\s*\)`, // (가)
    String.raw`^[①-⑳]`,
    String.raw`^[㉠-㉻]\s*[:：]`, // ㉠: …
    String.raw`^\d{1,2}\.\s`, // 10. 다음은
    String.raw`^[가-하]\.\s`, // 가. …
    String.raw`^[A-Z]\s*[:：]`, // A: …
    String.raw`^[가-힣]{1,4}\s*(?:\([^)]{1,10}\))?\s*[:：]`, // 갑:, 교사:, 학생 1:
    String.raw`^〈|^<[^작]`, // 〈자료〉, <보기>
  ].join("|"),
);

/** 문장이 끝나는 줄 (…다. / …다.” / …?) */
const ENDS_SENTENCE = /[다요까함음임][.!?]["”’)]?$|[.!?]["”’]$|\]$/;

export function tidyQuestionText(input: string): string {
  const text = input.replace(/\r\n?/g, "\n").replace(/[ \t\u00a0]+/g, " ");
  // 시험지 한 줄의 길이(긴 줄 기준). 문장이 끝나면서 이보다 확실히 짧은 줄은 단락의 마지막 줄로 본다.
  const lens = text
    .split("\n")
    .map((l) => l.trim().length)
    .filter((n) => n > 10)
    .sort((a, b) => a - b);
  const full = lens.length >= 4 ? lens[Math.floor(lens.length * 0.8)] : Infinity;
  const out: string[] = []; // 단락 목록
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (STARTS_BLOCK.test(line)) {
      flush();
      cur = line;
      // <작성 방법> 머리글은 혼자 한 단락
      if (/^<\s*작\s*성\s*방\s*법\s*>\s*$|^[【\[]\s*작\s*성\s*방\s*법\s*[】\]]\s*$/.test(line)) {
        flush();
        continue;
      }
    } else cur = cur ? `${cur} ${line}` : line;
    // 발문은 배점 "[4점]" 으로 끝난다 → 다음 줄부터 제시문
    if (/\[\s*\d+(?:\.\d+)?\s*점\s*\]$/.test(cur)) flush();
    // 문장이 끝나고 줄이 짧게 끝났다 → 단락 끝 (줄이 꽉 찼다면 문장이 우연히 줄 끝에서 끝난 것일 수 있어 잇는다)
    else if (ENDS_SENTENCE.test(line) && line.length < full * 0.75) flush();
  }
  flush();
  return out.join("\n\n");
}
