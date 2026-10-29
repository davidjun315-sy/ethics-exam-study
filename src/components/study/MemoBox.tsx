"use client";

import Link from "next/link";
import { useState } from "react";
import { quizApi as api } from "@/lib/quiz/client";
import { useQuestionRecord } from "@/lib/local-study";

export interface ServerMemo {
  memo: string;
  updated_at: string;
}

/**
 * 내 메모.
 * - 로그인(회원 또는 관리자): 서버에 계정별로 저장 → 휴대폰·다른 컴퓨터에서도 같은 메모
 * - 로그인 전: 이 브라우저에만 저장
 */
export function MemoBox({ questionId, refLabel, signedIn, server }: { questionId: string; refLabel: string; signedIn: boolean; server: ServerMemo | null }) {
  const { record, update } = useQuestionRecord(questionId);
  const local = record.memo ?? "";
  const [saved, setSaved] = useState(server?.memo ?? "");
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const value = draft ?? (signedIn ? saved : local);
  // 로그인 전 이 브라우저에 적어 둔 메모가 있고 서버에는 없을 때
  const canMove = signedIn && !saved && Boolean(local.trim()) && draft === null;

  async function saveServer(text: string) {
    setBusy(true);
    setStatus(null);
    try {
      await api(`/api/memos/${questionId}`, "PUT", { memo: text });
      setSaved(text);
      setDraft(null);
      if (local) update({ memo: "", ref: refLabel }); // 서버로 옮긴 뒤 브라우저 사본은 비운다
      setStatus({ ok: true, text: "저장됨 · 모든 기기에서 볼 수 있습니다" });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">내 메모</h3>
        <span className="text-xs text-faint">
          {signedIn ? "자동 저장 · 모든 기기에서 볼 수 있습니다 · 내 학습 → 메모에서 모아 보기" : "이 브라우저에만 저장됩니다"}
        </span>
      </div>
      {canMove && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded bg-warn-soft/40 p-2 text-sm">
          <span>이 브라우저에만 저장된 메모가 있습니다.</span>
          <button className="btn !py-0.5 text-sm" disabled={busy} onClick={() => saveServer(local)}>
            서버로 옮기기
          </button>
        </div>
      )}
      <textarea
        className="input min-h-48 text-[15px] leading-7"
        placeholder="헷갈렸던 점, 암기할 표현, 비교 포인트 등을 적어 두세요."
        value={canMove ? local : value}
        onChange={(e) => {
          setDraft(e.target.value);
          setStatus(null);
        }}
        onBlur={() => {
          if (draft === null) return;
          if (signedIn) {
            if (draft !== saved) saveServer(draft);
          } else update({ memo: draft, ref: refLabel });
        }}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {busy && <span className="text-muted">저장 중…</span>}
        {status && <span className={status.ok ? "text-ok" : "text-danger"}>{status.text}</span>}
        {!signedIn && (
          <span className="text-faint">
            휴대폰·다른 컴퓨터에서도 보려면{" "}
            <Link href={`/login?next=${encodeURIComponent(`/questions/${questionId}`)}`} className="text-navy underline">
              로그인
            </Link>{" "}
            후 메모하세요.
          </span>
        )}
      </div>
    </section>
  );
}
