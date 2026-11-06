import { redirect } from "next/navigation";
import { QuizPlayer } from "@/components/quiz/QuizPlayer";
import { currentLearner, type Filters } from "@/lib/quiz/learn";
import type { ChallengeType } from "@/lib/quiz/game";

export const metadata = { title: "윤리 퀴즈 풀기" };

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
  };
  // key: 같은 주소로 다시 들어와도 새 세션
  return <QuizPlayer key={JSON.stringify({ mode, filters, challenge })} mode={mode} filters={filters} challenge={challenge} />;
}
