import Link from "next/link";
import { Empty } from "@/components/ui";
import type { MemoWithQuestion } from "@/lib/data/memos";
import { classifyPhilosopher, classifyTradition, TRADITIONS, UNCLASSIFIED } from "@/lib/traditions";
import { questionRef } from "@/lib/format";
import { MoveLocalMemos } from "./MoveLocalMemos";

/** 문항의 섹터: 분석의 출제 영역 → 없으면 주요 사상가로 판단 */
function sectorOf(m: MemoWithQuestion): string {
  const byArea = classifyTradition(m.question.analysis?.area);
  if (byArea !== UNCLASSIFIED) return byArea;
  const main = m.question.philosophers.find((p) => p.role === "main") ?? m.question.philosophers[0];
  return main ? classifyPhilosopher({ name: main.name, tradition: null }) : UNCLASSIFIED;
}

/** 내 학습 → 메모: 섹터 → 사상가 → 메모 */
export function MemoCollection({ memos }: { memos: MemoWithQuestion[] }) {
  const order = [...TRADITIONS, UNCLASSIFIED] as string[];
  const sectors = new Map<string, Map<string, MemoWithQuestion[]>>(order.map((s) => [s, new Map()]));
  for (const m of memos) {
    const main = m.question.philosophers.find((p) => p.role === "main")?.name ?? m.question.philosophers[0]?.name ?? "사상가 미지정";
    const g = sectors.get(sectorOf(m))!;
    g.set(main, [...(g.get(main) ?? []), m]);
  }
  const shown = order.map((s) => ({ sector: s, groups: [...sectors.get(s)!.entries()] })).filter((s) => s.groups.length > 0);

  return (
    <div className="space-y-5">
      <MoveLocalMemos />
      {memos.length === 0 ? (
        <Empty>아직 메모가 없습니다. 문항 화면의 &apos;내 메모&apos; 탭에 적으면 여기에 섹터별로 모입니다.</Empty>
      ) : (
        <>
          <nav className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
            {shown.map((s) => (
              <a key={s.sector} href={`#memo-${s.sector}`} className="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink">
                {s.sector} <span className="text-xs text-faint">{s.groups.reduce((n, [, l]) => n + l.length, 0)}</span>
              </a>
            ))}
          </nav>
          {shown.map((s) => (
            <section key={s.sector} id={`memo-${s.sector}`} className="scroll-mt-20 space-y-3">
              <h2 className="text-lg font-bold">{s.sector}</h2>
              {s.groups.map(([philosopher, list]) => (
                <div key={philosopher} className="card p-4">
                  <h3 className="mb-2 text-sm font-bold text-navy">
                    {philosopher} <span className="font-normal text-faint">{list.length}</span>
                  </h3>
                  <ul className="space-y-3">
                    {list.map((m) => (
                      <li key={m.question_id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                        <div className="mb-1 flex flex-wrap items-baseline gap-2 text-sm">
                          <Link href={`/questions/${m.question_id}`} className="font-semibold text-navy hover:underline">
                            {questionRef(m.question.exam, m.question.label)}
                          </Link>
                          {m.question.concepts.length > 0 && <span className="text-xs text-muted">{m.question.concepts.map((c) => c.name).join(", ")}</span>}
                          <span className="ml-auto text-xs text-faint">{new Date(m.updated_at).toLocaleDateString("ko-KR")}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-[15px] leading-7">{m.memo}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
