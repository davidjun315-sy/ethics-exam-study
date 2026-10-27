"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { NoteConcept, PhilosopherStudyNote as Note } from "@/lib/ai/schemas";
import { api } from "@/lib/admin-client";

export const EMPTY_NOTE: Note = {
  overview: { oneLine: "", summary: "", keywords: [] },
  sections: [],
  identification: { decisiveExpressions: [], tips: [] },
  comparisons: [],
  traps: [],
  answerTips: [],
  futureTopics: [],
  studyOrder: [],
  caveats: [],
};
const EMPTY_CONCEPT: NoteConcept = {
  name: "",
  originalTerm: null,
  definition: "",
  explanation: "",
  keyPoints: [],
  examPoints: [],
  confusions: [],
  relatedQuestionRefs: [],
};

// 목록 값은 "한 줄에 하나"로 편집한다
const toLines = (a: string[]) => a.join("\n");
const fromLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const toRefs = (a: string[]) => a.join(", ");
const fromRefs = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">
        {label} {hint && <span className="font-normal text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Lines({ label, value, onChange, rows = 3, hint = "한 줄에 하나" }: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number; hint?: string }) {
  // 입력 중에는 원문을 유지해야 빈 줄을 칠 수 있다
  const [text, setText] = useState(toLines(value));
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="input text-sm"
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(fromLines(e.target.value));
        }}
      />
    </Field>
  );
}

function Refs({ value, onChange, refs }: { value: string[]; onChange: (v: string[]) => void; refs: string[] }) {
  const [text, setText] = useState(toRefs(value));
  return (
    <Field label="관련 기출" hint="쉼표로 구분 (예: 2024 A 3번)">
      <input
        className="input text-sm"
        list="note-refs"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(fromRefs(e.target.value));
        }}
      />
      {value.some((r) => !refs.includes(r)) && <p className="mt-0.5 text-xs text-warn">목록에 없는 기출은 저장할 때 지워집니다.</p>}
    </Field>
  );
}

function Toolbar({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <span className="ml-auto flex shrink-0 gap-1">
      <button type="button" className="btn !px-2 !py-0.5 text-xs" onClick={(e) => {
          e.preventDefault();
          onUp();
        }} aria-label="위로">▲</button>
      <button type="button" className="btn !px-2 !py-0.5 text-xs" onClick={(e) => {
          e.preventDefault();
          onDown();
        }} aria-label="아래로">▼</button>
      <button type="button" className="btn !px-2 !py-0.5 text-xs text-danger" onClick={(e) => {
          e.preventDefault();
          onRemove();
        }} aria-label="삭제">✕</button>
    </span>
  );
}

function ConceptEditor({ c, set, refs }: { c: NoteConcept; set: (c: NoteConcept) => void; refs: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label="개념명">
        <input className="input" value={c.name} onChange={(e) => set({ ...c, name: e.target.value })} />
      </Field>
      <Field label="한자 / 원어">
        <input className="input" value={c.originalTerm ?? ""} onChange={(e) => set({ ...c, originalTerm: e.target.value || null })} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="정의">
          <textarea className="input text-sm" rows={2} value={c.definition} onChange={(e) => set({ ...c, definition: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="설명">
          <textarea className="input text-sm" rows={4} value={c.explanation} onChange={(e) => set({ ...c, explanation: e.target.value })} />
        </Field>
      </div>
      <Lines label="요점" value={c.keyPoints} onChange={(v) => set({ ...c, keyPoints: v })} />
      <Lines label="기출에서는" value={c.examPoints} onChange={(v) => set({ ...c, examPoints: v })} />
      <div className="sm:col-span-2">
        <Lines
          label="헷갈리기 쉬운 것"
          hint="한 줄에 하나: 대상 :: 구별법"
          value={c.confusions.map((x) => `${x.with} :: ${x.distinction}`)}
          onChange={(v) =>
            set({
              ...c,
              confusions: v.map((line) => {
                const [w, ...rest] = line.split("::");
                return { with: w.trim(), distinction: rest.join("::").trim() };
              }),
            })
          }
        />
      </div>
      <div className="sm:col-span-2">
        <Refs value={c.relatedQuestionRefs} onChange={(v) => set({ ...c, relatedQuestionRefs: v })} refs={refs} />
      </div>
    </div>
  );
}

/**
 * 개념 정리 노트 편집기. 붙여넣은 AI 정리를 단원·개념 단위로 고치거나 처음부터 직접 쓴다.
 * key 를 바꿔 다시 마운트하면 서버의 최신 노트로 초기화된다.
 */
export function NoteEditor({ philosopherId, initial, refs, hasNote }: { philosopherId: string; initial: Note | null; refs: string[]; hasNote: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState<Note>(initial ?? EMPTY_NOTE);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(0); // 목록 순서가 바뀌면 줄 단위 입력칸을 새로 그린다

  const update = (n: Note) => {
    setNote(n);
    setDirty(true);
    setMsg(null);
  };
  const reorder = (n: Note) => {
    update(n);
    setRev((r) => r + 1);
  };

  async function save() {
    let content: unknown = note;
    if (mode === "json") {
      try {
        content = JSON.parse(json);
      } catch (e) {
        setMsg({ ok: false, text: `JSON 형식 오류: ${e instanceof Error ? e.message : String(e)}` });
        return;
      }
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ dropped: string[]; concepts: number }>(`/api/admin/philosophers/${philosopherId}/note`, "PUT", { content });
      setDirty(false);
      setMsg({ ok: true, text: `저장했습니다. (개념 ${r.concepts}개${r.dropped.length ? ` · 없는 기출 ref 제거: ${r.dropped.join(", ")}` : ""})` });
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("개념 정리 노트를 삭제할까요? 사상가 페이지에는 기출 분석 모아보기가 대신 나옵니다.")) return;
    setBusy(true);
    try {
      await api(`/api/admin/philosophers/${philosopherId}/note`, "DELETE");
      setNote(EMPTY_NOTE);
      setDirty(false);
      setMsg({ ok: true, text: "삭제했습니다." });
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const sections = note.sections;
  const setSection = (i: number, s: Note["sections"][number]) => update({ ...note, sections: sections.map((x, j) => (j === i ? s : x)) });

  return (
    <div className="space-y-4" key={rev}>
      <datalist id="note-refs">
        {refs.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line p-0.5">
          {(["form", "json"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`rounded-md px-3 py-1 text-sm ${mode === m ? "bg-navy text-white dark:text-[#0f141c]" : "text-muted"}`}
              onClick={() => {
                if (m === "json") setJson(JSON.stringify(note, null, 2));
                setMode(m);
              }}
            >
              {m === "form" ? "항목별 편집" : "JSON 편집"}
            </button>
          ))}
        </div>
        {dirty && <span className="text-xs text-warn">저장하지 않은 변경 사항이 있습니다.</span>}
      </div>

      {mode === "json" ? (
        <textarea
          className="input min-h-[60vh] font-mono text-xs"
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setDirty(true);
          }}
        />
      ) : (
        <>
          <fieldset className="card space-y-2 p-4">
            <legend className="px-1 text-sm font-bold">큰 그림</legend>
            <Field label="한 문장 요약">
              <input className="input" value={note.overview.oneLine} onChange={(e) => update({ ...note, overview: { ...note.overview, oneLine: e.target.value } })} />
            </Field>
            <Field label="사상 전체 요약">
              <textarea className="input text-sm" rows={4} value={note.overview.summary} onChange={(e) => update({ ...note, overview: { ...note.overview, summary: e.target.value } })} />
            </Field>
            <Field label="핵심 키워드" hint="쉼표로 구분">
              <input
                className="input"
                defaultValue={toRefs(note.overview.keywords)}
                onChange={(e) => update({ ...note, overview: { ...note.overview, keywords: fromRefs(e.target.value) } })}
              />
            </Field>
            <Lines label="추천 공부 순서" value={note.studyOrder} onChange={(v) => update({ ...note, studyOrder: v })} rows={4} />
          </fieldset>

          <div className="space-y-3">
            <h3 className="text-sm font-bold">단원 · 개념 <span className="font-normal text-faint">(위에서부터 순서대로 보입니다)</span></h3>
            {sections.map((s, si) => (
              <fieldset key={si} className="card space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-faint">단원 {si + 1}</span>
                  <Toolbar
                    onUp={() => reorder({ ...note, sections: move(sections, si, -1) })}
                    onDown={() => reorder({ ...note, sections: move(sections, si, 1) })}
                    onRemove={() => confirm(`'${s.title || `단원 ${si + 1}`}' 단원을 삭제할까요?`) && reorder({ ...note, sections: sections.filter((_, j) => j !== si) })}
                  />
                </div>
                <Field label="단원 제목">
                  <input className="input font-semibold" value={s.title} onChange={(e) => setSection(si, { ...s, title: e.target.value })} />
                </Field>
                <Field label="단원 소개">
                  <textarea className="input text-sm" rows={2} value={s.intro ?? ""} onChange={(e) => setSection(si, { ...s, intro: e.target.value || null })} />
                </Field>
                <div className="space-y-2">
                  {s.concepts.map((c, ci) => (
                    <details key={ci} className="rounded-lg border border-line p-3">
                      <summary className="flex cursor-pointer items-center gap-2">
                        <span className="text-xs text-faint">{si + 1}-{ci + 1}</span>
                        <span className="font-semibold text-navy">{c.name || "(이름 없음)"}</span>
                        <Toolbar
                          onUp={() => reorder({ ...note, sections: sections.map((x, j) => (j === si ? { ...x, concepts: move(x.concepts, ci, -1) } : x)) })}
                          onDown={() => reorder({ ...note, sections: sections.map((x, j) => (j === si ? { ...x, concepts: move(x.concepts, ci, 1) } : x)) })}
                          onRemove={() =>
                            confirm(`'${c.name}' 개념을 삭제할까요?`) &&
                            reorder({ ...note, sections: sections.map((x, j) => (j === si ? { ...x, concepts: x.concepts.filter((_, k) => k !== ci) } : x)) })
                          }
                        />
                      </summary>
                      <div className="mt-2">
                        <ConceptEditor c={c} refs={refs} set={(nc) => setSection(si, { ...s, concepts: s.concepts.map((x, k) => (k === ci ? nc : x)) })} />
                      </div>
                    </details>
                  ))}
                  <button type="button" className="btn text-sm" onClick={() => reorder({ ...note, sections: sections.map((x, j) => (j === si ? { ...x, concepts: [...x.concepts, { ...EMPTY_CONCEPT }] } : x)) })}>
                    + 개념 추가
                  </button>
                </div>
              </fieldset>
            ))}
            <button type="button" className="btn" onClick={() => reorder({ ...note, sections: [...sections, { title: `${sections.length + 1}. `, intro: null, concepts: [{ ...EMPTY_CONCEPT }] }] })}>
              + 단원 추가
            </button>
          </div>

          <fieldset className="card grid gap-2 p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-bold">판별법</legend>
            <Lines label="결정적 표현" value={note.identification.decisiveExpressions} onChange={(v) => update({ ...note, identification: { ...note.identification, decisiveExpressions: v } })} />
            <Lines label="판별 요령" value={note.identification.tips} onChange={(v) => update({ ...note, identification: { ...note.identification, tips: v } })} />
          </fieldset>

          <fieldset className="card space-y-3 p-4">
            <legend className="px-1 text-sm font-bold">비교 정리</legend>
            {note.comparisons.map((c, i) => {
              const setC = (nc: Note["comparisons"][number]) => update({ ...note, comparisons: note.comparisons.map((x, j) => (j === i ? nc : x)) });
              return (
                <div key={i} className="space-y-2 rounded-lg border border-line p-3">
                  <div className="flex items-center gap-2">
                    <input className="input !w-56 font-semibold" placeholder="비교 대상" value={c.other} onChange={(e) => setC({ ...c, other: e.target.value })} />
                    <Toolbar
                      onUp={() => reorder({ ...note, comparisons: move(note.comparisons, i, -1) })}
                      onDown={() => reorder({ ...note, comparisons: move(note.comparisons, i, 1) })}
                      onRemove={() => reorder({ ...note, comparisons: note.comparisons.filter((_, j) => j !== i) })}
                    />
                  </div>
                  <Field label="공통점">
                    <input className="input text-sm" value={c.common ?? ""} onChange={(e) => setC({ ...c, common: e.target.value || null })} />
                  </Field>
                  <Lines
                    label="차이"
                    hint="한 줄에 하나: 쟁점 | 이 사상가 | 상대"
                    rows={4}
                    value={c.differences.map((d) => `${d.aspect} | ${d.mine} | ${d.theirs}`)}
                    onChange={(v) =>
                      setC({
                        ...c,
                        differences: v.map((line) => {
                          const [aspect = "", mine = "", ...theirs] = line.split("|").map((x) => x.trim());
                          return { aspect, mine, theirs: theirs.join(" | ") };
                        }),
                      })
                    }
                  />
                  <Refs value={c.relatedQuestionRefs} onChange={(v) => setC({ ...c, relatedQuestionRefs: v })} refs={refs} />
                </div>
              );
            })}
            <button type="button" className="btn text-sm" onClick={() => reorder({ ...note, comparisons: [...note.comparisons, { other: "", common: null, differences: [], relatedQuestionRefs: [] }] })}>
              + 비교 추가
            </button>
          </fieldset>

          <fieldset className="card space-y-3 p-4">
            <legend className="px-1 text-sm font-bold">출제자가 노린 함정</legend>
            {note.traps.map((t, i) => {
              const setT = (nt: Note["traps"][number]) => update({ ...note, traps: note.traps.map((x, j) => (j === i ? nt : x)) });
              return (
                <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <span className="text-xs text-faint">함정 {i + 1}</span>
                    <Toolbar
                      onUp={() => reorder({ ...note, traps: move(note.traps, i, -1) })}
                      onDown={() => reorder({ ...note, traps: move(note.traps, i, 1) })}
                      onRemove={() => reorder({ ...note, traps: note.traps.filter((_, j) => j !== i) })}
                    />
                  </div>
                  <Field label="✕ 함정 · 오개념">
                    <textarea className="input text-sm" rows={2} value={t.trap} onChange={(e) => setT({ ...t, trap: e.target.value })} />
                  </Field>
                  <Field label="○ 바른 이해">
                    <textarea className="input text-sm" rows={2} value={t.correction} onChange={(e) => setT({ ...t, correction: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Refs value={t.relatedQuestionRefs} onChange={(v) => setT({ ...t, relatedQuestionRefs: v })} refs={refs} />
                  </div>
                </div>
              );
            })}
            <button type="button" className="btn text-sm" onClick={() => reorder({ ...note, traps: [...note.traps, { trap: "", correction: "", relatedQuestionRefs: [] }] })}>
              + 함정 추가
            </button>
          </fieldset>

          <fieldset className="card grid gap-2 p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-bold">답안 · 확장 · 주의</legend>
            <Lines label="서술형 답안 요령" value={note.answerTips} onChange={(v) => update({ ...note, answerTips: v })} />
            <Lines
              label="확장될 수 있는 주제"
              hint="한 줄에 하나: 주제 :: 이유"
              value={note.futureTopics.map((f) => `${f.topic} :: ${f.reason}`)}
              onChange={(v) =>
                update({
                  ...note,
                  futureTopics: v.map((line) => {
                    const [topic, ...rest] = line.split("::");
                    return { topic: topic.trim(), reason: rest.join("::").trim() };
                  }),
                })
              }
            />
            <div className="sm:col-span-2">
              <Lines label="확인이 필요한 부분" value={note.caveats} onChange={(v) => update({ ...note, caveats: v })} rows={2} />
            </div>
          </fieldset>
        </>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/95 p-2 backdrop-blur">
        <button type="button" className="btn-primary" disabled={busy || pending || !dirty} onClick={save}>
          {busy || pending ? "저장 중…" : "수정 내용 저장"}
        </button>
        {hasNote && (
          <button type="button" className="btn text-danger" disabled={busy || pending} onClick={remove}>
            노트 삭제
          </button>
        )}
        {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
