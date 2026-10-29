"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { quizApi as api } from "@/lib/quiz/client";
import { useStudyState } from "@/lib/local-study";

/** 로그인 전에 이 브라우저에 적어 둔 메모를 한 번에 서버로 옮긴다 */
export function MoveLocalMemos() {
  const state = useStudyState();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const items = Object.entries(state.questions)
    .filter(([, r]) => r.memo?.trim())
    .map(([questionId, r]) => ({ questionId, memo: r.memo! }));
  if (items.length === 0 && !msg) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn-soft/30 p-3 text-sm">
      {items.length > 0 && (
        <>
          <span>이 브라우저에만 저장된 메모 {items.length}개가 있습니다.</span>
          <button
            className="btn"
            disabled={busy || pending}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ saved: number; skipped: number }>("/api/memos", "POST", { items });
                setMsg(`${r.saved}개를 옮겼습니다.${r.skipped ? ` (${r.skipped}개는 서버에 이미 메모가 있어 건너뜀 — 브라우저에 남겨 둡니다)` : ""}`);
                startTransition(() => router.refresh());
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy || pending ? "옮기는 중…" : "서버로 옮기기"}
          </button>
        </>
      )}
      {msg && <span className="text-muted">{msg}</span>}
    </div>
  );
}
