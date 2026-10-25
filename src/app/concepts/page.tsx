import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { Empty, PageTitle } from "@/components/ui";
import { listConcepts } from "@/lib/data/queries";

export const metadata = { title: "개념" };

export default async function ConceptsPage({ searchParams }: PageProps<"/concepts">) {
  const sp = await searchParams;
  const sort = sp.sort === "name" ? "name" : "count";
  const { data, error } = await load(listConcepts);
  if (error || !data) return <DataError error={error} />;
  const list = [...data].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.count - a.count || a.name.localeCompare(b.name)));
  return (
    <div>
      <PageTitle
        title="개념"
        subtitle="개념을 클릭하면 해당 개념이 등장한 모든 기출을 볼 수 있습니다."
        actions={
          <>
            <Link href="/concepts" className={sort === "count" ? "btn-primary" : "btn"}>출제순</Link>
            <Link href="/concepts?sort=name" className={sort === "name" ? "btn-primary" : "btn"}>가나다순</Link>
          </>
        }
      />
      {list.length === 0 ? (
        <Empty>AI 분석을 실행하면 개념이 자동으로 등록됩니다.</Empty>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((c) => (
            <Link key={c.id} href={`/concepts/${c.id}`} className="card px-4 py-3 hover:border-navy/50">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{c.name}</span>
                <span className="text-sm font-semibold text-navy">{c.count}회</span>
              </div>
              <div className="mt-0.5 line-clamp-1 text-xs text-muted">
                {c.philosophers.join(", ") || "-"}
                {c.lastYear ? ` · 최근 ${c.lastYear}` : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
