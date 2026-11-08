/** 논쟁 대전 덱 고르기 (순수 계산) — 서버(startDuel)와 화면(덱 미리보기)이 같은 규칙을 쓴다 */
import { RARITIES, type Rarity } from "./rules.ts";

type DeckCard = { cardId: string; philosopherId: string; name: string; rarity: Rarity; level: number };

/**
 * 대전 덱 12장: 저장한 대전 덱이 있으면 그것, 없으면 보유 카드 중 강한 순으로.
 * 보유 카드가 12장보다 적으면 같은 카드를 다시 넣어 채운다 (같은 사상가 최대 3장, 모자라면 그 이상).
 */
export function pickDuelDeck<T extends DeckCard>(owned: T[], saved: string[], size: number): T[] {
  const byId = new Map(owned.map((o) => [o.cardId, o]));
  const out = saved.map((id) => byId.get(id)).filter((o): o is T => Boolean(o)).slice(0, size);
  const pool = [...owned].sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.level - a.level || a.name.localeCompare(b.name));
  const count = (ph: string) => out.filter((x) => x.philosopherId === ph).length;
  // 강한 카드부터 한 바퀴씩 돌며 채운다. 같은 사상가 3장이 모두 차면 상한을 하나씩 늘린다 (보유 카드가 적을 때)
  for (let cap = 3; out.length < size && pool.length; cap++) {
    let progress = true;
    while (out.length < size && progress) {
      progress = false;
      for (const o of pool) {
        if (out.length >= size) break;
        if (count(o.philosopherId) >= cap) continue;
        out.push(o);
        progress = true;
      }
    }
  }
  return out;
}
