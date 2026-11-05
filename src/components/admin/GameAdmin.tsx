"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { CandidateRow, CardInput, GameSettings } from "@/lib/game/data";
import { RARITIES, RARITY_BASE, RARITY_NAMES, SKILL_EFFECTS, type Rarity, type SkillEffect } from "@/lib/game/rules";
import { artPrompt, faceFor, portraitSearchUrl } from "@/lib/game/suggestions";
import { getBrowserClient } from "@/lib/supabase/browser";
import { quizApi as api } from "@/lib/quiz/client";
import { PhilosopherCard } from "@/components/game/PhilosopherCard";

const STATUS: Record<CandidateRow["status"], { label: string; tone: string }> = {
  ready: { label: "공개 중", tone: "bg-ok-soft text-ok" },
  draft: { label: "준비 완료 · 비공개", tone: "bg-navy-soft text-navy" },
  "missing-art": { label: "일러스트 없음", tone: "bg-warn-soft text-warn" },
  none: { label: "카드 미생성", tone: "bg-surface-2 text-muted" },
};

/** 업로드 전 3:4 로 가운데를 잘라 1200×1600 WebP 로 (카드마다 같은 비율·가벼운 용량) */
async function toCardArt(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const W = 1200;
  const H = 1600;
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const sw = W / scale;
  const sh = H / scale;
  const sx = (bmp.width - sw) / 2;
  const sy = (bmp.height - sh) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
  return new Promise((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("이미지 변환 실패"))), "image/webp", 0.88));
}

export function GameAdmin({ candidates, settings }: { candidates: CandidateRow[]; settings: GameSettings }) {
  const [filter, setFilter] = useState<"all" | CandidateRow["status"]>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: candidates.length, ready: 0, draft: 0, "missing-art": 0, none: 0 };
    for (const x of candidates) c[x.status]++;
    return c;
  }, [candidates]);
  const list = candidates.filter((c) => (filter === "all" || c.status === filter) && (!q || c.name.includes(q) || c.aliases.some((a) => a.includes(q))));

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "ready", "draft", "missing-art", "none"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs ${filter === k ? "border-navy bg-navy-soft font-semibold text-navy" : "border-line text-muted"}`}>
              {k === "all" ? "전체 후보" : STATUS[k].label} <b className="tabular-nums">{counts[k]}</b>
            </button>
          ))}
          <input className="input ml-auto !w-44 !py-1 text-xs" placeholder="사상가 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="text-xs text-muted">
          후보 = 기출 분석에 주요·비교 사상가로 연결된 사상가 (분석이 추가되면 자동으로 나타남). 일러스트와 필살기를 갖추고 &apos;공개&apos;한 카드만 뽑기에 나옵니다.
        </p>
      </section>

      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.philosopherId} className="card">
            <button type="button" onClick={() => setOpen(open === c.philosopherId ? null : c.philosopherId)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left">
              <span className="h-12 w-9 shrink-0 overflow-hidden rounded bg-surface-2">
                {c.card?.artUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.card.artUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0">
                <span className="font-bold">{c.name}</span>
                <span className="ml-2 text-xs text-muted">{c.tradition} · 기출 {c.questions}문항</span>
                {c.duplicateOf && <span className="ml-2 rounded bg-danger-soft px-1.5 text-[11px] text-danger">표기만 다른 같은 사상가? ({c.duplicateOf})</span>}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {c.card && <span className="text-xs text-muted">{RARITY_NAMES[c.card.rarity]}</span>}
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
                <span className="text-faint">{open === c.philosopherId ? "▾" : "▸"}</span>
              </span>
            </button>
            {open === c.philosopherId && <CardEditor c={c} />}
          </li>
        ))}
        {list.length === 0 && <li className="card p-6 text-center text-sm text-muted">조건에 맞는 후보가 없습니다.</li>}
      </ul>

      <SettingsForm initial={settings} />
    </div>
  );
}

function CardEditor({ c }: { c: CandidateRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const s = c.suggestion;
  const [d, setD] = useState<CardInput>(() =>
    c.card
      ? {
          rarity: c.card.rarity,
          base_atk: c.card.baseAtk,
          base_hp: c.card.baseHp,
          skill_name: c.card.skillName,
          skill_effect: c.card.skillEffect,
          skill_desc: c.card.skillDesc,
          quote: c.card.quote,
          art_url: c.card.artUrl,
          art_basis: c.card.artBasis,
          art_note: c.card.artNote,
          published: c.card.published,
        }
      : { rarity: s.rarity, base_atk: RARITY_BASE[s.rarity].atk, base_hp: RARITY_BASE[s.rarity].hp, skill_name: "", skill_effect: s.effect, skill_desc: "", quote: "", art_url: null, art_basis: s.basis, art_note: "", published: false },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const set = <K extends keyof CardInput>(k: K, v: CardInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const canPublish = Boolean(d.art_url && d.skill_name.trim());
  const prompt = artPrompt({ name: c.name, originalName: c.originalName, era: c.era, tradition: c.tradition, look: s.look, living: s.living, aliases: c.aliases });
  const face = s.living ? null : faceFor(c.name, c.aliases);

  async function save(next: CardInput) {
    setBusy("save");
    setMsg(null);
    try {
      await api(`/api/admin/game/cards/${c.philosopherId}`, "PUT", next);
      setD(next);
      setMsg({ ok: true, text: next.published ? "저장했습니다 · 뽑기에 공개됨" : "저장했습니다 · 비공개" });
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setMsg({ ok: false, text: "PNG · JPG · WebP 이미지만 올릴 수 있습니다." });
    if (file.size > 15 * 1024 * 1024) return setMsg({ ok: false, text: "15MB 이하 이미지를 올려 주세요." });
    setBusy("art");
    setMsg(null);
    try {
      const blob = await toCardArt(file);
      const u = await api<{ path: string; token: string; publicUrl: string }>(`/api/admin/game/cards/${c.philosopherId}/art`, "POST", { ext: "webp" });
      const { error } = await getBrowserClient().storage.from("question-images").uploadToSignedUrl(u.path, u.token, blob, { contentType: "image/webp", upsert: true });
      if (error) throw new Error(error.message);
      set("art_url", u.publicUrl);
      setMsg({ ok: true, text: "일러스트를 올렸습니다 (1200×1600 WebP). 저장해야 반영됩니다." });
    } catch (e) {
      console.error("[card art upload]", e);
      setMsg({ ok: false, text: `일러스트 업로드 실패: ${e instanceof Error ? e.message || e.name : String(e)}` });
    } finally {
      setBusy(null);
    }
  }

  const preview = {
    philosopherId: c.philosopherId,
    name: c.name,
    originalName: c.originalName,
    tradition: c.tradition,
    rarity: d.rarity,
    baseAtk: d.base_atk,
    baseHp: d.base_hp,
    skillName: d.skill_name || "필살기 이름",
    skillEffect: d.skill_effect,
    skillDesc: d.skill_desc,
    quote: d.quote,
    artUrl: d.art_url,
    artBasis: d.art_basis,
    artNote: d.art_note,
    published: d.published,
  };

  return (
    <div className="grid gap-4 border-t border-line p-4 md:grid-cols-[13rem_1fr]">
      <div className="space-y-2">
        <PhilosopherCard card={preview} level={1} tilt={false} />
        {!d.art_url && <p className="text-center text-xs text-warn">일러스트가 없어 공개할 수 없습니다</p>}
        <label className="btn w-full cursor-pointer py-2 text-sm">
          {busy === "art" ? "올리는 중…" : d.art_url ? "일러스트 바꾸기" : "일러스트 올리기"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy !== null} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <p className="text-[11px] leading-4 text-faint">3:4 세로 이미지 권장 · 올리면 가운데 기준 3:4 로 잘라 1200×1600 WebP 로 저장합니다.</p>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn !py-1 text-xs"
            onClick={() =>
              setD((x) => ({
                ...x,
                rarity: s.rarity,
                base_atk: RARITY_BASE[s.rarity].atk,
                base_hp: RARITY_BASE[s.rarity].hp,
                skill_name: s.skill,
                skill_effect: s.effect,
                skill_desc: s.skillDesc,
                quote: s.quote,
                art_basis: s.basis,
              }))
            }
          >
            제안 채우기
          </button>
          <span className="text-[11px] text-faint">필살기·대사는 게임용 창작 문구 제안입니다. 등급은 출제 빈도와 무관하게 게임 균형으로 정하세요.</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="block">
            <span className="label">등급</span>
            <select className="input" value={d.rarity} onChange={(e) => set("rarity", e.target.value as Rarity)}>
              {RARITIES.map((r) => <option key={r} value={r}>{RARITY_NAMES[r]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">기본 공격력</span>
            <input type="number" className="input" min={1} max={999} value={d.base_atk} onChange={(e) => set("base_atk", Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="label">기본 체력</span>
            <input type="number" className="input" min={1} max={9999} value={d.base_hp} onChange={(e) => set("base_hp", Number(e.target.value))} />
          </label>
          <div className="flex items-end">
            <button type="button" className="btn w-full !py-1.5 text-xs" onClick={() => setD((x) => ({ ...x, base_atk: RARITY_BASE[x.rarity].atk, base_hp: RARITY_BASE[x.rarity].hp }))}>
              등급 기본값
            </button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
          <label className="block">
            <span className="label">필살기 이름</span>
            <input className="input" maxLength={40} value={d.skill_name} onChange={(e) => set("skill_name", e.target.value)} placeholder="예: 정언명령" />
          </label>
          <label className="block">
            <span className="label">효과</span>
            <select className="input" value={d.skill_effect} onChange={(e) => set("skill_effect", e.target.value as SkillEffect)}>
              {(Object.keys(SKILL_EFFECTS) as SkillEffect[]).map((k) => <option key={k} value={k}>{SKILL_EFFECTS[k].name}</option>)}
            </select>
          </label>
        </div>
        <p className="-mt-1 text-[11px] text-faint">{SKILL_EFFECTS[d.skill_effect].desc}</p>
        <label className="block">
          <span className="label">필살기 설명 (선택)</span>
          <input className="input" maxLength={120} value={d.skill_desc} onChange={(e) => set("skill_desc", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">대표 카드 대사 (게임용 창작 문구 · 원문 인용처럼 쓰지 않기)</span>
          <input className="input" maxLength={80} value={d.quote} onChange={(e) => set("quote", e.target.value)} />
        </label>
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <label className="block">
            <span className="label">일러스트 근거</span>
            <select className="input" value={d.art_basis} onChange={(e) => set("art_basis", e.target.value as CardInput["art_basis"])}>
              <option value="portrait">초상·조각·도상 참고</option>
              <option value="reconstruction">재구성 (카드에 표시)</option>
            </select>
          </label>
          <label className="block">
            <span className="label">일러스트 메모 (선택, 상세 화면에 표시)</span>
            <input className="input" maxLength={200} value={d.art_note} onChange={(e) => set("art_note", e.target.value)} placeholder="예: 전통 초상화 도상 참고" />
          </label>
        </div>
        <details className="rounded-lg border border-line bg-surface-2/50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">일러스트 만들기 (실제 얼굴 반영 · 모든 카드 같은 화풍)</summary>
          {s.living ? (
            <p className="mt-2 rounded bg-warn-soft p-2 text-xs text-warn">
              생존 인물입니다. 초상권과 오해를 피하려고 실제 얼굴 대신 실루엣·뒷모습·상징 중심으로 그리도록 프롬프트가 구성되어 있습니다. 참고 사진은 첨부하지 마세요.
            </p>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted">
              <li>
                <a href={portraitSearchUrl(c.name, c.originalName, c.aliases)} target="_blank" rel="noreferrer" className="font-semibold text-navy underline">
                  참고 초상 찾기 (위키미디어 공용)
                </a>
                {face ? <> — 대표 초상: <span className="text-ink">{face.ref}</span></> : " — 확인된 초상이 없으면 전통 도상을 찾아 참고하세요 (카드에 '재구성' 표시)"}
                . 얼굴이 잘 보이는 퍼블릭 도메인 초상·흉상·영정을 내려받으세요.
              </li>
              <li>아래 프롬프트를 복사합니다.</li>
              <li>이미지 생성 AI(ChatGPT·Gemini 등)에 <b>참고 초상 이미지를 첨부하고</b> 프롬프트를 붙여넣습니다. 얼굴은 초상을 따르고, 화풍·구도는 프롬프트를 따릅니다.</li>
            </ol>
          )}
          <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-surface p-2 text-xs leading-5 text-muted">{prompt}</pre>
          <button
            type="button"
            className="btn mt-2 !py-1 text-xs"
            onClick={async () => {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            }}
          >
            {copied ? "✓ 복사됨" : "프롬프트 복사"}
          </button>
          <p className="mt-1 text-[11px] text-faint">
            실제 사진을 그대로 쓰거나 다른 화풍 이미지를 섞지 마세요. 참고 초상의 저작권(퍼블릭 도메인 여부)을 확인하고, 근거는 &apos;일러스트 메모&apos;에 적어 두면 카드 상세에 표시됩니다.
          </p>
        </details>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <label className={`flex items-center gap-2 text-sm ${canPublish ? "" : "text-faint"}`}>
            <input type="checkbox" checked={d.published} disabled={!canPublish} onChange={(e) => set("published", e.target.checked)} />
            뽑기에 공개
          </label>
          {!canPublish && <span className="text-xs text-warn">일러스트와 필살기 이름이 있어야 공개할 수 있습니다</span>}
          <button type="button" className="btn-primary ml-auto px-5" disabled={busy !== null} onClick={() => save({ ...d, published: d.published && canPublish })}>
            {busy === "save" ? "저장 중…" : "저장"}
          </button>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

function SettingsForm({ initial }: { initial: GameSettings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const total = RARITIES.reduce((n, r) => n + s.rates[r], 0);
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  const rule = (k: keyof GameSettings["coin_rules"], label: string) => (
    <label key={k} className="block">
      <span className="label">{label}</span>
      <input type="number" min={0} className="input" value={s.coin_rules[k]} onChange={(e) => setS({ ...s, coin_rules: { ...s.coin_rules, [k]: num(e.target.value) } })} />
    </label>
  );
  return (
    <section className="card space-y-4 p-4">
      <h2 className="text-[15px] font-bold">뽑기 · 강화 · 코인 설정</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block"><span className="label">뽑기 1회 비용</span><input type="number" min={1} className="input" value={s.draw_cost} onChange={(e) => setS({ ...s, draw_cost: Math.max(1, num(e.target.value)) })} /></label>
        <label className="block"><span className="label">최대 레벨</span><input type="number" min={2} max={20} className="input" value={s.max_level} onChange={(e) => setS({ ...s, max_level: Math.min(20, Math.max(2, num(e.target.value))) })} /></label>
        <label className="block"><span className="label">최대 레벨 중복 환급 코인</span><input type="number" min={0} className="input" value={s.dup_refund} onChange={(e) => setS({ ...s, dup_refund: num(e.target.value) })} /></label>
      </div>
      <div>
        <div className="label">등급별 확률 (가중치 · 합계 {total})</div>
        <div className="grid gap-2 sm:grid-cols-4">
          {RARITIES.map((r) => (
            <label key={r} className="block">
              <span className="text-xs text-muted">{RARITY_NAMES[r]} · {total ? ((s.rates[r] / total) * 100).toFixed(1) : 0}%</span>
              <input type="number" min={0} className="input" value={s.rates[r]} onChange={(e) => setS({ ...s, rates: { ...s.rates, [r]: num(e.target.value) } })} />
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-faint">공개 카드가 없는 등급은 실제 뽑기에서 빠지고 나머지 비율로 다시 나뉩니다.</p>
      </div>
      <div>
        <div className="label">학습 코인 지급 기준</div>
        <div className="grid gap-2 sm:grid-cols-4">
          {rule("fill_correct", "기입형 정답")}
          {rule("essay_correct", "서술형 완벽")}
          {rule("essay_partial", "서술형·기입형 부분")}
          {rule("wrong", "오답 후 해설 확인")}
          {rule("reconquer", "재정복 추가")}
          {rule("mission", "오늘의 미션 완료")}
          {rule("daily_cap", "하루 학습 코인 상한")}
          {rule("essay_min_chars", "서술형 정답 코인 최소 글자")}
        </div>
        <p className="mt-1 text-[11px] text-faint">같은 문제는 하루 한 번만 코인을 줍니다 (경험치와 같은 규칙). 미션 보너스는 상한과 별도입니다.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary px-5"
          disabled={busy || total <= 0}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await api("/api/admin/game/settings", "PUT", s);
              setMsg({ ok: true, text: "설정을 저장했습니다" });
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "저장 중…" : "설정 저장"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
