import Link from "next/link";
import { NoteBulkGenerate, TraditionSelect } from "@/components/admin/PhilosopherAdmin";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { NOTE_PROMPT_VERSION } from "@prompts/philosopher-notes";
import { DataError, load } from "@/components/DataError";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getReadClient } from "@/lib/supabase/server";
import { classifyPhilosopher, groupByTradition, UNCLASSIFIED } from "@/lib/traditions";

export const metadata = { title: "사상가 페이지 편집" };

export default async function AdminPhilosophersPage() {
  const { data, error } = await load(async () => {
    const db = getReadClient();
    const [p, links, notes] = await Promise.all([
      db.from("philosophers").select("id, name, tradition, school").order("name"),
      db.from("question_philosophers").select("philosopher_id, role").limit(20000),
      db.from("philosopher_notes").select("philosopher_id, source, updated_at, edited, prompt_version"),
    ]);
    if (p.error) throw new Error(p.error.message);
    const count = new Map<string, number>();
    for (const l of links.data ?? []) if (l.role === "main" || l.role === "comparison") count.set(l.philosopher_id, (count.get(l.philosopher_id) ?? 0) + 1);
    const noteBy = new Map((notes.data ?? []).map((n) => [n.philosopher_id as string, n]));
    const rows = (p.data ?? [])
      .map((x) => ({ ...x, count: count.get(x.id) ?? 0, note: noteBy.get(x.id) ?? null }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    // 새 정리 방식(맨 앞 등장 배경 · 핵심어 설명)이 아닌 노트 → 출제 많은 순으로 다시 정리 대상
    const outdated = rows.filter((r) => r.note && r.count > 0 && (r.note as { prompt_version?: string | null }).prompt_version !== NOTE_PROMPT_VERSION).map((r) => ({ id: r.id, name: r.name }));
    return { groups: groupByTradition(rows), total: rows.length, notesMissing: Boolean(notes.error), outdated };
  });
  if (error || !data) return <DataError error={error} />;
  return (
    <div className="space-y-4">
      <PageTitle
        title="사상가 페이지 편집"
        subtitle="사상가별 개념 정리 노트를 채팅 AI 로 만들고 고칩니다. 분야별로, 출제가 많은 사상가부터 보입니다."
        actions={<Link href="/admin" className="btn">관리자 홈</Link>}
      />
      {data.notesMissing && (
        <p className="rounded bg-danger-soft p-3 text-sm text-danger">
          philosopher_notes 테이블이 없습니다. Supabase SQL Editor 에서 supabase/migrations/003_philosopher_notes.sql 을 실행하세요.
        </p>
      )}
      {!data.notesMissing && isGeminiConfigured() && (
        <section className="card space-y-2 p-4">
          <h2 className="text-[15px] font-bold">개념 정리 새 방식으로 다시 정리</h2>
          <p className="text-xs text-muted">새 방식: 맨 앞에 사상가 등장 배경 · 핵심어를 풀어 바꾸지 않고 그대로 쓰며 쉽게 설명. 노트는 사상가마다 무료 AI 로 다시 만들 수 있습니다.</p>
          <NoteBulkGenerate targets={data.outdated} />
        </section>
      )}
      {data.total === 0 ? (
        <Empty>등록된 사상가가 없습니다.</Empty>
      ) : (
        <>
          <nav className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
            {data.groups.map((g) => (
              <a key={g.chapter} href={`#ch-${g.chapter}`} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink">
                {g.chapter} <span className="text-xs text-faint">{g.items.length}</span>
              </a>
            ))}
          </nav>
          {data.groups.map((g) => {
            const done = g.items.filter((r) => r.note).length;
            return (
              <section key={g.chapter} id={`ch-${g.chapter}`} className="scroll-mt-20">
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h2 className="text-[15px] font-bold">{g.chapter}</h2>
                  <span className="text-xs text-faint">
                    {g.items.length}명 · 정리 노트 {done}/{g.items.length}
                  </span>
                  {g.chapter === UNCLASSIFIED && <span className="text-xs text-warn">오른쪽에서 분야를 고르면 해당 챕터로 옮겨집니다.</span>}
                </div>
                <ul className="card divide-y divide-line">
                  {g.items.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                      <Link href={`/admin/philosophers/${r.id}`} className="font-semibold text-navy hover:underline">{r.name}</Link>
                      {r.school && <span className="text-xs text-faint">{r.school}</span>}
                      <span className="text-xs text-muted">출제 {r.count}문항</span>
                      <span className="ml-auto flex items-center gap-2">
                        {r.note ? <Badge tone="ok">정리 노트 · {formatDate(r.note.updated_at)}</Badge> : <Badge>노트 없음</Badge>}
                        <TraditionSelect id={r.id} value={classifyPhilosopher(r)} raw={r.tradition} />
                        <Link href={`/philosophers/${r.id}`} className="text-xs text-muted hover:text-navy">보기</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
