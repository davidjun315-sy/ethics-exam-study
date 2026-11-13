import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";
import { kstDay } from "@/lib/quiz/srs";
import { fetchAll, fetchIn } from "@/lib/quiz/paged";
import { baseName, clusterNames, fullConquestEntries, partConquestEntries, fullConquestRarity, conquestRarity, CONQUEST_TRACK_NAMES, type ConquestTrack, type ConquestCell, fullKey, CONQUEST_MIN, CONQUEST_RARITY_NAME, type ConquestRarity, type QuizProgress, conquestCells, mainTradition, OTHER, rankDaily, sameName, weekReport, type DailyRow, type WeekReport } from "./fun-core";
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
type ItemRow = { id: string; kind: string; origin: string; format: string; philosopher_names: string[] | null; area: string | null; question_id: string | null };
const loadItems = cached("quiz-fun-items-v3", () =>
  fetchAll<ItemRow>((from, to) => getAdminClient().from("quiz_items").select("id, kind, origin, format, philosopher_names, area, question_id").eq("status", "approved").order("id").range(from, to)),
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
    const list = (by[r.question_id] ??= []);
    if (!list.includes(ph.name)) list.push(ph.name);
  }
  return by;
});

/**
 * 이름 → 대표 사상가: ETHOS 전체가 쓰는 같은 사상가 묶기 표 (data/canon.ts).
 * 표를 못 읽으면 예전처럼 여기서 묶는다.
 */
async function canonFor(phs: PhRow[], cardIds: Set<string> = new Set()): Promise<(n: string) => PhRow | null> {
  try {
    const c = await (await import("@/lib/data/canon")).getCanon();
    return (n: string) => c.byName(n);
  } catch {
    return canonLocal(phs, cardIds);
  }
}
const solvedSet = (m: Map<string, { correct: boolean }>) => new Set([...m].filter(([, s]) => s.correct).map(([q]) => q));

function canonLocal(phs: PhRow[], cardIds: Set<string> = new Set()) {
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
/** 한 갈래(부분 기출 / 완전 기출)의 진행과 보상 */
export interface ConquestProgress {
  total: number;
  done: number;
  /** 다 채웠나 */
  full: boolean;
  rewardable: boolean;
  /** 카드 보상: claimable 지금 받을 수 있음 · claimed 받음 · unavailable 카드가 아직 공개되지 않음 */
  reward: "none" | "claimable" | "claimed" | "locked" | "unavailable";
  /** 보상 카드 등급 (부분: 10↑ 일반 · 20↑ 희귀 · 30↑ 영웅 / 완전: 10↑ 전설) */
  rarity: ConquestRarity | null;
}
export interface ConquestTile {
  id: string;
  name: string;
  artUrl: string | null;
  /** 공개된 게임 카드가 있음 (누르면 카드 상세) */
  hasCard: boolean;
  /** 부분 기출 (윤리 퀴즈 세부 문제) */
  part: ConquestProgress;
  /** 완전 기출 (기출 문항 전체) */
  whole: ConquestProgress;
}
export interface Conquest {
  groups: { tradition: string; tiles: ConquestTile[] }[];
  totals: Record<ConquestTrack, { conquered: number; items: number; done: number }> & { philosophers: number };
  /** 보상(021) 준비 여부 */
  ready: boolean;
  /** 갈래별 보상(024) 준비 여부 — 없으면 완전 기출 보상만 막힘 */
  tracksReady: boolean;
  min: number;
}
/** 화면용: 갈래 하나로 펼침 */
export const progressOf = (t: ConquestTile, track: ConquestTrack) => (track === "full" ? t.whole : t.part);

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
  const [phs, items, links, correct, solves, claimsRes, cards] = await Promise.all([
    loadPhilosophers(),
    loadItems(),
    loadQuestionLinks().catch(() => ({}) as Record<string, string[]>),
    correctIds(learner),
    loadFullSolves(learner),
    loadClaims(learner),
    import("@/lib/game/data").then((m) => m.publishedCards()).catch(() => []),
  ]);
  const canon = await canonFor(phs, new Set((cards as { philosopherId: string }[]).map((c) => c.philosopherId)));
  const nameOf = (n: string) => canon(n)?.name ?? null;
  const whole = fullConquestEntries(items, links, correct, solvedSet(solves.map));
  const part = partConquestEntries(items, links, correct);
  const wholeCells = new Map(conquestCells(whole.entries, whole.done, nameOf, fullConquestRarity).map((c) => [c.name, c]));
  const partCells = new Map(conquestCells(part.entries, part.done, nameOf, conquestRarity).map((c) => [c.name, c]));
  const byName = new Map(phs.map((p) => [p.name, p]));
  const cardOf = new Map((cards as { philosopherId: string; artUrl: string | null; tradition?: string }[]).map((c) => [c.philosopherId, c]));
  const empty = { total: 0, done: 0, full: false, rewardable: false, rarity: null } as const;
  const tiles: (ConquestTile & { tradition: string })[] = [...new Set([...wholeCells.keys(), ...partCells.keys()])]
    .map((name) => {
      const p = byName.get(name)!;
      const card = cardOf.get(p.id);
      const prog = (c: ConquestCell | undefined, track: ConquestTrack): ConquestProgress => {
        const x = c ?? { ...empty, name };
        const reward: ConquestProgress["reward"] = !x.rewardable ? "none" : claimsRes.claimed.has(`${p.id}:${track}`) ? "claimed" : !card ? "unavailable" : x.full ? "claimable" : "locked";
        return { total: x.total, done: x.done, full: x.full, rewardable: x.rewardable, rarity: x.rarity, reward };
      };
      return { id: p.id, name, artUrl: card?.artUrl ?? null, hasCard: Boolean(card), part: prog(partCells.get(name), "part"), whole: prog(wholeCells.get(name), "full"), tradition: mapTradition(name, card?.tradition, p.tradition) };
    })
    .sort((a, b) => b.whole.total + b.part.total - (a.whole.total + a.part.total) || a.name.localeCompare(b.name));
  const order = [...TRADITIONS, OTHER];
  const totalsOf = (track: ConquestTrack, e: { entries: { id: string }[]; done: Set<string> }) => ({
    conquered: tiles.filter((t) => progressOf(t, track).full).length,
    items: e.entries.length,
    done: e.entries.filter((x) => e.done.has(x.id)).length,
  });
  return {
    groups: order.map((tradition) => ({ tradition, tiles: tiles.filter((t) => t.tradition === tradition) })).filter((g) => g.tiles.length),
    totals: { philosophers: tiles.length, part: totalsOf("part", part), full: totalsOf("full", whole) },
    ready: claimsRes.ready,
    tracksReady: claimsRes.tracksReady,
    min: CONQUEST_MIN,
  };
}

/** 받은 정복 보상 ('사상가 id:갈래'). 024 전이면 예전 보상은 모두 부분 기출로 */
async function loadClaims(learner: string): Promise<{ ready: boolean; tracksReady: boolean; claimed: Set<string> }> {
  const db = getAdminClient();
  const withTrack = await db.from("quiz_conquest").select("philosopher_id, track").eq("learner", learner);
  if (!withTrack.error) return { ready: true, tracksReady: true, claimed: new Set(((withTrack.data ?? []) as { philosopher_id: string; track: string }[]).map((c) => `${c.philosopher_id}:${c.track}`)) };
  const old = await db.from("quiz_conquest").select("philosopher_id").eq("learner", learner);
  if (old.error) return { ready: false, tracksReady: false, claimed: new Set() };
  return { ready: true, tracksReady: false, claimed: new Set(((old.data ?? []) as { philosopher_id: string }[]).map((c) => `${c.philosopher_id}:part`)) };
}

/**
 * 카드 사상가마다 정복 지도의 문제 수 (빈출 정도): 완전 기출 문항 · 부분 기출 문제.
 * 게임 카드 목록을 만들 때 부르므로 cardIds 를 받는다 (publishedCards 를 다시 부르지 않음).
 */
export async function conquestCounts(cardIds: string[]): Promise<Record<string, { full: number; part: number }>> {
  const [phs, items, links] = await Promise.all([loadPhilosophers(), loadItems(), loadQuestionLinks().catch(() => ({}) as Record<string, string[]>)]);
  const canon = await canonFor(phs, new Set(cardIds));
  const nameOf = (n: string) => canon(n)?.name ?? null;
  const none = new Set<string>();
  const whole = fullConquestEntries(items, links, none, none);
  const part = partConquestEntries(items, links, none);
  const byName = new Map(phs.map((p) => [p.name, p.id]));
  const out: Record<string, { full: number; part: number }> = {};
  for (const [track, e] of [["full", whole], ["part", part]] as const) {
    for (const c of conquestCells(e.entries, none, nameOf)) {
      const id = byName.get(c.name);
      if (!id) continue;
      (out[id] ??= { full: 0, part: 0 })[track] = c.total;
    }
  }
  return out;
}

/** 사상가 한 명의 퀴즈 진행 (카드 상세 창용): 완전 기출 · 부분 기출 따로 */
export async function conquestFor(learner: string, philosopherId: string, name?: string): Promise<QuizProgress> {
  const c = await getConquest(learner);
  const tiles = c.groups.flatMap((g) => g.tiles);
  // 카드가 있는 사상가가 묶음의 대표라 보통 id 로 찾히고, 아니면 비슷한 이름으로
  const t = tiles.find((x) => x.id === philosopherId) ?? (name ? tiles.find((x) => sameName(x.name, name)) : undefined);
  const row = (x: ConquestProgress | undefined) => ({ done: x?.done ?? 0, total: x?.total ?? 0, rewardable: x?.rewardable ?? false, reward: x?.reward ?? "none", rarityName: x?.rarity ? CONQUEST_RARITY_NAME[x.rarity] : undefined });
  return { whole: row(t?.whole), part: row(t?.part), min: c.min, id: t?.id ?? philosopherId };
}

// ---------------------------------------------------------------------
// 사상가 한 명의 기출문제 목록 (정복한 문제 / 아직인 문제)
// ---------------------------------------------------------------------
export interface ConquestQuestion {
  /** q:<문항 id> */
  id: string;
  questionId: string;
  /** 윤리 퀴즈의 완전 기출 문제 id (023 동기화 전이면 null) */
  quizItemId: string | null;
  /** 예: 2018 A 1번 */
  ref: string;
  year: number | null;
  /** 배점 */
  score: number | null;
  /** 문항 첫머리 (정답은 넣지 않음) */
  preview: string;
  /** done: 맞힘 · wrong: 풀었지만 아직 못 맞힘 · new: 아직 안 풂 */
  status: "done" | "wrong" | "new";
  attempts: number;
  /** 기출문제 탭의 가장 높은 AI 점수 */
  bestScore: number | null;
}
export interface ConquestDetail {
  tile: ConquestTile;
  min: number;
  ready: boolean;
  /** 완전 기출 기록(022) 준비 여부 */
  fullReady: boolean;
  tracksReady: boolean;
  /** 이 사상가의 완전 기출문제 */
  questions: ConquestQuestion[];
  /** 이 사상가의 부분 기출 (윤리 퀴즈 세부 문제) */
  parts: ConquestPart[];
}
export interface ConquestPart {
  id: string;
  ref: string;
  year: number | null;
  format: string;
  preview: string;
  status: "done" | "wrong" | "new";
  attempts: number;
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
  const canon = await canonFor(phs, new Set((cards as { philosopherId: string }[]).map((x) => x.philosopherId)));
  // 이 사상가의 완전 기출 (연계 문항 포함)
  const qids = Object.entries(links)
    .filter(([, names]) => names.some((n) => canon(n)?.name === tile.name))
    .map(([q]) => q);
  // 윤리 퀴즈의 완전 기출 문제 (023 · 동기화 뒤): 문항 → 퀴즈 문제 id
  const quizItemOf = new Map(items.filter((it) => it.origin === "full" && it.question_id).map((it) => [it.question_id!, it.id]));
  const quizIds = qids.map((q) => quizItemOf.get(q)).filter((x): x is string => Boolean(x));
  const [qs, progress] = await Promise.all([
    fetchIn<{ id: string; label: string; score: number | null; question_text: string | null; exams: ExamRef | ExamRef[] | null }>(qids, (part) =>
      db.from("questions").select("id, label, score, question_text, exams(exam_year, section)").in("id", part),
    ),
    fetchIn<{ item_id: string; attempts: number; correct_count: number }>(quizIds, (part) =>
      db.from("quiz_progress").select("item_id, attempts, correct_count").eq("learner", learner).in("item_id", part),
    ),
  ]);
  const pg = new Map(progress.map((p) => [p.item_id, p]));
  // 첫머리의 ○ · ◦ 같은 글머리표는 떼고 한 줄로
  const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().replace(/^[○◦∘•·\-–\s]+/, "");
  const cut = (s: string, n = 100) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const questions: ConquestQuestion[] = qs
    .map((q) => {
      const e = Array.isArray(q.exams) ? q.exams[0] : q.exams;
      const s = solves.map.get(q.id);
      const quizItemId = quizItemOf.get(q.id) ?? null;
      const p = quizItemId ? pg.get(quizItemId) : undefined;
      const attempts = (s?.attempts ?? 0) + (p?.attempts ?? 0);
      return {
        id: fullKey(q.id),
        questionId: q.id,
        quizItemId,
        ref: e ? questionRef(e, q.label) : `${q.label}번`,
        year: e?.exam_year ?? null,
        score: q.score,
        preview: cut(clean(q.question_text)),
        status: s?.correct || (p && p.correct_count > 0) ? ("done" as const) : attempts > 0 ? ("wrong" as const) : ("new" as const),
        attempts,
        bestScore: s?.bestScore ?? null,
      };
    })
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.ref.localeCompare(b.ref, "ko", { numeric: true }) || labelNum(a.ref) - labelNum(b.ref));
  // 부분 기출 (윤리 퀴즈 세부 문제, 연계 문항 포함)
  const partItems = items.filter(
    (it) => it.kind === "exam" && it.origin !== "full" && [...(it.philosopher_names ?? []), ...((it.question_id && links[it.question_id]) || [])].some((n) => canon(n)?.name === tile.name),
  );
  const partIds = partItems.map((it) => it.id);
  const [prows, pprog] = await Promise.all([
    fetchIn<{ id: string; label: string | null; exam_year: number | null; question_id: string | null; prompt: string | null; format: string }>(partIds, (part) =>
      db.from("quiz_items").select("id, label, exam_year, question_id, prompt, format").in("id", part),
    ),
    fetchIn<{ item_id: string; attempts: number; correct_count: number }>(partIds, (part) =>
      db.from("quiz_progress").select("item_id, attempts, correct_count").eq("learner", learner).in("item_id", part),
    ),
  ]);
  const pq = new Map(pprog.map((p) => [p.item_id, p]));
  const refByQ = new Map(questions.map((q) => [q.questionId, q.ref]));
  const missingQ = [...new Set(prows.map((r) => r.question_id).filter((x): x is string => Boolean(x) && !refByQ.has(x!)))];
  if (missingQ.length) {
    const extra = await fetchIn<{ id: string; label: string; exams: ExamRef | ExamRef[] | null }>(missingQ, (part) => db.from("questions").select("id, label, exams(exam_year, section)").in("id", part));
    for (const q of extra) {
      const e = Array.isArray(q.exams) ? q.exams[0] : q.exams;
      if (e) refByQ.set(q.id, questionRef(e, q.label));
    }
  }
  const parts: ConquestPart[] = prows
    .map((r) => {
      const p = pq.get(r.id);
      return {
        id: r.id,
        ref: (r.question_id && refByQ.get(r.question_id)) || [r.exam_year, r.label && `${r.label}번`].filter(Boolean).join(" ") || "기출",
        year: r.exam_year,
        format: r.format,
        preview: cut(clean(r.prompt), 90),
        status: p && p.correct_count > 0 ? ("done" as const) : p && p.attempts > 0 ? ("wrong" as const) : ("new" as const),
        attempts: p?.attempts ?? 0,
      };
    })
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.ref.localeCompare(b.ref, "ko", { numeric: true }));
  return { tile, min: c.min, ready: c.ready, tracksReady: c.tracksReady, fullReady: solves.ready, questions, parts };
}

export const QUIZ_021_HINT = "정복 보상 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/021_quiz_conquest.sql 을 실행하세요.";

export class FunError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** 정복 보상: 서버가 정복 여부를 다시 확인한 뒤 문제 수에 맞는 등급의 카드 1장 */
export const QUIZ_024_HINT = "완전 기출 정복 보상은 관리자가 업데이트(SQL 024)를 적용하면 받을 수 있습니다.";
export async function claimConquest(learner: string, philosopherId: string, track: ConquestTrack = "part") {
  const c = await getConquest(learner);
  const tile = c.groups.flatMap((g) => g.tiles).find((t) => t.id === philosopherId);
  if (!tile) throw new FunError("없는 사상가입니다.", 404);
  if (!c.ready) throw new FunError(QUIZ_021_HINT, 503);
  if (track === "full" && !c.tracksReady) throw new FunError(QUIZ_024_HINT, 503);
  const x = progressOf(tile, track);
  const what = CONQUEST_TRACK_NAMES[track];
  if (x.reward === "claimed") throw new FunError("이미 받은 보상입니다.", 409);
  if (!x.rewardable || !x.rarity) throw new FunError(`${what}이 ${CONQUEST_MIN}개 이상인 사상가만 카드 보상이 있습니다.`, 409);
  if (x.reward === "unavailable") throw new FunError("이 사상가의 카드는 아직 공개되지 않았습니다.", 409);
  if (!x.full) throw new FunError(`아직 ${what}을 정복하지 못했습니다 (${x.done}/${x.total}).`, 409);
  const rarity = x.rarity;
  const db = getAdminClient();
  const { data, error } = c.tracksReady
    ? await db.rpc("quiz_conquest_claim_track", { p_learner: learner, p_philosopher: philosopherId, p_rarity: rarity, p_track: track })
    : await db.rpc("quiz_conquest_claim", { p_learner: learner, p_philosopher: philosopherId, p_rarity: rarity });
  if (error) throw /quiz_conquest|conquest|schema cache|does not exist/i.test(error.message) ? new FunError(track === "full" ? QUIZ_024_HINT : QUIZ_021_HINT, 503) : new FunError(error.message, 500);
  const d = data as { ok: boolean; already?: boolean; cardId?: string };
  if (!d.ok) throw new FunError("이미 받은 보상입니다.", 409);
  return { cardId: d.cardId!, name: tile.name, rarity, rarityName: CONQUEST_RARITY_NAME[rarity], track };
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
    const canon = await canonFor(phs);
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
    const canon = await canonFor(phs);
    // 정복 업적: 완전 기출 또는 부분 기출 중 하나라도 다 채운 사상가
    const nameOf = (n: string) => canon(n)?.name ?? null;
    const w = fullConquestEntries(items, links, correct, solvedSet(solves.map));
    const pt = partConquestEntries(items, links, correct);
    const full = new Set([...conquestCells(w.entries, w.done, nameOf), ...conquestCells(pt.entries, pt.done, nameOf)].filter((c) => c.full).map((c) => c.name));
    const cells = [...full].map((name) => ({ name, full: true }));
    return { answered: p?.total_answered ?? 0, bestStreak: p?.best_streak ?? 0, missions: missions.count ?? 0, essayCorrect: essays.count ?? 0, conquered: cells.filter((c) => c.full).length };
  } catch (e) {
    console.error("[quiz-stats]", e);
    return { answered: 0, bestStreak: 0, missions: 0, essayCorrect: 0, conquered: 0 };
  }
}
