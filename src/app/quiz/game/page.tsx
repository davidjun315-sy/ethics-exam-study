import Link from "next/link";
import { redirect } from "next/navigation";
import { GameApp, type Tab } from "@/components/game/GameApp";
import { GameError, getGameState } from "@/lib/game/data";
import { currentLearner } from "@/lib/quiz/learn";

export const metadata = { title: "철학자 대난투 · 윤리 퀴즈" };

const TABS: Tab[] = ["draw", "collection", "upgrade", "battle"];

export default async function GamePage({ searchParams }: PageProps<"/quiz/game">) {
  const learner = await currentLearner();
  if (!learner) redirect("/login?next=/quiz/game");
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "draw";
  const loaded = await getGameState(learner).then(
    (state) => ({ state, error: null }),
    (e: unknown) => ({ state: null, error: e instanceof GameError ? e.message : "잠시 후 다시 시도하세요." }),
  );
  if (!loaded.state)
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <h1 className="text-xl font-bold">철학자 대난투를 열 수 없습니다</h1>
        <p className="mt-2 text-sm text-muted">{loaded.error}</p>
        <Link href="/quiz" className="btn mt-4 inline-block">윤리 퀴즈로 돌아가기</Link>
      </div>
    );
  return <GameApp initial={loaded.state} initialTab={tab} />;
}
