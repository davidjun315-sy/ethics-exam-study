"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { api } from "@/lib/admin-client";
import { TRADITIONS, UNCLASSIFIED } from "@/lib/traditions";
import type { Philosopher } from "@/lib/types";
import { AiPasteBox } from "./AiPasteBox";

/** 무료 AI(Gemini)로 바로 개념 정리 → 저장 */
export function NoteGenerate({ philosopherId, hasNote }: { philosopherId: string; hasNote: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  async function run() {
    if (hasNote && !confirm("지금 노트를 새 정리로 바꿉니다. (직접 수정한 내용도 바뀝니다) 진행할까요?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ concepts: number; dropped: string[]; model: string }>(`/api/admin/philosophers/${philosopherId}/note/generate`, "POST");
      startTransition(() => router.refresh());
      setMsg({ ok: true, text: `정리했습니다 (개념 ${r.concepts}개 · ${r.model}). 사상가 페이지의 '개념 정리' 탭에 보입니다.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1.5">
      <button type="button" className="btn-primary" disabled={busy || pending} onClick={run}>
        {busy ? "AI가 정리하는 중… (1~2분)" : hasNote ? "무료 AI로 다시 정리" : "무료 AI로 바로 정리"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

/** 여러 사상가의 노트를 차례로 무료 AI 로 다시 정리 (한 번에 하나씩 · 중간에 멈출 수 있음) */
export function NoteBulkGenerate({ targets }: { targets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ name: string; ok: boolean; text: string }[]>([]);
  const stop = useRef(false);
  async function run() {
    if (!confirm(`${targets.length}명의 개념 정리 노트를 새 방식으로 다시 정리합니다. 한 명에 1~2분 걸리고, 직접 수정한 내용도 바뀝니다. 진행할까요?`)) return;
    stop.current = false;
    setRunning(true);
    setLog([]);
    for (const t of targets) {
      if (stop.current) break;
      try {
        const r = await api<{ concepts: number }>(`/api/admin/philosophers/${t.id}/note/generate`, "POST");
        setLog((l) => [...l, { name: t.name, ok: true, text: `개념 ${r.concepts}개` }]);
      } catch (e) {
        setLog((l) => [...l, { name: t.name, ok: false, text: e instanceof Error ? e.message : String(e) }]);
      }
    }
    setRunning(false);
    router.refresh();
  }
  if (!targets.length) return <p className="text-sm text-muted">모든 개념 정리 노트가 새 방식입니다.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={running} onClick={run}>
          {running ? `정리하는 중… ${log.length}/${targets.length}` : `예전 방식 노트 ${targets.length}개 모두 다시 정리 (무료 AI)`}
        </button>
        {running && (
          <button type="button" className="btn" onClick={() => (stop.current = true)}>
            이번 사상가까지만 하고 멈추기
          </button>
        )}
      </div>
      {log.length > 0 && (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
          {log.map((x, i) => (
            <li key={i} className={x.ok ? "text-ok" : "text-danger"}>
              {x.ok ? "✓" : "✗"} {x.name} · {x.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
