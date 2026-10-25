import { BarList, Heatmap } from "@/components/charts";
import { DataError, load } from "@/components/DataError";
import { Empty, PageTitle, SectionTitle, StatCard } from "@/components/ui";
import { getTrends } from "@/lib/data/queries";

export const metadata = { title: "출제분석" };

function Panel({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="card p-4">
      <SectionTitle right={note && <span className="text-xs text-faint">{note}</span>}>{title}</SectionTitle>
      {children}
    </section>
  );
}

export default async function TrendsPage() {
  const { data: t, error } = await load(getTrends);
  if (error || !t) return <DataError error={error} />;
  if (t.total === 0) {
    return (
      <div>
        <PageTitle title="출제분석" />
        <Empty>기출 데이터가 쌓이면 통계가 표시됩니다.</Empty>
      </div>
    );
  }
  const yearsAsc = [...t.years].sort((a, b) => a - b);
  const heatRows = t.philosopherCounts.slice(0, 25);
  const recentPhil = t.philosopherCounts
    .map((p) => ({ ...p, count: p.years.filter((y) => t.recentYears.includes(y)).length }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalArea = t.areaCounts.reduce((s, a) => s + a.count, 0) || 1;

  return (
    <div className="space-y-6">
      <PageTitle title="출제분석" subtitle="누적된 기출 DB 를 기준으로 계산합니다. (오답 유도·단순 언급 사상가는 출제 횟수에서 제외)" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="분석 대상 문항" value={t.total} />
        <StatCard label="학년도 범위" value={t.years.length ? `${Math.min(...t.years)}~${Math.max(...t.years)}` : "-"} />
        <StatCard label="출제 사상가" value={t.philosopherCounts.length} />
        <StatCard label="출제 개념" value={t.conceptCounts.length} />
      </div>

      <Panel title="연도별 사상가 출제 빈도" note="셀 = 해당 학년도 출제 문항 수">
        <Heatmap years={yearsAsc} rows={heatRows} values={t.yearPhilosopher} hrefBase="/philosophers" />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="사상가별 출제 횟수">
          <BarList rows={t.philosopherCounts} hrefBase="/philosophers" sub={(r) => (r.lastYear ? `최근 ${r.lastYear}` : null)} />
        </Panel>
        <Panel title="개념별 출제 횟수">
          <BarList rows={t.conceptCounts} hrefBase="/concepts" />
        </Panel>
        <Panel title="원전별 출제 횟수">
          <BarList rows={t.sourceCounts.map((s) => ({ ...s, name: `『${s.name}』` }))} hrefBase="/sources" />
        </Panel>
        <Panel title="영역별 출제 비율">
          <BarList
            rows={t.areaCounts}
            unit="문항"
            sub={(r) => `${Math.round((r.count / totalArea) * 100)}%`}
          />
        </Panel>
        <Panel title={`최근 5년 출제 사상가 (${t.recentYears.length ? `${Math.min(...t.recentYears)}~${Math.max(...t.recentYears)}` : "-"})`} note="출제된 학년도 수">
          <BarList rows={recentPhil} hrefBase="/philosophers" unit="년" />
        </Panel>
        <Panel title="최근 5년 주요 개념">
          <BarList rows={t.recentConceptCounts} hrefBase="/concepts" />
        </Panel>
        <Panel title="반복 출제 개념" note="2개 이상 학년도에 출제">
          <BarList rows={t.repeatedConcepts.map((c) => ({ ...c, count: c.years.length }))} hrefBase="/concepts" unit="년" sub={(r) => (r.lastYear ? `최근 ${r.lastYear}` : null)} />
        </Panel>
        <Panel title="오랫동안 출제되지 않은 사상가" note="최근 5개 학년도 미출제">
          {t.dormantPhilosophers.length === 0 ? (
            <p className="py-4 text-sm text-faint">없음</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">사상가</th>
                  <th className="py-1 text-right font-medium">마지막 출제</th>
                  <th className="py-1 text-right font-medium">누적</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {t.dormantPhilosophers.slice(0, 20).map((p) => (
                  <tr key={p.id}>
                    <td className="py-1.5">
                      <a href={`/philosophers/${p.id}`} className="hover:text-navy hover:underline">{p.name}</a>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{p.lastYear}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{p.count}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="전공 A / B 비교 (영역별 문항 수)">
        <div className="grid gap-6 md:grid-cols-2">
          {(["A", "B"] as const).map((s) => {
            const rows = [...(t.areaBySection[s] ?? [])].sort((a, b) => b.count - a.count);
            const max = Math.max(1, ...Object.values(t.areaBySection).flat().map((r) => r.count));
            return (
              <div key={s}>
                <h3 className="mb-2 text-sm font-bold text-muted">전공 {s}</h3>
                <BarList rows={rows} unit="문항" max={max} />
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
