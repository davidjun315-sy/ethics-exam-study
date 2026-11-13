import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, ChevronRight, Gift, RotateCcw } from "lucide-react";
import { currentLearner } from "@/lib/quiz/learn";
import { getConquestDetail, type ConquestProgress } from "@/lib/quiz/fun";
import { CONQUEST_RARITY_NAME, CONQUEST_TRACK_NAMES, type ConquestTrack } from "@/lib/quiz/fun-core";
import { Ring, TIER_TONE, TierLine } from "@/components/quiz/ConquestMap";

export const metadata = { title: "사상가 기출문제 · 정복 지도" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 한 번에 풀 수 있는 문제 수 (세션 최대) */
const BATCH = 20;
const FORMAT: Record<string, string> = { fill: "기입형", essay: "서술형" };

interface RowData {
  key: string;
  href: string;
  ref: string;
  tag: string;
  preview: string;
  status: "done" | "wrong" | "new";
  note: string | null;
}

/** 사상가 한 명의 기출문제: 완전 기출 / 부분 기출 (따로 세고 따로 보상) */
export default async function ConquestDetailPage({ params, searchParams }: PageProps<"/quiz/map/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const learner = await currentLearner();
  if (!learner) redirect(`/login?next=/quiz/map/${id}`);
  const d = await getConquestDetail(learner, id);
  if (!d) notFound();
  const track: ConquestTrack = sp.track === "part" ? "part" : "full";
  const { tile } = d;
  const back = encodeURIComponent(`/quiz/map/${id}`);
  const play = (ids: string[]) => `/quiz/play?mode=free&ids=${ids.join(",")}&from=${back}`;

  // 갈래별 줄 · 바로 풀 문제 (틀린 적 있는 것부터)
  const rows: RowData[] =
    track === "full"
      ? d.questions.map((q) => ({
          key: q.id,
          href: `/questions/${q.questionId}`,
          ref: q.ref,
          tag: q.score !== null ? `문항 전체 · ${q.score}점` : "문항 전체",
          preview: q.preview,
          status: q.status,
          note: q.status === "wrong" ? `${q.attempts}번 시도${q.bestScore !== null ? ` · 최고 ${Math.round(q.bestScore)}점` : ""} · 아직 못 맞힘` : null,
        }))
      : d.parts.map((q) => ({
          key: q.id,
          href: play([q.id]),
          ref: q.ref,
          tag: FORMAT[q.format] ?? q.format,
          preview: q.preview,
          status: q.status,
          note: q.status === "wrong" ? `${q.attempts}번 시도 · 아직 못 맞힘` : null,
        }));
  const queue =
    track === "full"
      ? [...d.questions.filter((q) => q.status === "wrong"), ...d.questions.filter((q) => q.status === "new")].map((q) => q.quizItemId).filter((x): x is string => Boolean(x))
      : [...d.parts.filter((q) => q.status === "wrong"), ...d.parts.filter((q) => q.status === "new")].map((q) => q.id);
  const left = rows.filter((r) => r.status !== "done");
  const done = rows.filter((r) => r.status === "done");
  const unit = track === "full" ? "문항" : "문제";
  const cur = track === "full" ? tile.whole : tile.part;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/quiz/map" className="text-xs text-muted hover:text-navy">
        ← 사상가 정복 지도
      </Link>

      {/* 요약: 두 갈래 */}
      <section className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <Ring t={{ ...cur, artUrl: tile.artUrl, name: tile.name }} size={72} />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">{tile.name}</h1>
          <Summary label="완전 기출" unit="문항" x={tile.whole} min={d.min} />
          <Summary label="부분 기출" unit="문제" x={tile.part} min={d.min} />
        </div>
      </section>

      {/* 갈래 고르기 */}
      <nav className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1" aria-label="정복 갈래">
        {(["full", "part"] as const).map((k) => {
          const x = k === "full" ? tile.whole : tile.part;
          return (
            <Link key={k} href={k === "part" ? `/quiz/map/${id}?track=part` : `/quiz/map/${id}`} aria-current={track === k ? "page" : undefined} className={`rounded-lg px-3 py-2 text-center text-sm font-bold ${track === k ? "bg-navy text-on-accent" : "text-muted hover:bg-surface-2"}`} data-track={k}>
              {CONQUEST_TRACK_NAMES[k]}
              <span className="ml-1.5 text-[11px] font-normal opacity-80">
                {x.done}/{x.total}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1 font-bold">
          <Gift className="h-3.5 w-3.5 text-[#c99a2e]" aria-hidden /> 보상
        </span>
        <TierLine track={track} />
      </div>
      <p className="-mt-2 text-[11px] leading-relaxed text-faint">
        {track === "full"
          ? "기출 문항 전체를 풉니다. 윤리 퀴즈 '실전만 · 완전 기출'에서 맞히거나, 기출문제 탭에서 AI 채점 '완벽하게 맞힘' 또는 첨삭 · 모범답안과 비교해 '다 맞혔어요'를 누르면 정복입니다. 줄을 누르면 기출문제 탭의 그 문항이 열립니다."
          : "윤리 퀴즈에서 문항을 빈칸·요구 사항별로 나눈 문제입니다. 한 번 맞히면 정복이고, 줄을 누르면 그 문제를 바로 풉니다."}{" "}
        두 사상가 이상이 함께 나온 연계 문항은 모두에게 함께 셉니다.
        {track === "full" && !d.fullReady && " (기출문제 탭 기록은 관리자가 업데이트(SQL 022)를 적용하면 남습니다.)"}
        {track === "full" && !d.tracksReady && " (완전 기출 보상은 관리자가 업데이트(SQL 024)를 적용하면 받을 수 있습니다.)"}
      </p>

      {queue.length > 0 && (
        <Link href={play(queue.slice(0, BATCH))} className="btn-primary flex w-full justify-center py-2.5 text-sm font-bold">
          남은 {CONQUEST_TRACK_NAMES[track]} {Math.min(queue.length, BATCH)}
          {unit} 윤리 퀴즈로 풀기 <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      )}

      <section aria-labelledby="left-h">
        <h2 id="left-h" className="mb-2 flex items-baseline gap-2 text-base font-bold">
          아직 정복 못한 {unit} <span className="text-sm font-semibold text-muted">{left.length}</span>
        </h2>
        {left.length === 0 ? (
          <p className="card p-5 text-center text-sm text-muted">{rows.length ? `모든 ${CONQUEST_TRACK_NAMES[track]}을 정복했습니다 🎉` : `이 사상가의 ${CONQUEST_TRACK_NAMES[track]}이 아직 없습니다.`}</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden" data-conquest-list="left">
            {left.map((r) => (
              <Row key={r.key} r={r} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="done-h">
        <h2 id="done-h" className="mb-2 flex items-baseline gap-2 text-base font-bold">
          정복한 {unit} <span className="text-sm font-semibold text-muted">{done.length}</span>
        </h2>
        {done.length === 0 ? (
          <p className="card p-5 text-center text-sm text-muted">아직 정복한 {unit}이 없습니다. 위 목록에서 하나씩 풀어 보세요.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden" data-conquest-list="done">
            {done.map((r) => (
              <Row key={r.key} r={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 요약 한 줄: 진행 + 보상 */
function Summary({ label, unit, x, min }: { label: string; unit: string; x: ConquestProgress; min: number }) {
  const left = Math.max(0, x.total - x.done);
  return (
    <p className="text-sm text-muted">
      <b className="text-ink">{label}</b> {x.done}/{x.total}
      {x.total > 0 && (left ? ` · 남은 ${left}${unit}` : " · 정복 완료!")}
      <span className="ml-1.5 inline-flex items-center gap-1 text-xs">
        <Gift className="h-3 w-3 text-[#c99a2e]" aria-hidden />
        {x.rarity ? (
          <>
            <b className={TIER_TONE[x.rarity]}>{CONQUEST_RARITY_NAME[x.rarity]}</b>
            {x.reward === "claimed" ? " 받음" : x.reward === "claimable" ? " 받기 가능" : x.reward === "unavailable" ? " (카드 공개 전)" : ""}
          </>
        ) : (
          <span className="text-faint">
            {min}
            {unit}↑부터
          </span>
        )}
      </span>
    </p>
  );
}

function Row({ r }: { r: RowData }) {
  const state =
    r.status === "done"
      ? { icon: <Check className="h-3.5 w-3.5" aria-hidden />, cls: "bg-[#ffd36b] text-[#3a2600]", label: "정복" }
      : r.status === "wrong"
        ? { icon: <RotateCcw className="h-3.5 w-3.5" aria-hidden />, cls: "bg-danger-soft text-danger", label: "다시 도전" }
        : { icon: <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />, cls: "bg-surface-2 text-faint", label: "안 푼 문제" };
  return (
    <li>
      <Link href={r.href} className="group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-surface-2/60 sm:px-4" data-status={r.status}>
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${state.cls}`} title={state.label}>
          {state.icon}
          <span className="sr-only">{state.label}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <b className="text-sm">{r.ref}</b>
            <span className="text-[11px] text-muted">{r.tag}</span>
            {r.note && <span className="text-[11px] font-semibold text-danger">{r.note}</span>}
          </span>
          {r.preview && <span className={`mt-0.5 line-clamp-2 text-[13px] leading-snug ${r.status === "done" ? "text-faint" : "text-muted"}`}>{r.preview}</span>}
        </span>
        <span className="mt-0.5 shrink-0 text-xs font-semibold text-navy opacity-80 group-hover:opacity-100">{r.status === "done" ? "다시 보기" : "풀기"} →</span>
      </Link>
    </li>
  );
}
