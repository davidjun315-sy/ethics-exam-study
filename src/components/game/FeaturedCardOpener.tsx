"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { GameState } from "@/lib/game/data";
import { quizApi } from "@/lib/quiz/client";

type SheetProps = Parameters<typeof import("./GameApp").PhilosopherSheet>[0];

/**
 * 메인·윤리 퀴즈의 대표 카드: 누르면 그 자리에서 카드 상세 창이 뜬다 (페이지 이동 없음).
 * 상세 창 코드와 카드 데이터는 누를 때 불러온다 (메인 화면을 가볍게).
 */
export function FeaturedCardOpener({
  philosopherId,
  label,
  children,
  quiz,
  className = "",
}: {
  philosopherId: string;
  label: string;
  children: ReactNode;
  quiz?: SheetProps["quiz"];
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<GameState | null>(null);
  const [Sheet, setSheet] = useState<ComponentType<SheetProps> | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);

  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      const [mod, s] = await Promise.all([
        import("./GameApp"),
        quizApi<GameState>("/api/game/state"),
      ]);
      setSheet(() => mod.PhilosopherSheet);
      setState(s);
    } catch {
      // 불러오지 못하면 게임 화면의 상세로
      router.push(`/quiz/game?tab=collection&detail=${philosopherId}`);
    } finally {
      setBusy(false);
    }
  }
  const reload = async () => {
    const s = await quizApi<GameState>("/api/game/state");
    setState(s);
    setChanged(true);
    return s;
  };
  const close = () => {
    setState(null);
    // 대표 카드를 바꾸는 등 변경이 있었으면 메인 위젯도 새로 그림
    if (changed) router.refresh();
    setChanged(false);
  };

  const card = state
    ? (state.cards.find((c) => c.philosopherId === philosopherId) ??
      state.owned.find((o) => o.philosopherId === philosopherId))
    : undefined;
  const copies = state
    ? state.owned
        .filter((o) => o.philosopherId === philosopherId)
        .sort(
          (a, b) =>
            ["legendary", "epic", "rare", "common"].indexOf(a.rarity) -
              ["legendary", "epic", "rare", "common"].indexOf(b.rarity) ||
            b.level - a.level,
        )
    : [];

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={label}
        aria-busy={busy}
        className={`block w-full text-left transition-opacity ${busy ? "opacity-70" : ""} ${className}`}
      >
        {children}
      </button>
      {state && card && Sheet && (
        // 감싼 곳(예: 가운데 정렬 타일)의 글자 정렬을 물려받지 않게
        <div className="text-left">
          <Sheet
            card={card}
            copies={copies}
            state={state}
            reload={reload}
            onClose={close}
            onLevelUp={() => router.push("/quiz/game?tab=upgrade")}
            onFuse={(cardId) =>
              router.push(`/quiz/game?tab=fusion&base=${cardId}`)
            }
            quiz={quiz}
          />
        </div>
      )}
    </>
  );
}
