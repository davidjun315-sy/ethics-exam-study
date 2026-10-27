"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, processExamPdf, type ProcessProgress } from "@/lib/admin-client";
import type { QuestionSummary } from "@/lib/data/queries";
import { examFullLabel, formatBytes, pct } from "@/lib/format";
import type { Exam, ExamPage } from "@/lib/types";
import { Badge, ConfidenceBadge, StatusBadge } from "@/components/ui";
import { ProgressBar } from "./ProgressBar";

type Scope = "full" | "answer" | "philosophers" | "sources" | "explanation" | "deep";
const SCOPES: { scope: Scope; label: string }[] = [
  { scope: "full", label: "전체 재분석" },
  { scope: "deep", label: "출제 의도·향후 출제만" },
  { scope: "answer", label: "답안·해설만" },
  { scope: "philosophers", label: "사상가만" },
  { scope: "sources", label: "원전만" },
  { scope: "explanation", label: "원문 해설·오답 분석만" },
];

export function ExamAdmin({
  exam,
  pages,
  questions,
  justSegmented,
}: {
  exam: Exam;
  pages: ExamPage[];
  questions: QuestionSummary[];
  justSegmented: number | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    exam_year: exam.exam_year,
    exam_name: exam.exam_name,
    subject: exam.subject,
    section: exam.section ?? "",
    note: exam.note ?? "",
  });
  const [msg, setMsg] = useState<string | null>(justSegmented !== null ? `${justSegmented}개 문항을 자동으로 분리했습니다. 문항 영역을 확인하세요.` : null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [busyLabel, setBusy] = useState<string | null>(null);
  // 서버에서 새 목록을 받아올 때까지도 작업 중으로 본다 (순서 변경 직후 예전 순서가 잠깐 보이지 않도록)
  const [refreshing, startTransition] = useTransition();
  const busy = busyLabel ?? (refreshing ? "refresh" : null);
  const [rowState, setRowState] = useState<Record<string, string>>({});
  // 직접 추가할 문항 번호: 기본값은 빠진 번호 중 가장 작은 것 (예: 1, 3, 4 가 있으면 2)
  const usedNumbers = new Set(questions.map((q) => q.question_number));
  const firstMissing = (() => {
    let n = 1;
    while (usedNumbers.has(n)) n++;
    return n;
  })();
  const [addNumber, setAddNumber] = useState<string>("");
  // 화면 순서가 문항 번호순과 다른지 (직접 추가·나누기 후)
  const outOfOrder = questions.some((q, i) => i > 0 && q.question_number < questions[i - 1].question_number);

  function move(index: number, delta: -1 | 1) {
    const order = questions.map((q) => q.id);
    const j = index + delta;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    return run("order", async () => {
      await api(`/api/admin/exams/${exam.id}/order`, "POST", { mode: "manual", order });
    });
  }
  const scanned = pages.length > 0 && pages.every((p) => !p.has_text_layer);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setMsg(null);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function analyze(q: QuestionSummary, scope: Scope, force: boolean) {
    setRowState((s) => ({ ...s, [q.id]: "분석 중…" }));
    try {
      const r = await api<{ status: string; message: string }>(`/api/admin/questions/${q.id}/analyze`, "POST", { scope, force });
      setRowState((s) => ({ ...s, [q.id]: r.status === "skipped" ? "건너뜀(이미 분석됨)" : "완료" }));
    } catch (e) {
      setRowState((s) => ({ ...s, [q.id]: `오류: ${e instanceof Error ? e.message : String(e)}` }));
      throw e;
    }
  }

  const pending = questions.filter((q) => !q.analysis || q.analysis.status === "pending" || q.analysis.status === "error");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin" className="text-sm text-muted hover:text-navy">← 관리자</Link>
          <h1 className="text-2xl font-bold">{examFullLabel(exam)}</h1>
          <p className="text-sm text-muted">
            {exam.page_count ?? "-"}쪽 · {formatBytes(exam.pdf_size)} · 문항 {questions.length}개 {scanned && <Badge tone="warn">스캔 PDF</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/exams/${exam.id}`} className="btn">공개 화면</Link>
          {exam.pdf_url && <a href={exam.pdf_url} target="_blank" rel="noreferrer" className="btn">PDF</a>}
          <button
            className="btn-danger"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!confirm("시험을 삭제하면 모든 문항, 분석, 이미지가 삭제됩니다. 계속할까요?")) return;
              run("delete", async () => {
                await api(`/api/admin/exams/${exam.id}`, "DELETE");
                router.push("/admin");
              });
            }}
          >
            시험 삭제
          </button>
        </div>
      </div>

      {msg && <p className="rounded bg-ok-soft p-3 text-sm text-ok">{msg}</p>}
      {error && <p className="rounded bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <form
            className="card space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              run("save", async () => {
                await api(`/api/admin/exams/${exam.id}`, "PATCH", {
                  ...form,
                  exam_year: Number(form.exam_year),
                  section: form.section || null,
                  note: form.note || null,
                });
                setMsg("시험 정보를 저장했습니다.");
              });
            }}
          >
            <h2 className="text-sm font-bold">시험 수정</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">학년도</label>
                <input type="number" className="input" value={form.exam_year} onChange={(e) => setForm({ ...form, exam_year: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">구분</label>
                <select className="input" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
                  <option value="A">전공 A</option>
                  <option value="B">전공 B</option>
                  <option value="">없음</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">시험명</label>
              <input className="input" value={form.exam_name} onChange={(e) => setForm({ ...form, exam_name: e.target.value })} />
            </div>
            <div>
              <label className="label">과목</label>
              <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <label className="label">비고</label>
              <textarea className="input min-h-16" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <button className="btn-primary" disabled={Boolean(busy)}>저장</button>
          </form>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-bold">페이지 분석 / 문항 자동 분리</h2>
            <p className="text-xs text-muted">
              PDF 를 브라우저에서 렌더링해 페이지 이미지와 텍스트 레이어를 추출하고, 2단 편집을 고려해 문항을 나눕니다.
              다시 실행하면 <b>기존 문항과 분석이 모두 삭제</b>됩니다.
            </p>
            <button
              className="btn"
              disabled={Boolean(busy) || !exam.pdf_url}
              onClick={() => {
                if (questions.length > 0 && !confirm(`기존 문항 ${questions.length}개와 분석 결과가 삭제됩니다. 계속할까요?`)) return;
                run("segment", async () => {
                  const r = await processExamPdf(exam.id, exam.pdf_url!, setProgress);
                  setMsg(`${r.saved}개 문항을 분리했습니다.${r.warnings.length ? ` 경고: ${r.warnings.join(" / ")}` : ""}`);
                });
              }}
            >
              {questions.length ? "페이지 분석 다시 실행" : "페이지 분석 실행"}
            </button>
            <ProgressBar p={progress} />
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                className="input !w-20"
                aria-label="추가할 문항 번호"
                placeholder={String(firstMissing)}
                value={addNumber}
                onChange={(e) => setAddNumber(e.target.value)}
              />
              <span className="text-sm text-muted">번</span>
              <button
                className="btn"
                disabled={Boolean(busy)}
                onClick={() =>
                  run("add", async () => {
                    const n = Number(addNumber || firstMissing);
                    const r = await api<{ question: { id: string } }>("/api/admin/questions", "POST", {
                      exam_id: exam.id,
                      question_number: n,
                      label: String(n),
                    });
                    router.push(`/admin/questions/${r.question.id}`);
                  })
                }
              >
                문항 직접 추가
              </button>
            </div>
            <p className="text-xs text-muted">추가한 문항은 번호에 맞는 자리에 들어갑니다. 비워 두면 빠진 번호({firstMissing}번)로 추가합니다.</p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-bold">AI 분석</h2>
            <p className="text-xs text-muted">
              이미 분석된 문항은 자동으로 다시 분석하지 않습니다. (비용 절감) 분석 대기: <b>{pending.length}</b>문항
            </p>
            <button
              className="btn-primary"
              disabled={Boolean(busy) || pending.length === 0}
              onClick={() =>
                run("analyze-all", async () => {
                  let ok = 0;
                  const failed: string[] = [];
                  for (let i = 0; i < pending.length; i++) {
                    setProgress({ step: `${pending[i].label}번 분석 중 (${i + 1}/${pending.length})`, done: i, total: pending.length });
                    try {
                      await analyze(pending[i], "full", false);
                      ok++;
                    } catch {
                      failed.push(pending[i].label);
                    }
                  }
                  setMsg(`${ok}개 문항 분석 완료${failed.length ? ` · 실패: ${failed.join(", ")}번` : ""}`);
                })
              }
            >
              분석 안 된 문항 모두 분석
            </button>
          </section>

          {pages.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-bold">페이지 ({pages.length})</h2>
              <div className="grid grid-cols-4 gap-2">
                {pages.map((p) =>
                  p.image_url ? (
                    <a key={p.id} href={p.image_url} target="_blank" rel="noreferrer" title={`${p.page_number}쪽${p.has_text_layer ? "" : " (텍스트 없음)"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image_url} alt={`${p.page_number}쪽`} className={`rounded border ${p.has_text_layer ? "border-line" : "border-warn"}`} loading="lazy" />
                      <span className="text-xs text-muted">{p.page_number}</span>
                    </a>
                  ) : null,
                )}
              </div>
            </section>
          )}
        </div>

        <section className="card overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <span className="text-sm font-semibold">문항 순서</span>
            {outOfOrder && <span className="text-xs text-warn">⚠ 번호순과 다른 순서가 있습니다</span>}
            <button
              className={outOfOrder ? "btn-primary !py-1 text-xs" : "btn !py-1 text-xs"}
              disabled={Boolean(busy) || questions.length < 2}
              onClick={() =>
                run("order", async () => {
                  await api(`/api/admin/exams/${exam.id}/order`, "POST", { mode: "byNumber" });
                  setMsg("문항 번호순으로 정렬했습니다.");
                })
              }
            >
              {busy === "order" ? "정렬 중…" : "번호순 정렬"}
            </button>
            <span className="text-xs text-faint">▲▼ 로 한 칸씩 옮길 수도 있습니다. 공부 화면의 이전/다음 문항 순서에도 반영됩니다.</span>
          </div>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-muted">
              <tr>
                <th className="w-10 px-2 py-2 font-medium">순서</th>
                <th className="px-3 py-2 font-medium">문항</th>
                <th className="px-3 py-2 font-medium">페이지</th>
                <th className="px-3 py-2 font-medium">사상가 / 정답</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {questions.map((q, i) => (
                <tr key={q.id}>
                  <td className="px-2 py-2">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        className="rounded px-1.5 text-xs text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                        disabled={Boolean(busy) || i === 0}
                        onClick={() => move(i, -1)}
                        aria-label={`${q.label}번 위로`}
                      >
                        ▲
                      </button>
                      <button
                        className="rounded px-1.5 text-xs text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                        disabled={Boolean(busy) || i === questions.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={`${q.label}번 아래로`}
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/questions/${q.id}`} className="font-bold text-navy hover:underline">{q.label}번</Link>
                    <div className="text-xs text-muted">{q.score !== null ? `${q.score}점` : "배점 ?"} {q.question_type ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 text-muted tabular-nums">{q.page_start ?? "-"}{q.page_end && q.page_end !== q.page_start ? `–${q.page_end}` : ""}</td>
                  <td className="max-w-xs px-3 py-2">
                    <div className="font-medium">{q.philosophers.filter((p) => p.role === "main").map((p) => p.name).join(", ") || "-"}</div>
                    <div className="line-clamp-2 text-xs text-muted">{q.analysis?.answer ?? q.question_text?.slice(0, 80) ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={q.analysis?.status} />
                      {q.analysis && <ConfidenceBadge value={q.analysis.overall_confidence} />}
                      {q.analysis && q.analysis.source_confidence !== null && q.analysis.source_confidence < 0.6 && (
                        <Badge tone="warn">원전 {pct(q.analysis.source_confidence)}</Badge>
                      )}
                    </div>
                    {rowState[q.id] && <div className="mt-1 text-xs text-muted">{rowState[q.id]}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {!q.analysis || q.analysis.status === "pending" || q.analysis.status === "error" ? (
                        <>
                          <button className="btn-primary !px-2 !py-1 text-xs" disabled={Boolean(busy)} onClick={() => run("a", () => analyze(q, "full", false))}>
                            AI 분석
                          </button>
                          <Link href={`/admin/questions/${q.id}`} className="btn !px-2 !py-1 text-xs" title="채팅 AI 결과 붙여넣기">
                            셀프 분석
                          </Link>
                        </>
                      ) : (
                        <select
                          className="input !w-auto !py-1 text-xs"
                          value=""
                          disabled={Boolean(busy)}
                          onChange={(e) => {
                            const s = e.target.value as Scope;
                            if (!s) return;
                            if (s === "full" && !confirm("전체 재분석하면 AI 분석 결과가 새로 바뀝니다. (관리자가 수정한 사상가·개념·원전 연결은 유지)")) return;
                            run("a", () => analyze(q, s, true));
                          }}
                        >
                          <option value="">재분석…</option>
                          {SCOPES.map((s) => (
                            <option key={s.scope} value={s.scope}>{s.label}</option>
                          ))}
                        </select>
                      )}
                      {i < questions.length - 1 && (
                        <button
                          className="btn !px-2 !py-1 text-xs"
                          disabled={Boolean(busy)}
                          title="다음 문항을 이 문항에 합칩니다"
                          onClick={() => {
                            if (!confirm(`${q.label}번과 ${questions[i + 1].label}번을 합칠까요? 문항 이미지는 문항 수정 화면에서 다시 생성하세요.`)) return;
                            run("merge", async () => {
                              await api(`/api/admin/questions/${q.id}/merge`, "POST", { otherId: questions[i + 1].id });
                              router.push(`/admin/questions/${q.id}?recrop=1`);
                            });
                          }}
                        >
                          ↓ 다음과 합치기
                        </button>
                      )}
                      <button
                        className="btn-danger !px-2 !py-1 text-xs"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          if (!confirm(`${q.label}번 문항을 삭제할까요?`)) return;
                          run("del", async () => {
                            await api(`/api/admin/questions/${q.id}`, "DELETE");
                          });
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {questions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">문항이 없습니다. 페이지 분석을 실행하세요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
