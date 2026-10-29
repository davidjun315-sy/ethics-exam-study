"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { quizApi } from "@/lib/quiz/client";

/** 로그인 / 회원가입 */
export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode === "signup";
  const router = useRouter();

  async function submit() {
    setError(null);
    if (signup && password !== password2) return setError("비밀번호 확인이 일치하지 않습니다.");
    setBusy(true);
    try {
      await quizApi(signup ? "/api/auth/signup" : "/api/auth/login", "POST", signup ? { username, password, displayName } : { username, password });
      router.replace(next);
      router.refresh(); // 헤더의 로그인 상태까지 새로

    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="block">
        <span className="label">아이디</span>
        <input
          className="input py-2.5 text-[16px]"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder={signup ? "영문 소문자·숫자·_ 3~20자" : ""}
        />
      </label>
      {signup && (
        <label className="block">
          <span className="label">닉네임 <span className="font-normal text-faint">(화면에 보이는 이름, 선택)</span></span>
          <input className="input py-2.5 text-[16px]" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={30} />
        </label>
      )}
      <label className="block">
        <span className="label">비밀번호{signup && <span className="font-normal text-faint"> (8자 이상)</span>}</span>
        <input className="input py-2.5 text-[16px]" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? "new-password" : "current-password"} required />
      </label>
      {signup && (
        <label className="block">
          <span className="label">비밀번호 확인</span>
          <input className="input py-2.5 text-[16px]" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required />
        </label>
      )}
      {error && <p className="rounded bg-danger-soft p-2 text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full py-3 text-base font-semibold" disabled={busy}>
        {busy ? "잠시만요…" : signup ? "가입하고 시작하기" : "로그인"}
      </button>
      <p className="text-center text-sm text-muted">
        {signup ? (
          <>
            이미 계정이 있나요? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-navy underline">로그인</Link>
          </>
        ) : (
          <>
            처음이세요? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-navy underline">회원가입</Link>
          </>
        )}
      </p>
    </form>
  );
}
