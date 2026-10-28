"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { quizApi as api } from "@/lib/quiz/client";
import { LEVEL_NAMES, type StartLevel } from "@/lib/quiz/srs";

const HELP: Record<StartLevel, string> = {
  basic: "쉬운 문제부터",
  advanced: "중간 난이도 중심",
  expert: "어려운 문제 위주",
};

/** 시작 난이도 선택 · 변경 */
export function StartLevelPicker({ current }: { current: StartLevel | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<StartLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(LEVEL_NAMES) as StartLevel[]).map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy !== null}
            aria-pressed={current === k}
            onClick={async () => {
              setBusy(k);
              setError(null);
              try {
                await api("/api/quiz/profile", "POST", { startLevel: k });
                startTransition(() => router.refresh());
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(null);
              }
            }}
            className={`rounded-lg border p-3 text-left transition-colors ${current === k ? "border-navy bg-navy-soft" : "border-line hover:border-navy/50"}`}
          >
            <div className={`font-bold ${current === k ? "text-navy" : ""}`}>{busy === k ? "…" : LEVEL_NAMES[k]}</div>
            <div className="text-[11px] text-muted">{HELP[k]}</div>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
