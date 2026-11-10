import Link from "next/link";
import { CardPreview } from "@/components/admin/CardPreview";
import { PageTitle } from "@/components/ui";
import { GameError, publishedCards } from "@/lib/game/data";

export const metadata = { title: "카드 등급 미리보기" };

/** 관리자: 등급별 카드 프레임·광택 미리보기 (실제 카드 데이터는 바꾸지 않음) */
export default async function CardPreviewPage() {
  const cards = await publishedCards().catch((e: unknown) => (e instanceof GameError ? e.message : e instanceof Error ? e.message : String(e)));
  return (
    <div className="space-y-4">
      <PageTitle
        title="카드 등급 미리보기"
        subtitle="같은 일러스트를 일반 → 전설로 나란히 봅니다. PC 는 카드 위에 마우스를 올려 움직여 보세요."
        actions={<Link href="/admin/game" className="btn">카드 관리</Link>}
      />
      {typeof cards === "string" ? <p className="card p-4 text-sm text-danger">{cards}</p> : <CardPreview cards={cards} />}
    </div>
  );
}
