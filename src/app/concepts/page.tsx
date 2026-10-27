import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { Empty, PageTitle } from "@/components/ui";
import { listConcepts } from "@/lib/data/queries";
import { listConceptsByPhilosopher } from "@/lib/data/study";

export const metadata = { title: "개념" };

const VIEWS = [
  { key: "philosopher", label: "사상가별" },
  { key: "count", label: "출제순" },
  { key: "name", label: "가나다순" },
] as const;

export default async function ConceptsPage({ searchParams }: PageProps<"/concepts">) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.sort)?.key ?? "philosopher";
  const header = (
    <PageTitle
      title="개념"
      subtitle="개념을 클릭하면 해당 개념이 등장한 모든 기출과 사상가별 정리를 볼 수 있습니다."
      actions={VIEWS.map((v) => (
        <Link key={v.key} href={`/concepts?sort=${v.key}`} className={view === v.key ? "btn-primary" : "btn"}>
          {v.label}
        </Link>
      ))}
    />
  );

  if (view === "philosopher") {
    const { data, error } = await load(listConceptsByPhilosopher);
    if (error || !data) return <DataError error={error} />;
    return (
      <div>
        {header}
        {data.length === 0 ? (
          <Empty>AI 분석을 실행하면 개념이 자동으로 등록됩니다.</Empty>
        ) : (
          <>
            <nav className="mb-4 flex flex-wrap gap-1.5 text-sm">
              {data.map((g) => (
                <a key={g.philosopher?.id ?? "none"} href={`#p-${g.philosopher?.id ?? "none"}`} className="rounded border border-line px-2 py-0.5 hover:border-navy hover:text-navy">
                  {g.philosopher?.name ?? "사상가 미지정"}
                </a>
              ))}
            </nav>
            <div className="space-y-4">
              {data.map((g) => (
                <section key={g.philosopher?.id ?? "none"} id={`p-${g.philosopher?.id ?? "none"}`} className="card scroll-mt-20 p-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-bold">
                      {g.philosopher ? (
                        <Link href={`/philosophers/${g.philosopher.id}#concepts`} className="hover:text-navy hover:underline">
                          {g.philosopher.name}
                        </Link>
                      ) : (
                        "사상가 미지정"
                      )}
                      <span className="ml-2 text-sm font-normal text-muted">개념 {g.concepts.length}개{g.total ? ` · 출제 ${g.total}문항` : ""}</span>
                    </h2>
                    {g.philosopher && (
                      <Link href={`/philosophers/${g.philosopher.id}#concepts`} className="text-xs text-navy">
                        {g.philosopher.name} 개념 정리 보기 →
                      </Link>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.concepts.map((c) => (
                      <Link
                        key={c.id}
                        href={`/concepts/${c.id}`}
                        className={`rounded-md border px-2.5 py-1 text-sm hover:border-navy hover:text-navy ${c.count ? "border-line" : "border-dashed border-line-strong text-muted"}`}
                        title={c.count ? `${c.count}회 출제 · 최근 ${c.lastYear}` : "아직 기출에 나오지 않은 개념"}
                      >
                        {c.name}
                        <span className="ml-1 text-xs text-faint">{c.count ? c.count : "미출제"}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <p className="mt-3 text-xs text-faint">
              개념의 사상가는 문항 분석에서 지정된 사상가를 따릅니다. 지정이 없으면 그 문항의 주요 사상가로 묶습니다. 점선은 아직 기출에 나오지 않은 개념입니다.
            </p>
          </>
        )}
      </div>
    );
  }

  const { data, error } = await load(listConcepts);
  if (error || !data) return <DataError error={error} />;
  const list = [...data].sort((a, b) => (view === "name" ? a.name.localeCompare(b.name) : b.count - a.count || a.name.localeCompare(b.name)));
  return (
    <div>
      {header}
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
