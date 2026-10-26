import Link from "next/link";
import { Badge } from "@/components/ui";
import { getPatterns } from "@/lib/data/trends";

/** 사상가 / 개념 / 원전 상세 페이지의 "출제 패턴" 요약 (DB 계산) */
export async function EntityPattern({ kind, id }: { kind: "philosopher" | "concept" | "source"; id: string }) {
  let data;
  try {
    data = await getPatterns();
  } catch {
    return null;
  }
  const { patterns } = data;
  const list = kind === "philosopher" ? patterns.philosophers : kind === "concept" ? patterns.concepts : patterns.sources;
  const p = list.find((x) => x.id === id);
  if (!p) return null;
  const rows: [string, React.ReactNode][] = [
    ["최근 5년 출제", `${p.recent5}회`],
    ["평균 출제 간격", p.avgInterval !== null ? `${p.avgInterval}년${p.cycle ? ` (${p.cycle})` : ""}` : "1회 출제"],
    ["마지막 출제 후", p.yearsSinceLast !== null ? `${p.yearsSinceLast}년` : "-"],
  ];
  if ("subPatterns" in p) {
    p.subPatterns.forEach((g) =>
      rows.push([
        g.group,
        <span key={g.group} className="flex flex-wrap gap-1">
          {g.items.slice(0, 8).map((i) => (
            <Badge key={i.key}>
              {i.label} {i.count}
            </Badge>
          ))}
        </span>,
      ]),
    );
    if (p.unexaminedConcepts.length) rows.push(["아직 출제되지 않은 주요 개념", p.unexaminedConcepts.join(", ")]);
  }
  if ("unusedExtensions" in p && p.unusedExtensions.length) {
    rows.push(["아직 사용되지 않은 확장 방식 (AI 제안)", p.unusedExtensions.map((e) => e.topic).join(" / ")]);
  }
  if ("unusedPassages" in p) {
    if (p.locations.length) rows.push(["사용된 부분", p.locations.map((l) => `${l.label} ${l.count}`).join(", ")]);
    if (p.unusedPassages.length) rows.push(["아직 출제되지 않은 부분", p.unusedPassages.join(", ")]);
  }
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-bold">출제 패턴</h2>
        <Link href="/trends?tab=patterns" className="text-xs text-navy">
          전체 패턴 보기
        </Link>
      </div>
      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[11rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
