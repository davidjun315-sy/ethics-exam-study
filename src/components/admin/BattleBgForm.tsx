"use client";

import { useState } from "react";
import { fitImage } from "@/lib/game/chroma";
import { getBrowserClient } from "@/lib/supabase/browser";
import { quizApi as api } from "@/lib/quiz/client";

const SLOTS: { key: "동양윤리" | "한국윤리" | "서양윤리" | "사회사상"; label: string; scene: string }[] = [
  { key: "동양윤리", label: "동양윤리", scene: "an ancient Chinese Confucian academy courtyard at dusk, stone-paved plaza, red pillared pavilion, ink-wash mountains and mist in the distance, paper lanterns" },
  { key: "한국윤리", label: "한국윤리", scene: "a Joseon-dynasty Korean seowon (Confucian academy) courtyard, hanok tiled roofs, old pine trees, autumn maple leaves, soft sunset" },
  { key: "서양윤리", label: "서양윤리", scene: "the ancient Athenian agora with the Parthenon on a hill at golden hour, white marble plaza, olive trees, Greek columns" },
  { key: "사회사상", label: "사회사상", scene: "a grand 19th-century European public square in front of a neoclassical parliament and library, stone plaza, gas lamps, dusk sky" },
];

const promptFor = (scene: string) =>
  `Wide 16:9 2D mobile RPG battle background: ${scene}. Side view stage, flat walkable ground filling the bottom third of the image, empty open space in the center where characters will fight, rich painterly cel-shaded style matching chibi game characters, dramatic but not too busy, slightly darker near the bottom, no characters, no people, no text, no UI.`;

/** 관리자: 도장깨기 전장 배경 (분야별 그림) */
export function BattleBgForm({ initial, ready }: { initial: Record<string, string>; ready: boolean }) {
  const [bg, setBg] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function upload(key: string, file: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setMsg({ ok: false, text: "PNG · JPG · WebP 이미지만 올릴 수 있습니다." });
    if (file.size > 20 * 1024 * 1024) return setMsg({ ok: false, text: "20MB 이하 이미지를 올려 주세요." });
    setBusy(key);
    setMsg(null);
    try {
      const f = await fitImage(file, 1920);
      const u = await api<{ path: string; token: string; publicUrl: string }>("/api/admin/game/battle-bg", "POST", { ext: f.ext });
      const { error } = await getBrowserClient().storage.from("question-images").uploadToSignedUrl(u.path, u.token, f.blob, { contentType: f.ext === "webp" ? "image/webp" : "image/jpeg", upsert: true });
      if (error) throw new Error(error.message);
      await api("/api/admin/game/battle-bg", "PUT", { tradition: key, url: u.publicUrl });
      setBg((b) => ({ ...b, [key]: u.publicUrl }));
      setMsg({ ok: true, text: `${key} 전장 배경을 저장했습니다 (${f.width}×${f.height}). 바로 도장깨기에 나옵니다.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  async function reset(key: string) {
    setBusy(key);
    setMsg(null);
    try {
      await api("/api/admin/game/battle-bg", "PUT", { tradition: key, url: null });
      setBg((b) => {
        const n = { ...b };
        delete n[key];
        return n;
      });
      setMsg({ ok: true, text: `${key} 전장을 기본 배경으로 되돌렸습니다.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-3 p-4" aria-labelledby="battle-bg-h">
      <div>
        <h2 id="battle-bg-h" className="text-[15px] font-bold">도장깨기 전장 배경</h2>
        <p className="mt-0.5 text-xs text-muted">보스 사상가의 분야에 따라 배경이 바뀝니다. 가로 16:9 그림, 아래 1/3 정도가 캐릭터가 설 바닥이면 잘 어울립니다. 비워 두면 기본 배경이 나옵니다.</p>
      </div>
      {!ready && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">저장하려면 Supabase SQL Editor 에서 <code>supabase/migrations/016_game_battle_bg.sql</code> 을 먼저 실행하세요.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SLOTS.map((s) => (
          <div key={s.key} className="space-y-1.5 rounded-xl border border-line p-2" aria-label={`${s.label} 전장 배경`}>
            <div className="flex items-baseline justify-between text-xs">
              <b>{s.label}</b>
              <span className="text-faint">{bg[s.key] ? "올린 그림" : "기본 배경"}</span>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-lg bg-[linear-gradient(180deg,#5d6aa0,#1d2142_62%,#3a3328_62%,#221d16)]">
              {bg[s.key] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bg[s.key]} alt="" className="absolute inset-0 h-full w-full object-cover object-bottom" />
              )}
              {/* 캐릭터가 서는 높이 안내 */}
              <div className="absolute inset-x-0 bottom-[8%] border-t border-dashed border-white/50" />
              <span className="absolute bottom-[9%] left-1 text-[9px] text-white/80 drop-shadow">캐릭터 발 위치</span>
            </div>
            <button
              type="button"
              className="btn w-full py-1 text-[11px]"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(promptFor(s.scene));
                  setCopied(s.key);
                  setTimeout(() => setCopied(null), 2500);
                } catch {
                  setMsg({ ok: false, text: "복사하지 못했습니다." });
                }
              }}
            >
              {copied === s.key ? "✓ 복사됨 · ChatGPT 에 붙여넣기" : "ChatGPT용 배경 요청문 복사"}
            </button>
            <label className={`btn-primary flex w-full cursor-pointer justify-center py-1.5 text-xs ${busy || !ready ? "pointer-events-none opacity-50" : ""}`}>
              {busy === s.key ? "올리는 중…" : bg[s.key] ? "다른 그림으로 바꾸기" : "배경 그림 올리기"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={Boolean(busy) || !ready} onChange={(e) => e.target.files?.[0] && upload(s.key, e.target.files[0])} />
            </label>
            {bg[s.key] && (
              <button type="button" className="w-full text-[11px] text-muted underline disabled:opacity-50" disabled={Boolean(busy)} onClick={() => reset(s.key)}>
                기본 배경으로
              </button>
            )}
          </div>
        ))}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">{msg.text}</p>}
    </section>
  );
}
