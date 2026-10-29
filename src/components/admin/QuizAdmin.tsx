"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/admin-client";
import type { AdminItem, QuizSettings, ReportRow, SyncResult } from "@/lib/quiz/bank";
import { TRADITIONS } from "@/lib/traditions";
import { Badge } from "@/components/ui";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  return { busy: busy ?? (pending ? "refresh" : null), msg, run };
}

const Msg = ({ msg }: { msg: { ok: boolean; text: string } | null }) =>
  msg ? <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span> : null;

export function SyncButton() {
  const { busy, msg, run } = useAction();
  return (
    <>
      <button
        className="btn-primary"
        disabled={Boolean(busy)}
        onClick={() =>
          run("sync", async () => {
            const r = await api<SyncResult>("/api/admin/quiz/sync", "POST");
            return `새 문제 ${r.created}개 (예상 문제 ${r.expected}) · 갱신 ${r.updated} · 원본 변경(수정 문제) ${r.changed} · 출제 중지 ${r.stale}${r.duplicates ? ` · 중복 의심 ${r.duplicates}` : ""}`;
          })
        }
      >
        {busy === "sync" ? "동기화 중…" : "문제은행 동기화"}
      </button>
      <Msg msg={msg} />
    </>
  );
}

/** 서술형 AI 첨삭 연결 테스트 */
export function AiTestButton() {
  const { busy, msg, run } = useAction();
  return (
    <>
      <button
        className="btn"
        disabled={Boolean(busy)}
        onClick={() =>
          run("ai", async () => {
            const r = await api<{ model: string; displayName: string | null }>("/api/admin/quiz/ai-test", "POST");
            return `연결 성공 · 키 정상 · 모델 ${r.displayName ? `${r.displayName} (${r.model})` : r.model}`;
          })
        }
      >
        {busy === "ai" ? "확인 중…" : "연결 테스트"}
      </button>
      <Msg msg={msg} />
    </>
  );
}

const STATUS_TONE = { approved: "ok", pending: "warn", hidden: "neutral", stale: "neutral" } as const;
const STATUS_LABEL = { approved: "공개", pending: "승인 대기", hidden: "비공개", stale: "출제 중지" } as const;

function ItemCard({ it, checked, onCheck }: { it: AdminItem; checked: boolean; onCheck: (v: boolean) => void }) {
  const { busy, msg, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({
    label: it.label,
    format: it.format,
    grading: it.grading,
    prompt: it.prompt ?? "",
    passage: it.passage ?? "",
    answer: it.answer ?? "",
    accepted: it.accepted_answers.join("\n"),
    explanation: it.explanation ?? "",
    difficulty: it.difficulty,
    area: it.area ?? "",
  });
  const patch = (body: Record<string, unknown>, label: string, text: string) =>
    run(label, async () => {
      await api(`/api/admin/quiz/items/${it.id}`, "PATCH", body);
      return text;
    });

  return (
    <li className={`card p-4 ${it.status === "stale" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label="선택" className="mr-1" />
        <Badge tone={it.kind === "exam" ? "navy" : "warn"}>{it.kind === "exam" ? "실제 기출" : "AI 예상"}</Badge>
        <Badge tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</Badge>
        <Badge>{it.format === "fill" ? "기입형" : "서술형"}</Badge>
        <Badge>{it.grading === "auto" ? "자동 채점" : "자기평가"}</Badge>
        {it.ref && (
          <Link href={`/questions/${it.question_id}`} className="text-sm font-semibold text-navy hover:underline">
            {it.ref}
          </Link>
        )}
        {it.label && <span className="text-sm font-bold">{it.label}</span>}
        {it.area && <span className="text-xs text-muted">{it.area}</span>}
        {it.edited && <Badge tone="ok">관리자 수정</Badge>}
        {it.source_changed && <Badge tone="danger">원본 분석 변경됨</Badge>}
        <span className="ml-auto text-xs text-faint">풀이 {it.attempts}회</span>
      </div>
      {it.review_reasons.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-warn">
          {it.review_reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {!editing ? (
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-[6rem_1fr]">
          {it.kind === "exam" ? (
            <>
              <span className="text-muted">세부 발문</span>
              <span className={it.prompt ? "" : "text-warn"}>{it.prompt ?? "(원문 발문 없음 — 문항 전체를 푸는 문제)"}</span>
            </>
          ) : (
            <>
              <span className="text-muted">문제</span>
              <span className="line-clamp-4 whitespace-pre-wrap">{it.passage}</span>
            </>
          )}
          <span className="text-muted">정답</span>
          <span className="whitespace-pre-wrap font-semibold">{it.answer || <span className="text-danger">없음</span>}</span>
          {it.grading === "auto" && (
            <>
              <span className="text-muted">인정 표현</span>
              <span>{it.accepted_answers.join(" · ") || "-"}</span>
            </>
          )}
          {it.kind === "exam" && it.questionText && (
            <>
              <span className="text-muted">원문</span>
              <details>
                <summary className="cursor-pointer text-xs text-navy">원문 보기 (그대로 출제됨)</summary>
                <p className="mt-1 whitespace-pre-wrap rounded bg-surface-2 p-2 text-[13px] leading-6">{it.questionText}</p>
              </details>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <label>
            <span className="label">레이블</span>
            <input className="input" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="label">유형</span>
              <select className="input" value={d.format} onChange={(e) => setD({ ...d, format: e.target.value as "fill" | "essay" })}>
                <option value="fill">기입형</option>
                <option value="essay">서술형</option>
              </select>
            </label>
            <label>
              <span className="label">채점</span>
              <select className="input" value={d.grading} onChange={(e) => setD({ ...d, grading: e.target.value as "auto" | "self" })}>
                <option value="auto">자동</option>
                <option value="self">자기평가</option>
              </select>
            </label>
            <label>
              <span className="label">난이도</span>
              <select className="input" value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: Number(e.target.value) as 1 | 2 | 3 })}>
                <option value={1}>하</option>
                <option value={2}>중</option>
                <option value={3}>상</option>
              </select>
            </label>
          </div>
          {it.kind === "exam" ? (
            <label className="sm:col-span-2">
              <span className="label">세부 발문 (원문의 작성 방법 줄 그대로)</span>
              <textarea className="input min-h-16" value={d.prompt} onChange={(e) => setD({ ...d, prompt: e.target.value })} />
            </label>
          ) : (
            <label className="sm:col-span-2">
              <span className="label">문제 (제시문 + 발문)</span>
              <textarea className="input min-h-40" value={d.passage} onChange={(e) => setD({ ...d, passage: e.target.value })} />
            </label>
          )}
          <label className="sm:col-span-2">
            <span className="label">정답</span>
            <textarea className="input min-h-16" value={d.answer} onChange={(e) => setD({ ...d, answer: e.target.value })} />
          </label>
          <label>
            <span className="label">정답으로 인정할 표현 (한 줄에 하나)</span>
            <textarea className="input min-h-20" value={d.accepted} onChange={(e) => setD({ ...d, accepted: e.target.value })} />
          </label>
          <label>
            <span className="label">영역</span>
            <select className="input" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })}>
              <option value="">미분류</option>
              {TRADITIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {it.kind === "expected" && (
            <label className="sm:col-span-2">
              <span className="label">해설</span>
              <textarea className="input min-h-20" value={d.explanation} onChange={(e) => setD({ ...d, explanation: e.target.value })} />
            </label>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button
              className="btn-primary"
              disabled={Boolean(busy)}
              onClick={() =>
                patch(
                  {
                    label: d.label,
                    format: d.format,
                    grading: d.grading,
                    difficulty: d.difficulty,
                    prompt: it.kind === "exam" ? d.prompt || null : undefined,
                    passage: it.kind === "expected" ? d.passage : undefined,
                    answer: d.answer,
                    accepted_answers: d.accepted.split("\n").map((x) => x.trim()).filter(Boolean),
                    explanation: it.kind === "expected" ? d.explanation : undefined,
                    area: d.area || null,
                    clearChanged: true,
                  },
                  "save",
                  "저장했습니다. (학습 기록은 그대로)",
                ).then(() => setEditing(false))
              }
            >
              저장
            </button>
            <button className="btn" onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {it.status !== "approved" && (
          <button className="btn !py-1 text-sm text-ok" disabled={Boolean(busy)} onClick={() => patch({ status: "approved" }, "ok", "공개했습니다.")}>
            승인 · 공개
          </button>
        )}
        {it.status !== "hidden" && (
          <button className="btn !py-1 text-sm" disabled={Boolean(busy)} onClick={() => patch({ status: "hidden" }, "hide", "비공개로 바꿨습니다.")}>
            비공개
          </button>
        )}
        {!editing && (
          <button className="btn !py-1 text-sm" onClick={() => setEditing(true)}>
            수정
          </button>
        )}
        {it.source_changed && (
          <button className="btn !py-1 text-sm" disabled={Boolean(busy)} onClick={() => patch({ clearChanged: true }, "ack", "확인 표시를 지웠습니다.")}>
            변경 확인함
          </button>
        )}
        <Msg msg={msg} />
      </div>
    </li>
  );
}

export function ItemList({ items }: { items: AdminItem[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { busy, msg, run } = useAction();
  const bulk = (status: "approved" | "hidden", ids: string[]) =>
    run(status, async () => {
      const r = await api<{ count: number }>("/api/admin/quiz/bulk", "POST", { ids, status });
      setSel(new Set());
      return `${r.count}개를 ${status === "approved" ? "공개" : "비공개로"} 했습니다.`;
    });
  const clean = items.filter((i) => i.status === "pending" && i.review_reasons.length === 0 && i.answer);
  if (items.length === 0) return <p className="rounded border border-dashed border-line p-8 text-center text-sm text-muted">조건에 맞는 문제가 없습니다.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={sel.size === items.length} onChange={(e) => setSel(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} />
          전체 선택 ({items.length})
        </label>
        <button className="btn !py-1" disabled={!sel.size || Boolean(busy)} onClick={() => bulk("approved", [...sel])}>선택 승인 ({sel.size})</button>
        <button className="btn !py-1" disabled={!sel.size || Boolean(busy)} onClick={() => bulk("hidden", [...sel])}>선택 비공개</button>
        {clean.length > 0 && (
          <button className="btn !py-1 text-ok" disabled={Boolean(busy)} onClick={() => bulk("approved", clean.map((i) => i.id))}>
            검수 사유 없는 대기 문제 모두 승인 ({clean.length})
          </button>
        )}
        <Msg msg={msg} />
      </div>
      <ul className="space-y-3">
        {items.map((it) => (
          <ItemCard
            key={it.id + it.updated_at}
            it={it}
            checked={sel.has(it.id)}
            onCheck={(v) =>
              setSel((s) => {
                const n = new Set(s);
                if (v) n.add(it.id);
                else n.delete(it.id);
                return n;
              })
            }
          />
        ))}
      </ul>
    </div>
  );
}

export function ReportList({ reports }: { reports: ReportRow[] }) {
  const { busy, msg, run } = useAction();
  if (reports.length === 0)
    return (
      <div className="space-y-2">
        <Msg msg={msg} />
        <p className="rounded border border-dashed border-line p-8 text-center text-sm text-muted">검수 요청이 없습니다.</p>
      </div>
    );
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">자동 채점에서 오답 처리됐지만 학습자가 맞다고 본 답입니다. 인정하면 그 표현이 정답 목록에 추가됩니다 (이미 기록된 결과는 바뀌지 않음).</p>
      <Msg msg={msg} />
      <ul className="card divide-y divide-line">
        {reports.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
            <span>
              {r.item?.label && <b className="mr-1">{r.item.label}</b>}
              정답 <b>{r.item?.answer}</b> · 학습자 답 <b className="text-navy">{r.answer_text}</b>
            </span>
            {r.item?.question_id && (
              <Link href={`/questions/${r.item.question_id}`} className="text-xs text-muted hover:text-navy">원문</Link>
            )}
            <span className="ml-auto flex gap-1">
              <button className="btn !py-1 text-ok" disabled={Boolean(busy)} onClick={() => run(r.id, () => api(`/api/admin/quiz/reports/${r.id}`, "POST", { action: "accept" }).then(() => "정답으로 인정했습니다."))}>
                정답으로 인정
              </button>
              <button className="btn !py-1" disabled={Boolean(busy)} onClick={() => run(r.id, () => api(`/api/admin/quiz/reports/${r.id}`, "POST", { action: "reject" }).then(() => "반려했습니다."))}>
                반려
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsForm({ initial }: { initial: QuizSettings }) {
  const [s, setS] = useState(initial);
  const { busy, msg, run } = useAction();
  const num = (k: keyof QuizSettings, label: string) => (
    <label>
      <span className="label">{label}</span>
      <input className="input" type="number" min={0} max={50} value={s[k] as number} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
    </label>
  );
  const rest = s.daily_total - s.daily_exam - s.daily_expected - s.daily_review;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {num("daily_total", "하루 문제 수")}
        {num("daily_exam", "실제 기출")}
        {num("daily_expected", "AI 예상 문제")}
        {num("daily_review", "개인 복습")}
      </div>
      <p className={`text-xs ${rest < 0 ? "text-danger" : "text-muted"}`}>
        {rest < 0 ? "기출 + 예상 + 복습이 하루 문제 수보다 많습니다." : rest > 0 ? `남는 ${rest}문제는 출제 가능한 다른 문제로 채웁니다.` : "부족한 유형은 다른 문제로 채우고, 실제 출처를 표시합니다."}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.auto_approve_exam} onChange={(e) => setS({ ...s, auto_approve_exam: e.target.checked })} />
        분리가 분명한 실제 기출 세부 문제는 자동 승인 (검수 사유가 있으면 항상 대기)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.signup_open} onChange={(e) => setS({ ...s, signup_open: e.target.checked })} />
        회원가입 받기 (끄면 새 가입만 막히고 기존 회원은 그대로 이용)
      </label>
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={Boolean(busy) || rest < 0} onClick={() => run("save", () => api("/api/admin/quiz/settings", "PUT", s).then(() => "저장했습니다. 내일 미션부터 적용됩니다."))}>
          저장
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  );
}

export function ManualItemForm() {
  const [d, setD] = useState({ passage: "", answer: "", explanation: "", format: "essay" as "fill" | "essay", area: "" });
  const { busy, msg, run } = useAction();
  return (
    <div className="space-y-2 text-sm">
      <label className="block">
        <span className="label">문제 (제시문 + 발문 + 작성 방법)</span>
        <textarea className="input min-h-40" value={d.passage} onChange={(e) => setD({ ...d, passage: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">정답 / 모범답안</span>
        <textarea className="input min-h-20" value={d.answer} onChange={(e) => setD({ ...d, answer: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">해설</span>
        <textarea className="input min-h-16" value={d.explanation} onChange={(e) => setD({ ...d, explanation: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={d.format} onChange={(e) => setD({ ...d, format: e.target.value as "fill" | "essay" })}>
          <option value="essay">서술형 (자기평가)</option>
          <option value="fill">기입형 (자동 채점)</option>
        </select>
        <select className="input" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })}>
          <option value="">영역 미분류</option>
          {TRADITIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="btn-primary"
          disabled={Boolean(busy) || d.passage.trim().length < 10 || !d.answer.trim()}
          onClick={() =>
            run("add", async () => {
              await api("/api/admin/quiz/items", "POST", { ...d, area: d.area || null });
              setD({ passage: "", answer: "", explanation: "", format: "essay", area: "" });
              return "승인 대기로 추가했습니다. 문제 검수에서 승인하세요.";
            })
          }
        >
          예상 문제 추가
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  );
}

export function MemberToggle({ id, disabled }: { id: string; disabled: boolean }) {
  const { busy, msg, run } = useAction();
  return (
    <span className="flex items-center gap-1">
      <button
        className={`btn !py-0.5 text-xs ${disabled ? "text-ok" : "text-danger"}`}
        disabled={Boolean(busy)}
        onClick={() =>
          run("m", () => api(`/api/admin/members/${id}`, "PATCH", { disabled: !disabled }).then(() => (disabled ? "정지를 풀었습니다." : "이용을 정지했습니다.")))
        }
      >
        {disabled ? "정지 해제" : "이용 정지"}
      </button>
      <Msg msg={msg} />
    </span>
  );
}
