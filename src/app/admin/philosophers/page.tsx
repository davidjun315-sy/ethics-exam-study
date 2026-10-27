import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getReadClient } from "@/lib/supabase/server";

export const metadata = { title: "사상가 페이지 편집" };

export default async function AdminPhilosophersPage() {
  const { data, error } = await load(async () => {
    const db = getReadClient();
    const [p, links, notes] = await Promise.all([
      db.from("philosophers").select("id, name, tradition").order("name"),
      db.from("question_philosophers").select("philosopher_id, role").limit(20000),
      db.from("philosopher_notes").select("philosopher_id, source, updated_at, edited"),
    ]);
    if (p.error) throw new Error(p.error.message);
    const count = new Map<string, number>();
    for (const l of links.data ?? []) if (l.role === "main" || l.role === "comparison") count.set(l.philosopher_id, (count.get(l.philosopher_id) ?? 0) + 1);
    const noteBy = new Map((notes.data ?? []).map((n) => [n.philosopher_id as string, n]));
    return {
      rows: (p.data ?? [])
        .map((x) => ({ ...x, count: count.get(x.id) ?? 0, note: noteBy.get(x.id) ?? null }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      notesMissing: Boolean(notes.error),
    };
  });
  if (error || !data) return <DataError error={error} />;
  return (
    <div className="space-y-4">
      <PageTitle
        title="사상가 페이지 편집"
        subtitle="사상가별 개념 정리 노트를 채팅 AI 로 만들고 고칩니다. 출제가 많은 사상가부터 보입니다."
        actions={<Link href="/admin" className="btn">관리자 홈</Link>}
      />
      {data.notesMissing && (
        <p className="rounded bg-danger-soft p-3 text-sm text-danger">
          philosopher_notes 테이블이 없습니다. Supabase SQL Editor 에서 supabase/migrations/003_philosopher_notes.sql 을 실행하세요.
        </p>
      )}
      {data.rows.length === 0 ? (
        <Empty>등록된 사상가가 없습니다.</Empty>
      ) : (
        <ul className="card divide-y divide-line">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <Link href={`/admin/philosophers/${r.id}`} className="font-semibold text-navy hover:underline">{r.name}</Link>
              {r.tradition && <span className="text-xs text-faint">{r.tradition}</span>}
              <span className="text-xs text-muted">출제 {r.count}문항</span>
              <span className="ml-auto">
                {r.note ? (
                  <Badge tone="ok">정리 노트 · {formatDate(r.note.updated_at)}</Badge>
                ) : (
                  <Badge>노트 없음</Badge>
                )}
              </span>
              <Link href={`/philosophers/${r.id}`} className="text-xs text-muted hover:text-navy">보기</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
