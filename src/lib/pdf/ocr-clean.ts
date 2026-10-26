/**
 * OCR 결과 정리 (임용 기출 지면에 맞춘 규칙).
 * - 말풍선 테두리·그림에서 생긴 기호 조각(|, ^, = 등) 제거
 * - 괄호 속 빈칸 기호 오인식((©), ( 으 ), ( < ) 등)을 순서대로 ㉠, ㉡, ㉢… 로 복원
 * - <작성 방법> 글머리표 ○ 오인식(ㅇ, o, 0) 복원
 * 브라우저 / Node 테스트 공용 순수 함수.
 */

const CIRCLED = "㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭".split("");
// 괄호 안에 기호 1~2개만 있는 경우 = 원문자 빈칸이 깨진 것
const PLACEHOLDER = /\(\s*(?:[©®@°Q○◯ㅇ으<>0Oo⑦⑧⓪©㉠-㉭]|[^\s()가-힣A-Za-z0-9.,·'"]{1,2})\s*\)/g;
const JUNK_TOKEN = /^[|^=~#§®¬_\\/<>+*`'"’‘”“\-–—]+$/;
const HANGUL = /[가-힣]/g;

function cleanLine(line: string): string {
  const tokens = line.split(/\s+/).filter(Boolean);
  const hangul = (line.match(HANGUL) ?? []).length;
  const kept = tokens.filter((t, i) => {
    if (JUNK_TOKEN.test(t)) return false;
    // 한글이 대부분인 줄의 앞뒤에 붙은 짧은 영문/기호 조각은 그림에서 생긴 잡음일 가능성이 높다
    const edge = i === 0 || i === tokens.length - 1;
    if (edge && hangul >= 8 && /^[A-Za-z]{1,3}$/.test(t)) return false;
    return true;
  });
  return kept
    .join(" ")
    .replace(/\s*\|\s*$/, "")
    .replace(/^\s*\|\s*/, "")
    .replace(/(\S)\|(\s|$)/g, "$1$2");
}

export function cleanOcrText(text: string): string {
  let n = 0;
  const lines = text
    .split("\n")
    .map((l) => cleanLine(l.trim()))
    .map((l) => l.replace(/^(?:ㅇ|o|O|0|°)\s+(?=\(|[가-힣])/, "○ "))
    .map((l) => l.replace(PLACEHOLDER, () => `( ${CIRCLED[Math.min(n++, CIRCLED.length - 1)]} )`))
    // 한글·숫자가 거의 없는 잡음 줄 제거 (그림 조각)
    .filter((l) => {
      const meaningful = (l.match(/[가-힣0-9]/g) ?? []).length;
      return l.length > 0 && (meaningful >= 2 || /^[<(\[]/.test(l));
    });
  return lines.join("\n");
}
