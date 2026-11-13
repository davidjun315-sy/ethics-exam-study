"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { quizApi as api } from "@/lib/quiz/client";
import { REAL_UNIT_DESC, REAL_UNIT_NAMES, TRACK_DESC, TRACK_NAMES, type EffTrack, type RealUnit, type Track } from "@/lib/quiz/srs";

const ORDER: Track[] = ["mixed", "practice", "real"];
const UNITS: RealUnit[] = ["part", "full"];

/**
 * 학습 단계: 기출 기반 연습문제(개념 다지기)와 실전 문제를 섞을지.
 * 실전만 안에서는 부분 기출(문항을 나눈 세부 문제) / 완전 기출(문항 전체)을 고른다 (023).
 */
export function TrackPicker({ current, practiceCount, fullCount, partCount }: { current: EffTrack; practiceCount: number; fullCount: number; partCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const track: Track = current === "full" ? "real" : current;
  const unit: RealUnit = current === "full" ? "full" : "part";

  async function save(key: string, body: { track?: Track; realUnit?: RealUnit }) {
    setBusy(key);
    setError(null);
    try {
      await api("/api/quiz/profile", "POST", body);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {ORDER.map((k) => {
          const on = track === k;
          return (
            <div key={k} className={`flex flex-col rounded-lg border transition-colors ${on ? "border-navy bg-navy-soft" : "border-line hover:border-navy/50"}`}>
              <button type="button" disabled={busy !== null} aria-pressed={on} onClick={() => !on && save(k, { track: k })} className="flex-1 p-3 text-left">
                <div className={`font-bold ${on ? "text-navy" : ""}`}>{busy === k ? "…" : TRACK_NAMES[k]}</div>
                <div className="text-[11px] leading-snug text-muted">{TRACK_DESC[k]}</div>
              </button>
              {/* 실전만: 부분 기출 / 완전 기출 */}
              {k === "real" && (
                <div className="px-3 pb-3" role="group" aria-label="실전 문제 단위">
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface p-0.5">
                    {UNITS.map((u) => {
                      const sel = on && unit === u;
                      return (
                        <button
                          key={u}
                          type="button"
                          disabled={busy !== null}
                          aria-pressed={sel}
                          title={REAL_UNIT_DESC[u]}
                          onClick={() => !sel && save(`unit-${u}`, { realUnit: u })}
                          className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${sel ? "bg-navy text-on-accent" : "text-muted hover:bg-surface-2"}`}
                        >
                          {busy === `unit-${u}` ? "…" : REAL_UNIT_NAMES[u]}
                          <span className={`ml-1 text-[10px] font-normal ${sel ? "opacity-80" : "text-faint"}`}>{u === "full" ? fullCount : partCount}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10.5px] leading-snug text-muted">{REAL_UNIT_DESC[on ? unit : "part"]}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {practiceCount === 0 && track !== "real" && (
        <p className="mt-2 text-xs text-warn">아직 공개된 연습문제가 없어 실전 문제로 채워집니다. (관리자: 문제은행 동기화)</p>
      )}
      {current === "full" && fullCount === 0 && (
        <p className="mt-2 text-xs text-warn">아직 공개된 완전 기출 문제가 없습니다. (관리자: SQL 023 적용 후 문제은행 동기화)</p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
