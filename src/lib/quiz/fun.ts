import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";
import { kstDay } from "@/lib/quiz/srs";
import { fetchAll, fetchIn } from "@/lib/quiz/paged";
import { baseName, clusterNames, conquestEntries, fullKey, CONQUEST_MIN, CONQUEST_RARITY_NAME, type ConquestRarity, type QuizProgress, conquestCells, mainTradition, OTHER, rankDaily, sameName, weekReport, type DailyRow, type WeekReport } from "./fun-core";
import { classifyPhilosopher } from "@/lib/traditions";
import { questionRef } from "@/lib/format";
import { loadFullSolves } from "@/lib/quiz/full";

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
type ItemRow = { id: string; kind: string; format: string; philosopher_names: string[] | null; area: string | null; question_id: string | null };
const loadItems = cached("quiz-fun-items-v2", () =>
  fetchAll<ItemRow>((from, to) => getAdminClient().from("quiz_items").select("id, kind, format, philosopher_names, area, question_id").eq("status", "approved").order("id").range(from, to)),
);
/** 기출 문항 → 그 문항의 주요 · 비교 사상가 (연계 문제는 여러 명) */
const loadQuestionLinks = cached("quiz-fun-question-links", async () => {
  const rows = await fetchAll<{ question_id: string; role: string; philosophers: { name: string } | { name: string }[] | null }>((from, to) =>
    getAdminClient().from("question_philosophers").select("question_id, role, philosophers(name)").in("role", ["main", "comparison"]).order("question_id").range(from, to),
  );
  const by: Record<string, string[]> = {};
  for (const r of rows) {
    const ph = Array.isArray(r.philosophers) ? r.philosophers[0] : r.philosophers;
    if (!ph?.name) continue;
    (by[r.question_id] ??= []).includes(ph.name) || by[r.question_id].push(ph.name);
  }
  return by;
});

/** 정복 지도에서 세는 문제: 기출 실전 문제만 (개념 다지기 연습문제 · 예상 문제 제외, 출제 범위 설정과 무관) */
const conquestItems = (items: ItemRow[]) => items.filter((it) => it.kind === "exam");
const solvedSet = (m: Map<string, { correct: boolean }>) => new Set([...m].filter(([, s]) => s.correct).map(([q]) => q));

function canonFor(phs: PhRow[], cardIds: Set<string> = new Set()) {
  // 이름 · 별칭을 같은 사상가끼리 묶고(비슷한 이름 포함), 묶음마다 대표 한 줄:
  // 게임 카드가 있는 줄 → 괄호 없는 이름 → 짧은 이름 순
  const cl = clusterNames([...phs.map((p) => p.name), ...phs.flatMap((p) => p.aliases ?? [])]);
  const rowsBy = new Map<number, PhRow[]>();
  const link = (k: number | undefined, p: PhRow) => {
    if (k === undefined) return;
    const list = rowsBy.get(k) ?? [];
    if (!list.includes(p)) list.push(p);
    rowsBy.set(k, list);
  };
  for (const p of phs) {
    link(cl.get(p.name.trim()), p);
    for (const a of p.aliases ?? []) link(cl.get(a.trim()), p);
  }
  const score = (p: PhRow) => (cardIds.has(p.id) ? 0 : 10) + (baseName(p.name) === p.name.replace(/\s/g, "") ? 0 : 5) + p.name.length * 0.01;
  // 별칭으로 이어진 묶음은 한 사람 → 같은 대표
  const repOf = new Map<PhRow, PhRow>();
  for (const list of rowsBy.values()) {
    const all = new Set<PhRow>(list);
    for (const p of list) for (const [, other] of rowsBy) if (other.includes(p)) other.forEach((o) => all.add(o));
    const rep = [...all].sort((a, b) => score(a) - score(b))[0];
    for (const p of all) if (!repOf.has(p) || score(rep) < score(repOf.get(p)!)) repOf.set(p, rep);
  }
  const exact = new Map<string, PhRow>();
  for (const p of phs) {
    const rep = repOf.get(p) ?? p;
    for (const n of [p.name, ...(p.aliases ?? [])]) {
      exact.set(n.replace(/\s/g, ""), rep);
      exact.set(baseName(n), rep);
    }
  }
  const names = [...exact.keys()];
  const memo = new Map<string, PhRow | null>();
  return (n: string): PhRow | null => {
    const key = n.replace(/\s/g, "");
    const hit = exact.get(key) ?? exact.get(baseName(n));
    if (hit) return hit;
    if (memo.has(n)) return memo.get(n)!;
    // 표에 없는 이름 변형 (토마스 아퀴나스 · 나바에즈 …)
    const m = names.find((x) => sameName(n, x));
    const r = m ? exact.get(m)! : null;
    memo.set(n, r);
    return r;
  };
}



async function namesOf(learners: string[]) {
  const ids = learners.filter((l) => l.startsWith("m:")).map((l) => l.slice(2)).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
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
  /** 정복 보상 카드 등급 (10↑ 일반 · 20↑ 희귀 · 30↑ 영웅 · 40↑ 전설) */
  rarity: ConquestRarity | null;
  artUrl: string | null;
  /** 공개된 게임 카드가 있음 (누르면 카드 상세) */
  hasCard: boolean;
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

/** 지도 탭: 한국 사상가 이름이 먼저, 그다음 카드 분야 · 사상가 분야 (도덕교육론 · 미분류는 '그 밖') */
function mapTradition(name: string, cardTradition: string | undefined, phTradition: string | null): string {
  for (const t of [cardTradition, phTradition]) {
    const k = classifyPhilosopher({ name, tradition: t ?? null });
    if (k === "한국윤리") return k;
  }
  for (const t of [cardTradition, phTradition]) {
    const m = mainTradition(classifyPhilosopher({ name, tradition: t ?? null }));
    if (m !== OTHER) return m;
  }
  return OTHER;
}

export async function getConquest(learner: string): Promise<Conquest> {
  const db = getAdminClient();
  const [phs, items, links, correct, solves, claims, cards] = await Promise.all([
    loadPhilosophers(),
    loadItems(),
    loadQuestionLinks().catch(() => ({}) as Record<string, string[]>),
    correctIds(learner),
    loadFullSolves(learner),
    db.from("quiz_conquest").select("philosopher_id").eq("learner", learner),
    import("@/lib/game/data").then((m) => m.publishedCards()).catch(() => []),
  ]);
  const { entries, done } = conquestEntries(items, links, correct, solvedSet(solves.map));
  const canon = canonFor(phs, new Set((cards as { philosopherId: string }[]).map((c) => c.philosopherId)));
  const cells = conquestCells(entries, done, (n) => canon(n)?.name ?? null);
  const byName = new Map(phs.map((p) => [p.name, p]));
  const claimed = new Set(((claims.data ?? []) as { philosopher_id: string }[]).map((c) => c.philosopher_id));
  const cardOf = new Map((cards as { philosopherId: string; artUrl: string | null; tradition?: string }[]).map((c) => [c.philosopherId, c]));
  const tiles: (ConquestTile & { tradition: string })[] = cells
    .map((c) => {
      const p = byName.get(c.name)!;
      const card = cardOf.get(p.id);
      const reward: ConquestTile["reward"] = !c.rewardable ? "none" : claimed.has(p.id) ? "claimed" : !card ? "unavailable" : c.full ? "claimable" : "locked";
      return { id: p.id, name: c.name, total: c.total, done: c.done, full: c.full, rewardable: c.rewardable, rarity: c.rarity, reward, artUrl: card?.artUrl ?? null, hasCard: Boolean(card), tradition: mapTradition(c.name, card?.tradition, p.tradition) };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const order = [...TRADITIONS, OTHER];
  return {
    groups: order.map((tradition) => ({ tradition, tiles: tiles.filter((t) => t.tradition === tradition) })).filter((g) => g.tiles.length),
    totals: { philosophers: tiles.length, full: tiles.filter((t) => t.full).length, items: entries.length, done: entries.filter((e) => done.has(e.id)).length },
    ready: !claims.error,
    min: CONQUEST_MIN,
  };
}

/** 사상가 한 명의 퀴즈 진행 (카드 상세 창용). 그 사상가 문제가 없으면 total 0 */
export async function conquestFor(learner: string, philosopherId: string, name?: string): Promise<QuizProgress> {
  const c = await getConquest(learner);
  const tiles = c.groups.flatMap((g) => g.tiles);
  // 카드가 있는 사상가가 묶음의 대표라 보통 id 로 찾히고, 아니면 비슷한 이름으로
  const t = tiles.find((x) => x.id === philosopherId) ?? (name ? tiles.find((x) => sameName(x.name, name)) : undefined);
  if (!t) return { done: 0, total: 0, rewardable: false, reward: "none", min: c.min };
  return { done: t.done, total: t.total, rewardable: t.rewardable, reward: t.reward, min: c.min, rarityName: t.rarity ? CONQUEST_RARITY_NAME[t.rarity] : undefined };
}

// ---------------------------------------------------------------------
// 사상가 한 명의 기출문제 목록 (정복한 문제 / 아직인 문제)
// ---------------------------------------------------------------------
export interface ConquestQuestion {
  id: string;
  /** 예: 2018 A 1번 */
  ref: string;
  year: number | null;
  format: string;
  area: string | null;
  /** 문제 첫머리 (정답은 넣지 않음) */
  preview: string;
  /** done: 한 번 이상 맞힘 · wrong: 풀었지만 아직 못 맞힘 · new: 아직 안 풂 */
  status: "done" | "wrong" | "new";
  attempts: number;
  lastAt: string | null;
  /** part: 윤리 퀴즈 부분 문항 · full: 완전 기출문제 (기출문제 탭에서 문항 전체) */
  kind: "part" | "full";
  questionId: string | null;
  /** 완전 기출문제의 가장 높은 AI 점수 */
  bestScore: number | null;
  /** 완전 기출문제를 맞혀서 함께 정복된 부분 문항 */
  viaFull: boolean;
}
export interface ConquestDetail {
  tile: ConquestTile;
  min: number;
  ready: boolean;
  /** 완전 기출문제 기록(022) 준비 여부 */
  fullReady: boolean;
  /** 부분 문항 (윤리 퀴즈) */
  questions: ConquestQuestion[];
  /** 완전 기출문제 */
  full: ConquestQuestion[];
}

type ExamRef = Parameters<typeof questionRef>[0];
const labelNum = (l: string) => Number((l.match(/\d+/) ?? ["999"])[0]);

export async function getConquestDetail(learner: string, philosopherId: string): Promise<ConquestDetail | null> {
  const db = getAdminClient();
  const [c, phs, items, links, solves, cards] = await Promise.all([
    getConquest(learner),
    loadPhilosophers(),
    loadItems(),
    loadQuestionLinks().catch(() => ({}) as Record<string, string[]>),
    loadFullSolves(learner),
    import("@/lib/game/data").then((m) => m.publishedCards()).catch(() => []),
  ]);
  const tiles = c.groups.flatMap((g) => g.tiles);
  const self = phs.find((p) => p.id === philosopherId);
  // 카드가 있는 사상가가 묶음의 대표라 보통 id 로 찾히고, 아니면 비슷한 이름으로
  const tile = tiles.find((t) => t.id === philosopherId) ?? (self ? tiles.find((t) => sameName(t.name, self.name)) : undefined);
  if (!tile) return null;
  const canon = canonFor(phs, new Set((cards as { philosopherId: string }[]).map((x) => x.philosopherId)));
  const mine = (names: string[]) => names.some((n) => canon(n)?.name === tile.name);
  // 부분 문항: 그 문항 자체의 사상가 + 원래 기출 문항의 사상가 (연계 문제)
  const ids = conquestItems(items)
    .filter((it) => mine([...(it.philosopher_names ?? []), ...((it.question_id && links[it.question_id]) || [])]))
    .map((it) => it.id);
  const fullIds = Object.entries(links)
    .filter(([, names]) => mine(names))
    .map(([q]) => q);
  const [rows, progress] = await Promise.all([
    fetchIn<{ id: string; label: string | null; exam_year: number | null; question_id: string | null; prompt: string | null; format: string; area: string | null }>(ids, (part) =>
      db.from("quiz_items").select("id, label, exam_year, question_id, prompt, format, area").in("id", part),
    ),
    fetchIn<{ item_id: string; attempts: number; correct_count: number; last_at: string | null }>(ids, (part) =>
      db.from("quiz_progress").select("item_id, attempts, correct_count, last_at").eq("learner", learner).in("item_id", part),
    ),
  ]);
  const qids = [...new Set([...rows.map((r) => r.question_id).filter((x): x is string => Boolean(x)), ...fullIds])];
  const qs = await fetchIn<{ id: string; label: string; score: number | null; question_text: string | null; exams: ExamRef | ExamRef[] | null }>(qids, (part) =>
    db.from("questions").select("id, label, score, question_text, exams(exam_year, section)").in("id", part),
  );
  const qOf = new Map(qs.map((q) => [q.id, q]));
  const refOf = (qid: string | null) => {
    const q = qid ? qOf.get(qid) : undefined;
    const e = q && (Array.isArray(q.exams) ? q.exams[0] : q.exams);
    return q && e ? questionRef(e, q.label) : null;
  };
  const yearOf = (qid: string) => {
    const q = qOf.get(qid);
    const e = q && (Array.isArray(q.exams) ? q.exams[0] : q.exams);
    return e?.exam_year ?? null;
  };
  const pg = new Map(progress.map((p) => [p.item_id, p]));
  // 첫머리의 ○ · ◦ 같은 글머리표는 떼고 한 줄로
  const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().replace(/^[○◦∘•·\-–\s]+/, "");
  const cut = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const byRef = (a: ConquestQuestion, b: ConquestQuestion) => (b.year ?? 0) - (a.year ?? 0) || a.ref.localeCompare(b.ref, "ko", { numeric: true }) || labelNum(a.ref) - labelNum(b.ref);
  const parts: ConquestQuestion[] = rows
    .map((r) => {
      const p = pg.get(r.id);
      // 완전 기출문제로 맞히면 그 문항의 부분 문항도 정복
      const viaFull = Boolean(r.question_id && solves.map.get(r.question_id)?.correct);
      return {
        id: r.id,
        kind: "part" as const,
        questionId: r.question_id,
        ref: refOf(r.question_id) || [r.exam_year, r.label && `${r.label}번`].filter(Boolean).join(" ") || "기출",
        year: r.exam_year,
        format: r.format,
        area: r.area,
        preview: cut(clean(r.prompt)),
        status: (p && p.correct_count > 0) || viaFull ? ("done" as const) : p && p.attempts > 0 ? ("wrong" as const) : ("new" as const),
        attempts: p?.attempts ?? 0,
        lastAt: p?.last_at ?? null,
        bestScore: null,
        viaFull,
      };
    })
    .sort(byRef);
  const full: ConquestQuestion[] = fullIds
    .filter((q) => qOf.has(q))
    .map((q) => {
      const s = solves.map.get(q);
      const row = qOf.get(q)!;
      return {
        id: fullKey(q),
        kind: "full" as const,
        questionId: q,
        ref: refOf(q) ?? "기출",
        year: yearOf(q),
        format: row.score !== null ? `${row.score}점` : "전체 문항",
        area: null,
        preview: cut(clean(row.question_text), 100),
        status: s?.correct ? ("done" as const) : s && s.attempts > 0 ? ("wrong" as const) : ("new" as const),
        attempts: s?.attempts ?? 0,
        lastAt: null,
        bestScore: s?.bestScore ?? null,
        viaFull: false,
      };
    })
    .sort(byRef);
  return { tile, min: c.min, ready: c.ready, fullReady: solves.ready, questions: parts, full };
}

export const QUIZ_021_HINT = "정복 보상 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/021_quiz_conquest.sql 을 실행하세요.";

export class FunError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** 정복 보상: 서버가 정복 여부를 다시 확인한 뒤 문제 수에 맞는 등급의 카드 1장 */
export async function claimConquest(learner: string, philosopherId: string) {
  const c = await getConquest(learner);
  const tile = c.groups.flatMap((g) => g.tiles).find((t) => t.id === philosopherId);
  if (!tile) throw new FunError("없는 사상가입니다.", 404);
  if (!c.ready) throw new FunError(QUIZ_021_HINT, 503);
  if (tile.reward === "claimed") throw new FunError("이미 받은 보상입니다.", 409);
  if (!tile.rewardable) throw new FunError(`문제가 ${CONQUEST_MIN}개 이상인 사상가만 카드 보상이 있습니다.`, 409);
  if (tile.reward === "unavailable") throw new FunError("이 사상가의 카드는 아직 공개되지 않았습니다.", 409);
  if (!tile.full) throw new FunError(`아직 정복하지 못했습니다 (${tile.done}/${tile.total}).`, 409);
  const rarity = tile.rarity;
  if (!rarity) throw new FunError(`문제가 ${CONQUEST_MIN}개 이상인 사상가만 카드 보상이 있습니다.`, 409);
  const { data, error } = await getAdminClient().rpc("quiz_conquest_claim", { p_learner: learner, p_philosopher: philosopherId, p_rarity: rarity });
  if (error) throw /quiz_conquest|conquest|schema cache|does not exist/i.test(error.message) ? new FunError(QUIZ_021_HINT, 503) : new FunError(error.message, 500);
  const d = data as { ok: boolean; already?: boolean; cardId?: string };
  if (!d.ok) throw new FunError("이미 받은 보상입니다.", 409);
  return { cardId: d.cardId!, name: tile.name, rarity, rarityName: CONQUEST_RARITY_NAME[rarity] };
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
      db.from("quiz_profiles").select("total_answered, best_streak").eq("learner", learner).maybeSingle(),
      db.from("quiz_daily").select("learner", { count: "exact", head: true }).eq("learner", learner).not("completed_at", "is", null),
      db.from("quiz_progress").select("item_id, quiz_items!inner(format)", { count: "exact", head: true }).eq("learner", learner).gt("correct_count", 0).eq("quiz_items.format", "essay"),
      loadItems(),
      correctIds(learner),
    ]);
    const p = prof.data as { total_answered?: number; best_streak?: number } | null;
    const [phs, links, solves] = await Promise.all([loadPhilosophers(), loadQuestionLinks().catch(() => ({}) as Record<string, string[]>), loadFullSolves(learner)]);
    const canon = canonFor(phs);
    const { entries, done } = conquestEntries(items, links, correct, solvedSet(solves.map));
    const cells = conquestCells(entries, done, (n) => canon(n)?.name ?? null);
    return { answered: p?.total_answered ?? 0, bestStreak: p?.best_streak ?? 0, missions: missions.count ?? 0, essayCorrect: essays.count ?? 0, conquered: cells.filter((c) => c.full).length };
  } catch (e) {
    console.error("[quiz-stats]", e);
    return { answered: 0, bestStreak: 0, missions: 0, essayCorrect: 0, conquered: 0 };
  }
}
