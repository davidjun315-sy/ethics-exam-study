import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { ExportPanel } from "@/components/admin/ExportPanel";
import { PageTitle } from "@/components/ui";
import { listExportTargets } from "@/lib/data/export";

export const metadata = { title: "분석 자료 내보내기" };

export default async function ExportPage() {
  const { data, error } = await load(listExportTargets);
  return (
    <div className="space-y-4">
      <PageTitle
        title="분석 자료 내보내기"
        subtitle="AI 분석 자료를 채팅 AI 에 올려 질문할 수 있는 Markdown 파일로 내려받습니다. 받을 때마다 지금 DB 의 최신 분석으로 새로 만듭니다."
        actions={<Link href="/admin" className="btn">관리자 홈</Link>}
      />
      {error || !data ? (
        <DataError error={error} />
      ) : (
        <>
          <p className="text-sm text-muted">
            문항 {data.totals.questions}개 (분석 {data.totals.analyzed}개) · 사상가 {data.totals.philosophers}명 · 사상가 개념 정리 {data.totals.notes}개
          </p>
          <ExportPanel data={data} />
          <section className="card space-y-2 p-4 text-sm">
            <h2 className="text-[15px] font-bold">채팅 AI 에서 쓰는 법</h2>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li><b>Claude</b>: 프로젝트를 만들고 &apos;프로젝트 지식&apos;에 파일을 올리면 그 프로젝트의 모든 대화에서 자료를 참고합니다.</li>
              <li><b>ChatGPT</b>: 프로젝트(또는 GPTs)의 파일에 올리거나, 대화창에 파일을 첨부해 질문합니다.</li>
              <li><b>NotebookLM</b>: 노트북의 소스로 올리면 답에 근거 위치를 표시해 줍니다.</li>
              <li>분석을 고친 뒤에는 <b>바뀐 사상가만 (.zip)</b>을 받아, 채팅 AI 에 올려 둔 같은 이름의 파일(예: 서양윤리_칸트.md)을 지우고 새 파일을 올리면 됩니다.</li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
