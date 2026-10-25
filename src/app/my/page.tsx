import { PageTitle } from "@/components/ui";
import { MyStudy } from "@/components/study/MyStudy";

export const metadata = { title: "내 학습 기록" };

export default function MyPage() {
  return (
    <div>
      <PageTitle title="내 학습 기록" subtitle="이 브라우저에만 저장된 개인 기록입니다. 다른 기기로 옮기려면 내보내기 / 가져오기를 사용하세요." />
      <MyStudy />
    </div>
  );
}
