"use client";

import { useState } from "react";
import { fitImage } from "@/lib/game/chroma";
import { getBrowserClient } from "@/lib/supabase/browser";
import { quizApi as api } from "@/lib/quiz/client";
import { ART_SLOTS, type ArtSlotKey } from "@/lib/game/art-slots";

const ASPECT: Record<string, string> = { "16:9": "aspect-video", "21:9": "aspect-[21/9]", "3:1": "aspect-[3/1]", "2:3": "aspect-[2/3] max-h-64 mx-auto" };

/**
 * 관리자: 꾸미기 이미지 칸 (사상의 탑 배경 · 메인 배너 · 출석 팝업 등).
 * 칸마다 ChatGPT 요청문을 복사 → ChatGPT 에서 그림 생성 → 받은 그림을 그 칸에 올리면 바로 반영. 비우면 기본 그림.
 */
export function ArtSlotsForm({ initial, ready }: { initial: Partial<Record<ArtSlotKey, string>>; ready: boolean }) {
  const [art, setArt] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function upload(key: ArtSlotKey, file: File, maxSide: number) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setMsg({ ok: false, text: "PNG · JPG · WebP 이미지만 올릴 수 있습니다." });
    if (file.size > 20 * 1024 * 1024) return setMsg({ ok: false, text: "20MB 이하 이미지를 올려 주세요." });
    setBusy(key);
    setMsg(null);
    try {
      const f = await fitImage(file, maxSide);
      const u = await api<{ path: string; token: string; publicUrl: string }>("/api/admin/game/art", "POST", { ext: f.ext });
      const { error } = await getBrowserClient().storage.from("question-images").uploadToSignedUrl(u.path, u.token, f.blob, { contentType: f.ext === "webp" ? "image/webp" : "image/jpeg", upsert: true });
      if (error) throw new Error(error.message);
      await api("/api/admin/game/art", "PUT", { slot: key, url: u.publicUrl });
      setArt((a) => ({ ...a, [key]: u.publicUrl }));
      setMsg({ ok: true, text: `저장했습니다 (${f.width}×${f.height}). 바로 사이트에 나옵니다.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  async function reset(key: ArtSlotKey) {
    setBusy(key);
    setMsg(null);
    try {
      await api("/api/admin/game/art", "PUT", { slot: key, url: null });
      setArt((a) => {
        const n = { ...a };
        delete n[key];
        return n;
      });
      setMsg({ ok: true, text: "기본 그림으로 되돌렸습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const groups = [...new Set(ART_SLOTS.map((s) => s.group))];
  return (
    <section className="card space-y-4 p-4" aria-labelledby="art-slots-h" data-art-slots>
      <div>
        <h2 id="art-slots-h" className="text-[15px] font-bold">꾸미기 이미지 (ChatGPT 연계)</h2>
        <p className="mt-0.5 text-xs text-muted">
          칸마다 <b>ChatGPT용 요청문 복사</b> → ChatGPT 에 붙여넣어 그림 만들기 → 받은 그림을 그 칸에 올리면 바로 반영됩니다. 비워 두면 기본 그림(그라데이션)이 나옵니다. 큰 그림은 올릴 때 자동으로 줄입니다.
        </p>
      </div>
      {!ready && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">저장하려면 Supabase SQL Editor 에서 <code>supabase/migrations/027_game_tower.sql</code> 을 먼저 실행하세요.</p>}
      {groups.map((g) => (
        <div key={g} className="space-y-2">
          <h3 className="text-xs font-bold tracking-wide text-muted">{g}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ART_SLOTS.filter((s) => s.group === g).map((s) => (
              <div key={s.key} className="space-y-1.5 rounded-xl border border-line p-2" aria-label={s.label} data-art-slot={s.key}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <b>{s.label}</b>
                  <span className="shrink-0 text-faint">
                    {s.ratio} · {art[s.key] ? "올린 그림" : "기본"}
                  </span>
                </div>
                <div className={`relative overflow-hidden rounded-lg ${ASPECT[s.ratio]}`} style={{ background: s.fallback }}>
                  {art[s.key] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art[s.key]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                </div>
                <p className="text-[11px] leading-4 text-muted">{s.where}</p>
                <button
                  type="button"
                  className="btn w-full py-1 text-[11px]"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(s.prompt);
                      setCopied(s.key);
                      setTimeout(() => setCopied(null), 2500);
                    } catch {
                      setMsg({ ok: false, text: "복사하지 못했습니다. 아래 요청문을 직접 선택해 복사하세요." });
                    }
                  }}
                >
                  {copied === s.key ? "✓ 복사됨 · ChatGPT 에 붙여넣기" : "ChatGPT용 요청문 복사"}
                </button>
                <details className="text-[11px] text-muted">
                  <summary className="cursor-pointer">요청문 보기</summary>
                  <p className="mt-1 select-all rounded bg-surface-2 p-2 leading-4">{s.prompt}</p>
                </details>
                <label className={`btn-primary flex w-full cursor-pointer justify-center py-1.5 text-xs ${busy || !ready ? "pointer-events-none opacity-50" : ""}`}>
                  {busy === s.key ? "올리는 중…" : art[s.key] ? "다른 그림으로 바꾸기" : "그림 올리기"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={Boolean(busy) || !ready} onChange={(e) => e.target.files?.[0] && upload(s.key, e.target.files[0], s.maxSide)} />
                </label>
                {art[s.key] && (
                  <button type="button" className="w-full text-[11px] text-muted underline disabled:opacity-50" disabled={Boolean(busy)} onClick={() => reset(s.key)}>
                    기본 그림으로
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
