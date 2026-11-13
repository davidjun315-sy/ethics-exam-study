import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, ChevronRight, Gift, RotateCcw } from "lucide-react";
import { currentLearner } from "@/lib/quiz/learn";
import { getConquestDetail, type ConquestQuestion } from "@/lib/quiz/fun";
import { CONQUEST_RARITY_NAME } from "@/lib/quiz/fun-core";
import { Ring } from "@/components/quiz/ConquestMap";

export const metadata = { title: "사상가 기출문제 · 정복 지도" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 한 번에 풀 수 있는 문제 수 (세션 최대) */
const BATCH = 20;
const TONE = {
  common: "text-[#5d6673] dark:text-[#a7b0bd]",
  rare: "text-[#2a6fd6] dark:text-[#8fd0ff]",
  epic: "text-[#7b3fe4] dark:text-[#d8b4ff]",
  legendary: "text-[#b9780f] dark:text-[#ffe39a]",
} as const;

/** 사상가 한 명의 완전 기출문제: 아직 정복 못한 문제 / 정복한 문제 (정복 지도는 완전 기출만 셈) */
export default async function ConquestDetailPage({ params }: PageProps<"/quiz/map/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const learner = await currentLearner();
  if (!learner) redirect(`/login?next=/quiz/map/${id}`);
  const d = await getConquestDetail(learner, id);
  if (!d) notFound();
  const { tile, questions } = d;
  const left = questions.filter((q) => q.status !== "done");
  const done = questions.filter((q) => q.status === "done");
  const here = `/quiz/map/${id}`;
  const play = (ids: string[]) => `/quiz/play?mode=free&ids=${ids.join(",")}&from=${encodeURIComponent(here)}`;
  // 윤리 퀴즈로 바로 풀기: 틀린 적 있는 문항 먼저, 그다음 안 푼 문항 (완전 기출 문제가 있는 것만)
  const queue = [...left.filter((q) => q.status === "wrong"), ...left.filter((q) => q.status === "new")].map((q) => q.quizItemId).filter((x): x is string => Boolean(x));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/quiz/map" className="text-xs text-muted hover:text-navy">
        ← 사상가 정복 지도
      </Link>

      {/* 요약 */}
      <section className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <Ring t={tile} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">{tile.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            정복한 완전 기출 <b className="text-ink">{tile.done}</b>/{tile.total}
            {left.length > 0 ? <> · 남은 {left.length}문항</> : <b className="ml-1 text-[#8a5a00] dark:text-[#ffd36b]">· 정복 완료!</b>}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
            <Gift className="h-3.5 w-3.5 text-[#c99a2e]" aria-hidden />
            {tile.rarity ? (
              <>
                정복 보상 <b className={TONE[tile.rarity]}>{CONQUEST_RARITY_NAME[tile.rarity]}</b> 카드
                {tile.reward === "claimed" && " · 받음"}
                {tile.reward === "claimable" && " · 정복 지도에서 받으세요"}
                {tile.reward === "unavailable" && " · 카드 공개 전"}
              </>
            ) : (
              <>카드 보상은 완전 기출 {d.min}문항 이상인 사상가만</>
            )}
          </p>
        </div>
        {queue.length > 0 && (
          <Link href={play(queue.slice(0, BATCH))} className="btn-primary w-full justify-center py-2.5 text-sm font-bold sm:w-auto">
            남은 {Math.min(queue.length, BATCH)}문항 윤리 퀴즈로 풀기 <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </section>

      <p className="-mt-1 text-[11px] leading-relaxed text-faint">
        정복 지도는 <b>완전 기출</b>(문항 전체)만 셉니다. 윤리 퀴즈 &lsquo;실전만 · 완전 기출&rsquo;에서 맞히거나, 기출문제 탭에서 AI 채점 80점 이상 또는 모범답안과 비교해 &lsquo;다 맞혔어요&rsquo;를 누르면 정복입니다. 두 사상가 이상이 함께 나온 연계 문항은 모두에게 함께 셉니다.
        {!d.fullReady && " (기출문제 탭 기록은 관리자가 업데이트(SQL 022)를 적용하면 남습니다.)"}
      </p>

      <section aria-labelledby="left-h">
        <h2 id="left-h" className="mb-2 flex items-baseline gap-2 text-base font-bold">
          아직 정복 못한 문항 <span className="text-sm font-semibold text-muted">{left.length}</span>
        </h2>
        {left.length === 0 ? (
          <p className="card p-5 text-center text-sm text-muted">{questions.length ? "모든 완전 기출을 정복했습니다 🎉" : "이 사상가와 연결된 기출 문항이 아직 없습니다."}</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden" data-conquest-list="left">
            {left.map((q) => (
              <Row key={q.id} q={q} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="done-h">
        <h2 id="done-h" className="mb-2 flex items-baseline gap-2 text-base font-bold">
          정복한 문항 <span className="text-sm font-semibold text-muted">{done.length}</span>
        </h2>
        {done.length === 0 ? (
          <p className="card p-5 text-center text-sm text-muted">아직 정복한 문항이 없습니다. 위 목록에서 하나씩 풀어 보세요.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden" data-conquest-list="done">
            {done.map((q) => (
              <Row key={q.id} q={q} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 문항 한 줄: 누르면 기출문제 탭의 그 문항 (답안 작성 · AI 채점 · 모범답안) */
function Row({ q }: { q: ConquestQuestion }) {
  const state =
    q.status === "done"
      ? { icon: <Check className="h-3.5 w-3.5" aria-hidden />, cls: "bg-[#ffd36b] text-[#3a2600]", label: "정복" }
      : q.status === "wrong"
        ? { icon: <RotateCcw className="h-3.5 w-3.5" aria-hidden />, cls: "bg-danger-soft text-danger", label: "다시 도전" }
        : { icon: <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />, cls: "bg-surface-2 text-faint", label: "안 푼 문항" };
  return (
    <li>
      <Link href={`/questions/${q.questionId}`} className="group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-surface-2/60 sm:px-4" data-status={q.status}>
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${state.cls}`} title={state.label}>
          {state.icon}
          <span className="sr-only">{state.label}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <b className="text-sm">{q.ref}</b>
            {q.score !== null && <span className="text-[11px] text-muted">{q.score}점</span>}
            {q.status === "wrong" && (
              <span className="text-[11px] font-semibold text-danger">
                {q.attempts}번 시도{q.bestScore !== null ? ` · 최고 ${Math.round(q.bestScore)}점` : ""} · 아직 못 맞힘
              </span>
            )}
          </span>
          {q.preview && <span className={`mt-0.5 line-clamp-2 text-[13px] leading-snug ${q.status === "done" ? "text-faint" : "text-muted"}`}>{q.preview}</span>}
        </span>
        <span className="mt-0.5 shrink-0 text-xs font-semibold text-navy opacity-80 group-hover:opacity-100">{q.status === "done" ? "다시 보기" : "풀기"} →</span>
      </Link>
    </li>
  );
}
