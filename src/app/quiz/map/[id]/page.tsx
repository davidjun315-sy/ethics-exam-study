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
const FORMAT: Record<string, string> = { fill: "기입형", essay: "서술형" };
const TONE = {
  common: "text-[#5d6673] dark:text-[#a7b0bd]",
  rare: "text-[#2a6fd6] dark:text-[#8fd0ff]",
  epic: "text-[#7b3fe4] dark:text-[#d8b4ff]",
  legendary: "text-[#b9780f] dark:text-[#ffe39a]",
} as const;

/** 사상가 한 명의 기출문제: 아직 정복 못한 문제 / 정복한 문제 */
export default async function ConquestDetailPage({ params }: PageProps<"/quiz/map/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const learner = await currentLearner();
  if (!learner) redirect(`/login?next=/quiz/map/${id}`);
  const d = await getConquestDetail(learner, id);
  if (!d) notFound();
  const { tile, questions, full } = d;
  const fullDone = full.filter((q) => q.status === "done").length;
  const partDone = questions.filter((q) => q.status === "done").length;
  const left = questions.filter((q) => q.status !== "done");
  const done = questions.filter((q) => q.status === "done");
  const here = `/quiz/map/${id}`;
  const play = (ids: string[]) => `/quiz/play?mode=free&ids=${ids.join(",")}&from=${encodeURIComponent(here)}`;
  // 남은 문제: 틀린 적 있는 문제 먼저, 그다음 안 푼 문제
  const queue = [...left.filter((q) => q.status === "wrong"), ...left.filter((q) => q.status === "new")].map((q) => q.id);

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
            정복한 기출문제 <b className="text-ink">{tile.done}</b>/{tile.total}
            {tile.total - tile.done > 0 ? <> · 남은 {tile.total - tile.done}문제</> : <b className="ml-1 text-[#8a5a00] dark:text-[#ffd36b]">· 정복 완료!</b>}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            완전 기출 {fullDone}/{full.length} · 부분 문항 {partDone}/{questions.length}
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
              <>카드 보상은 기출문제 {d.min}개 이상인 사상가만</>
            )}
          </p>
        </div>
        {queue.length > 0 && (
          <Link href={play(queue.slice(0, BATCH))} className="btn-primary w-full justify-center py-2.5 text-sm font-bold sm:w-auto">
            남은 부분 문항 {Math.min(queue.length, BATCH)}개 풀기 <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </section>
      {queue.length > BATCH && <p className="-mt-2 text-[11px] text-faint">한 번에 {BATCH}문제씩 풉니다 (틀린 적 있는 문제부터).</p>}

      {/* 완전 기출문제: 기출문제 탭에서 문항 전체를 풀기 */}
      <section aria-labelledby="full-h">
        <h2 id="full-h" className="mb-1 flex items-baseline gap-2 text-base font-bold">
          완전 기출문제 <span className="text-sm font-semibold text-muted">{fullDone}/{full.length}</span>
        </h2>
        <p className="mb-2 text-[11px] text-faint">
          기출문제 탭에서 문항 전체를 풉니다. AI 채점 80점 이상이거나, 모범답안과 비교해 스스로 &lsquo;다 맞혔어요&rsquo;를 누르면 정복 — 그 문항의 부분 문항도 함께 정복됩니다.
          {!d.fullReady && " (기록은 관리자가 업데이트(SQL 022)를 적용하면 남습니다.)"}
        </p>
        {full.length === 0 ? (
          <p className="card p-5 text-center text-sm text-muted">이 사상가와 연결된 기출 문항이 아직 없습니다.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden" data-conquest-list="full">
            {[...full.filter((q) => q.status !== "done"), ...full.filter((q) => q.status === "done")].map((q) => (
              <Row key={q.id} q={q} href={`/questions/${q.questionId}`} />
            ))}
          </ul>
        )}
      </section>

      {/* 부분 문항 (윤리 퀴즈) — 아직 정복 못한 문제 */}
      <section aria-labelledby="left-h">
        <h2 id="left-h" className="mb-2 flex items-baseline gap-2 text-base font-bold">
          부분 문항 · 아직 정복 못한 문제 <span className="text-sm font-semibold text-muted">{left.length}</span>
          <span className="ml-auto text-[11px] font-normal text-faint">윤리 퀴즈 · 한 번 맞히면 정복</span>
        </h2>
        {left.length === 0 ? (
          <p className="card p-5 text-center text-sm text-muted">{questions.length ? "부분 문항을 모두 정복했습니다 🎉" : "이 사상가의 윤리 퀴즈 부분 문항이 아직 없습니다."}</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden" data-conquest-list="left">
            {left.map((q) => (
              <Row key={q.id} q={q} href={play([q.id])} />
            ))}
          </ul>
        )}
      </section>

      {/* 정복한 문제 */}
      <section aria-labelledby="done-h">
        <h2 id="done-h" className="mb-2 flex items-baseline gap-2 text-base font-bold">
          부분 문항 · 정복한 문제 <span className="text-sm font-semibold text-muted">{done.length}</span>
        </h2>
        {done.length === 0 ? (
          <p className="card p-5 text-center text-sm text-muted">아직 정복한 문제가 없습니다. 위 목록에서 하나씩 풀어 보세요.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden" data-conquest-list="done">
            {done.map((q) => (
              <Row key={q.id} q={q} href={play([q.id])} />
            ))}
          </ul>
        )}
      </section>
      <p className="text-[11px] text-faint">기출문제(실전)만 셉니다. 개념 다지기 연습문제와 예상 문제는 정복 지도에 들어가지 않습니다. 두 사상가 이상이 함께 나온 연계 문항은 그 사상가 모두의 지도에 함께 셉니다.</p>
    </div>
  );
}

function Row({ q, href }: { q: ConquestQuestion; href: string }) {
  const state =
    q.status === "done"
      ? { icon: <Check className="h-3.5 w-3.5" aria-hidden />, cls: "bg-[#ffd36b] text-[#3a2600]", label: "정복" }
      : q.status === "wrong"
        ? { icon: <RotateCcw className="h-3.5 w-3.5" aria-hidden />, cls: "bg-danger-soft text-danger", label: "다시 도전" }
        : { icon: <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />, cls: "bg-surface-2 text-faint", label: "안 푼 문제" };
  return (
    <li>
      <Link href={href} className="group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-surface-2/60 sm:px-4" data-status={q.status}>
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${state.cls}`} title={state.label}>
          {state.icon}
          <span className="sr-only">{state.label}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <b className="text-sm">{q.ref}</b>
            <span className="text-[11px] text-muted">{q.kind === "full" ? `문항 전체${q.format.endsWith("점") ? ` · ${q.format}` : ""}` : (FORMAT[q.format] ?? q.format)}</span>
            {q.status === "wrong" && (
              <span className="text-[11px] font-semibold text-danger">
                {q.attempts}번 시도{q.bestScore !== null ? ` · 최고 ${Math.round(q.bestScore)}점` : ""} · 아직 못 맞힘
              </span>
            )}
            {q.viaFull && <span className="text-[11px] font-semibold text-[#8a5a00] dark:text-[#ffd36b]">완전 기출로 정복</span>}
          </span>
          {q.preview && <span className={`mt-0.5 line-clamp-2 text-[13px] leading-snug ${q.status === "done" ? "text-faint" : "text-muted"}`}>{q.preview}</span>}
        </span>
        <span className="mt-0.5 shrink-0 text-xs font-semibold text-navy opacity-80 group-hover:opacity-100">
          {q.status === "done" ? (q.kind === "full" ? "다시 보기" : "다시 풀기") : "풀기"} →
        </span>
      </Link>
    </li>
  );
}
