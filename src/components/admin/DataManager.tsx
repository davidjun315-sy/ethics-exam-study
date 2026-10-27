"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/admin-client";
import type { Concept, Philosopher, Source, SourcePassage } from "@/lib/types";

type Tab = "philosophers" | "concepts" | "sources" | "source_passages";
type FieldKind = "text" | "textarea" | "list" | "philosopher" | "source";
interface Field {
  key: string;
  label: string;
  kind: FieldKind;
}

const FIELDS: Record<Tab, Field[]> = {
  philosophers: [
    { key: "name", label: "이름", kind: "text" },
    { key: "aliases", label: "다른 이름 (쉼표)", kind: "list" },
    { key: "original_name", label: "원어 / 한자", kind: "text" },
    { key: "tradition", label: "영역 (동양윤리 등)", kind: "text" },
    { key: "school", label: "학파", kind: "text" },
    { key: "era", label: "시대", kind: "text" },
    { key: "core_ideas", label: "핵심 사상", kind: "textarea" },
    { key: "description", label: "설명", kind: "textarea" },
  ],
  concepts: [
    { key: "name", label: "개념명", kind: "text" },
    { key: "aliases", label: "다른 표현 (쉼표)", kind: "list" },
    { key: "definition", label: "정의", kind: "textarea" },
    { key: "similar_concepts", label: "유사 개념 (쉼표)", kind: "list" },
    { key: "confusable_concepts", label: "반대 / 혼동 개념 (쉼표)", kind: "list" },
  ],
  sources: [
    { key: "title", label: "원전명 (『』 없이)", kind: "text" },
    { key: "aliases", label: "다른 이름 (쉼표)", kind: "list" },
    { key: "philosopher_id", label: "사상가", kind: "philosopher" },
    { key: "summary", label: "핵심 내용", kind: "textarea" },
  ],
  source_passages: [
    { key: "source_id", label: "원전", kind: "source" },
    { key: "volume", label: "권", kind: "text" },
    { key: "chapter", label: "장 / 편", kind: "text" },
    { key: "section", label: "절", kind: "text" },
    { key: "page", label: "페이지", kind: "text" },
    { key: "original_text", label: "원문", kind: "textarea" },
    { key: "translation", label: "번역문", kind: "textarea" },
    { key: "citation", label: "출처 (번역본 등)", kind: "text" },
    { key: "related_concepts", label: "관련 개념 (쉼표)", kind: "list" },
    { key: "note", label: "메모", kind: "textarea" },
  ],
};

const TAB_LABEL: Record<Tab, string> = { philosophers: "사상가", concepts: "개념", sources: "원전", source_passages: "원문 / 번역문" };
const PUBLIC_PATH: Partial<Record<Tab, string>> = { philosophers: "/philosophers", concepts: "/concepts", sources: "/sources" };

type Row = Record<string, unknown> & { id: string };

export function DataManager({
  tab,
  philosophers,
  concepts,
  sources,
  passages,
}: {
  tab: Tab;
  philosophers: Philosopher[];
  concepts: Concept[];
  sources: Source[];
  passages: SourcePassage[];
}) {
  const router = useRouter();
  const rows: Row[] = useMemo(
    () => ({ philosophers, concepts, sources, source_passages: passages })[tab] as unknown as Row[],
    [tab, philosophers, concepts, sources, passages],
  );
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sourceTitle = new Map(sources.map((s) => [s.id, s.title]));
  const philName = new Map(philosophers.map((p) => [p.id, p.name]));

  const titleOf = (r: Row) =>
    tab === "source_passages"
      ? `『${sourceTitle.get(r.source_id as string) ?? "?"}』 ${[r.volume, r.chapter].filter(Boolean).join(" ")} — ${String(r.original_text ?? r.translation ?? "").slice(0, 40)}`
      : String(r.name ?? r.title);
  const filtered = rows.filter((r) => !q || titleOf(r).includes(q));

  function open(r: Row | "new") {
    setEditing(r);
    setError(null);
    const d: Record<string, string> = {};
    for (const f of FIELDS[tab]) {
      const v = r === "new" ? undefined : r[f.key];
      d[f.key] = Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : String(v);
    }
    setDraft(d);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    for (const f of FIELDS[tab]) {
      const v = draft[f.key] ?? "";
      if (f.kind === "list") body[f.key] = v.split(",").map((s) => s.trim()).filter(Boolean);
      else body[f.key] = v.trim() === "" ? null : v;
    }
    try {
      if (editing === "new") await api(`/api/admin/entities/${tab}`, "POST", body);
      else if (editing) await api(`/api/admin/entities/${tab}/${editing.id}`, "PATCH", body);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Row) {
    if (!confirm(`'${titleOf(r)}' 을(를) 삭제할까요? 기출과의 연결도 함께 삭제됩니다.`)) return;
    try {
      await api(`/api/admin/entities/${tab}/${r.id}`, "DELETE");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <Link key={t} href={`/admin/data?tab=${t}`} className={t === tab ? "btn-primary" : "btn"}>
            {TAB_LABEL[t]}
          </Link>
        ))}
        <input className="input ml-auto !w-56" placeholder="목록에서 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" onClick={() => open("new")}>+ 새 {TAB_LABEL[tab]}</button>
      </div>
      {error && <p className="rounded bg-danger-soft p-3 text-sm text-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_28rem]">
        <ul className="card max-h-[70vh] divide-y divide-line overflow-auto">
          {filtered.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 px-4 py-2 text-sm ${editing !== "new" && editing?.id === r.id ? "bg-navy-soft" : ""}`}>
              <button className="flex-1 truncate text-left hover:text-navy" onClick={() => open(r)}>
                {titleOf(r)}
                {tab === "sources" && r.philosopher_id ? <span className="ml-2 text-xs text-muted">{philName.get(r.philosopher_id as string)}</span> : null}
              </button>
              {tab === "philosophers" && (
                <Link href={`/admin/philosophers/${r.id}`} className="text-xs text-navy hover:underline">페이지 편집</Link>
              )}
              {PUBLIC_PATH[tab] && (
                <Link href={`${PUBLIC_PATH[tab]}/${r.id}`} className="text-xs text-muted hover:text-navy">보기</Link>
              )}
              <button className="text-xs text-danger" onClick={() => remove(r)}>삭제</button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">항목이 없습니다.</li>}
        </ul>

        {editing && (
          <form
            className="card space-y-2 self-start p-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <h2 className="text-sm font-bold">{editing === "new" ? `새 ${TAB_LABEL[tab]}` : "수정"}</h2>
            {FIELDS[tab].map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                {f.kind === "textarea" ? (
                  <textarea className="input min-h-24" value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                ) : f.kind === "philosopher" ? (
                  <select className="input" value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                    <option value="">미지정</option>
                    {philosophers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) : f.kind === "source" ? (
                  <select className="input" value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} required>
                    <option value="">원전 선택</option>
                    {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                ) : (
                  <input className="input" value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button className="btn-primary" disabled={busy}>저장</button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>취소</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
