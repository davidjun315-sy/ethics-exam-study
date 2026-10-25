"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        setLoading(false);
        if (res.ok) {
          router.replace(next);
          router.refresh();
        } else {
          const json = await res.json().catch(() => ({}));
          setError(json.error ?? "로그인 실패");
        }
      }}
    >
      <div>
        <label className="label" htmlFor="pw">관리자 비밀번호</label>
        <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={loading || !password}>
        {loading ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
