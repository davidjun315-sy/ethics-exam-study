import Link from "next/link";
import { GitCompare } from "lucide-react";
import { SearchFilter } from "@/components/SearchFilter";
import { DataError, load } from "@/components/DataError";
import { Empty, PageTitle } from "@/components/ui";
import { cachedPhilosophers as listPhilosophers } from "@/lib/data/cached";
import { groupByTradition } from "@/lib/traditions";

export const metadata = { title: "사상가 탐구" };

const SECTOR_TONE: Record<string, string> = {
  동양윤리: "bg-[#e9f4ee] text-[#1f7a5c] dark:bg-[#15301f] dark:text-[#7cd0a5]",
  한국윤리: "bg-[#fbefe1] text-[#9a5a06] dark:bg-[#382a14] dark:text-[#f0c070]",
  서양윤리: "bg-[#ebeffa] text-[#4a66bf] dark:bg-[#1f2c47] dark:text-[#9db6ee]",
  사회사상: "bg-[#f2ebfa] text-[#7445b4] dark:bg-[#2a2140] dark:text-[#c7a6f2]",
};

export default async function PhilosophersPage() {
  const { data, error } = await load(listPhilosophers);
  if (error || !data) return <DataError error={error} />;
  const groups = groupByTradition(data);
  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle
        title="사상가 탐구"
        subtitle={`사상가 ${data.length}명 · 선택하면 개념 정리, 관련 기출, 원전, 비교 사상가를 볼 수 있습니다.`}
        actions={
          <Link href="/philosophers/compare" className="btn">
            <GitCompare className="h-4 w-4" aria-hidden />
            사상가 비교
          </Link>
        }
      />
      {data.length === 0 ? (
        <Empty>AI 분석을 실행하면 사상가가 자동으로 등록됩니다.</Empty>
      ) : (
        <div id="ph-list">
          <SearchFilter target="ph-list" placeholder="사상가 · 학파 · 시대로 찾기" />
          <nav aria-label="분야 바로가기" className="sticky top-[calc(3.5rem+var(--safe-top))] z-10 -mx-4 mb-3 flex gap-1.5 overflow-x-auto bg-bg/90 px-4 py-2 backdrop-blur [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
            {groups.map((g) => (
              <a key={g.chapter} href={`#sec-${g.chapter}`} className="chip shrink-0 !min-h-8">
                {g.chapter} <span className="num text-xs text-faint">{g.items.length}</span>
              </a>
            ))}
          </nav>
          <div className="space-y-6">
            {groups.map(({ chapter: g, items: list }) => (
              <section key={g} id={`sec-${g}`} data-group className="scroll-mt-32">
                <h2 className="mb-2 flex items-baseline gap-2 text-sm font-bold">
                  {g} <span className="text-xs font-normal text-faint">{list.length}명</span>
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {list
                    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
                    .map((p) => (
                      <Link
                        key={p.id}
                        href={`/philosophers/${p.id}`}
                        data-search={`${p.name} ${p.school ?? ""} ${p.era ?? ""}`}
                        className="card group flex items-center gap-3 px-3.5 py-3 transition-colors hover:border-navy/50"
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${SECTOR_TONE[g] ?? "bg-surface-2 text-muted"}`} aria-hidden>
                          {p.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-ink group-hover:text-navy">{p.name}</span>
                          {(p.school || p.era) && <span className="block truncate text-xs text-muted">{[p.school, p.era].filter(Boolean).join(" · ")}</span>}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="num block text-sm font-bold text-navy">{p.count}회</span>
                          {p.lastYear && <span className="num block text-[11px] text-faint">최근 {p.lastYear}</span>}
                        </span>
                      </Link>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
