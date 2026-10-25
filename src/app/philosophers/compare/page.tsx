import { DataError, load } from "@/components/DataError";
import { PageTitle } from "@/components/ui";
import { ComparePanel } from "@/components/study/ComparePanel";
import { getReadClient } from "@/lib/supabase/server";
import { listQuestionSummaries } from "@/lib/data/queries";

export const metadata = { title: "사상가 비교" };

const EXAMPLES = [
  ["주희", "왕수인"],
  ["이황", "이이"],
  ["맹자", "순자"],
  ["플라톤", "아리스토텔레스"],
  ["칸트", "밀"],
];

export default async function ComparePage({ searchParams }: PageProps<"/philosophers/compare">) {
  const sp = await searchParams;
  const { data, error } = await load(async () => {
    const db = getReadClient();
    const { data: ps, error: e } = await db.from("philosophers").select("id, name, school").order("name");
    if (e) throw new Error(e.message);
    const all = await listQuestionSummaries();
    return { philosophers: ps ?? [], all };
  });
  if (error || !data) return <DataError error={error} />;

  const a = typeof sp.a === "string" ? sp.a : "";
  const b = typeof sp.b === "string" ? sp.b : "";
  const related = a && b ? data.all.filter((q) => q.philosophers.some((p) => p.id === a) && q.philosophers.some((p) => p.id === b)) : [];
  const relatedA = a ? data.all.filter((q) => q.philosophers.some((p) => p.id === a && p.role === "main")) : [];
  const relatedB = b ? data.all.filter((q) => q.philosophers.some((p) => p.id === b && p.role === "main")) : [];
  const byName = new Map(data.philosophers.map((p) => [p.name, p.id]));
  const examples = EXAMPLES.filter(([x, y]) => byName.has(x) && byName.has(y)).map(([x, y]) => ({
    label: `${x} vs ${y}`,
    a: byName.get(x)!,
    b: byName.get(y)!,
  }));

  return (
    <div>
      <PageTitle title="사상가 비교" subtitle="두 사상가를 선택하면 인간관, 본성론, 도덕 원리, 수양론, 정치관을 비교합니다. 한 번 생성한 비교는 저장되어 다시 AI 를 호출하지 않습니다." />
      <ComparePanel
        philosophers={data.philosophers}
        initialA={a}
        initialB={b}
        examples={examples}
        related={related}
        relatedA={relatedA}
        relatedB={relatedB}
      />
    </div>
  );
}
