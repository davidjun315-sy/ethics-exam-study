"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiPasteBox } from "@/components/admin/AiPasteBox";
import { api } from "@/lib/admin-client";

/** 관리자: 전체 분석 업데이트(계산) / AI 해석 (API 또는 채팅 붙여넣기) */
export function PredictAdmin({ runId, stale, aiConfigured }: { runId: string | null; stale: boolean; aiConfigured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setError(null);
    setMsg(null);
    try {
      setMsg(await fn());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="card space-y-3 border-navy/30 p-4">
      <h3 className="text-sm font-bold text-navy">관리자 · 전체 분석</h3>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={stale || !runId ? "btn-primary" : "btn"}
          disabled={Boolean(busy)}
          onClick={() =>
            run("compute", async () => {
              await api("/api/admin/predictions", "POST");
              return "전체 기출 통계 · 패턴 · 예측 점수를 새로 계산했습니다. (AI 비용 없음)";
            })
          }
        >
          {busy === "compute" ? "계산 중…" : "전체 분석 업데이트 (계산)"}
        </button>
        {runId && aiConfigured && (
          <button
            className="btn"
            disabled={Boolean(busy)}
            onClick={() =>
              run("ai", async () => {
                const r = await api<{ matched: number }>(`/api/admin/predictions/${runId}/interpret`, "POST");
                return `AI 해석을 ${r.matched}개 주제에 추가했습니다.`;
              })
            }
          >
            {busy === "ai" ? "AI 해석 중…" : "AI 해석 받기 (API)"}
          </button>
        )}
        <span className="text-xs text-faint">계산은 무료이며 DB 데이터만 사용합니다. AI 해석은 상위 15개 주제의 요약 데이터만 보냅니다.</span>
      </div>
      {runId && (
        <details>
          <summary className="cursor-pointer text-sm text-muted">API 없이 채팅 AI 로 해석 받기</summary>
          <div className="mt-2">
            <AiPasteBox
              promptUrl={`/api/admin/predictions/${runId}/manual`}
              submitUrl={`/api/admin/predictions/${runId}/manual`}
              copyLabel="출제 예측 해석 프롬프트 복사"
              onSaved={(m) => {
                setMsg(m);
                router.refresh();
              }}
            />
          </div>
        </details>
      )}
      {msg && <p className="rounded bg-ok-soft p-2 text-sm text-ok">{msg}</p>}
      {error && <p className="rounded bg-danger-soft p-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

/** 관리자: 예상 주제로 연습문제 만들기 */
export function PracticeAdmin({ topicId, aiConfigured }: { topicId: string; aiConfigured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="rounded border border-dashed border-line-strong p-3">
      <summary className="cursor-pointer text-sm font-semibold text-navy">예상 문제 만들기 (관리자)</summary>
      <div className="mt-2 space-y-2">
        {aiConfigured && (
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api(`/api/admin/predictions/topics/${topicId}/practice`, "POST");
                setMsg("연습문제를 만들었습니다.");
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "만드는 중…" : "AI 로 예상 문제 만들기 (API)"}
          </button>
        )}
        <AiPasteBox
          promptUrl={`/api/admin/predictions/topics/${topicId}/practice/manual`}
          submitUrl={`/api/admin/predictions/topics/${topicId}/practice/manual`}
          copyLabel="예상 문제 프롬프트 복사 (채팅 AI)"
          onSaved={(m) => {
            setMsg(m);
            router.refresh();
          }}
        />
        {msg && <p className="text-sm text-ok">{msg}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </details>
  );
}
