import Link from "next/link";
import { GameAdmin } from "@/components/admin/GameAdmin";
import { PageTitle } from "@/components/ui";
import { freeDrawStats, GameError, getGameSettings, listCandidates } from "@/lib/game/data";

export const metadata = { title: "철학자 대난투 카드 관리" };

export default async function GameAdminPage() {
  const loaded = await Promise.all([listCandidates(), getGameSettings(), freeDrawStats().catch(() => null)]).then(
    ([candidates, settings, freeDraws]) => ({ candidates, settings, freeDraws, error: null }),
    (e: unknown) => ({ candidates: null, settings: null, freeDraws: null, error: e instanceof GameError ? e.message : e instanceof Error ? e.message : String(e) }),
  );
  return (
    <div className="space-y-4">
      <PageTitle
        title="철학자 대난투 카드 관리"
        subtitle="카드 후보는 기출 분석에 연결된 사상가에서 자동으로 만들어집니다. 일러스트·능력치·필살기를 갖춘 카드만 공개하세요. 사상가 원본 정보와 기출 분석은 바뀌지 않습니다."
        actions={
          <>
            <Link href="/admin/game/cards" className="btn">등급 미리보기</Link>
            <Link href="/quiz/game" className="btn">게임 화면</Link>
            <Link href="/admin" className="btn">관리자 홈</Link>
          </>
        }
      />
      {loaded.candidates && loaded.settings ? (
        <GameAdmin candidates={loaded.candidates} settings={loaded.settings} freeDraws={loaded.freeDraws} />
      ) : (
        <p className="card p-4 text-sm text-danger">{loaded.error}</p>
      )}
    </div>
  );
}
