import Link from "next/link";
import { PatternsTab } from "@/components/trends/PatternsTab";
import { PredictTab } from "@/components/trends/PredictTab";
import { StatsTab } from "@/components/trends/StatsTab";
import { PageTitle } from "@/components/ui";

export const metadata = { title: "출제분석" };

const TABS = [
  { key: "stats", label: "통계 분석", help: "출제 횟수 · 비율 · 연도별 분포" },
  { key: "patterns", label: "출제 패턴", help: "반복 · 주기 · 비교 조합 · 사상가/개념/원전별 패턴" },
  { key: "predict", label: "출제 예측", help: "다음 시험 대비 우선 학습 주제" },
] as const;

export default async function TrendsPage({ searchParams }: PageProps<"/trends">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "stats";
  return (
    <div className="space-y-5">
      <PageTitle title="출제분석" subtitle="모든 기출 분석 데이터를 종합해 출제 경향과 다음 시험 대비 학습 우선순위를 봅니다." />
      <nav className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/trends?tab=${t.key}`}
            title={t.help}
            className={`rounded-md px-4 py-2 text-sm ${tab === t.key ? "bg-navy font-semibold text-white dark:text-[#0f141c]" : "text-muted hover:bg-surface-2"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "stats" && <StatsTab />}
      {tab === "patterns" && <PatternsTab />}
      {tab === "predict" && <PredictTab />}
    </div>
  );
}
