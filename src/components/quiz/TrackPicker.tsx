"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { quizApi as api } from "@/lib/quiz/client";
import { TRACK_DESC, TRACK_NAMES, type Track } from "@/lib/quiz/srs";

const ORDER: Track[] = ["mixed", "practice", "real"];

/** 학습 단계: 기출 기반 연습문제(개념 다지기)와 실전 문제를 섞을지 */
export function TrackPicker({ current, practiceCount }: { current: Track; practiceCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {ORDER.map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy !== null}
            aria-pressed={current === k}
            onClick={async () => {
              if (current === k) return;
              setBusy(k);
              setError(null);
              try {
                await api("/api/quiz/profile", "POST", { track: k });
                startTransition(() => router.refresh());
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(null);
              }
            }}
            className={`rounded-lg border p-3 text-left transition-colors ${current === k ? "border-navy bg-navy-soft" : "border-line hover:border-navy/50"}`}
          >
            <div className={`font-bold ${current === k ? "text-navy" : ""}`}>{busy === k ? "…" : TRACK_NAMES[k]}</div>
            <div className="text-[11px] leading-snug text-muted">{TRACK_DESC[k]}</div>
          </button>
        ))}
      </div>
      {practiceCount === 0 && current !== "real" && (
        <p className="mt-2 text-xs text-warn">아직 공개된 연습문제가 없어 실전 문제로 채워집니다. (관리자: 문제은행 동기화)</p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
