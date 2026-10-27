import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { Empty, PageTitle } from "@/components/ui";
import { listPhilosophers } from "@/lib/data/queries";
import { groupByTradition } from "@/lib/traditions";

export const metadata = { title: "사상가" };

export default async function PhilosophersPage() {
  const { data, error } = await load(listPhilosophers);
  if (error || !data) return <DataError error={error} />;
  const groups = groupByTradition(data);
  return (
    <div>
      <PageTitle
        title="사상가"
        subtitle="사상가를 선택하면 관련 기출, 주요 개념, 원전, 함께 비교되는 사상가를 볼 수 있습니다."
        actions={<Link href="/philosophers/compare" className="btn-primary">사상가 비교</Link>}
      />
      {data.length === 0 ? (
        <Empty>AI 분석을 실행하면 사상가가 자동으로 등록됩니다.</Empty>
      ) : (
        <div className="space-y-5">
          {groups.map(({ chapter: g, items: list }) => (
            <section key={g}>
              <h2 className="mb-2 text-sm font-bold text-muted">{g}</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {list
                  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
                  .map((p) => (
                    <Link key={p.id} href={`/philosophers/${p.id}`} className="card px-4 py-3 hover:border-navy/50">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold text-ink">{p.name}</span>
                        <span className="text-sm font-semibold text-navy">{p.count}회</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {[p.school, p.era].filter(Boolean).join(" · ") || "-"}
                        {p.lastYear ? ` · 최근 ${p.lastYear}` : ""}
                      </div>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
