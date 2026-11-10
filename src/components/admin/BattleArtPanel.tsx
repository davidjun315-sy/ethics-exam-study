"use client";

import { useState } from "react";
import { keyGreen } from "@/lib/game/chroma";
import { getBrowserClient } from "@/lib/supabase/browser";
import { quizApi as api } from "@/lib/quiz/client";

/** ChatGPT 용 전투 캐릭터 요청문 (같은 대화창에서 이어 그리면 그림체가 통일됨) */
const promptFor = (name: string, originalName: string | null) =>
  `Same art style and size as the previous characters (if any). Chibi (2.5 head-tall) full-body game character of ${name}${originalName ? ` (${originalName})` : ""}, the philosopher, in historically fitting clothes, holding an item that symbolizes his/her thought, confident expression, battle-ready pose facing RIGHT, clean cel-shaded mobile RPG style, thick soft dark outline, flat pure green #00FF00 background, no ground shadow, no text.`;

/** 관리자: 도장깨기 전장에 서는 전신 캐릭터 (초록 배경 그림 → 투명) */
export function BattleArtPanel({ philosopherId, name, originalName, initial, cardSaved }: { philosopherId: string; name: string; originalName: string | null; initial: string | null; cardSaved: boolean }) {
  const [url, setUrl] = useState<string | null>(initial);
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function upload(file: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setMsg({ ok: false, text: "PNG · JPG · WebP 이미지만 올릴 수 있습니다." });
    if (file.size > 15 * 1024 * 1024) return setMsg({ ok: false, text: "15MB 이하 이미지를 올려 주세요." });
    setBusy(true);
    setMsg(null);
    try {
      const k = await keyGreen(file, { flip, maxHeight: 720 });
      const u = await api<{ path: string; token: string; publicUrl: string }>(`/api/admin/game/cards/${philosopherId}/battle-art`, "POST", { ext: k.ext });
      const { error } = await getBrowserClient().storage.from("question-images").uploadToSignedUrl(u.path, u.token, k.blob, { contentType: `image/${k.ext}`, upsert: true });
      if (error) throw new Error(error.message);
      await api(`/api/admin/game/cards/${philosopherId}/battle-art`, "PUT", { url: u.publicUrl });
      setUrl(u.publicUrl);
      setMsg({
        ok: true,
        text: `전투 캐릭터를 저장했습니다 (${k.width}×${k.height}). ${k.greenShare < 0.15 ? "초록 배경이 거의 없어 배경이 남았을 수 있습니다." : "바로 도장깨기에 나옵니다."}`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/admin/game/cards/${philosopherId}/battle-art`, "PUT", { url: null });
      setUrl(null);
      setMsg({ ok: true, text: "전투 캐릭터를 지웠습니다 (전장에서는 카드 초상으로 나옵니다)." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line p-2.5" aria-label="전투 캐릭터">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-bold">전투 캐릭터</span>
        <span className="text-[10px] text-faint">도장깨기 전장</span>
      </div>
      <div className="flex h-36 items-end justify-center rounded-lg bg-[linear-gradient(180deg,#273455,#121a2b_70%,#2b3a2a_70%,#1d281c)] p-1">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${name} 전투 캐릭터`} className="h-full w-auto object-contain drop-shadow-[0_6px_6px_rgba(0,0,0,0.5)]" />
        ) : (
          <span className="self-center text-[11px] text-white/60">아직 없음 · 카드 초상으로 나옵니다</span>
        )}
      </div>
      {!cardSaved && <p className="text-[11px] text-warn">카드를 먼저 저장해야 올릴 수 있습니다.</p>}
      <button
        type="button"
        className="btn w-full py-1.5 text-xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(promptFor(name, originalName));
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            setMsg({ ok: false, text: "복사하지 못했습니다." });
          }
        }}
      >
        {copied ? "✓ 복사됨 · ChatGPT 에 붙여넣기" : "ChatGPT용 캐릭터 요청문 복사"}
      </button>
      <label className="flex items-center gap-1.5 text-[11px] text-muted">
        <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
        왼쪽을 보는 그림이면 체크 (좌우 뒤집어 저장)
      </label>
      <label className={`btn-primary flex w-full cursor-pointer justify-center py-2 text-sm ${busy || !cardSaved ? "pointer-events-none opacity-50" : ""}`}>
        {busy ? "처리 중…" : url ? "초록 배경 그림으로 바꾸기" : "초록 배경 그림 올리기"}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy || !cardSaved} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {url && (
        <button type="button" className="w-full text-[11px] text-muted underline disabled:opacity-50" disabled={busy} onClick={remove}>
          전투 캐릭터 지우기
        </button>
      )}
      {msg && <p className={`text-[11px] ${msg.ok ? "text-ok" : "text-danger"}`} role="status">{msg.text}</p>}
      <p className="text-[10px] leading-4 text-faint">초록(#00FF00) 배경은 자동으로 지우고, 그림 부분만 잘라 투명 WebP 로 저장합니다. 오른쪽을 보는 그림 기준이며 보스로 나올 때는 자동으로 왼쪽을 봅니다.</p>
    </div>
  );
}
