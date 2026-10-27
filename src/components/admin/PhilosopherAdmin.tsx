"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/admin-client";
import { TRADITIONS, UNCLASSIFIED } from "@/lib/traditions";
import type { Philosopher } from "@/lib/types";
import { AiPasteBox } from "./AiPasteBox";

/** 채팅 AI 로 개념 정리: 프롬프트 복사 → 결과 붙여넣기 */
export function NotePaste({ philosopherId, hasNote }: { philosopherId: string; hasNote: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      {hasNote && <p className="rounded bg-warn-soft/40 p-2 text-sm text-warn">붙여넣어 저장하면 지금 노트를 새 정리로 바꿉니다. (직접 수정한 내용도 바뀝니다)</p>}
      <AiPasteBox
        promptUrl={`/api/admin/philosophers/${philosopherId}/note/manual`}
        submitUrl={`/api/admin/philosophers/${philosopherId}/note/manual`}
        copyLabel="개념 정리 프롬프트 복사"
        onSaved={(m) => {
          setMsg(null);
          startTransition(() => {
            router.refresh();
            setMsg(`${m} 사상가 페이지의 '개념 정리' 탭에 보입니다.`);
          });
        }}
      />
      {pending && <p className="text-sm text-muted">불러오는 중…</p>}
      {msg && !pending && <p className="text-sm text-ok">{msg}</p>}
    </div>
  );
}

const FIELDS: { key: keyof Philosopher; label: string; area?: boolean; list?: boolean }[] = [
  { key: "name", label: "이름" },
  { key: "original_name", label: "한자 / 원어" },
  { key: "aliases", label: "다른 이름 (쉼표로 구분)", list: true },
  { key: "tradition", label: "분야 (사상가 페이지 편집 목록의 챕터)" },
  { key: "school", label: "학파" },
  { key: "era", label: "시대" },
  { key: "core_ideas", label: "핵심 사상 (개념 정리 노트가 없을 때 보임)", area: true },
  { key: "description", label: "설명", area: true },
];

/** 사상가 기본 정보 수정 */
export function PhilosopherInfoForm({ philosopher }: { philosopher: Philosopher }) {
  const router = useRouter();
  const init = () =>
    Object.fromEntries(FIELDS.map((f) => [f.key, Array.isArray(philosopher[f.key]) ? (philosopher[f.key] as string[]).join(", ") : ((philosopher[f.key] as string | null) ?? "")]));
  const [draft, setDraft] = useState<Record<string, string>>(init);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function save() {
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const v = draft[f.key]?.trim() ?? "";
      body[f.key] = f.list ? v.split(",").map((s) => s.trim()).filter(Boolean) : v || null;
    }
    try {
      await api(`/api/admin/entities/philosophers/${philosopher.id}`, "PATCH", body);
      setMsg({ ok: true, text: "저장했습니다." });
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className="label">{f.label}</label>
          {f.area ? (
            <textarea className="input min-h-24 text-sm" value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
          ) : (
            <input
              className="input"
              value={draft[f.key]}
              required={f.key === "name"}
              list={f.key === "tradition" ? "tradition-options" : undefined}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
      <datalist id="tradition-options">
        {TRADITIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="flex items-center gap-2 pt-1">
        <button className="btn-primary" disabled={busy || pending}>{busy || pending ? "저장 중…" : "기본 정보 저장"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

/** 목록에서 바로 분야(챕터)를 바꾼다 */
export function TraditionSelect({ id, value, raw }: { id: string; value: string; raw: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-1">
      <select
        className="input !w-auto !py-0.5 text-xs"
        aria-label="분야"
        title={raw && raw !== value ? `저장된 값: ${raw}` : undefined}
        value={TRADITIONS.includes(value as (typeof TRADITIONS)[number]) ? value : ""}
        disabled={busy || pending}
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          try {
            await api(`/api/admin/entities/philosophers/${id}`, "PATCH", { tradition: e.target.value || null });
            startTransition(() => router.refresh());
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="">{UNCLASSIFIED}</option>
        {TRADITIONS.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      {(busy || pending) && <span className="text-xs text-faint">…</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
