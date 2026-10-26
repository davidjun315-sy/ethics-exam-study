import Link from "next/link";
import type { ReactNode } from "react";
import { DataError, load } from "@/components/DataError";
import { Badge, Empty, SectionTitle } from "@/components/ui";
import { getPatterns } from "@/lib/data/trends";
import type { Appearance, CountItem } from "@/lib/trends/patterns";

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <SectionTitle right={note && <span className="text-xs text-faint">{note}</span>}>{title}</SectionTitle>
      {children}
    </section>
  );
}

const counts = (items: CountItem[], max = 8) =>
  items.length ? items.slice(0, max).map((i) => `${i.label} ${i.count}`).join(", ") : "-";

function AppearanceLine({ a }: { a: Appearance }) {
  return (
    <span className="text-xs text-muted">
      총 {a.total}회 · 최근 5년 {a.recent5}회 · 최근 {a.lastYear ?? "-"}
      {a.avgInterval !== null ? ` · 평균 간격 ${a.avgInterval}년` : ""}
      {a.cycle ? ` · ${a.cycle}` : ""}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </>
  );
}

function Simple({ items, empty = "해당 없음" }: { items: ReactNode[]; empty?: string }) {
  return items.length ? <ul className="space-y-1 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-sm text-faint">{empty}</p>;
}

export async function PatternsTab() {
  const { data, error } = await load(getPatterns);
  if (error || !data) return <DataError error={error} />;
  const { patterns: p, facts } = data;
  if (facts.length === 0) return <Empty>분석 완료된 문항이 쌓이면 출제 패턴이 표시됩니다.</Empty>;
  const g = p.global;
  const withFormats = facts.filter((f) => f.formats.length > 0).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        분석 완료 문항 {facts.length}개 ({g.window.years[0]}~{g.window.latest}학년도)를 집계했습니다. 모든 수치는 DB 에서 계산한 값이며 AI 추측이 아닙니다.
        {withFormats < facts.length && (
          <span className="ml-1 text-warn">
            출제 방식 패턴은 심화 분석(출제 의도)이 있는 {withFormats}/{facts.length}개 문항만 집계됩니다.
          </span>
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="최근 반복이 증가한 사상가·개념" note="최근 3년 연평균 ≥ 이전 연평균 × 1.5">
          <Simple items={g.rising.slice(0, 12).map((x) => `${x.name} — 최근 3년 ${x.recent3}회 (이전 ${x.before}회)`)} />
        </Panel>
        <Panel title="과거에 자주 나왔지만 최근 줄어든 것" note="2회 이상 · 최근 5년 0회">
          <Simple items={g.declining.slice(0, 12).map((x) => `${x.name} — ${x.before}회, 마지막 ${x.lastYear}`)} />
        </Panel>
        <Panel title="몇 년 간격으로 재출제되는 패턴" note="간격 편차 1년 이내">
          <Simple items={g.cycles.slice(0, 12).map((x) => `${x.name} — ${x.cycle} (${x.years.join(", ")})`)} />
        </Panel>
        <Panel title="반복된 비교 조합">
          <Simple
            items={g.comparisonPairs.slice(0, 12).map((x) => (
              <Link key={x.key} href={`/philosophers/compare?a=${x.aId}&b=${x.bId}`} className="hover:text-navy hover:underline">
                {x.a} · {x.b} — {x.total}회 ({x.years.join(", ")})
              </Link>
            ))}
          />
        </Panel>
        <Panel title="출제 방식 반복" note="최근 5년 / 그 이전">
          <Simple
            items={g.formatCounts.map((f) => {
              const per = g.formatByPeriod.find((x) => x.format === f.key);
              return `${f.label} — ${f.count}회 (최근 5년 ${per?.recent5 ?? 0} / 이전 ${per?.before ?? 0})`;
            })}
            empty="심화 분석된 문항이 없습니다."
          />
        </Panel>
        <Panel title="같은 사상가 + 다른 개념">
          <Simple
            items={g.samePhilosopherDifferentConcepts.slice(0, 10).map((x) => (
              <span key={x.id}>
                <Link href={`/philosophers/${x.id}`} className="font-semibold hover:text-navy">
                  {x.philosopher}
                </Link>
                : {x.concepts.map((c) => `${c.name}(${c.years.join("·")})`).join(", ")}
              </span>
            ))}
          />
        </Panel>
        <Panel title="같은 개념 + 다른 사상가">
          <Simple
            items={g.sameConceptDifferentPhilosophers.slice(0, 10).map((x) => (
              <span key={x.id}>
                <Link href={`/concepts/${x.id}`} className="font-semibold hover:text-navy">
                  {x.concept}
                </Link>
                : {x.philosophers.map((c) => `${c.name}(${c.years.join("·")})`).join(", ")}
              </span>
            ))}
          />
        </Panel>
      </div>

      <Panel title="사상가별 출제 패턴" note="눌러서 펼치기">
        <div className="divide-y divide-line">
          {p.philosophers.slice(0, 40).map((x) => (
            <details key={x.id} className="py-2">
              <summary className="cursor-pointer">
                <span className="font-semibold">{x.name}</span> <AppearanceLine a={x} />
              </summary>
              <dl className="mt-2 grid gap-x-4 gap-y-1.5 pl-4 sm:grid-cols-[10rem_1fr]">
                <Row label="출제 연도">{x.years.join(", ")}</Row>
                {x.subPatterns.map((sp) => (
                  <Row key={sp.group} label={`하위 패턴 · ${sp.group}`}>
                    {sp.items.map((i) => (
                      <Badge key={i.key}>
                        {i.label} {i.count}회
                      </Badge>
                    ))}
                  </Row>
                ))}
                <Row label="주요 출제 개념">{counts(x.concepts)}</Row>
                <Row label="반복 출제 개념">{counts(x.repeatedConcepts) }</Row>
                <Row label="아직 출제되지 않은 주요 개념">
                  {x.unexaminedConcepts.length ? x.unexaminedConcepts.join(", ") : "-"}
                  <span className="ml-1 text-xs text-faint">(개념 정리·확장 출제·개념 연결 데이터 기준)</span>
                </Row>
                <Row label="같이 출제되는 사상가">{counts(x.coPhilosophers)}</Row>
                <Row label="자주 사용되는 원전">{x.sources.length ? x.sources.map((s) => `『${s.label}』 ${s.count}`).join(", ") : "-"}</Row>
                <Row label="주요 문제 유형">{counts([...x.formats, ...x.questionTypes])}</Row>
              </dl>
              <Link href={`/philosophers/${x.id}`} className="ml-4 text-xs text-navy underline">
                사상가 페이지
              </Link>
            </details>
          ))}
        </div>
      </Panel>

      <Panel title="개념별 출제 패턴">
        <div className="divide-y divide-line">
          {p.concepts.slice(0, 60).map((x) => (
            <details key={x.id} className="py-2">
              <summary className="cursor-pointer">
                <span className="font-semibold">{x.name}</span> <AppearanceLine a={x} />
              </summary>
              <dl className="mt-2 grid gap-x-4 gap-y-1.5 pl-4 sm:grid-cols-[10rem_1fr]">
                <Row label="출제 연도">{x.years.join(", ")}</Row>
                <Row label="관련 사상가">{counts(x.philosophers)}</Row>
                <Row label="같이 등장하는 개념">{counts(x.coConcepts)}</Row>
                <Row label="과거 출제 방식">{counts(x.formats)}</Row>
                <Row label="아직 사용되지 않은 확장 방식">
                  {x.unusedExtensions.length ? (
                    <ul className="space-y-0.5">
                      {x.unusedExtensions.map((e, i) => (
                        <li key={i}>
                          {e.topic} <span className="text-xs text-faint">(AI 제안 · {e.fromQuestion} 분석에서)</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "-"
                  )}
                </Row>
              </dl>
              <Link href={`/concepts/${x.id}`} className="ml-4 text-xs text-navy underline">
                개념 페이지
              </Link>
            </details>
          ))}
        </div>
      </Panel>

      <Panel title="원전별 출제 패턴">
        {p.sources.length === 0 ? (
          <Empty>원전이 연결된 문항이 없습니다.</Empty>
        ) : (
          <div className="divide-y divide-line">
            {p.sources.map((x) => (
              <details key={x.id} className="py-2">
                <summary className="cursor-pointer">
                  <span className="font-semibold">『{x.title}』</span> <AppearanceLine a={x} />
                </summary>
                <dl className="mt-2 grid gap-x-4 gap-y-1.5 pl-4 sm:grid-cols-[10rem_1fr]">
                  <Row label="출제 연도">{x.years.join(", ")}</Row>
                  <Row label="사용된 부분">{counts(x.locations)}</Row>
                  <Row label="반복되는 문구">{x.repeatedPhrases.length ? x.repeatedPhrases.map((r) => `“${r.label}” ${r.count}회`).join(" / ") : "-"}</Row>
                  <Row label="관련 개념">{counts(x.concepts)}</Row>
                  <Row label="관련 사상가">{counts(x.philosophers)}</Row>
                  <Row label="아직 출제되지 않은 부분">
                    {x.unusedPassages.length ? x.unusedPassages.join(", ") : <span className="text-faint">원전 DB 에 원문을 입력하면 표시됩니다</span>}
                  </Row>
                </dl>
              </details>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
