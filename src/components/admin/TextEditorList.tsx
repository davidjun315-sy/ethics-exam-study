"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/admin-client";
import { checkQuizText } from "@/lib/quiz/split";
import { tidyQuestionText } from "@/lib/text/tidy";
import { Badge } from "@/components/ui";

export interface TextRow {
  id: string;
  label: string;
  text: string;
  imageUrl: string | null;
  labels: string[]; // 분석의 요구 사항별 해설 레이블
}

type Status = { ok: boolean; text: string } | null;

/** 퀴즈로 나눌 수 있는지 한눈에 */
function QuizCheck({ text, labels }: { text: string; labels: string[] }) {
  if (labels.length === 0) return <Badge>분석 해설 없음 · 퀴즈 제외</Badge>;
  const c = checkQuizText(text, labels);
  if (!c.hasHeader) return <Badge tone="danger">&lt;작성 방법&gt; 없음</Badge>;
  if (c.missing.length) return <Badge tone="warn">조건 줄을 못 찾음: {c.missing.join(", ")}</Badge>;
  return <Badge tone="ok">퀴즈 {c.items}문제 · 조건 {c.conditions}줄</Badge>;
}

export function TextEditorList({ rows }: { rows: TextRow[] }) {
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.text])));
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.text])));
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showImg, setShowImg] = useState<Record<string, boolean>>({});

  const dirty = rows.filter((r) => draft[r.id] !== saved[r.id]).map((r) => r.id);

  // 저장하지 않고 나가려 하면 확인
  useEffect(() => {
    if (!dirty.length) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty.length]);

  async function save(id: string) {
    const text = draft[id];
    setStatus((s) => ({ ...s, [id]: null }));
    try {
      await api(`/api/admin/questions/${id}`, "PATCH", { question: { question_text: text.trim() ? text : null } });
      setSaved((s) => ({ ...s, [id]: text }));
      setStatus((s) => ({ ...s, [id]: { ok: true, text: "저장됨 · 퀴즈에 반영" } }));
      return true;
    } catch (e) {
      setStatus((s) => ({ ...s, [id]: { ok: false, text: e instanceof Error ? e.message : String(e) } }));
      return false;
    }
  }

  async function saveAll() {
    setBusy("all");
    let n = 0;
    for (const id of dirty) if (await save(id)) n++;
    setBusy(null);
    return n;
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/95 p-2 backdrop-blur">
        <span className="text-sm text-muted">{rows.length}문항</span>
        {dirty.length > 0 && <span className="text-sm font-semibold text-warn">저장 안 된 문항 {dirty.length}개</span>}
        <span className="ml-auto flex gap-2">
          <button
            className="btn !py-1 text-sm"
            disabled={Boolean(busy)}
            onClick={() => setDraft((d) => Object.fromEntries(rows.map((r) => [r.id, tidyQuestionText(d[r.id] ?? "")])))}
            title="모든 문항의 문장 중간 줄바꿈을 정리합니다 (저장 전까지 바뀌지 않음)"
          >
            모두 다듬기
          </button>
          <button className="btn-primary !py-1 text-sm" disabled={Boolean(busy) || dirty.length === 0} onClick={saveAll}>
            {busy === "all" ? "저장 중…" : `모두 저장${dirty.length ? ` (${dirty.length})` : ""}`}
          </button>
        </span>
      </div>

      {rows.map((r) => {
        const text = draft[r.id] ?? "";
        const changed = text !== saved[r.id];
        const lines = Math.min(40, Math.max(8, text.split("\n").length + 2));
        return (
          <section key={r.id} id={`q-${r.id}`} className={`card scroll-mt-28 p-3 sm:p-4 ${changed ? "border-warn/60" : ""}`}>
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold">{r.label}번</span>
              <QuizCheck text={text} labels={r.labels} />
              {changed && <Badge tone="warn">수정됨</Badge>}
              <span className="ml-auto flex items-center gap-2 text-xs">
                <Link href={`/questions/${r.id}`} className="text-muted hover:text-navy" target="_blank">문항 화면</Link>
                <Link href={`/admin/questions/${r.id}`} className="text-muted hover:text-navy" target="_blank">문항 수정</Link>
              </span>
            </header>
            <div className={`grid gap-3 ${showImg[r.id] !== false && r.imageUrl ? "lg:grid-cols-2" : ""}`}>
              {r.imageUrl && showImg[r.id] !== false && (
                <div className="max-h-[70vh] overflow-auto rounded border border-line bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.imageUrl} alt={`${r.label}번 원본`} className="w-full" loading="lazy" />
                </div>
              )}
              <textarea
                className="input font-[inherit] text-[15px] leading-7"
                rows={lines}
                value={text}
                spellCheck={false}
                onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                    e.preventDefault();
                    if (changed) save(r.id);
                  }
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="btn !py-1 text-sm" onClick={() => setDraft((d) => ({ ...d, [r.id]: tidyQuestionText(text) }))}>
                다듬기
              </button>
              <button className="btn !py-1 text-sm" disabled={!changed} onClick={() => setDraft((d) => ({ ...d, [r.id]: saved[r.id] }))}>
                되돌리기
              </button>
              {r.imageUrl && (
                <button className="btn !py-1 text-sm" onClick={() => setShowImg((s) => ({ ...s, [r.id]: s[r.id] === false }))}>
                  {showImg[r.id] === false ? "이미지 보기" : "이미지 숨기기"}
                </button>
              )}
              <button className="btn-primary !py-1 text-sm" disabled={!changed || Boolean(busy)} onClick={() => save(r.id)}>
                저장
              </button>
              <span className="text-xs text-faint">Ctrl+S 로도 저장</span>
              {status[r.id] && <span className={`text-sm ${status[r.id]!.ok ? "text-ok" : "text-danger"}`}>{status[r.id]!.text}</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
