import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { Badge, Empty } from "@/components/ui";
import { cachedQuestionsByPhilosopher as listQuestionsByPhilosopher } from "@/lib/data/cached";
import { groupByTradition } from "@/lib/traditions";
import { ROLE_LABEL } from "@/lib/types";
import { SearchFilter } from "./SearchFilter";

/** 기출문제 → 사상가별: 분야(섹터) → 사상가 → 문항 */
export async function ExamsByPhilosopher() {
  const { data, error } = await load(listQuestionsByPhilosopher);
  if (error || !data) return <DataError error={error} />;
  if (data.length === 0) return <Empty>분석된 문항이 쌓이면 사상가별로 볼 수 있습니다.</Empty>;
  const groups = groupByTradition(data.map((d) => ({ ...d, name: d.philosopher.name, tradition: d.philosopher.tradition })));

  return (
    <div id="ph-exams" className="space-y-6">
      <SearchFilter target="ph-exams" placeholder="사상가 이름으로 찾기" />
      <nav className="sticky top-[calc(3.5rem+var(--safe-top))] z-10 -mx-4 -mt-3 flex gap-1.5 overflow-x-auto bg-bg/90 px-4 py-2 backdrop-blur [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        {groups.map((g) => (
          <a key={g.chapter} href={`#sector-${g.chapter}`} className="chip shrink-0 !min-h-8">
            {g.chapter} <span className="num text-xs text-faint">{g.items.length}</span>
          </a>
        ))}
      </nav>
      {groups.map((g) => (
        <section key={g.chapter} id={`sector-${g.chapter}`} data-group className="scroll-mt-32">
          <h2 className="mb-2 flex items-baseline gap-2 text-base font-bold">
            {g.chapter}
            <span className="text-sm font-normal text-faint">
              사상가 {g.items.length}명 · 기출 {new Set(g.items.flatMap((d) => d.questions.filter((q) => q.role === "main" || q.role === "comparison").map((q) => q.id))).size}문항
            </span>
          </h2>
          <div className="space-y-2">
            {g.items.map(({ philosopher: p, questions, asked, lastYear }) => (
              <details key={p.id} data-search={`${p.name} ${p.school ?? ""}`} className="card group">
                <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
                  <span className="text-faint transition-transform group-open:rotate-90" aria-hidden>▸</span>
                  <span className="font-bold text-ink">{p.name}</span>
                  {p.school && <span className="text-xs text-faint">{p.school}</span>}
                  <span className="ml-auto text-sm text-muted">
                    <span className="font-semibold text-navy">{asked}문항</span>
                    {questions.length > asked && <span className="text-faint"> · 그 외 언급 {questions.length - asked}</span>}
                    {lastYear && <span className="text-faint"> · 최근 {lastYear}</span>}
                  </span>
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {questions.map((q) => (
                    <li key={q.id}>
                      <Link href={`/questions/${q.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm hover:bg-surface-2">
                        <span className="w-28 shrink-0 font-semibold text-navy">
                          {q.exam.exam_year} {q.exam.section ?? ""} {q.label}번
                        </span>
                        <Badge tone={q.role === "main" ? "navy" : "neutral"}>{ROLE_LABEL[q.role]}</Badge>
                        {q.score && <span className="text-xs text-faint">{q.score}점</span>}
                        <span className="min-w-0 flex-1 truncate text-muted">
                          {q.concepts.length ? q.concepts.map((c) => c.name).join(", ") : (q.question_text ?? "").replace(/\s+/g, " ").slice(0, 60)}
                        </span>
                        {q.philosophers.length > 1 && (
                          <span className="text-xs text-faint">
                            함께: {q.philosophers.filter((x) => x.id !== p.id).map((x) => x.name).join(", ")}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-4 py-2 text-right">
                  <Link href={`/philosophers/${p.id}`} className="text-xs text-navy hover:underline">{p.name} 개념 정리 →</Link>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
