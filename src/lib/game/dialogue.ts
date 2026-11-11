/**
 * 배틀 전 논쟁 (순수 계산 · 화면과 테스트 공통)
 *  보스가 자기 사상으로 내 팀 사상가 한 명의 사상을 비판 → 그 사상가가 반박 → 결론이 나지 않아 겨룬다.
 *  실제로 맞섰던 짝(RIVALS)이 팀에 있으면 그 사상가가 나서고, 전용 대사를 쓴다.
 */
import { RIVALS, THOUGHTS, type Thought } from "./thought.ts";

export interface Speaker {
  key: string; // 배틀 참가자 키 (foe-0, me-1 …)
  name: string;
  tradition: string;
  skillName: string;
  skillDesc?: string;
  quote?: string;
}

export interface DialogueLine {
  who: "boss" | "ally" | "narration";
  key?: string;
  name?: string;
  text: string;
}

const clean = (n: string) => n.replace(/\s/g, "");

/** 받침 있는 글자인가 (한글이 아니면 받침 없음으로) */
function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return /[0-9LMNRlmnr]$/.test(ch);
  return code % 28 !== 0;
}
/** 조사: josa("맹자", "이", "가") → "맹자가" */
export const josa = (word: string, withB: string, without: string) => word + pp(word, withB, without);
/** 조사만: pp("성선설", "이라니", "라니") → "이라니" */
export const pp = (word: string, withB: string, without: string) => (hasBatchim(word) ? withB : without);
/** 부르는 말: 공자여 · 정약용이여 */
const call = (name: string) => josa(name, "이여", "여");

export function thoughtOf(s: Pick<Speaker, "name" | "skillName" | "skillDesc" | "quote">): Thought {
  const n = clean(s.name);
  const hit = THOUGHTS[n] ?? THOUGHTS[Object.keys(THOUGHTS).find((k) => k.length >= 2 && n.includes(k)) ?? ""];
  if (hit) return hit;
  // 표에 없는 사상가: 카드의 필살기 이름 · 대사로
  return {
    k: s.skillName,
    c: (s.quote || s.skillDesc || `나의 길은 「${s.skillName}」에 있소.`).trim(),
    r: "그대의 생각에는 사람이 살아가는 데 꼭 필요한 무언가가 빠져 있소.",
  };
}

const rivalOf = (a: string, b: string) => RIVALS.find((r) => (clean(a).includes(r.a) && clean(b).includes(r.b)) || (clean(a).includes(r.b) && clean(b).includes(r.a)));

/** 누가 나서서 반박할지: 맞수 → 다른 분야 사상가 → 첫 번째 */
export function pickResponder(boss: Speaker, team: Speaker[]): Speaker {
  return team.find((m) => rivalOf(boss.name, m.name)) ?? team.find((m) => m.tradition !== boss.tradition && THOUGHTS[clean(m.name)]) ?? team.find((m) => THOUGHTS[clean(m.name)]) ?? team[0];
}

export function buildDialogue(boss: Speaker, team: Speaker[]): DialogueLine[] {
  if (!team.length) return [];
  const ally = pickResponder(boss, team);
  const B = thoughtOf(boss);
  const A = thoughtOf(ally);
  const rv = rivalOf(boss.name, ally.name);
  const lines: DialogueLine[] = [{ who: "narration", text: `${josa(boss.name, "이", "가")} 앞을 가로막는다.` }];
  if (rv) {
    const bossIsA = clean(boss.name).includes(rv.a);
    lines.push({ who: "boss", key: boss.key, name: boss.name, text: bossIsA ? rv.aSays : rv.bSays });
    lines.push({ who: "ally", key: ally.key, name: ally.name, text: bossIsA ? rv.bSays : rv.aSays });
  } else {
    lines.push({ who: "boss", key: boss.key, name: boss.name, text: `${call(ally.name)}, 「${A.k}」${pp(A.k, "이라니", "라니")}? ${B.r}` });
    // 반박: 자기 주장 + 보스의 핵심어로는 부족하다
    lines.push({ who: "ally", key: ally.key, name: ally.name, text: `${call(boss.name)}, ${A.c} 그대의 「${B.k}」만으로는 사람과 세상을 바로 세울 수 없소.` });
  }
  lines.push({ who: "boss", key: boss.key, name: boss.name, text: `${rv ? "" : `${B.c} `}말로는 결판이 나지 않겠소. 사상을 걸고 겨루어 봅시다!` });
  lines.push({ who: "narration", text: `「${B.k}」 대 「${A.k}」 — 논쟁의 장이 열린다!` });
  return lines;
}
