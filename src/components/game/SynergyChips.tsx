"use client";

import { SYNERGIES, type Synergy } from "@/lib/game/synergy";

/** 팀 시너지 표시 (팀 고르기 · 배틀 화면 공통) */
export function SynergyChips({ list, dark = false, empty }: { list: Synergy[]; dark?: boolean; empty?: string }) {
  if (!list.length) return empty ? <p className={`text-xs ${dark ? "text-white/55" : "text-faint"}`}>{empty}</p> : null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="팀 시너지">
      {list.map((s) => (
        <li
          key={s.id}
          title={s.desc}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
            s.id === "title"
              ? dark
                ? "border-white/25 bg-white/10 text-white/90"
                : "border-navy/30 bg-navy-soft text-navy"
              : dark
                ? "border-[#ffd36b]/40 bg-[#ffd36b]/10 text-[#ffe7a8]"
                : "border-[#c99a2e]/40 bg-[#ffd36b]/15 text-[#8a5a00] dark:text-[#ffd36b]"
          }`}
        >
          {s.id === "title" ? "♛" : "✦"} {s.name}
          <span className="ml-1 font-medium opacity-80">{s.desc.slice(s.desc.indexOf(" · ") + 3)}</span>
        </li>
      ))}
    </ul>
  );
}

/** 시너지 안내 (어떤 조합이 있는지) */
export function SynergyGuide() {
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer select-none font-semibold">팀 시너지 조합 보기</summary>
      <ul className="mt-1.5 space-y-0.5">
        {Object.values(SYNERGIES).map((s) => (
          <li key={s.name}>
            <b className="text-ink">{s.name}</b> · {s.desc}
          </li>
        ))}
        <li className="text-faint">「학파」와 「동문수학」은 둘 중 하나만 적용됩니다.</li>
        <li className="text-faint">달고 있는 칭호도 내 팀 능력치를 올립니다 (어려운 칭호일수록 큼 · 명예의 전당에서 확인).</li>
      </ul>
    </details>
  );
}
