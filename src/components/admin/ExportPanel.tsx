"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { ExportTargets } from "@/lib/data/export";
import { TRADITIONS, UNCLASSIFIED } from "@/lib/traditions";

/**
 * 내보내기 기록 (이 브라우저에만): 마지막으로 받은 시각 → '바뀜' 표시와 '바뀐 사상가만' 묶음에 쓴다.
 * all = 전체·묶음 파일을 받은 시각, byP = 사상가·섹터 파일을 받은 시각
 */
interface Log {
  all: string | null;
  byP: Record<string, string>;
}
const KEY = "ees:export:v1";
const EMPTY = "{}";
const listeners = new Set<() => void>();
const readRaw = () => {
  try {
    return window.localStorage.getItem(KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
};
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function saveLog(update: (l: Log) => Log) {
  try {
    const cur = JSON.parse(readRaw()) as Partial<Log>;
    window.localStorage.setItem(KEY, JSON.stringify(update({ all: cur.all ?? null, byP: cur.byP ?? {} })));
  } catch {
    // 비공개 모드 등: 기록 없이 내려받기만
  }
  listeners.forEach((l) => l());
}

const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "-";

export function ExportPanel({ data }: { data: ExportTargets }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => EMPTY);
  const log = useMemo<Log>(() => {
    try {
      const l = JSON.parse(raw) as Partial<Log>;
      return { all: l.all ?? null, byP: l.byP ?? {} };
    } catch {
      return { all: null, byP: {} };
    }
  }, [raw]);
  const [text, setText] = useState(true);
  const [future, setFuture] = useState(true);

  const q = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    if (!text) sp.set("text", "0");
    if (!future) sp.set("future", "0");
    return `/api/admin/export?${sp}`;
  };
  const lastFor = (id: string) => [log.all, log.byP[id]].filter((x): x is string => Boolean(x)).reduce<string | null>((m, t) => (!m || t > m ? t : m), null);
  const changed = (p: ExportTargets["philosophers"][number]) => {
    const last = lastFor(p.id);
    return Boolean(last && p.updatedAt && p.updatedAt > last);
  };
  const changedSinceAll = log.all ? data.philosophers.filter((p) => p.updatedAt && p.updatedAt > log.all!) : [];
  const now = () => new Date().toISOString();
  const markAll = () => saveLog((l) => ({ ...l, all: now() }));
  const markSome = (ids: string[]) => saveLog((l) => ({ ...l, byP: { ...l.byP, ...Object.fromEntries(ids.map((id) => [id, now()])) } }));

  const groups = [...TRADITIONS, UNCLASSIFIED].map((t) => ({ t, ps: data.philosophers.filter((p) => p.tradition === t) })).filter((g) => g.ps.length);

  return (
    <div className="space-y-4">
      <section className="card space-y-2 p-4">
        <h2 className="text-[15px] font-bold">담을 내용</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={text} onChange={(e) => setText(e.target.checked)} /> 문제 원문</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} /> 향후 출제 (예상 문제·답안)</label>
        </div>
        <p className="text-xs text-muted">
          모범답안 · 요구 사항별 해설 · 출제 의도 · 원문 해설 · 개념 정리 · 오답 분석 · 원전 · 사상가 AI 개념 정리는 항상 들어갑니다. 파일이 너무 크면 원문이나 향후 출제를 빼 보세요.
        </p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-[15px] font-bold">한꺼번에</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <a href={q({ scope: "all" })} onClick={markAll} className="btn-primary py-2.5 text-center">
            전체 한 파일 (.md)
          </a>
          <a href={q({ scope: "zip" })} onClick={markAll} className="btn py-2.5 text-center">
            사상가별 파일 묶음 (.zip)
          </a>
          {changedSinceAll.length > 0 ? (
            <a href={q({ scope: "zip", since: log.all! })} onClick={markAll} className="btn border-warn/60 py-2.5 text-center text-warn">
              바뀐 사상가 {changedSinceAll.length}명만 (.zip)
            </a>
          ) : (
            <span className="rounded-md border border-dashed border-line py-2.5 text-center text-sm text-faint">
              {log.all ? "마지막 내보내기 이후 바뀐 사상가 없음" : "전체·묶음을 한 번 받으면 이후 바뀐 것만 받을 수 있어요"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          마지막 전체 내보내기: {fmt(log.all)} (이 브라우저 기준) · 자료 최종 변경: {fmt(data.latest)}
        </p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-[15px] font-bold">섹터별 (.md)</h2>
        <div className="flex flex-wrap gap-2">
          {groups.map(({ t, ps }) => (
            <a key={t} href={q({ scope: "tradition", tradition: t })} onClick={() => markSome(ps.map((p) => p.id))} className="btn">
              {t} <span className="text-xs text-muted">{ps.length}명</span>
              {ps.some(changed) && <span className="ml-1 rounded bg-warn-soft px-1 text-[11px] text-warn">바뀜</span>}
            </a>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-[15px] font-bold">사상가별 (.md)</h2>
        <div className="space-y-4">
          {groups.map(({ t, ps }) => (
            <div key={t}>
              <h3 className="mb-1 text-sm font-semibold text-navy">{t}</h3>
              <ul className="divide-y divide-line text-sm">
                {ps.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                    <span className="min-w-20 font-semibold">{p.name}</span>
                    <span className="text-xs text-muted">
                      문항 {p.questions}
                      {p.analyzed < p.questions ? ` (분석 ${p.analyzed})` : ""}
                      {p.hasNote ? " · 개념 정리" : ""}
                    </span>
                    <span className="text-xs text-faint">변경 {fmt(p.updatedAt)}</span>
                    {changed(p) && <span className="rounded bg-warn-soft px-1.5 text-[11px] text-warn">받은 뒤 바뀜</span>}
                    <a href={q({ scope: "philosopher", id: p.id })} onClick={() => markSome([p.id])} className="btn ml-auto !py-0.5 text-xs">
                      내려받기
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
