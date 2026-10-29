"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { quizApi } from "@/lib/quiz/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn"
      onClick={async () => {
        await quizApi("/api/auth/login", "DELETE").catch(() => {});
        router.replace("/");
        router.refresh(); // 헤더의 로그인 표시까지 새로
      }}
    >
      로그아웃
    </button>
  );
}

export function PasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          await quizApi("/api/auth/password", "POST", { current: cur, next });
          setCur("");
          setNext("");
          setMsg({ ok: true, text: "비밀번호를 바꿨습니다." });
        } catch (err) {
          setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="input" type="password" placeholder="현재 비밀번호" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
      <input className="input" type="password" placeholder="새 비밀번호 (8자 이상)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      <div className="flex items-center gap-2">
        <button className="btn" disabled={busy}>비밀번호 변경</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
