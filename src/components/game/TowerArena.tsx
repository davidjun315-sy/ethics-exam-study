"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Rarity } from "@/lib/game/rules";
import type { RunState } from "@/lib/game/tower";
import type { EnemyView, TeamCard } from "@/lib/game/tower-data";
import { fxTheme, type FxTheme } from "@/lib/game/skillFx";
import { Burst, Motif, RING, type Box } from "./BattleStage";

/**
 * 사상의 탑 전장: 아군 전투 캐릭터(왼쪽, 오른쪽을 봄) vs 적 사상가(오른쪽).
 * 정답 → 아군 돌진 · 필살기(빠른 정답 · 3콤보 이상 · 마지막 일격)는 사상가마다 다른 기술 연출 + 큰 폭발 · 화면 흔들림
 * 오답 → 적이 돌진해 아군 전원에게 공격 / 반론 대비가 있으면 푸른 방패로 막음
 */
export interface Strike {
  id: number;
  kind: "attack" | "skill" | "enemy" | "shield";
  /** 공격하는 아군 (attack · skill) */
  actor: number;
  dealt: number;
  taken: number;
  quick: boolean;
  combo: number;
  cleared: boolean;
  dead: boolean;
}

/** 맞는 순간 (ms): 돌진이 가장 앞에 나간 때 · 기술이 날아가 닿는 때 */
export const STRIKE_IMPACT = { attack: 230, skill: 720, enemy: 260, shield: 260 } as const;
const STRIKE_LEN = 1500;

const SHIELD_THEME: FxTheme = { colors: ["#7fc6ff", "#3b7dd8", "#e6f6ff"], motif: "sigil", glyph: "盾" };

export function TowerArena({
  team,
  enemy,
  state,
  boss,
  strike,
  enemyDown,
  teamDown,
}: {
  team: TeamCard[];
  enemy: EnemyView | null;
  state: RunState;
  boss: boolean;
  strike: Strike | null;
  /** 이 층 적이 쓰러짐 (해설 · 강화 고르기 동안 유지) */
  enemyDown: boolean;
  teamDown: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 360, H: 230 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { W, H } = size;

  // 자리: 아군은 앞(적 쪽)부터 뒤로 비스듬히, 적은 오른쪽에 크게
  const allyBox = (i: number): Box => {
    const h = H * 0.52 * (1 - i * 0.08);
    const w = h * 0.82;
    const feet = H * (0.95 - i * 0.045);
    // 뒤 캐릭터가 왼쪽 끝에서 잘리지 않게
    const x = Math.max(w * 0.5 + 4, W * (0.36 - i * 0.12));
    return { x, y: feet - h * 0.5, feet, top: feet - h, w, h };
  };
  const enemyBox: Box = (() => {
    const h = H * (boss ? 0.74 : 0.64);
    const w = h * 0.82;
    const feet = H * 0.95;
    const x = W * 0.77;
    return { x, y: feet - h * 0.5, feet, top: feet - h, w, h };
  })();

  const k = strike?.kind;
  const actor = strike && (k === "attack" || k === "skill") ? Math.min(strike.actor, team.length - 1) : -1;
  const actorTheme = actor >= 0 ? fxTheme(team[actor].name, team[actor].skillName ?? "") : null;
  const enemyTheme = enemy ? fxTheme(enemy.name) : SHIELD_THEME;
  const impact = k ? STRIKE_IMPACT[k] : 0;

  return (
    <div ref={ref} className={`relative h-[220px] select-none sm:h-[290px] ${strike && (k === "skill" || (k === "enemy" && strike.taken > 0)) ? "fx-shake-big" : strike ? "fx-shake" : ""}`} style={{ animationDelay: `${impact}ms` }} data-tower-arena>
      {/* 바닥 그림자 */}
      <div className="pointer-events-none absolute inset-x-[4%] bottom-[2%] h-[12%] rounded-[50%] bg-black/35 blur-md" aria-hidden />

      {/* 아군 (뒤 → 앞 순서로 그려 앞 캐릭터가 위에) */}
      {[...team.keys()].reverse().map((i) => {
        const c = team[i];
        const b = allyBox(i);
        const isActor = i === actor;
        const hit = k === "enemy" && strike!.taken > 0;
        const anim = isActor ? (k === "skill" ? "bs-cast bs-aura" : "bs-lunge-r") : hit ? "bs-hit" : k === "skill" ? "bs-aura" : teamDown ? "" : "bs-idle";
        return (
          <div key={c.cardId} className="absolute" style={{ left: b.x, top: b.top, height: b.h, transform: "translateX(-50%)", zIndex: 10 - i }}>
            <div className={`h-full ${teamDown ? "bs-faint" : ""}`} style={{ animationDelay: strike?.dead ? `${impact + 420 + i * 120}ms` : "0ms" }}>
              <div key={strike?.id ?? 0} className={`h-full ${anim}`} style={{ animationDelay: hit ? `${impact}ms` : isActor ? "0ms" : `${i * 0.4}s`, ["--aura" as string]: actorTheme?.colors[0] ?? "#ffd36b" } as CSSProperties}>
                <Fighter img={c.battleArtUrl} art={c.artUrl} name={c.name} rarity={c.rarity} flip={false} />
              </div>
            </div>
          </div>
        );
      })}

      {/* 적 (바깥: 자리 · 가운데: 쓰러짐 · 안: 맞음/돌진/숨쉬기) */}
      {enemy && (
        <div key="enemy" className="absolute" style={{ left: enemyBox.x, top: enemyBox.top, height: enemyBox.h, transform: "translateX(-50%)", zIndex: 5 }}>
          <div className={`h-full ${enemyDown ? "bs-faint" : ""}`} style={{ animationDelay: strike?.cleared ? `${impact + 420}ms` : "0ms" }}>
            <div
              key={strike?.id ?? 0}
              className={`h-full ${k === "enemy" || k === "shield" ? "bs-lunge-l" : k === "attack" || k === "skill" ? `bs-hit ${k === "skill" ? "bs-hit-big" : ""}` : enemyDown ? "" : "bs-idle"}`}
              style={{ animationDelay: k === "attack" || k === "skill" ? `${impact}ms` : "0ms" }}
            >
              <Fighter img={enemy.battleArtUrl} art={enemy.artUrl} name={enemy.name} rarity={enemy.rarity} flip boss={boss} />
            </div>
          </div>
        </div>
      )}

      {/* 연출 (사건마다 새로 그려 애니메이션이 처음부터) */}
      {strike && (
        <div key={strike.id} className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden>
          {k === "attack" && actorTheme && (
            <>
              {[0, 1].map((n) => (
                <span key={n} className="fx-crescent" style={{ left: enemyBox.x, top: enemyBox.y, width: enemyBox.w * 1.3, height: enemyBox.w * 1.3, ["--c0" as string]: actorTheme.colors[0], ["--c1" as string]: actorTheme.colors[1], ["--c2" as string]: actorTheme.colors[2], ["--r" as string]: `${-30 + n * 70}deg`, animationDelay: `${impact - 40 + n * 90}ms` } as CSSProperties} />
              ))}
              <Burst b={enemyBox} theme={actorTheme} big={false} delay={impact} />
            </>
          )}
          {k === "skill" && actorTheme && (
            <>
              {/* 시전: 발밑 마법진 + 아군 전원 빛 */}
              <div className="fx-sigil fx-sigil-cast" style={{ left: allyBox(actor).x, top: allyBox(actor).feet - allyBox(actor).w * 0.15, width: allyBox(actor).w * 1.5, height: allyBox(actor).w * 1.5, ["--c0" as string]: actorTheme.colors[0], ["--c1" as string]: actorTheme.colors[1], ["--c2" as string]: actorTheme.colors[2] } as CSSProperties}>
                <span style={{ fontSize: allyBox(actor).w * 0.35 }}>{actorTheme.glyph}</span>
              </div>
              {team.map((_, i) => (
                <div key={i} className="fx-ally-glow" style={{ left: allyBox(i).x, top: allyBox(i).y, width: allyBox(i).w * 1.8, height: allyBox(i).h * 1.1, ["--c2" as string]: actorTheme.colors[2], animationDelay: `${i * 60}ms` } as CSSProperties} />
              ))}
              {/* 기술 이름 */}
              <div className="tower-skillname absolute left-1/2 top-[6%] -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-sm font-black text-white sm:text-base" style={{ background: `linear-gradient(90deg, transparent, ${actorTheme.colors[1]}, ${actorTheme.colors[0]}, transparent)` }}>
                {team[actor].skillName || `${team[actor].name}의 일격`}
              </div>
              <Motif theme={actorTheme} from={allyBox(actor)} to={[enemyBox]} H={H} delay={impact - 420} />
              <Burst b={enemyBox} theme={actorTheme} big delay={impact} />
              <div className="fx-flash" style={{ ["--c2" as string]: actorTheme.colors[2], animationDelay: `${impact}ms` } as CSSProperties} />
            </>
          )}
          {(k === "enemy" || k === "shield") && (
            <>
              <Motif theme={enemyTheme} from={enemyBox} to={k === "shield" ? [allyBox(0)] : team.map((_, i) => allyBox(i))} H={H} delay={impact - 160} />
              {k === "enemy"
                ? team.map((_, i) => <Burst key={i} b={allyBox(i)} theme={enemyTheme} big={false} delay={impact + i * 70} />)
                : (
                  <>
                    <div className="fx-sigil" style={{ left: allyBox(0).x + allyBox(0).w * 0.55, top: allyBox(0).y, width: allyBox(0).w * 1.4, height: allyBox(0).w * 1.4, transform: "rotateY(60deg)", ["--c0" as string]: SHIELD_THEME.colors[0], ["--c1" as string]: SHIELD_THEME.colors[1], ["--c2" as string]: SHIELD_THEME.colors[2], animationDelay: `${impact - 60}ms` } as CSSProperties}>
                      <span style={{ fontSize: allyBox(0).w * 0.3 }}>{SHIELD_THEME.glyph}</span>
                    </div>
                    <Burst b={{ ...allyBox(0), x: allyBox(0).x + allyBox(0).w * 0.55 }} theme={SHIELD_THEME} big={false} delay={impact} />
                  </>
                )}
              {k === "enemy" && strike.taken > 0 && <div className="tower-redflash absolute inset-0" style={{ animationDelay: `${impact}ms` }} />}
            </>
          )}

          {/* 피해 숫자 */}
          {strike.dealt > 0 && (
            <span className={`fx-dmg ${k === "skill" ? "fx-dmg-big" : ""} ${strike.quick ? "fx-dmg-crit" : ""}`} style={{ left: enemyBox.x, top: enemyBox.top - 6, ["--c0" as string]: strike.quick ? "#ffd36b" : "#fff3c4", animationDelay: `${impact}ms` } as CSSProperties}>
              {strike.quick && <span className="fx-crit-tag">빠른 일격!</span>}-{strike.dealt}
            </span>
          )}
          {strike.taken > 0 && (
            <span className="fx-dmg" style={{ left: allyBox(Math.min(1, team.length - 1)).x, top: allyBox(0).top - 6, ["--c0" as string]: "#ff8a7a", animationDelay: `${impact}ms` } as CSSProperties}>
              -{strike.taken}
            </span>
          )}
          {k === "shield" && (
            <span className="fx-dmg" style={{ left: allyBox(0).x, top: allyBox(0).top - 6, ["--c0" as string]: "#9fd8ff", animationDelay: `${impact}ms` } as CSSProperties}>
              막음!
            </span>
          )}
          {strike.combo >= 2 && strike.dealt > 0 && (
            <span className="tower-combo absolute left-[4%] top-[6%] text-lg font-black italic text-[#ffb36b] sm:text-2xl" style={{ animationDelay: `${impact}ms` }}>
              {strike.combo} COMBO
            </span>
          )}
          {strike.cleared && (
            <div className="fx-ko fx-ko-win absolute inset-x-0 top-[26%] text-center" style={{ animationDelay: `${impact + 300}ms` }}>
              <span style={{ animationDelay: `${impact + 300}ms` }}>격파!</span>
            </div>
          )}
          {strike.dead && (
            <div className="fx-ko fx-ko-lose absolute inset-x-0 top-[26%] text-center">
              <span style={{ animationDelay: `${impact + 300}ms` }}>쓰러짐…</span>
            </div>
          )}
        </div>
      )}
      {/* 체력바 위치 표시용 상태 (스크린리더) */}
      <span className="sr-only">
        내 팀 체력 {state.hp}/{state.maxHp}, 적 체력 {state.enemyHp}/{state.enemyMax}
      </span>
    </div>
  );
}

export const STRIKE_DURATION = STRIKE_LEN;

/** 전투 캐릭터 (투명 배경 전신) · 없으면 초상 메달 + 받침 */
function Fighter({ img, art, name, rarity, flip, boss = false }: { img: string | null; art: string | null; name: string; rarity: Rarity; flip: boolean; boss?: boolean }) {
  if (img)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img} alt={name} draggable={false} className={`block h-full w-auto max-w-none object-contain drop-shadow-[0_6px_8px_rgba(0,0,0,.45)] ${boss ? "drop-shadow-[0_0_14px_rgba(255,107,90,.55)]" : ""}`} style={{ transform: flip ? "scaleX(-1)" : undefined }} />
    );
  return (
    <div className="flex h-full aspect-[0.82] flex-col items-center justify-end" title={name}>
      <div className="relative aspect-square w-[88%] shrink-0 overflow-hidden rounded-full border-[3px] bg-[#1a2234] shadow-[0_4px_10px_rgba(0,0,0,.5)]" style={{ borderColor: RING[rarity] }}>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt={name} draggable={false} className="h-full w-full object-cover object-[center_18%]" />
        ) : (
          <span className="flex h-full items-center justify-center text-2xl font-black text-white/50">{name.slice(0, 1)}</span>
        )}
      </div>
      <div className="-mt-1 h-[14%] w-[66%] shrink-0 rounded-b-xl rounded-t-sm" style={{ background: `linear-gradient(180deg, ${RING[rarity]}, #3b3f4d)` }} />
    </div>
  );
}
