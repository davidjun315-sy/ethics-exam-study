import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";
import { kstDay } from "@/lib/quiz/srs";
import { fetchAll, fetchIn } from "@/lib/quiz/paged";
import { CONQUEST_MIN, conquestCells, rankDaily, weekReport, type DailyRow, type WeekReport } from "./fun-core";

/**
 * 윤리 퀴즈 재미 요소 (서버)
 *  - 오늘의 미션 랭킹 · 사상가 정복 지도(+ 카드 보상) · 주간 학습 리포트 · 퀴즈 업적용 통계
 */

const TRADITIONS = ["동양윤리", "한국윤리", "서양윤리", "사회사상"];

// 공용 데이터 (모두에게 같음 → 저장해 두고 재사용, 관리자가 고치면 비워짐)
type PhRow = { id: string; name: string; aliases: string[] | null; tradition: string | null };
const loadPhilosophers = cached("quiz-fun-philosophers", async () => {
  const { data, error } = await getAdminClient().from("philosophers").select("id, name, aliases, tradition");
  if (error) throw new Error(error.message);
  return (data ?? []) as PhRow[];
});
type ItemRow = { id: string; kind: string; format: string; philosopher_names: string[] | null; area: string | null };
const loadItems = cached("quiz-fun-items", () =>
  fetchAll<ItemRow>((from, to) => getAdminClient().from("quiz_items").select("id, kind, format, philosopher_names, area").eq("status", "approved").order("id").range(from, to)),
);

function canonFor(phs: PhRow[]) {
  const map = new Map<string, PhRow>();
  for (const p of phs) {
    map.set(p.name.replace(/\s/g, ""), p);
    for (const a of p.aliases ?? []) map.set(a.replace(/\s/g, ""), p);
  }
  return (n: string) => map.get(n.replace(/\s/g, "")) ?? null;
}

async function namesOf(learners: string[]) {
  const ids = learners.filter((l) => l.startsWith("m:")).map((l) => l.slice(2));
  const db = getAdminClient();
  const [members, profs] = await Promise.all([
    ids.length ? db.from("members").select("id, display_name").in("id", ids) : Promise.resolve({ data: [] }),
    learners.length ? db.from("game_profiles").select("*").in("learner", learners) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map(((members.data ?? []) as { id: string; display_name: string }[]).map((m) => [`m:${m.id}`, m.display_name]));
  const titles = new Map(((profs.data ?? []) as { learner: string; title?: string | null }[]).map((p) => [p.learner, p.title ?? null]));
  return { name: (l: string) => (l === "owner" ? "관리자" : (names.get(l) ?? "학습자")), title: (l: string) => titles.get(l) ?? null };
}

// ---------------------------------------------------------------------
// 오늘의 미션 랭킹
// ---------------------------------------------------------------------
export interface DailyRanking {
  day: string;
  rows: { rank: number; name: string; title: string | null; answered: number; total: number; done: boolean; me: boolean }[];
  mine: { rank: number; answered: number; total: number; done: boolean } | null;
  players: number;
  finishers: number;
}

const dailyBoard = unstable_cache(
  async (day: string) => {
    const rows = await fetchAll<{ learner: string; item_ids: string[]; results: Record<string, string> | null; completed_at: string | null; created_at: string }>((from, to) =>
      getAdminClient().from("quiz_daily").select("learner, item_ids, results, completed_at, created_at").eq("day", day).order("learner").range(from, to),
    );
    const list: DailyRow[] = rows.map((r) => {
      const res = Object.values(r.results ?? {});
      return { learner: r.learner, answered: res.length, total: r.item_ids?.length ?? 10, correct: res.filter((x) => x === "correct").length, completedAt: r.completed_at, updatedAt: r.completed_at ?? r.created_at };
    });
    const ranked = rankDaily(list);
    const top = ranked.slice(0, 10).map((r) => r.learner);
    const who = await namesOf(top);
    return {
      ranked: ranked.map((r) => ({ learner: r.learner, answered: r.answered, total: r.total, done: Boolean(r.completedAt) })),
      top: Object.fromEntries(top.map((l) => [l, { name: who.name(l), title: who.title(l) }])) as Record<string, { name: string; title: string | null }>,
    };
  },
  ["quiz-daily-ranking"],
  { revalidate: 30 },
);

export async function getDailyRanking(learner: string): Promise<DailyRanking | null> {
  try {
    const day = kstDay();
    const b = await dailyBoard(day);
    const i = b.ranked.findIndex((r) => r.learner === learner);
    return {
      day,
      rows: b.ranked.slice(0, 10).map((r, k) => ({ rank: k + 1, name: b.top[r.learner]?.name ?? "학습자", title: b.top[r.learner]?.title ?? null, answered: r.answered, total: r.total, done: r.done, me: r.learner === learner })),
      mine: i >= 0 ? { rank: i + 1, answered: b.ranked[i].answered, total: b.ranked[i].total, done: b.ranked[i].done } : null,
      players: b.ranked.length,
      finishers: b.ranked.filter((r) => r.done).length,
    };
  } catch (e) {
    console.error("[quiz-daily-ranking]", e);
    return null;
  }
}

// ---------------------------------------------------------------------
// 사상가 정복 지도
// ---------------------------------------------------------------------
export interface ConquestTile {
  id: string;
  name: string;
  total: number;
  done: number;
  full: boolean;
  rewardable: boolean;
  /** 카드 보상: claimable 지금 받을 수 있음 · claimed 받음 · unavailable 카드가 아직 공개되지 않음 */
  reward: "none" | "claimable" | "claimed" | "locked" | "unavailable";
  artUrl: string | null;
}
export interface Conquest {
  groups: { tradition: string; tiles: ConquestTile[] }[];
  totals: { philosophers: number; full: number; items: number; done: number };
  /** 보상(021) 준비 여부 */
  ready: boolean;
  min: number;
}

/** 이 학습자가 '한 번 이상 맞힌 문제' id */
async function correctIds(learner: string) {
  const rows = await fetchAll<{ item_id: string }>((from, to) => getAdminClient().from("quiz_progress").select("item_id").eq("learner", learner).gt("correct_count", 0).order("item_id").range(from, to));
  return new Set(rows.map((r) => r.item_id));
}

export async function getConquest(learner: string): Promise<Conquest> {
  const db = getAdminClient();
  const [phs, items, correct, prof, claims, cards] = await Promise.all([
    loadPhilosophers(),
    loadItems(),
    correctIds(learner),
    db.from("quiz_profiles").select("*").eq("learner", learner).maybeSingle(),
    db.from("quiz_conquest").select("philosopher_id").eq("learner", learner),
    import("@/lib/game/data").then((m) => m.publishedCards()).catch(() => []),
  ]);
  const scope = ((prof.data as { question_scope?: string } | null)?.question_scope ?? "both") as "both" | "exam" | "expected";
  const inScope = items.filter((it) => scope === "both" || it.kind === scope);
  const canon = canonFor(phs);
  const cells = conquestCells(
    inScope.map((it) => ({ id: it.id, names: it.philosopher_names ?? [] })),
    correct,
    (n) => canon(n)?.name ?? null,
  );
  const byName = new Map(phs.map((p) => [p.name, p]));
  const claimed = new Set(((claims.data ?? []) as { philosopher_id: string }[]).map((c) => c.philosopher_id));
  const cardOf = new Map((cards as { philosopherId: string; artUrl: string | null; tradition?: string }[]).map((c) => [c.philosopherId, c]));
  const tiles: (ConquestTile & { tradition: string })[] = cells
    .map((c) => {
      const p = byName.get(c.name)!;
      const card = cardOf.get(p.id);
      const reward: ConquestTile["reward"] = !c.rewardable ? "none" : claimed.has(p.id) ? "claimed" : !card ? "unavailable" : c.full ? "claimable" : "locked";
      return { id: p.id, name: c.name, total: c.total, done: c.done, full: c.full, rewardable: c.rewardable, reward, artUrl: card?.artUrl ?? null, tradition: p.tradition ?? card?.tradition ?? "기타" };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const order = [...TRADITIONS, ...[...new Set(tiles.map((t) => t.tradition))].filter((t) => !TRADITIONS.includes(t))];
  return {
    groups: order.map((tradition) => ({ tradition, tiles: tiles.filter((t) => t.tradition === tradition) })).filter((g) => g.tiles.length),
    totals: { philosophers: tiles.length, full: tiles.filter((t) => t.full).length, items: inScope.length, done: inScope.filter((it) => correct.has(it.id)).length },
    ready: !claims.error,
    min: CONQUEST_MIN,
  };
}

export const QUIZ_021_HINT = "정복 보상 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/021_quiz_conquest.sql 을 실행하세요.";

export class FunError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** 정복 보상: 서버가 정복 여부를 다시 확인한 뒤 영웅 카드 1장 */
export async function claimConquest(learner: string, philosopherId: string) {
  const c = await getConquest(learner);
  const tile = c.groups.flatMap((g) => g.tiles).find((t) => t.id === philosopherId);
  if (!tile) throw new FunError("없는 사상가입니다.", 404);
  if (!c.ready) throw new FunError(QUIZ_021_HINT, 503);
  if (tile.reward === "claimed") throw new FunError("이미 받은 보상입니다.", 409);
  if (!tile.rewardable) throw new FunError(`문제가 ${CONQUEST_MIN}개 이상인 사상가만 카드 보상이 있습니다.`, 409);
  if (tile.reward === "unavailable") throw new FunError("이 사상가의 카드는 아직 공개되지 않았습니다.", 409);
  if (!tile.full) throw new FunError(`아직 정복하지 못했습니다 (${tile.done}/${tile.total}).`, 409);
  const { data, error } = await getAdminClient().rpc("quiz_conquest_claim", { p_learner: learner, p_philosopher: philosopherId, p_rarity: "epic" });
  if (error) throw /quiz_conquest|conquest|schema cache|does not exist/i.test(error.message) ? new FunError(QUIZ_021_HINT, 503) : new FunError(error.message, 500);
  const d = data as { ok: boolean; already?: boolean; cardId?: string };
  if (!d.ok) throw new FunError("이미 받은 보상입니다.", 409);
  return { cardId: d.cardId!, name: tile.name, rarity: "epic" as const };
}

// ---------------------------------------------------------------------
// 주간 학습 리포트
// ---------------------------------------------------------------------
export async function getWeeklyReport(learner: string): Promise<WeekReport | null> {
  try {
    const today = kstDay();
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 14);
    const since = d.toISOString().slice(0, 10);
    const [rows, phs] = await Promise.all([
      fetchAll<{ item_id: string; result: "correct" | "partial" | "wrong"; day: string }>((from, to) =>
        getAdminClient().from("quiz_attempts").select("item_id, result, day").eq("learner", learner).gte("day", since).order("created_at").range(from, to),
      ),
      loadPhilosophers(),
    ]);
    const ids = [...new Set(rows.map((r) => r.item_id))];
    const items = await fetchIn<{ id: string; philosopher_names: string[] | null; area: string | null }>(ids, (part) => getAdminClient().from("quiz_items").select("id, philosopher_names, area").in("id", part));
    const meta = new Map(items.map((i) => [i.id, i]));
    const canon = canonFor(phs);
    return weekReport(
      rows.map((r) => ({ day: r.day, result: r.result, names: [...new Set((meta.get(r.item_id)?.philosopher_names ?? []).map((n) => canon(n)?.name ?? n))], area: meta.get(r.item_id)?.area ?? null })),
      today,
    );
  } catch (e) {
    console.error("[quiz-weekly-report]", e);
    return null;
  }
}

// ---------------------------------------------------------------------
// 퀴즈 업적용 통계 (업적 · 칭호 계산에 씀)
// ---------------------------------------------------------------------
export interface QuizStats {
  answered: number;
  bestStreak: number;
  missions: number;
  essayCorrect: number;
  conquered: number;
}

export async function getQuizStats(learner: string): Promise<QuizStats> {
  const db = getAdminClient();
  try {
    const [prof, missions, essays, items, correct] = await Promise.all([
      db.from("quiz_profiles").select("total_answered, best_streak, question_scope").eq("learner", learner).maybeSingle(),
      db.from("quiz_daily").select("learner", { count: "exact", head: true }).eq("learner", learner).not("completed_at", "is", null),
      db.from("quiz_progress").select("item_id, quiz_items!inner(format)", { count: "exact", head: true }).eq("learner", learner).gt("correct_count", 0).eq("quiz_items.format", "essay"),
      loadItems(),
      correctIds(learner),
    ]);
    const p = prof.data as { total_answered?: number; best_streak?: number; question_scope?: string } | null;
    const scope = p?.question_scope ?? "both";
    const phs = await loadPhilosophers();
    const canon = canonFor(phs);
    const cells = conquestCells(
      items.filter((it) => scope === "both" || it.kind === scope).map((it) => ({ id: it.id, names: it.philosopher_names ?? [] })),
      correct,
      (n) => canon(n)?.name ?? null,
    );
    return { answered: p?.total_answered ?? 0, bestStreak: p?.best_streak ?? 0, missions: missions.count ?? 0, essayCorrect: essays.count ?? 0, conquered: cells.filter((c) => c.full).length };
  } catch (e) {
    console.error("[quiz-stats]", e);
    return { answered: 0, bestStreak: 0, missions: 0, essayCorrect: 0, conquered: 0 };
  }
}
