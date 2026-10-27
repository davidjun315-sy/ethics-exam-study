"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, extractRegionsTextDetailed, recropQuestion, type RegionTextResult } from "@/lib/admin-client";
import type { QuestionDetail } from "@/lib/data/queries";
import { examShortLabel } from "@/lib/format";
import type { AnalysisStatus, ExamPage, PhilosopherRole, Region, VerificationStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import { ManualAnalysis } from "./ManualAnalysis";

type Scope = "full" | "answer" | "philosophers" | "sources" | "explanation" | "deep";

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// 채팅 AI 로 문항 원문을 정확하게 받아쓰게 하는 프롬프트 (OCR 이 틀리는 기호·그림 겹침 부분까지 정확함)
const DICTATION_PROMPT = `첨부한 이미지는 임용시험 기출 문항입니다. 이미지 속 글을 원문 그대로 받아써 주세요.
- 설명이나 요약 없이 받아쓴 원문만 출력하세요.
- 발문, 제시문, 말풍선·박스 안 글, (가)(나), ㉠㉡ 같은 원문자, 밑줄 표시 위치, <작성 방법>과 ○ 항목까지 빠짐없이 쓰세요.
- 말풍선 앞에는 말하는 사람(예: 교사:, 갑:)을 붙이세요.
- 줄바꿈은 문단 단위로 하고, 지면의 줄바꿈 때문에 끊긴 문장은 이어서 쓰세요.
- 읽을 수 없는 글자는 [?] 로 표시하고 추측하지 마세요.`;

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const csv = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function QuestionEditor({ detail, pages, recropHint }: { detail: QuestionDetail; pages: ExamPage[]; recropHint: boolean }) {
  const router = useRouter();
  const { question: q, exam, analysis: a } = detail;
  const pageImages = Object.fromEntries(pages.filter((p) => p.image_url).map((p) => [p.page_number, p.image_url!]));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(recropHint ? "문항이 합쳐졌습니다. '문항 이미지 다시 만들기'를 눌러 이미지를 갱신하세요." : null);
  const [error, setError] = useState<string | null>(null);

  // ---- 문항 정보 ----
  const [info, setInfo] = useState({
    label: q.label,
    question_number: String(q.question_number),
    sub_question_number: q.sub_question_number ?? "",
    score: q.score === null ? "" : String(q.score),
    question_type: q.question_type ?? "",
    parent_id: q.parent_id ?? "",
    needs_review: q.needs_review,
    question_text: q.question_text ?? "",
  });
  const [regions, setRegions] = useState<Region[]>(q.regions);
  // 영역을 바꾸면 원문 텍스트도 PDF 텍스트 레이어에서 다시 뽑는다. (텍스트 보기 / AI 분석에 쓰임)
  const [syncText, setSyncText] = useState(true);
  // OCR 처럼 오래 걸리는 작업의 진행 상황 (버튼 아래 표시)
  const [progress, setProgress] = useState<string | null>(null);
  const regionTextDetailed = async (rs: Region[], ocr: "auto" | "always" | "never" = "auto"): Promise<RegionTextResult> =>
    exam.pdf_url && rs.length
      ? extractRegionsTextDetailed(exam.pdf_url, rs, { ocr, onProgress: setProgress })
      : { text: "", imageRatio: 0, method: "text" };
  const regionText = async (rs: Region[]) => (await regionTextDetailed(rs)).text;
  // 박스 제시문 등이 그림으로 들어 있을 때의 안내
  const extractNote = (r: RegionTextResult) =>
    r.method === "ocr"
      ? ` 이 영역의 약 ${Math.round(r.imageRatio * 100)}%가 PDF 안에 그림(이미지)으로 들어 있어 OCR 로 읽었습니다. ㉠·㉡ 같은 기호나 일부 글자가 틀릴 수 있으니 확인 후 고쳐 주세요.`
      : r.imageRatio >= 0.15
        ? ` 이 영역에 그림이 있지만 텍스트 레이어로 충분히 읽혀서 OCR 은 쓰지 않았습니다. 빠진 글이 있으면 'OCR 로 다시 읽기'를 누르세요.`
        : "";
  const progressLine = (label: string) =>
    busy === label && progress ? <p className="mt-1 text-xs text-muted">{progress}</p> : null;

  // ---- 분석 ----
  const x = a?.details ?? {};
  const [an, setAn] = useState({
    area: a?.area ?? "",
    school: a?.school ?? "",
    era: a?.era ?? "",
    question_type: a?.question_type ?? "",
    difficulty: a?.difficulty ?? "",
    answer: a?.answer ?? "",
    answer_explanation: a?.answer_explanation ?? "",
    question_intent: a?.question_intent ?? "",
    required_keywords: (a?.required_keywords ?? []).join(", "),
    common_mistakes: (a?.common_mistakes ?? []).join("\n"),
    modelAnswer: x.modelAnswer ?? "",
    details: JSON.stringify(x, null, 2),
    status: (a?.status ?? "pending") as AnalysisStatus,
    philosopher_confidence: a?.philosopher_confidence?.toString() ?? "",
    answer_confidence: a?.answer_confidence?.toString() ?? "",
    source_confidence: a?.source_confidence?.toString() ?? "",
    concept_confidence: a?.concept_confidence?.toString() ?? "",
    overall_confidence: a?.overall_confidence?.toString() ?? "",
  });

  // ---- 태그 ----
  const [phils, setPhils] = useState(detail.philosophers.map((p) => ({ name: p.philosophers.name, role: p.role })));
  const philNameById = new Map(detail.philosophers.map((p) => [p.philosopher_id, p.philosophers.name]));
  const [concepts, setConcepts] = useState(
    detail.concepts.map((c) => ({ name: c.concepts.name, philosopher: c.philosopher_id ? (philNameById.get(c.philosopher_id) ?? "") : "" })),
  );
  const [sources, setSources] = useState(
    detail.sources.map((s) => ({
      title: s.sources?.title ?? s.title_raw ?? "",
      philosopher_name: s.philosopher_name ?? "",
      location: s.location ?? "",
      verification_status: s.verification_status,
      confidence: s.confidence?.toString() ?? "",
      related_content: s.related_content ?? "",
      relation_to_question: s.relation_to_question ?? "",
      quoted_text: s.quoted_text ?? "",
      reasoning: s.reasoning ?? "",
    })),
  );

  // ---- 나누기 ----
  const [split, setSplit] = useState({ regionIndex: 0, yPct: 50, newLabel: `${q.question_number}-2`, newNumber: String(q.question_number), newSub: "2", textA: q.question_text ?? "", textB: "", asChild: false });

  // 결과 메시지를 버튼 바로 옆에도 보여주기 위해 마지막 작업을 기억한다.
  const [lastAction, setLastAction] = useState<string | null>(null);
  const inlineStatus = (label: string) =>
    lastAction === label && busy !== label && (msg || error) ? (
      <p className={`mt-1 rounded px-2 py-1 text-xs ${error ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>{error ?? msg}</p>
    ) : null;

  async function run(label: string, fn: () => Promise<string | void>) {
    setLastAction(label);
    setBusy(label);
    setError(null);
    setMsg(null);
    try {
      const m = await fn();
      if (m) setMsg(m);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const reanalyze = (scope: Scope) =>
    run(`ai-${scope}`, async () => {
      const r = await api<{ message: string }>(`/api/admin/questions/${q.id}/analyze`, "POST", { scope, force: true });
      router.refresh();
      return `${r.message} (화면의 입력값을 새 결과로 보려면 새로고침하세요)`;
    });

  const target = regions[split.regionIndex];
  const splitY = target ? target.y0 + ((target.y1 - target.y0) * split.yPct) / 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/admin/exams/${exam.id}`} className="text-sm text-muted hover:text-navy">← {examShortLabel(exam)} 문항 목록</Link>
          <h1 className="text-2xl font-bold">
            {q.label}번 수정 <StatusBadge status={a?.status} />
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/questions/${q.id}`} className="btn">공부 화면</Link>
          <button
            className="btn-danger"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!confirm("이 문항을 삭제할까요?")) return;
              run("delete", async () => {
                await api(`/api/admin/questions/${q.id}`, "DELETE");
                router.push(`/admin/exams/${exam.id}`);
              });
            }}
          >
            문항 삭제
          </button>
        </div>
      </div>
      {msg && <p className="rounded bg-ok-soft p-3 text-sm text-ok">{msg}</p>}
      {error && <p className="rounded bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      <Section
        title="AI 분석 실행"
        right={a?.model && <span className="text-xs text-faint">{a.provider} / {a.model}</span>}
      >
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={Boolean(busy)} onClick={() => reanalyze("full")}>
            {busy === "ai-full" ? "분석 중…" : a && a.status !== "pending" ? "전체 재분석" : "AI 분석"}
          </button>
          {(["deep", "answer", "philosophers", "sources", "explanation"] as const).map((s) => (
            <button key={s} className="btn" disabled={Boolean(busy) || !a || a.status === "pending"} onClick={() => reanalyze(s)}>
              {busy === `ai-${s}` ? "분석 중…" : { deep: "출제 의도·개념 정리·향후 출제만 재분석", answer: "답안·해설만 재분석", philosophers: "사상가만 재분석", sources: "원전만 재분석", explanation: "원문 해설·오답 분석만 재분석" }[s]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          부분 재분석은 해당 항목만 다시 요청하므로 비용이 적게 듭니다. 관리자가 직접 수정한 사상가·개념·원전 연결은 재분석해도 유지됩니다.
        </p>
      </Section>

      <Section title="셀프 분석 — 채팅 AI 결과 붙여넣기 (API 비용 없음)">
        <ManualAnalysis
          questionId={q.id}
          imageUrl={q.question_image_url}
          onSaved={(m) => {
            setMsg(`${m} 새 결과를 입력 칸에 보려면 새로고침하세요.`);
            setError(null);
            router.refresh();
          }}
        />
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="문항 정보">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className="label">표시 번호</label>
              <input className="input" value={info.label} onChange={(e) => setInfo({ ...info, label: e.target.value })} />
            </div>
            <div>
              <label className="label">문항 번호</label>
              <input className="input" type="number" value={info.question_number} onChange={(e) => setInfo({ ...info, question_number: e.target.value })} />
            </div>
            <div>
              <label className="label">하위 문항</label>
              <input className="input" placeholder="예: 1" value={info.sub_question_number} onChange={(e) => setInfo({ ...info, sub_question_number: e.target.value })} />
            </div>
            <div>
              <label className="label">배점</label>
              <input className="input" type="number" value={info.score} onChange={(e) => setInfo({ ...info, score: e.target.value })} />
            </div>
            <div>
              <label className="label">유형</label>
              <input className="input" placeholder="기입형 / 서술형" value={info.question_type} onChange={(e) => setInfo({ ...info, question_type: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">상위 문항</label>
              <select className="input" value={info.parent_id} onChange={(e) => setInfo({ ...info, parent_id: e.target.value })}>
                <option value="">없음 (독립 문항)</option>
                {detail.siblings.filter((s) => s.id !== q.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}번</option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={info.needs_review} onChange={(e) => setInfo({ ...info, needs_review: e.target.checked })} />
              분리 검토 필요
            </label>
          </div>
          <div className="mt-2">
            <label className="label">원문 텍스트</label>
            <textarea className="input min-h-60 font-mono text-[13px]" value={info.question_text} onChange={(e) => setInfo({ ...info, question_text: e.target.value })} />
            <button
              className="btn mt-1 text-xs"
              disabled={Boolean(busy) || !exam.pdf_url || regions.length === 0}
              onClick={() =>
                run("extract", async () => {
                  const r = await regionTextDetailed(regions, "auto");
                  if (!r.text) throw new Error("영역 안에서 글자를 찾지 못했습니다. 영역 좌표가 문항을 벗어나지 않았는지 확인하세요.");
                  await api(`/api/admin/questions/${q.id}`, "PATCH", { question: { question_text: r.text } });
                  setInfo((cur) => ({ ...cur, question_text: r.text }));
                  return `현재 영역 기준으로 텍스트를 다시 뽑아 저장했습니다. (${r.text.length}자)${extractNote(r)}`;
                })
              }
            >
              {busy === "extract" ? "추출 중…" : "현재 영역 기준으로 텍스트 다시 추출 + 저장"}
            </button>
            <button
              className="btn ml-1 mt-1 text-xs"
              disabled={Boolean(busy) || !exam.pdf_url || regions.length === 0}
              title="텍스트 레이어 대신 문항 이미지를 OCR 로 읽습니다"
              onClick={() =>
                run("ocr", async () => {
                  const r = await regionTextDetailed(regions, "always");
                  if (!r.text) throw new Error("OCR 로도 글자를 읽지 못했습니다.");
                  await api(`/api/admin/questions/${q.id}`, "PATCH", { question: { question_text: r.text } });
                  setInfo((cur) => ({ ...cur, question_text: r.text }));
                  return `OCR 로 읽어 저장했습니다. (${r.text.length}자) ㉠·㉡ 같은 기호나 일부 글자가 틀릴 수 있으니 확인 후 고쳐 주세요.`;
                })
              }
            >
              {busy === "ocr" ? "OCR 중…" : "OCR 로 다시 읽기"}
            </button>
            <button
              className="btn ml-1 mt-1 text-xs"
              title="Claude / ChatGPT / Gemini 채팅에 문항 이미지와 함께 붙여넣으면 원문을 그대로 받아써 줍니다"
              onClick={() =>
                run("dictate", async () => {
                  await navigator.clipboard.writeText(DICTATION_PROMPT);
                  return "받아쓰기 프롬프트를 복사했습니다. 채팅 AI 에 문항 이미지와 함께 붙여넣고, 받은 원문을 위 칸에 붙여넣은 뒤 '문항 정보 저장'을 누르세요.";
                })
              }
            >
              채팅 AI 받아쓰기 프롬프트 복사
            </button>
            {inlineStatus("dictate")}
            {progressLine("extract")}
            {progressLine("ocr")}
            {inlineStatus("ocr")}
            {!exam.pdf_url && <p className="mt-1 text-xs text-faint">원본 PDF 가 없어 텍스트를 추출할 수 없습니다.</p>}
            {inlineStatus("extract")}
          </div>
          <button
            className="btn-primary mt-2"
            disabled={Boolean(busy)}
            onClick={() =>
              run("info", async () => {
                await api(`/api/admin/questions/${q.id}`, "PATCH", {
                  question: {
                    label: info.label,
                    question_number: Number(info.question_number),
                    sub_question_number: info.sub_question_number || null,
                    score: numOrNull(info.score),
                    question_type: info.question_type || null,
                    parent_id: info.parent_id || null,
                    needs_review: info.needs_review,
                    question_text: info.question_text || null,
                  },
                });
                return "문항 정보를 저장했습니다.";
              })
            }
          >
            문항 정보 저장
          </button>
          {inlineStatus("info")}
        </Section>

        <Section title="문항 이미지 / 영역">
          {q.question_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.question_image_url} alt="문항 이미지" className="max-h-96 w-full rounded border border-line bg-white object-contain" />
          ) : (
            <p className="text-sm text-faint">문항 이미지가 없습니다.</p>
          )}
          <p className="mt-3 text-xs text-muted">좌표는 페이지 기준 0~1 비율입니다. 여러 단·페이지에 걸친 문항은 영역을 여러 개 둡니다.</p>
          <div className="mt-2 space-y-2">
            {regions.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1 text-xs">
                <span className="w-6 font-semibold">#{i + 1}</span>
                {(["page", "x0", "y0", "x1", "y1"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1">
                    {k}
                    <input
                      type="number"
                      step={k === "page" ? 1 : 0.005}
                      className="input !w-20 !px-1.5 !py-1 text-xs"
                      value={r[k]}
                      onChange={(e) => setRegions(regions.map((rr, j) => (j === i ? { ...rr, [k]: Number(e.target.value) } : rr)))}
                    />
                  </label>
                ))}
                <button className="btn !px-2 !py-0.5 text-xs" onClick={() => setRegions(regions.filter((_, j) => j !== i))}>삭제</button>
              </div>
            ))}
            <button
              className="btn text-xs"
              onClick={() => setRegions([...regions, { page: regions.at(-1)?.page ?? q.page_start ?? 1, x0: 0.05, y0: 0.1, x1: 0.95, y1: 0.5 }])}
            >
              + 영역 추가
            </button>
          </div>
          <RegionPreview regions={regions} pageImages={pageImages} splitAt={target ? { index: split.regionIndex, y: splitY } : null} />
          <button
            className="btn-primary mt-3"
            disabled={Boolean(busy) || regions.length === 0}
            onClick={() =>
              run("recrop", async () => {
                const [url, extracted] = await Promise.all([
                  recropQuestion(exam.id, q.question_number, regions, pageImages),
                  syncText ? regionTextDetailed(regions) : Promise.resolve<RegionTextResult>({ text: "", imageRatio: 0, method: "text" }),
                ]);
                const text = extracted.text;
                await api(`/api/admin/questions/${q.id}`, "PATCH", {
                  question: {
                    regions,
                    question_image_url: url,
                    page_start: Math.min(...regions.map((r) => r.page)),
                    page_end: Math.max(...regions.map((r) => r.page)),
                    ...(text ? { question_text: text } : {}),
                  },
                });
                if (text) setInfo((cur) => ({ ...cur, question_text: text }));
                const textMsg = !syncText
                  ? ""
                  : text
                    ? " 원문 텍스트도 새 영역 기준으로 바꿨습니다."
                    : " (영역 안에서 텍스트를 찾지 못해 기존 텍스트는 그대로 두었습니다.)";
                const aiMsg = text && a && a.status !== "pending" ? " 문항 내용이 바뀌었다면 AI 분석을 다시 실행하세요." : "";
                return `영역을 저장하고 문항 이미지를 다시 만들었습니다.${textMsg}${aiMsg}${text ? extractNote(extracted) : ""}`;
              })
            }
          >
            {busy === "recrop" ? "저장 중…" : "영역 저장 + 문항 이미지 다시 만들기"}
          </button>
          {progressLine("recrop")}
          {inlineStatus("recrop")}
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={syncText} onChange={(e) => setSyncText(e.target.checked)} />
            원문 텍스트도 영역 기준으로 다시 추출 (직접 고친 텍스트를 지키려면 끄세요)
          </label>

          <details className="mt-4 rounded border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold">문항 나누기</summary>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <label>영역
                  <select className="input !w-auto ml-1" value={split.regionIndex} onChange={(e) => setSplit({ ...split, regionIndex: Number(e.target.value) })}>
                    {regions.map((_, i) => <option key={i} value={i}>#{i + 1}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">자를 위치
                  <input type="range" min={5} max={95} value={split.yPct} onChange={(e) => setSplit({ ...split, yPct: Number(e.target.value) })} />
                  {split.yPct}%
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="label">새 문항 표시 번호</label><input className="input" value={split.newLabel} onChange={(e) => setSplit({ ...split, newLabel: e.target.value })} /></div>
                <div><label className="label">새 문항 번호</label><input className="input" type="number" value={split.newNumber} onChange={(e) => setSplit({ ...split, newNumber: e.target.value })} /></div>
                <div><label className="label">하위 문항 번호</label><input className="input" value={split.newSub} onChange={(e) => setSplit({ ...split, newSub: e.target.value })} /></div>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={split.asChild} onChange={(e) => setSplit({ ...split, asChild: e.target.checked })} /> 새 문항을 이 문항의 하위 문항으로 저장 (예: 3 → 3-1, 3-2)</label>
              <div className="grid gap-2 md:grid-cols-2">
                <div><label className="label">이 문항 텍스트</label><textarea className="input min-h-32 font-mono text-xs" value={split.textA} onChange={(e) => setSplit({ ...split, textA: e.target.value })} /></div>
                <div><label className="label">새 문항 텍스트</label><textarea className="input min-h-32 font-mono text-xs" value={split.textB} onChange={(e) => setSplit({ ...split, textB: e.target.value })} /></div>
              </div>
              <button
                className="btn-primary"
                disabled={Boolean(busy) || !target}
                onClick={() =>
                  run("split", async () => {
                    const regionsA = [...regions.slice(0, split.regionIndex), { ...target!, y1: splitY }];
                    const regionsB = [{ ...target!, y0: splitY }, ...regions.slice(split.regionIndex + 1)];
                    let textA = split.textA;
                    let textB = split.textB;
                    if (syncText) {
                      const [ta, tb] = await Promise.all([regionText(regionsA), regionText(regionsB)]);
                      if (ta) textA = ta;
                      if (tb) textB = tb;
                    }
                    const r = await api<{ question: { id: string; regions: Region[]; question_number: number } }>(`/api/admin/questions/${q.id}/split`, "POST", {
                      regionIndex: split.regionIndex,
                      y: Number(splitY.toFixed(4)),
                      newNumber: Number(split.newNumber),
                      newLabel: split.newLabel,
                      newSubNumber: split.newSub || null,
                      textA,
                      textB,
                      asChild: split.asChild,
                    });
                    // 두 문항 모두 이미지를 다시 만든다.
                    const [urlA, urlB] = await Promise.all([
                      recropQuestion(exam.id, q.question_number, regionsA, pageImages),
                      recropQuestion(exam.id, r.question.question_number, r.question.regions, pageImages),
                    ]);
                    await Promise.all([
                      api(`/api/admin/questions/${q.id}`, "PATCH", { question: { question_image_url: urlA } }),
                      api(`/api/admin/questions/${r.question.id}`, "PATCH", { question: { question_image_url: urlB } }),
                    ]);
                    setRegions(regionsA);
                    setInfo((cur) => ({ ...cur, question_text: textA }));
                    setSplit((cur) => ({ ...cur, textA, textB }));
                    return `문항을 나눴습니다. 새 문항: ${split.newLabel}번`;
                  })
                }
              >
                {busy === "split" ? "나누는 중…" : "나누기"}
              </button>
              {progressLine("split")}
              {inlineStatus("split")}
            </div>
          </details>
        </Section>
      </div>

      <Section
        title="AI 분석 결과 수정"
        right={a?.edited_fields?.length ? <span className="text-xs text-ok">수정된 항목: {a.edited_fields.join(", ")}</span> : null}
      >
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(["area", "school", "era", "question_type"] as const).map((k) => (
            <div key={k}>
              <label className="label">{{ area: "출제 영역", school: "학파", era: "시대", question_type: "문제 유형" }[k]}</label>
              <input className="input" value={an[k]} onChange={(e) => setAn({ ...an, [k]: e.target.value })} />
            </div>
          ))}
          <div>
            <label className="label">난이도</label>
            <select className="input" value={an.difficulty} onChange={(e) => setAn({ ...an, difficulty: e.target.value })}>
              <option value="">-</option>
              <option value="상">상</option>
              <option value="중">중</option>
              <option value="하">하</option>
            </select>
          </div>
          <div>
            <label className="label">상태</label>
            <select className="input" value={an.status} onChange={(e) => setAn({ ...an, status: e.target.value as AnalysisStatus })}>
              <option value="pending">분석 전</option>
              <option value="analyzed">분석 완료</option>
              <option value="needs_review">검토 필요</option>
              <option value="verified">검수 완료</option>
              <option value="error">오류</option>
            </select>
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-5">
          {(["philosopher_confidence", "answer_confidence", "source_confidence", "concept_confidence", "overall_confidence"] as const).map((k) => (
            <div key={k}>
              <label className="label">{{ philosopher_confidence: "사상가", answer_confidence: "정답", source_confidence: "원전", concept_confidence: "개념", overall_confidence: "전체" }[k]} 확신도 (0~1)</label>
              <input className="input" type="number" step={0.01} min={0} max={1} value={an[k]} onChange={(e) => setAn({ ...an, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <div><label className="label">모범답안</label><textarea className="input min-h-40" value={an.modelAnswer} onChange={(e) => setAn({ ...an, modelAnswer: e.target.value })} /></div>
          <div><label className="label">전체 해설</label><textarea className="input min-h-40" value={an.answer_explanation} onChange={(e) => setAn({ ...an, answer_explanation: e.target.value })} /></div>
          <div><label className="label">정답 요약 (채점·검색용, 화면에는 안 보임)</label><textarea className="input min-h-16" value={an.answer} onChange={(e) => setAn({ ...an, answer: e.target.value })} /></div>
          <div><label className="label">채점 키워드 (쉼표로 구분, 화면에는 안 보임)</label><textarea className="input min-h-16" value={an.required_keywords} onChange={(e) => setAn({ ...an, required_keywords: e.target.value })} /></div>
          <div><label className="label">자주 하는 실수 — 오답 분석 (한 줄에 하나)</label><textarea className="input min-h-16" value={an.common_mistakes} onChange={(e) => setAn({ ...an, common_mistakes: e.target.value })} /></div>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-muted">상세 분석 JSON (요구 사항별 해설, 원문 해설, 출제 의도, 예상 문제 등)</summary>
          <textarea className="input mt-2 min-h-72 font-mono text-xs" value={an.details} onChange={(e) => setAn({ ...an, details: e.target.value })} />
        </details>
        <button
          className="btn-primary mt-3"
          disabled={Boolean(busy)}
          onClick={() =>
            run("analysis", async () => {
              let details: Record<string, unknown>;
              try {
                details = JSON.parse(an.details || "{}");
              } catch {
                throw new Error("상세 분석 JSON 형식이 올바르지 않습니다.");
              }
              details.modelAnswer = an.modelAnswer;
              await api(`/api/admin/questions/${q.id}`, "PATCH", {
                analysis: {
                  area: an.area || null,
                  school: an.school || null,
                  era: an.era || null,
                  question_type: an.question_type || null,
                  difficulty: (an.difficulty || null) as "상" | "중" | "하" | null,
                  answer: an.answer || null,
                  answer_explanation: an.answer_explanation || null,
                  question_intent: an.question_intent || null,
                  required_keywords: csv(an.required_keywords),
                  common_mistakes: lines(an.common_mistakes),
                  details,
                  status: an.status,
                  philosopher_confidence: numOrNull(an.philosopher_confidence),
                  answer_confidence: numOrNull(an.answer_confidence),
                  source_confidence: numOrNull(an.source_confidence),
                  concept_confidence: numOrNull(an.concept_confidence),
                  overall_confidence: numOrNull(an.overall_confidence),
                },
              });
              return "분석 결과를 저장했습니다. (AI 원본은 별도로 보존됩니다)";
            })
          }
        >
          분석 저장
        </button>
      </Section>

      <Section title="사상가 · 개념 · 원전 연결 수정">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-bold text-muted">사상가 (역할)</h3>
            {phils.map((p, i) => (
              <div key={i} className="mb-1 flex gap-1">
                <input className="input" value={p.name} onChange={(e) => setPhils(phils.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <select className="input !w-32" value={p.role} onChange={(e) => setPhils(phils.map((x, j) => (j === i ? { ...x, role: e.target.value as PhilosopherRole } : x)))}>
                  <option value="main">main 주요</option>
                  <option value="comparison">comparison 비교</option>
                  <option value="distractor">distractor 오답</option>
                  <option value="mentioned">mentioned 언급</option>
                </select>
                <button className="btn" onClick={() => setPhils(phils.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="btn text-xs" onClick={() => setPhils([...phils, { name: "", role: "main" }])}>+ 사상가</button>

            <h3 className="mb-2 mt-4 text-xs font-bold text-muted">개념 (어느 사상가의 개념인지)</h3>
            {concepts.map((c, i) => (
              <div key={i} className="mb-1 flex gap-1">
                <input className="input" placeholder="개념" value={c.name} onChange={(e) => setConcepts(concepts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input !w-32" placeholder="사상가" value={c.philosopher} onChange={(e) => setConcepts(concepts.map((x, j) => (j === i ? { ...x, philosopher: e.target.value } : x)))} />
                <button className="btn" onClick={() => setConcepts(concepts.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="btn text-xs" onClick={() => setConcepts([...concepts, { name: "", philosopher: "" }])}>+ 개념</button>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold text-muted">원전</h3>
            {sources.map((s, i) => {
              const set = (patch: Partial<typeof s>) => setSources(sources.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="mb-2 space-y-1 rounded border border-line p-2">
                  <div className="flex gap-1">
                    <input className="input" placeholder="원전명 (예: 전습록)" value={s.title} onChange={(e) => set({ title: e.target.value })} />
                    <input className="input !w-28" placeholder="사상가" value={s.philosopher_name} onChange={(e) => set({ philosopher_name: e.target.value })} />
                    <button className="btn" onClick={() => setSources(sources.filter((_, j) => j !== i))}>×</button>
                  </div>
                  <div className="flex gap-1">
                    <input className="input" placeholder="장 / 편 / 권 (모르면 비워두기)" value={s.location} onChange={(e) => set({ location: e.target.value })} />
                    <select className="input !w-32" value={s.verification_status} onChange={(e) => set({ verification_status: e.target.value as VerificationStatus })}>
                      <option value="confirmed">confirmed</option>
                      <option value="likely">likely</option>
                      <option value="candidate">candidate</option>
                      <option value="unknown">unknown</option>
                    </select>
                    <input className="input !w-20" type="number" step={0.01} min={0} max={1} placeholder="0~1" value={s.confidence} onChange={(e) => set({ confidence: e.target.value })} />
                  </div>
                  <textarea className="input min-h-12 text-xs" placeholder="출제된 문장" value={s.quoted_text} onChange={(e) => set({ quoted_text: e.target.value })} />
                  <textarea className="input min-h-12 text-xs" placeholder="관련 내용" value={s.related_content} onChange={(e) => set({ related_content: e.target.value })} />
                  <textarea className="input min-h-12 text-xs" placeholder="제시문과의 관계" value={s.relation_to_question} onChange={(e) => set({ relation_to_question: e.target.value })} />
                  <textarea className="input min-h-12 text-xs" placeholder="판단 근거" value={s.reasoning} onChange={(e) => set({ reasoning: e.target.value })} />
                </div>
              );
            })}
            <button
              className="btn text-xs"
              onClick={() =>
                setSources([...sources, { title: "", philosopher_name: "", location: "", verification_status: "confirmed", confidence: "1", related_content: "", relation_to_question: "", quoted_text: "", reasoning: "관리자 확인" }])
              }
            >
              + 원전
            </button>
          </div>
        </div>
        <button
          className="btn-primary mt-3"
          disabled={Boolean(busy)}
          onClick={() =>
            run("tags", async () => {
              await api(`/api/admin/questions/${q.id}/tags`, "PUT", {
                philosophers: phils.filter((p) => p.name.trim()),
                concepts: concepts.filter((c) => c.name.trim()).map((c) => ({ name: c.name, philosopher: c.philosopher.trim() || null })),
                sources: sources
                  .filter((s) => s.title.trim() || s.quoted_text.trim())
                  .map((s) => ({
                    title: s.title.trim() || null,
                    philosopher_name: s.philosopher_name.trim() || null,
                    location: s.location.trim() || null,
                    verification_status: s.verification_status,
                    confidence: numOrNull(s.confidence),
                    related_content: s.related_content || null,
                    relation_to_question: s.relation_to_question || null,
                    quoted_text: s.quoted_text || null,
                    reasoning: s.reasoning || null,
                  })),
              });
              return "사상가·개념·원전 연결을 저장했습니다. (관리자 확인으로 표시됩니다)";
            })
          }
        >
          연결 저장
        </button>
      </Section>

      {a?.ai_original != null && (
        <Section title="AI 최초(최신) 분석 원본">
          <details>
            <summary className="cursor-pointer text-sm text-muted">JSON 보기 — 관리자 수정과 별도로 보존됩니다</summary>
            <pre className="mt-2 max-h-[32rem] overflow-auto rounded bg-surface-2 p-3 text-xs">{JSON.stringify(a.ai_original, null, 2)}</pre>
          </details>
        </Section>
      )}
    </div>
  );
}

function RegionPreview({
  regions,
  pageImages,
  splitAt,
}: {
  regions: Region[];
  pageImages: Record<number, string>;
  splitAt: { index: number; y: number } | null;
}) {
  const pagesUsed = [...new Set(regions.map((r) => r.page))];
  if (pagesUsed.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {pagesUsed.map((p) =>
        pageImages[p] ? (
          <div key={p} className="relative overflow-hidden rounded border border-line bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pageImages[p]} alt={`${p}쪽`} className="block w-full" />
            {regions.map((r, i) =>
              r.page === p ? (
                <div
                  key={i}
                  className="absolute border-2 border-[#1f3a68] bg-[#1f3a68]/10"
                  style={{ left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`, width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%` }}
                >
                  <span className="absolute left-0 top-0 bg-[#1f3a68] px-1 text-[10px] text-white">#{i + 1}</span>
                  {splitAt && splitAt.index === i && (
                    <div className="absolute left-0 right-0 border-t-2 border-dashed border-[#b42318]" style={{ top: `${((splitAt.y - r.y0) / (r.y1 - r.y0)) * 100}%` }} />
                  )}
                </div>
              ) : null,
            )}
            <span className="absolute bottom-0 right-0 bg-black/50 px-1 text-[10px] text-white">{p}쪽</span>
          </div>
        ) : (
          <div key={p} className="rounded border border-dashed border-line p-4 text-xs text-faint">{p}쪽 이미지 없음</div>
        ),
      )}
    </div>
  );
}
