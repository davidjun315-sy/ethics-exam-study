import "server-only";
import { cached } from "@/lib/cache";
import { getAdminClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/quiz/paged";
import { baseName, clusterNames, sameName } from "@/lib/quiz/fun-core";
import { classifyPhilosopher, UNCLASSIFIED } from "@/lib/traditions";
import type { Philosopher } from "@/lib/types";

/**
 * 같은 사상가 묶기 (ETHOS 전체 공통): 이름 · 별칭이 같거나 비슷한 사상가 줄을 하나로.
 *  예: 토마스 아퀴나스 ⊃ 아퀴나스 · 나바에츠 ≈ 나바에즈 (사상가 정복 지도와 같은 규칙, quiz/fun-core 의 sameName)
 * 데이터는 지우거나 합치지 않고, 화면 · 통계에서 대표 한 줄로 보여 준다.
 * 대표: 게임 카드가 있는 줄 → 기출 연결이 많은 줄 → 괄호 없는 이름 → 짧은 이름
 * 분류: 묶음 전체 (대표 이름 → 다른 이름 · 분야 값 순, 한국 사상가는 이름이 우선)
 */
export interface CanonData {
  /** 모든 사상가 줄 */
  rows: Philosopher[];
  /** 사상가 id → 대표 id */
  repOf: Record<string, string>;
  /** 대표 id → 묶인 id 들 (대표 포함) */
  members: Record<string, string[]>;
  /** 대표 id → 분야 (동양윤리 · 한국윤리 …, 모르면 미분류) */
  chapter: Record<string, string>;
}

async function buildCanon(): Promise<CanonData> {
  const db = getAdminClient();
  const [{ data: ps, error }, links, cards] = await Promise.all([
    db.from("philosophers").select("*"),
    fetchAll<{ philosopher_id: string }>((from, to) =>
      db.from("question_philosophers").select("philosopher_id").in("role", ["main", "comparison"]).order("question_id").order("philosopher_id").range(from, to),
    ).catch(() => []),
    db.from("game_cards").select("philosopher_id"),
  ]);
  if (error) throw new Error(error.message);
  const rows = (ps ?? []) as Philosopher[];
  const linked = new Map<string, number>();
  for (const l of links) linked.set(l.philosopher_id, (linked.get(l.philosopher_id) ?? 0) + 1);
  const hasCard = new Set(((cards.data ?? []) as { philosopher_id: string }[]).map((c) => c.philosopher_id));

  // 이름 · 별칭으로 묶음 번호
  const namesOf = (p: Philosopher) => [p.name, ...(p.aliases ?? [])].filter(Boolean);
  const cl = clusterNames(rows.flatMap(namesOf));
  const parent = new Map(rows.map((p) => [p.id, p.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  const firstByCluster = new Map<number, string>();
  for (const p of rows) {
    for (const n of namesOf(p)) {
      const k = cl.get(n.trim());
      if (k === undefined) continue;
      const other = firstByCluster.get(k);
      if (other === undefined) firstByCluster.set(k, p.id);
      else parent.set(find(p.id), find(other));
    }
  }
  const groups = new Map<string, Philosopher[]>();
  for (const p of rows) groups.set(find(p.id), [...(groups.get(find(p.id)) ?? []), p]);

  const score = (p: Philosopher) => [hasCard.has(p.id) ? 1 : 0, linked.get(p.id) ?? 0, /[(（]/.test(p.name) ? 0 : 1, -p.name.length];
  const better = (a: Philosopher, b: Philosopher) => {
    const x = score(a), y = score(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return a.id < b.id;
  };
  const repOf: Record<string, string> = {};
  const members: Record<string, string[]> = {};
  const chapter: Record<string, string> = {};
  for (const list of groups.values()) {
    const rep = list.reduce((a, b) => (better(a, b) ? a : b));
    members[rep.id] = list.map((p) => p.id);
    for (const p of list) repOf[p.id] = rep.id;
    // 분류: 대표 → 나머지 순으로 처음 분류되는 값
    const ordered = [rep, ...list.filter((p) => p.id !== rep.id)];
    let ch: string = UNCLASSIFIED;
    for (const p of ordered) {
      ch = classifyPhilosopher({ name: p.name, tradition: p.tradition });
      if (ch !== UNCLASSIFIED) break;
    }
    if (ch === UNCLASSIFIED) for (const p of ordered) for (const n of p.aliases ?? []) if (ch === UNCLASSIFIED) ch = classifyPhilosopher({ name: n, tradition: null });
    chapter[rep.id] = ch;
  }
  return { rows, repOf, members, chapter };
}

/** 서버에 저장해 두고 재사용 (관리자가 고치면 비워짐 · 1시간마다 새로) */
export const loadCanonData = cached("philosopher-canon", buildCanon);

export interface Canon extends CanonData {
  /** 대표 사상가 줄 (aliases 에 묶인 다른 이름을 더함 · tradition 은 정리된 분야) */
  rep: (id: string) => Philosopher | undefined;
  repId: (id: string) => string;
  /** 같은 사상가로 묶인 id 들 */
  idsOf: (id: string) => string[];
  /** 같은 사상가로 묶인 이름들 (별칭 포함) */
  namesOf: (nameOrId: string) => string[];
  /** 이름 → 대표 (비슷한 이름도) */
  byName: (name: string) => Philosopher | null;
}

export async function getCanon(): Promise<Canon> {
  return makeCanon(await loadCanonData());
}

export function makeCanon(d: CanonData): Canon {
  const byId = new Map(d.rows.map((p) => [p.id, p]));
  const repRows = new Map<string, Philosopher>();
  for (const [rid, ids] of Object.entries(d.members)) {
    const r = byId.get(rid)!;
    const names = ids.flatMap((id) => [byId.get(id)!.name, ...(byId.get(id)!.aliases ?? [])]).filter((n) => n && n !== r.name);
    repRows.set(rid, { ...r, aliases: [...new Set(names)], tradition: d.chapter[rid] === UNCLASSIFIED ? r.tradition : d.chapter[rid] });
  }
  const exact = new Map<string, string>();
  for (const p of d.rows) for (const n of [p.name, ...(p.aliases ?? [])]) {
    if (!n) continue;
    exact.set(n.replace(/\s/g, ""), d.repOf[p.id]);
    if (!exact.has(baseName(n))) exact.set(baseName(n), d.repOf[p.id]);
  }
  const keys = [...exact.keys()];
  const memo = new Map<string, string | null>();
  const repId = (id: string) => d.repOf[id] ?? id;
  const byName = (name: string): Philosopher | null => {
    const k = name.replace(/\s/g, "");
    let id = exact.get(k) ?? exact.get(baseName(name)) ?? null;
    if (!id) {
      if (!memo.has(name)) {
        const m = keys.find((x) => sameName(name, x));
        memo.set(name, m ? exact.get(m)! : null);
      }
      id = memo.get(name) ?? null;
    }
    return id ? (repRows.get(id) ?? null) : null;
  };
  const idsOf = (id: string) => d.members[repId(id)] ?? [id];
  return {
    ...d,
    rep: (id) => repRows.get(repId(id)),
    repId,
    idsOf,
    namesOf: (x) => {
      const r = byId.has(x) ? repRows.get(repId(x)) : byName(x);
      if (!r) return [x];
      return [...new Set(idsOf(r.id).flatMap((id) => [byId.get(id)!.name, ...(byId.get(id)!.aliases ?? [])]).filter(Boolean))];
    },
    byName,
  };
}

/** 문항 요약의 사상가를 대표로 바꾸고 같은 사상가는 한 번만 (역할은 더 중요한 쪽) */
export function canonPeople<T extends { id: string; name: string; role: string }>(list: T[], c: Canon): T[] {
  const order: Record<string, number> = { main: 0, comparison: 1, distractor: 2, mentioned: 3 };
  const out = new Map<string, T>();
  for (const p of list) {
    const r = c.rep(p.id);
    const q = r ? { ...p, id: r.id, name: r.name } : p;
    const prev = out.get(q.id);
    if (!prev || (order[q.role] ?? 9) < (order[prev.role] ?? 9)) out.set(q.id, q);
  }
  return [...out.values()].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
}
