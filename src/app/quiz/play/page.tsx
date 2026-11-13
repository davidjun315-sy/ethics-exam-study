import { redirect } from "next/navigation";
import { QuizPlayer } from "@/components/quiz/QuizPlayer";
import { currentLearner, type Filters } from "@/lib/quiz/learn";
import type { ChallengeType } from "@/lib/quiz/game";

export const metadata = { title: "윤리 퀴즈 풀기" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function QuizPlayPage({ searchParams }: PageProps<"/quiz/play">) {
  if (!(await currentLearner())) redirect("/quiz");
  const sp = await searchParams;
  const challenge = (["decode", "essay", "revenge"] as const).find((c) => c === one(sp.challenge)) as ChallengeType | undefined;
  const mode = challenge ? (challenge === "revenge" ? "review" : "free") : one(sp.mode) === "free" ? "free" : one(sp.mode) === "review" ? "review" : "daily";
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const filters: Filters = {
    area: one(sp.area),
    philosopher: one(sp.philosopher),
    year: num(one(sp.year)),
    kind: one(sp.kind) === "exam" || one(sp.kind) === "expected" || one(sp.kind) === "practice" ? (one(sp.kind) as Filters["kind"]) : undefined,
    format: one(sp.format) === "fill" || one(sp.format) === "essay" ? (one(sp.format) as Filters["format"]) : undefined,
    difficulty: [1, 2, 3].includes(num(one(sp.difficulty)) ?? 0) ? (num(one(sp.difficulty)) as 1 | 2 | 3) : undefined,
    which: one(sp.which) === "new" || one(sp.which) === "review" ? (one(sp.which) as Filters["which"]) : "any",
    // 고른 문제만 (정복 지도 → 사상가 기출문제 목록에서)
    ids: one(sp.ids)?.split(",").filter((x) => UUID.test(x)).slice(0, 20),
  };
  if (!filters.ids?.length) delete filters.ids;
  // 돌아갈 곳: 정복 지도의 사상가 목록만 허용
  const from = one(sp.from);
  const back = from && /^\/quiz\/map\/[0-9a-f-]{36}$/i.test(from) ? { href: from, label: "기출문제 목록으로" } : undefined;
  // key: 같은 주소로 다시 들어와도 새 세션
  return <QuizPlayer key={JSON.stringify({ mode, filters, challenge })} mode={mode} filters={filters} challenge={challenge} back={back} />;
}
