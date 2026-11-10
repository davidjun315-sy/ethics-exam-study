import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminClient } from "@/lib/supabase/server";
import { weekStart } from "@/lib/game/ranking";

/**
 * 윤리 퀴즈 주간 랭킹: 이번 주(한국 시간 월요일 0시~) 문제 풀이로 얻은 경험치 합.
 * 경험치는 같은 문제는 하루 한 번만 주므로 같은 문제 반복으로 순위를 올릴 수 없다.
 * 모두에게 같은 표라 1분 동안 저장해 두고 재사용한다 (회원 이름만, 아이디는 보이지 않음).
 */
export interface QuizRankRow {
  rank: number;
  /** 내 줄인가 (학습자 키는 화면에 넘기지 않음) */
  me: boolean;
  name: string;
  title: string | null;
  xp: number;
  solved: number;
  correct: number;
}
export interface QuizWeekly {
  weekStart: string;
  weekEnd: string;
  rows: QuizRankRow[];
  /** 내 순위 (상위에 없을 때도) */
  mine: { rank: number; xp: number; solved: number; correct: number } | null;
}

type Board = { weekStart: string; weekEnd: string; all: { learner: string; xp: number; solved: number; correct: number }[]; names: Record<string, string>; titles: Record<string, string | null> };

const TOP = 10;

async function loadBoard(startIso: string): Promise<Board> {
  const db = getAdminClient();
  const by = new Map<string, { xp: number; solved: number; correct: number; first: string }>();
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await db
      .from("quiz_attempts")
      .select("learner, xp, result, created_at")
      .gte("created_at", startIso)
      .order("created_at")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { learner: string; xp: number; result: string; created_at: string }[]) {
      const x = by.get(r.learner) ?? { xp: 0, solved: 0, correct: 0, first: r.created_at };
      x.xp += r.xp ?? 0;
      x.solved += 1;
      if (r.result === "correct") x.correct += 1;
      by.set(r.learner, x);
    }
    if (!data || data.length < 1000) break;
  }
  const all = [...by.entries()]
    .filter(([, x]) => x.xp > 0)
    .map(([learner, x]) => ({ learner, xp: x.xp, solved: x.solved, correct: x.correct, first: x.first }))
    .sort((a, b) => b.xp - a.xp || a.first.localeCompare(b.first) || a.learner.localeCompare(b.learner))
    .map((r) => ({ learner: r.learner, xp: r.xp, solved: r.solved, correct: r.correct }));
  const top = all.slice(0, TOP).map((r) => r.learner);
  const ids = top.filter((l) => l.startsWith("m:")).map((l) => l.slice(2));
  const [members, profs] = await Promise.all([
    ids.length ? db.from("members").select("id, display_name").in("id", ids) : Promise.resolve({ data: [] }),
    // 칭호 (게임 019). 표가 없거나 열이 없어도 랭킹은 그대로
    top.length ? db.from("game_profiles").select("*").in("learner", top) : Promise.resolve({ data: [] }),
  ]);
  const names: Record<string, string> = Object.fromEntries(((members.data ?? []) as { id: string; display_name: string }[]).map((m) => [`m:${m.id}`, m.display_name]));
  const titles: Record<string, string | null> = Object.fromEntries(((profs.data ?? []) as { learner: string; title?: string | null }[]).map((p) => [p.learner, p.title ?? null]));
  const start = new Date(startIso);
  return { weekStart: startIso, weekEnd: new Date(start.getTime() + 7 * 86400_000).toISOString(), all, names, titles };
}

const cachedBoard = unstable_cache(loadBoard, ["quiz-weekly-ranking"], { revalidate: 60 });

export async function getQuizWeekly(learner: string): Promise<QuizWeekly | null> {
  try {
    const b = await cachedBoard(weekStart().toISOString());
    const i = b.all.findIndex((r) => r.learner === learner);
    return {
      weekStart: b.weekStart,
      weekEnd: b.weekEnd,
      rows: b.all.slice(0, TOP).map((r, k) => ({ rank: k + 1, me: r.learner === learner, xp: r.xp, solved: r.solved, correct: r.correct, name: r.learner === "owner" ? "관리자" : (b.names[r.learner] ?? "학습자"), title: b.titles[r.learner] ?? null })),
      mine: i >= 0 ? { rank: i + 1, xp: b.all[i].xp, solved: b.all[i].solved, correct: b.all[i].correct } : null,
    };
  } catch (e) {
    console.error("[quiz-weekly]", e);
    return null;
  }
}
