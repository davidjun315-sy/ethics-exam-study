import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/admin/NoteEditor";
import { NotePaste, PhilosopherInfoForm } from "@/components/admin/PhilosopherAdmin";
import { DataError, load } from "@/components/DataError";
import { Badge, PageTitle } from "@/components/ui";
import { getPhilosopherNote } from "@/lib/data/notes";
import { getPhilosopherNotebook } from "@/lib/data/study";
import { formatDate } from "@/lib/format";
import { noteFreshness } from "@/lib/study/notes";
import { getReadClient } from "@/lib/supabase/server";
import type { Philosopher } from "@/lib/types";

export const metadata = { title: "사상가 페이지 편집" };

export default async function AdminPhilosopherPage({ params }: PageProps<"/admin/philosophers/[id]">) {
  const { id } = await params;
  const { data, error } = await load(async () => {
    const { data: p } = await getReadClient().from("philosophers").select("*").eq("id", id).maybeSingle();
    if (!p) return null;
    const [notebook, note] = await Promise.all([getPhilosopherNotebook(p as Philosopher), getPhilosopherNote(id)]);
    return { philosopher: p as Philosopher, notebook, note };
  });
  if (error) return <DataError error={error} />;
  if (!data) notFound();
  const { philosopher: p, notebook, note } = data;
  const refs = notebook.timeline.map((q) => q.ref);
  const fresh = note ? noteFreshness(note.based_on_question_ids, notebook.timeline.map((q) => q.id)) : null;

  return (
    <div className="space-y-6">
      <PageTitle
        title={`${p.name} — 페이지 편집`}
        subtitle="기출 AI 분석을 채팅 AI 로 정리해 붙여넣으면, 사상가 페이지에 '개념 정리'가 메인으로 보입니다."
        actions={
          <>
            <Link href="/admin/philosophers" className="btn">사상가 목록</Link>
            <Link href={`/philosophers/${p.id}`} className="btn">사상가 페이지 보기</Link>
          </>
        }
      />

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-[15px] font-bold">① 채팅 AI 로 개념 정리하기</h2>
          <span className="text-xs text-faint">분석 완료 기출 {notebook.timeline.length}문항 · 개념 {notebook.concepts.length}개가 프롬프트에 들어갑니다</span>
        </div>
        <ol className="list-decimal space-y-0.5 pl-5 text-sm text-muted">
          <li>‘개념 정리 프롬프트 복사’를 누릅니다. (이 사상가의 문항별 AI 분석이 모두 담깁니다)</li>
          <li>Claude · ChatGPT · Gemini 채팅에 붙여넣고 보냅니다. 답이 길어 끊기면 “이어서”라고 보내세요.</li>
          <li>답 전체(```json … ```)를 복사해 아래 칸에 붙여넣고 저장합니다.</li>
        </ol>
        {notebook.timeline.length === 0 ? (
          <p className="text-sm text-warn">이 사상가가 나온 분석 완료 문항이 없습니다. 먼저 기출 문항을 분석하세요. (아래에서 직접 작성은 가능합니다)</p>
        ) : (
          <NotePaste philosopherId={p.id} hasNote={Boolean(note)} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold">② 개념 정리 노트 수정</h2>
          {note ? (
            <>
              <Badge tone="ok">{note.source ?? "AI"} · {formatDate(note.updated_at)}</Badge>
              <span className="text-xs text-faint">기출 {note.based_on_question_ids.length}문항 기준{note.edited ? " · 직접 수정됨" : ""}</span>
              {fresh && fresh.added.length > 0 && (
                <Badge tone="warn">정리 이후 {fresh.added.length}문항이 더 분석됨 — ①로 다시 정리하면 반영됩니다</Badge>
              )}
            </>
          ) : (
            <span className="text-xs text-faint">아직 노트가 없습니다. ①로 만들거나 여기서 직접 작성하세요.</span>
          )}
        </div>
        <NoteEditor key={note?.updated_at ?? "new"} philosopherId={p.id} initial={note?.content ?? null} refs={refs} hasNote={Boolean(note)} />
      </section>

      <section className="card p-4">
        <details>
          <summary className="cursor-pointer text-[15px] font-bold">③ 사상가 기본 정보 수정</summary>
          <div className="mt-3">
            <PhilosopherInfoForm philosopher={p} />
          </div>
        </details>
      </section>
    </div>
  );
}
