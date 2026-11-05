import "server-only";
import { getAdminClient } from "@/lib/supabase/server";
import { classifyPhilosopher } from "@/lib/traditions";
import { kstDay } from "@/lib/quiz/srs";
import { fetchAll } from "@/lib/quiz/paged";
import { opponentLevel, runBattle, type BattleEvent, type Difficulty, type Fighter } from "./battle";
import { DEFAULT_COIN_RULES, effectiveRates, MAX_LEVEL_DEFAULT, quizCoins, RARITIES, statsAt, upgradeCost, type CoinRules, type Rarity, type SkillEffect } from "./rules";
import { suggestFor } from "./suggestions";

/**
 * 철학자 대난투 서버 데이터.
 * - 사상가 원본(philosophers · question_philosophers)은 읽기만 한다. 카드 정보는 game_cards 에 따로
 * - 코인·뽑기·강화는 DB 함수(game_grant · game_draw · game_upgrade) 안에서 한 번에 처리 (008)
 */
export const GAME_MIGRATION_HINT = "철학자 대난투 테이블이 없습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/008_philosopher_game.sql 을 실행하세요.";

const MESSAGES: Record<string, string> = {
  GAME_NOT_ENOUGH_COINS: "코인이 부족합니다. 윤리 퀴즈를 풀어 코인을 모아 보세요.",
  GAME_NO_CARDS: "아직 공개된 카드가 없습니다. 관리자가 카드 일러스트를 준비하면 열립니다.",
  GAME_NOT_OWNED: "보유하지 않은 카드입니다.",
  GAME_MAX_LEVEL: "이미 최대 레벨입니다.",
  GAME_LEVEL_CHANGED: "다른 화면에서 이미 강화되었습니다. 새로고침 후 다시 시도하세요.",
  GAME_NOT_ENOUGH_SHARDS: "강화 조각이 부족합니다.",
};

export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function gameError(message: string): GameError {
  const code = message.match(/GAME_[A-Z_]+/)?.[0];
  if (code && MESSAGES[code]) return new GameError(MESSAGES[code], code === "GAME_NO_CARDS" ? 409 : 400);
  if (/game_|function public\.game/.test(message) && /(does not exist|schema cache|Could not find)/i.test(message)) return new GameError(GAME_MIGRATION_HINT, 503);
  return new GameError(message, 500);
}

// ---------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------
export interface GameSettings {
  draw_cost: number;
  rates: Record<Rarity, number>;
  coin_rules: CoinRules;
  max_level: number;
  dup_refund: number;
}
const DEFAULT_SETTINGS: GameSettings = {
  draw_cost: 100,
  rates: { common: 60, rare: 28, epic: 10, legendary: 2 },
  coin_rules: DEFAULT_COIN_RULES,
  max_level: MAX_LEVEL_DEFAULT,
  dup_refund: 20,
};

export async function getGameSettings(): Promise<GameSettings> {
  const { data, error } = await getAdminClient().from("game_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw gameError(error.message);
  const d = (data ?? {}) as Partial<GameSettings>;
  return {
    draw_cost: d.draw_cost ?? DEFAULT_SETTINGS.draw_cost,
    rates: { ...DEFAULT_SETTINGS.rates, ...(d.rates ?? {}) },
    coin_rules: { ...DEFAULT_COIN_RULES, ...(d.coin_rules ?? {}) },
    max_level: d.max_level ?? DEFAULT_SETTINGS.max_level,
    dup_refund: d.dup_refund ?? DEFAULT_SETTINGS.dup_refund,
  };
}

export async function saveGameSettings(s: GameSettings) {
  const { error } = await getAdminClient()
    .from("game_settings")
    .upsert({ id: 1, ...s, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw gameError(error.message);
}

// ---------------------------------------------------------------------
// 카드
// ---------------------------------------------------------------------
export interface CardView {
  philosopherId: string;
  name: string;
  originalName: string | null;
  tradition: string; // 동양윤리 · 서양윤리 …
  rarity: Rarity;
  baseAtk: number;
  baseHp: number;
  skillName: string;
  skillEffect: SkillEffect;
  skillDesc: string;
  quote: string;
  artUrl: string | null;
  artBasis: "portrait" | "reconstruction";
  artNote: string;
  published: boolean;
}

type CardRow = {
  philosopher_id: string;
  rarity: Rarity;
  base_atk: number;
  base_hp: number;
  skill_name: string;
  skill_effect: SkillEffect;
  skill_desc: string;
  quote: string;
  art_url: string | null;
  art_basis: "portrait" | "reconstruction";
  art_note: string;
  published: boolean;
  updated_at: string;
};
type PhRow = { id: string; name: string; aliases: string[] | null; original_name: string | null; tradition: string | null; era: string | null };

const toView = (c: CardRow, p: PhRow): CardView => ({
  philosopherId: c.philosopher_id,
  name: p.name,
  originalName: p.original_name,
  tradition: classifyPhilosopher({ name: p.name, tradition: p.tradition }),
  rarity: c.rarity,
  baseAtk: c.base_atk,
  baseHp: c.base_hp,
  skillName: c.skill_name,
  skillEffect: c.skill_effect,
  skillDesc: c.skill_desc,
  quote: c.quote,
  artUrl: c.art_url,
  artBasis: c.art_basis,
  artNote: c.art_note,
  published: c.published,
});

/** 기출 분석에 주요·비교 사상가로 연결된 사상가 id → 연결 문항 수 */
async function linkedCounts(): Promise<Map<string, number>> {
  const rows = await fetchAll<{ philosopher_id: string }>((from, to) =>
    getAdminClient().from("question_philosophers").select("philosopher_id").in("role", ["main", "comparison"]).order("question_id").order("philosopher_id").range(from, to),
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.philosopher_id, (m.get(r.philosopher_id) ?? 0) + 1);
  return m;
}

async function loadCards(ids?: string[]): Promise<{ cards: CardRow[]; philosophers: Map<string, PhRow> }> {
  const db = getAdminClient();
  let q = db.from("game_cards").select("*");
  if (ids) q = q.in("philosopher_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await q;
  if (error) throw gameError(error.message);
  const cards = (data ?? []) as CardRow[];
  const pids = cards.map((c) => c.philosopher_id);
  const { data: ps, error: pe } = pids.length
    ? await db.from("philosophers").select("id, name, aliases, original_name, tradition, era").in("id", pids)
    : { data: [], error: null };
  if (pe) throw gameError(pe.message);
  return { cards, philosophers: new Map(((ps ?? []) as PhRow[]).map((p) => [p.id, p])) };
}

/** 뽑기에 나오는 카드 (공개 + 일러스트 + 기출 연결). DB 함수와 같은 조건 */
export async function publishedCards(): Promise<CardView[]> {
  const { data, error } = await getAdminClient().rpc("game_draw_pool");
  if (error) throw gameError(error.message);
  const ids = ((data ?? []) as { philosopher_id: string }[]).map((r) => r.philosopher_id);
  const { cards, philosophers } = await loadCards(ids);
  return cards.filter((c) => philosophers.has(c.philosopher_id)).map((c) => toView(c, philosophers.get(c.philosopher_id)!));
}

// ---------------------------------------------------------------------
// 학습자 상태
// ---------------------------------------------------------------------
export interface OwnedCard extends CardView {
  level: number;
  shards: number;
  copies: number;
  atk: number;
  hp: number;
  upgrade: { shards: number; coins: number } | null; // null = 최대 레벨
}

export interface GameState {
  coins: number;
  settings: { drawCost: number; maxLevel: number; dupRefund: number; rates: Record<Rarity, number>; effectiveRates: Record<Rarity, number>; coinRules: CoinRules };
  cards: CardView[]; // 공개 카드 (도감)
  owned: OwnedCard[]; // 보유 카드 (공개가 내려가도 일러스트가 있으면 계속 보유)
  featuredId: string | null;
  deck: string[];
  record: { wins: number; losses: number };
}

export async function getGameState(learner: string): Promise<GameState> {
  const db = getAdminClient();
  const [settings, cards, wallet, col, prof] = await Promise.all([
    getGameSettings(),
    publishedCards(),
    db.from("game_wallets").select("coins").eq("learner", learner).maybeSingle(),
    db.from("game_collection").select("*").eq("learner", learner),
    db.from("game_profiles").select("*").eq("learner", learner).maybeSingle(),
  ]);
  for (const r of [wallet, col, prof]) if (r.error) throw gameError(r.error.message);
  const colRows = (col.data ?? []) as { philosopher_id: string; level: number; shards: number; copies: number }[];
  const missing = colRows.map((r) => r.philosopher_id).filter((id) => !cards.some((c) => c.philosopherId === id));
  const extra = missing.length ? await loadCards(missing) : { cards: [], philosophers: new Map<string, PhRow>() };
  const known = new Map<string, CardView>([
    ...cards.map((c) => [c.philosopherId, c] as const),
    ...extra.cards.filter((c) => c.art_url && extra.philosophers.has(c.philosopher_id)).map((c) => [c.philosopher_id, toView(c, extra.philosophers.get(c.philosopher_id)!)] as const),
  ]);
  const owned: OwnedCard[] = colRows
    .filter((r) => known.has(r.philosopher_id))
    .map((r) => {
      const c = known.get(r.philosopher_id)!;
      const st = statsAt({ atk: c.baseAtk, hp: c.baseHp }, r.level);
      return { ...c, level: r.level, shards: r.shards, copies: r.copies, atk: st.atk, hp: st.hp, upgrade: r.level >= settings.max_level ? null : upgradeCost(r.level) };
    });
  const p = prof.data as { featured_philosopher_id: string | null; deck: string[]; wins: number; losses: number } | null;
  const ownedIds = new Set(owned.map((o) => o.philosopherId));
  return {
    coins: (wallet.data as { coins: number } | null)?.coins ?? 0,
    settings: {
      drawCost: settings.draw_cost,
      maxLevel: settings.max_level,
      dupRefund: settings.dup_refund,
      rates: settings.rates,
      effectiveRates: effectiveRates(settings.rates, RARITIES.filter((r) => cards.some((c) => c.rarity === r))),
      coinRules: settings.coin_rules,
    },
    cards,
    owned,
    featuredId: p?.featured_philosopher_id && ownedIds.has(p.featured_philosopher_id) ? p.featured_philosopher_id : null,
    deck: (p?.deck ?? []).filter((id) => ownedIds.has(id)).slice(0, 3),
    record: { wins: p?.wins ?? 0, losses: p?.losses ?? 0 },
  };
}

/** 퀴즈 홈의 '나의 철학자' (테이블이 없으면 null → 퀴즈는 그대로 동작) */
export async function getFeatured(learner: string): Promise<{ coins: number; featured: OwnedCard | null; ownedCount: number; cardCount: number; maxLevel: number } | null> {
  try {
    const s = await getGameState(learner);
    return {
      coins: s.coins,
      featured: s.owned.find((o) => o.philosopherId === s.featuredId) ?? null,
      ownedCount: s.owned.length,
      cardCount: s.cards.length,
      maxLevel: s.settings.maxLevel,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// 뽑기 · 강화 · 대표 카드 · 덱
// ---------------------------------------------------------------------
export interface DrawResult {
  card: CardView;
  isNew: boolean;
  level: number;
  shards: number;
  copies: number;
  refund: number;
  coins: number;
  replayed: boolean;
}

export async function drawCard(learner: string, requestId: string): Promise<DrawResult> {
  const { data, error } = await getAdminClient().rpc("game_draw", { p_learner: learner, p_ref: `draw:${requestId}`, p_day: kstDay() });
  if (error) throw gameError(error.message);
  const r = data as { philosopherId: string; isNew: boolean; level: number; shards: number; copies: number; refund: number; coins: number; replayed: boolean };
  const { cards, philosophers } = await loadCards([r.philosopherId]);
  if (!cards[0] || !philosophers.get(r.philosopherId)) throw new GameError("카드 정보를 찾을 수 없습니다.", 500);
  return { card: toView(cards[0], philosophers.get(r.philosopherId)!), isNew: r.isNew, level: r.level, shards: r.shards, copies: r.copies, refund: r.refund, coins: r.coins, replayed: r.replayed };
}

export async function upgradeCard(learner: string, philosopherId: string, requestId: string) {
  const db = getAdminClient();
  const { data: row, error } = await db.from("game_collection").select("level, shards").eq("learner", learner).eq("philosopher_id", philosopherId).maybeSingle();
  if (error) throw gameError(error.message);
  if (!row) throw new GameError(MESSAGES.GAME_NOT_OWNED);
  const cost = upgradeCost(row.level as number);
  const { data, error: e } = await db.rpc("game_upgrade", {
    p_learner: learner,
    p_philosopher: philosopherId,
    p_ref: `upgrade:${requestId}`,
    p_day: kstDay(),
    p_from_level: row.level,
    p_shards: cost.shards,
    p_coins: cost.coins,
  });
  if (e) throw gameError(e.message);
  return data as { fromLevel: number; level: number; shards: number; coins: number; replayed: boolean };
}

async function assertOwned(learner: string, ids: string[]) {
  const { data, error } = await getAdminClient().from("game_collection").select("philosopher_id").eq("learner", learner).in("philosopher_id", ids);
  if (error) throw gameError(error.message);
  if ((data ?? []).length !== new Set(ids).size) throw new GameError(MESSAGES.GAME_NOT_OWNED);
}

export async function setFeatured(learner: string, philosopherId: string | null) {
  if (philosopherId) await assertOwned(learner, [philosopherId]);
  const { error } = await getAdminClient()
    .from("game_profiles")
    .upsert({ learner, featured_philosopher_id: philosopherId, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  if (error) throw gameError(error.message);
}

export async function setDeck(learner: string, ids: string[]) {
  if (new Set(ids).size !== ids.length || ids.length > 3) throw new GameError("서로 다른 카드 3장까지 고르세요.");
  if (ids.length) await assertOwned(learner, ids);
  const { error } = await getAdminClient().from("game_profiles").upsert({ learner, deck: ids, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  if (error) throw gameError(error.message);
}

// ---------------------------------------------------------------------
// 배틀 (보상 없음: 코인은 학습으로만)
// ---------------------------------------------------------------------
export interface BattleCard {
  key: string;
  philosopherId: string;
  name: string;
  rarity: Rarity;
  level: number;
  atk: number;
  hp: number;
  skillName: string;
  skillEffect: SkillEffect;
  artUrl: string | null;
  tradition: string;
}
export interface BattleReplay {
  id: string;
  difficulty: Difficulty;
  me: BattleCard[];
  foe: BattleCard[];
  first: "me" | "foe";
  winner: "me" | "foe";
  events: BattleEvent[];
  record: { wins: number; losses: number };
}

export async function playBattle(learner: string, deckIds: string[], difficulty: Difficulty): Promise<BattleReplay> {
  if (deckIds.length !== 3 || new Set(deckIds).size !== 3) throw new GameError("서로 다른 카드 3장으로 덱을 구성하세요.");
  const state = await getGameState(learner);
  const mine = deckIds.map((id) => state.owned.find((o) => o.philosopherId === id));
  if (mine.some((m) => !m)) throw new GameError(MESSAGES.GAME_NOT_OWNED);
  if (state.cards.length < 3) throw new GameError("상대 덱을 만들 공개 카드가 아직 3장 미만입니다.", 409);
  const seed = crypto.randomUUID();
  // 상대: 공개 카드 중 무작위 3장 (시드로 섞음), 레벨은 내 덱 기준
  const lv = opponentLevel(mine.map((m) => m!.level), difficulty, state.settings.maxLevel);
  const shuffled = [...state.cards].map((c, i) => ({ c, k: hashSeed(`${seed}:${i}`) })).sort((a, b) => a.k - b.k).map((x) => x.c);
  const foeCards = shuffled.slice(0, 3);
  const asBattle = (c: CardView, level: number, key: string): BattleCard => {
    const st = statsAt({ atk: c.baseAtk, hp: c.baseHp }, level);
    return { key, philosopherId: c.philosopherId, name: c.name, rarity: c.rarity, level, atk: st.atk, hp: st.hp, skillName: c.skillName, skillEffect: c.skillEffect, artUrl: c.artUrl, tradition: c.tradition };
  };
  const me = mine.map((m, i) => asBattle(m!, m!.level, `me-${i}`));
  const foe = foeCards.map((c, i) => asBattle(c, lv, `foe-${i}`));
  const toFighter = (b: BattleCard): Fighter => ({ key: b.key, philosopherId: b.philosopherId, name: b.name, atk: b.atk, hp: b.hp, skillName: b.skillName, skillEffect: b.skillEffect });
  const r = runBattle(me.map(toFighter), foe.map(toFighter), seed);

  const db = getAdminClient();
  const { data: saved, error } = await db
    .from("game_battles")
    .insert({ learner, difficulty, deck: me, opponent: foe, seed, result: r.winner === "me" ? "win" : "lose", turns: r.actions })
    .select("id")
    .single();
  if (error) throw gameError(error.message);
  const record = { wins: state.record.wins + (r.winner === "me" ? 1 : 0), losses: state.record.losses + (r.winner === "me" ? 0 : 1) };
  await db.from("game_profiles").upsert({ learner, deck: deckIds, wins: record.wins, losses: record.losses, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  return { id: saved.id as string, difficulty, me, foe, first: r.first, winner: r.winner, events: r.events, record };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------
// 학습 코인 (윤리 퀴즈에서 호출). 실패해도 퀴즈 기록은 그대로
// ---------------------------------------------------------------------
export async function grantQuizCoins(
  learner: string,
  a: { attemptId: string; format: "fill" | "essay"; selfGraded: boolean; result: "correct" | "partial" | "wrong"; answerLength: number; xpAwarded: boolean; reconquered: boolean; missionDay: string | null },
): Promise<{ coins: number; note: string }> {
  try {
    const settings = await getGameSettings();
    const rules = settings.coin_rules;
    const c = quizCoins(a, rules);
    const db = getAdminClient();
    const day = kstDay();
    let total = 0;
    const grant = async (amount: number, kind: string, ref: string, cap: number | null) => {
      if (amount <= 0) return;
      const { data, error } = await db.rpc("game_grant", { p_learner: learner, p_amount: amount, p_kind: kind, p_ref: ref, p_day: day, p_meta: { attemptId: a.attemptId }, p_daily_cap: cap });
      if (error) throw new Error(error.message);
      total += (data as number) ?? 0;
    };
    await grant(c.base, "quiz", `attempt:${a.attemptId}`, rules.daily_cap);
    await grant(c.reconquer, "reconquer", `reconquer:${a.attemptId}`, rules.daily_cap);
    if (a.missionDay) await grant(rules.mission, "mission", `mission:${a.missionDay}`, null);
    const capped = c.base + c.reconquer > 0 && total < c.base + c.reconquer + (a.missionDay ? rules.mission : 0);
    return { coins: total, note: c.reason || (capped ? "오늘 학습 코인 상한에 도달했습니다" : "") };
  } catch (e) {
    console.error("[game] coin grant skipped", e instanceof Error ? e.message : e);
    return { coins: 0, note: "" };
  }
}

// ---------------------------------------------------------------------
// 관리자: 카드 후보 (기출 분석 DB 기준)
// ---------------------------------------------------------------------
export interface CandidateRow {
  philosopherId: string;
  name: string;
  aliases: string[];
  originalName: string | null;
  era: string | null;
  tradition: string;
  questions: number; // 주요·비교로 연결된 기출 문항 수
  card: CardView | null;
  status: "ready" | "draft" | "missing-art" | "none";
  duplicateOf: string | null; // 표기가 다른 같은 사상가로 보이는 항목
  suggestion: ReturnType<typeof suggestFor>;
}

export async function listCandidates(): Promise<CandidateRow[]> {
  const db = getAdminClient();
  const [counts, { data: ps, error }, { data: cs, error: ce }] = await Promise.all([
    linkedCounts(),
    db.from("philosophers").select("id, name, aliases, original_name, tradition, era"),
    db.from("game_cards").select("*"),
  ]);
  if (error) throw gameError(error.message);
  if (ce) throw gameError(ce.message);
  const phs = ((ps ?? []) as PhRow[]).filter((p) => counts.has(p.id));
  const cards = new Map(((cs ?? []) as CardRow[]).map((c) => [c.philosopher_id, c]));
  const norm = (s: string) => s.replace(/\s+/g, "");
  const nameOf = new Map<string, string>();
  for (const p of phs) for (const n of [p.name, ...(p.aliases ?? [])]) if (!nameOf.has(norm(n))) nameOf.set(norm(n), p.id);
  return phs
    .map((p): CandidateRow => {
      const c = cards.get(p.id);
      const view = c ? toView(c, p) : null;
      const tradition = classifyPhilosopher({ name: p.name, tradition: p.tradition });
      const dup = [p.name, ...(p.aliases ?? [])].map((n) => nameOf.get(norm(n))).find((id) => id && id !== p.id) ?? null;
      return {
        philosopherId: p.id,
        name: p.name,
        aliases: p.aliases ?? [],
        originalName: p.original_name,
        era: p.era,
        tradition,
        questions: counts.get(p.id) ?? 0,
        card: view,
        status: !c ? "none" : !c.art_url ? "missing-art" : c.published && c.skill_name ? "ready" : "draft",
        duplicateOf: dup ? (phs.find((x) => x.id === dup)?.name ?? null) : null,
        suggestion: suggestFor(p.name, p.aliases ?? [], tradition),
      };
    })
    .sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name));
}

export interface CardInput {
  rarity: Rarity;
  base_atk: number;
  base_hp: number;
  skill_name: string;
  skill_effect: SkillEffect;
  skill_desc: string;
  quote: string;
  art_url: string | null;
  art_basis: "portrait" | "reconstruction";
  art_note: string;
  published: boolean;
}

/** 카드 저장. 공개는 일러스트·필살기가 있고 기출 분석에 연결된 사상가만 */
export async function saveCard(philosopherId: string, input: CardInput) {
  const counts = await linkedCounts();
  if (!counts.has(philosopherId)) throw new GameError("기출 분석에 (주요·비교 사상가로) 연결된 사상가만 카드로 만들 수 있습니다.");
  if (input.published && (!input.art_url || !input.skill_name.trim())) throw new GameError("일러스트와 필살기 이름이 있어야 공개할 수 있습니다.");
  const { error } = await getAdminClient()
    .from("game_cards")
    .upsert({ philosopher_id: philosopherId, ...input, updated_at: new Date().toISOString() }, { onConflict: "philosopher_id" });
  if (error) throw gameError(error.message);
}
