"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Comparison } from "@/lib/ai/schemas";
import type { QuestionSummary } from "@/lib/data/queries";
import { questionRef } from "@/lib/format";
import { Badge, ConfidenceBadge, Empty } from "@/components/ui";

interface P {
  id: string;
  name: string;
  school: string | null;
}

export function ComparePanel({
  philosophers,
  initialA,
  initialB,
  examples,
  related,
  relatedA,
  relatedB,
}: {
  philosophers: P[];
  initialA: string;
  initialB: string;
  examples: { label: string; a: string; b: string }[];
  related: QuestionSummary[];
  relatedA: QuestionSummary[];
  relatedB: QuestionSummary[];
}) {
  const router = useRouter();
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [result, setResult] = useState<{ key: string; data: Comparison } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialA && initialB && initialA !== initialB));
  const pa = philosophers.find((p) => p.id === initialA);
  const pb = philosophers.find((p) => p.id === initialB);
  const key = `${initialA}:${initialB}`;

  useEffect(() => {
    if (!initialA || !initialB || initialA === initialB) return;
    let cancelled = false;
    fetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: initialA, b: initialB }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "비교 실패");
        // API 는 id 정렬 순서로 저장하므로 A/B 가 뒤바뀌었으면 되돌린다.
        const c = json.comparison as Comparison;
        const swapped = json.aId !== initialA;
        const data: Comparison = swapped
          ? {
              ...c,
              aspects: c.aspects.map((x) => ({ ...x, a: x.b, b: x.a })),
              keyConceptsA: c.keyConceptsB,
              keyConceptsB: c.keyConceptsA,
              sourcesA: c.sourcesB,
              sourcesB: c.sourcesA,
              distinguishingExpressions: c.distinguishingExpressions.map((d) => ({ ...d, belongsTo: d.belongsTo === "A" ? "B" : "A" })),
            }
          : c;
        if (!cancelled) setResult({ key: `${initialA}:${initialB}`, data });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [initialA, initialB]);

  const current = result?.key === key ? result.data : null;

  function go(na: string, nb: string) {
    setError(null);
    if (na && nb && na !== nb) setLoading(true);
    router.push(`/philosophers/compare?a=${na}&b=${nb}`);
  }

  if (philosophers.length < 2) return <Empty>사상가가 2명 이상 등록되어야 비교할 수 있습니다.</Empty>;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">사상가 A</label>
          <select className="input w-48" value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">선택</option>
            {philosophers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <span className="pb-2 text-muted">vs</span>
        <div>
          <label className="label">사상가 B</label>
          <select className="input w-48" value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">선택</option>
            {philosophers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" disabled={!a || !b || a === b} onClick={() => go(a, b)}>
          비교하기
        </button>
        {examples.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {examples.map((x) => (
              <button key={x.label} className="btn" onClick={() => { setA(x.a); setB(x.b); go(x.a, x.b); }}>
                {x.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loading && !current && <p className="text-sm text-muted">AI 가 비교 자료를 만드는 중입니다… (처음 한 번만 생성됩니다)</p>}

      {pa && pb && current && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-[15px]">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left">
                  <th className="w-32 px-4 py-2 text-sm text-muted">항목</th>
                  <th className="px-4 py-2 text-navy">{pa.name}</th>
                  <th className="px-4 py-2 text-navy">{pb.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {current.aspects.map((x) => (
                  <tr key={x.aspect}>
                    <td className="px-4 py-3 text-sm font-semibold text-muted">{x.aspect}</td>
                    <td className="px-4 py-3 leading-7">{x.a}</td>
                    <td className="px-4 py-3 leading-7">{x.b}</td>
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-muted">핵심 개념</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{current.keyConceptsA.map((k) => <Badge key={k}>{k}</Badge>)}</div></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{current.keyConceptsB.map((k) => <Badge key={k}>{k}</Badge>)}</div></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-muted">대표 원전</td>
                  <td className="px-4 py-3">{current.sourcesA.map((s) => `『${s}』`).join(", ")}</td>
                  <td className="px-4 py-3">{current.sourcesB.map((s) => `『${s}』`).join(", ")}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <h3 className="mb-2 text-sm font-bold text-navy">임용 시험에서 구별하는 표현</h3>
              <ul className="space-y-2">
                {current.distinguishingExpressions.map((d, i) => (
                  <li key={i} className="rounded border border-line px-3 py-2">
                    <span className="mr-2 text-xs font-bold text-navy">{d.belongsTo === "A" ? pa.name : pb.name}</span>“{d.expression}”
                    {d.note && <p className="mt-0.5 text-sm text-muted">{d.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
            <section className="card p-4">
              <h3 className="mb-2 text-sm font-bold text-navy">시험 대비 팁</h3>
              <ul className="list-disc space-y-1 pl-5">
                {current.examTips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
              {current.caveats.length > 0 && (
                <>
                  <h3 className="mb-2 mt-4 text-sm font-bold text-warn">해석상 주의</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {current.caveats.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </>
              )}
              <div className="mt-3"><ConfidenceBadge label="AI 확신도" value={current.confidence} /></div>
            </section>
          </div>
        </>
      )}

      {pa && pb && (
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-bold text-navy">관련 기출</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: "함께 출제", list: related },
              { title: `${pa.name} 중심`, list: relatedA },
              { title: `${pb.name} 중심`, list: relatedB },
            ].map((g) => (
              <div key={g.title}>
                <div className="mb-1 text-xs font-semibold text-muted">{g.title} ({g.list.length})</div>
                <ul className="space-y-1 text-sm">
                  {g.list.slice(0, 12).map((q) => (
                    <li key={q.id}>
                      <Link href={`/questions/${q.id}`} className="hover:text-navy hover:underline">{questionRef(q.exam, q.label)}</Link>
                    </li>
                  ))}
                  {g.list.length === 0 && <li className="text-faint">없음</li>}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
