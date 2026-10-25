import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { Empty, PageTitle } from "@/components/ui";
import { listSources } from "@/lib/data/queries";

export const metadata = { title: "원전" };

export default async function SourcesPage() {
  const { data, error } = await load(listSources);
  if (error || !data) return <DataError error={error} />;
  const list = [...data].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  return (
    <div>
      <PageTitle title="원전" subtitle="원전별로 출제된 문장과 관련 기출을 볼 수 있습니다." />
      {list.length === 0 ? (
        <Empty>AI 원전 분석을 실행하거나 관리자 페이지에서 원전을 직접 등록하세요.</Empty>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <Link key={s.id} href={`/sources/${s.id}`} className="card px-4 py-3 hover:border-navy/50">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">『{s.title}』</span>
                <span className="text-sm font-semibold text-navy">{s.count}회</span>
              </div>
              <div className="mt-0.5 text-xs text-muted">{s.philosopher?.name ?? "사상가 미지정"}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
